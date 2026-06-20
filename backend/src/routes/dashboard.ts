import { Router, Response } from 'express';
import { query } from '../db/init';
import { AuthRequest } from '../middleware/auth';

export const dashboardRouter: ReturnType<typeof Router> = Router();

// Get dashboard statistics
dashboardRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const requestedVatMonths = Number.parseInt(String(req.query.vatMonths ?? '3'), 10);
    const vatPeriodMonths = Number.isInteger(requestedVatMonths) && requestedVatMonths >= 1 && requestedVatMonths <= 12
      ? requestedVatMonths
      : 3;
    const vatMonthsBeforeCurrent = vatPeriodMonths - 1;

    // Get overall statistics
    const statsResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COALESCE(SUM(CASE WHEN currency = 'CZK' THEN total ELSE COALESCE(total_czk, 0) END) FILTER (WHERE status IN ('sent', 'overdue')), 0) as outstanding_amount,
        COALESCE(SUM(CASE WHEN currency = 'CZK' THEN total ELSE COALESCE(total_czk, 0) END) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN currency = 'CZK' THEN total ELSE COALESCE(total_czk, 0) END) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', CURRENT_DATE)), 0) as paid_this_month
      FROM invoices
      WHERE user_id = $1
    `, [req.userId]);

    const stats = statsResult.rows[0];

    // Get recent invoices
    const recentResult = await query(`
      SELECT i.id, i.invoice_number, i.status, i.currency, i.total, i.issue_date, i.due_date,
             c.company_name as client_name
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
      LIMIT 10
    `, [req.userId]);

    // Get monthly revenue for last 12 months
    const revenueResult = await query(`
      SELECT
        date_trunc('month', paid_at) as month,
        SUM(CASE WHEN currency = 'CZK' THEN total ELSE COALESCE(total_czk, 0) END) as revenue,
        COUNT(*) as invoice_count
      FROM invoices
      WHERE user_id = $1
        AND status = 'paid'
        AND paid_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY date_trunc('month', paid_at)
      ORDER BY month ASC
    `, [req.userId]);

    // Get monthly expenses for last 12 months
    const expensesResult = await query(`
      SELECT
        date_trunc('month', issue_date) as month,
        SUM(total) as expenses,
        COUNT(*) as expense_count
      FROM expenses
      WHERE user_id = $1
        AND status = 'paid'
        AND issue_date >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY date_trunc('month', issue_date)
      ORDER BY month ASC
    `, [req.userId]);

    // Get total expenses this year
    const yearlyExpensesResult = await query(`
      SELECT COALESCE(SUM(total), 0) as total_expenses
      FROM expenses
      WHERE user_id = $1
        AND status = 'paid'
        AND issue_date >= date_trunc('year', CURRENT_DATE)
    `, [req.userId]);

    // Check for overdue invoices and update status
    await query(`
      UPDATE invoices
      SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND status = 'sent' AND due_date < CURRENT_DATE
    `, [req.userId]);

    // Get unmatched payments
    const unmatchedPaymentsResult = await query(`
      SELECT COUNT(*) as count
      FROM payments
      WHERE user_id = $1 AND invoice_id IS NULL
    `, [req.userId]);

    // Get tax settings from users table
    const settingsResult = await query(`
      SELECT vat_payer, pausalni_dan_enabled, pausalni_dan_tier, pausalni_dan_limit
      FROM users
      WHERE id = $1
    `, [req.userId]);

    // Get total invoiced this year (all paid invoices, EUR converted to CZK)
    const yearlyInvoicedResult = await query(`
      SELECT COALESCE(SUM(
        CASE WHEN currency = 'CZK' THEN total ELSE COALESCE(total_czk, 0) END
      ), 0) as total_invoiced
      FROM invoices
      WHERE user_id = $1
        AND status = 'paid'
        AND paid_at >= date_trunc('year', CURRENT_DATE)
    `, [req.userId]);

    // Get the selected number of calendar months, including the current partial month.
    // Issued invoices contribute output VAT; paid expenses contribute deductible input VAT.
    const vatSummaryResult = await query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - ($2::int * INTERVAL '1 month'),
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS month
      ),
      invoice_totals AS (
        SELECT
          date_trunc('month', issue_date)::date AS month,
          COALESCE(SUM(
            CASE
              WHEN currency = 'CZK' THEN subtotal
              WHEN exchange_rate IS NOT NULL THEN subtotal * exchange_rate
              ELSE 0
            END
          ), 0) AS net_revenue,
          COALESCE(SUM(
            CASE
              WHEN currency = 'CZK' THEN vat_amount
              WHEN exchange_rate IS NOT NULL THEN vat_amount * exchange_rate
              ELSE 0
            END
          ), 0) AS output_vat,
          COUNT(*) FILTER (
            WHERE currency <> 'CZK' AND exchange_rate IS NULL
          ) AS excluded_foreign_invoice_count
        FROM invoices
        WHERE user_id = $1
          AND status IN ('sent', 'overdue', 'paid')
          AND issue_date >= date_trunc('month', CURRENT_DATE) - ($2::int * INTERVAL '1 month')
          AND issue_date <= CURRENT_DATE
        GROUP BY date_trunc('month', issue_date)
      ),
      expense_totals AS (
        SELECT
          date_trunc('month', issue_date)::date AS month,
          COALESCE(SUM(vat_amount) FILTER (WHERE currency = 'CZK'), 0) AS input_vat,
          COUNT(*) FILTER (WHERE currency <> 'CZK') AS excluded_foreign_expense_count
        FROM expenses
        WHERE user_id = $1
          AND status = 'paid'
          AND issue_date >= date_trunc('month', CURRENT_DATE) - ($2::int * INTERVAL '1 month')
          AND issue_date <= CURRENT_DATE
        GROUP BY date_trunc('month', issue_date)
      )
      SELECT
        to_char(months.month, 'YYYY-MM-DD') AS month,
        CURRENT_DATE::text AS period_end,
        COALESCE(invoice_totals.net_revenue, 0) AS net_revenue,
        COALESCE(invoice_totals.output_vat, 0) AS output_vat,
        COALESCE(expense_totals.input_vat, 0) AS input_vat,
        COALESCE(invoice_totals.excluded_foreign_invoice_count, 0) AS excluded_foreign_invoice_count,
        COALESCE(expense_totals.excluded_foreign_expense_count, 0) AS excluded_foreign_expense_count
      FROM months
      LEFT JOIN invoice_totals ON invoice_totals.month = months.month
      LEFT JOIN expense_totals ON expense_totals.month = months.month
      ORDER BY months.month ASC
    `, [req.userId, vatMonthsBeforeCurrent]);

    const vatMonths = vatSummaryResult.rows.map(row => {
      const outputVat = parseFloat(row.output_vat);
      const inputVat = parseFloat(row.input_vat);

      return {
        month: row.month,
        netRevenue: parseFloat(row.net_revenue),
        outputVat,
        inputVat,
        estimatedVatDue: outputVat - inputVat
      };
    });

    const vatSummary = vatMonths.reduce((summary, month) => ({
      netRevenue: summary.netRevenue + month.netRevenue,
      outputVat: summary.outputVat + month.outputVat,
      inputVat: summary.inputVat + month.inputVat,
      estimatedVatDue: summary.estimatedVatDue + month.estimatedVatDue
    }), { netRevenue: 0, outputVat: 0, inputVat: 0, estimatedVatDue: 0 });

    const excludedForeignInvoiceCount = vatSummaryResult.rows.reduce(
      (total, row) => total + parseInt(row.excluded_foreign_invoice_count),
      0
    );
    const excludedForeignExpenseCount = vatSummaryResult.rows.reduce(
      (total, row) => total + parseInt(row.excluded_foreign_expense_count),
      0
    );

    const pausalniDanSettings = settingsResult.rows[0] || { pausalni_dan_enabled: false, pausalni_dan_tier: 1, pausalni_dan_limit: 1000000 };
    const tier = pausalniDanSettings.pausalni_dan_tier || 1;
    const limit = pausalniDanSettings.pausalni_dan_limit || 1000000;
    const invoicedThisYear = parseFloat(yearlyInvoicedResult.rows[0].total_invoiced);

    res.json({
      stats: {
        draftCount: parseInt(stats.draft_count),
        sentCount: parseInt(stats.sent_count),
        paidCount: parseInt(stats.paid_count),
        overdueCount: parseInt(stats.overdue_count),
        cancelledCount: parseInt(stats.cancelled_count),
        outstandingAmount: parseFloat(stats.outstanding_amount),
        paidAmount: parseFloat(stats.paid_amount),
        paidThisMonth: parseFloat(stats.paid_this_month)
      },
      recentInvoices: recentResult.rows.map(row => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        currency: row.currency,
        total: parseFloat(row.total),
        issueDate: row.issue_date,
        dueDate: row.due_date,
        clientName: row.client_name
      })),
      monthlyRevenue: revenueResult.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue),
        invoiceCount: parseInt(row.invoice_count)
      })),
      monthlyExpenses: expensesResult.rows.map(row => ({
        month: row.month,
        expenses: parseFloat(row.expenses),
        expenseCount: parseInt(row.expense_count)
      })),
      yearlyExpenses: parseFloat(yearlyExpensesResult.rows[0].total_expenses),
      unmatchedPayments: parseInt(unmatchedPaymentsResult.rows[0].count),
      pausalniDan: {
        enabled: pausalniDanSettings.pausalni_dan_enabled ?? false,
        tier: tier,
        limit: limit,
        invoicedThisYear: invoicedThisYear,
        remaining: Math.max(0, limit - invoicedThisYear)
      },
      vatSummary: {
        enabled: pausalniDanSettings.vat_payer ?? false,
        periodMonths: vatPeriodMonths,
        periodStart: vatMonths[0]?.month ?? null,
        periodEnd: vatSummaryResult.rows[0]?.period_end ?? null,
        currency: 'CZK',
        ...vatSummary,
        excludedForeignInvoiceCount,
        excludedForeignExpenseCount,
        months: vatMonths
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// Get quick stats for header
dashboardRouter.get('/quick-stats', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('sent', 'overdue')) as unpaid_count,
        COALESCE(SUM(CASE WHEN currency = 'CZK' THEN total ELSE COALESCE(total_czk, 0) END) FILTER (WHERE status IN ('sent', 'overdue')), 0) as unpaid_amount
      FROM invoices
      WHERE user_id = $1
    `, [req.userId]);

    res.json({
      unpaidCount: parseInt(result.rows[0].unpaid_count),
      unpaidAmount: parseFloat(result.rows[0].unpaid_amount)
    });
  } catch (error) {
    console.error('Quick stats error:', error);
    res.status(500).json({ error: 'Failed to get quick stats' });
  }
});
