import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database query function
const mockQuery = vi.fn();
vi.mock('../db/init.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args)
}));

// Import after mocking
import { dashboardRouter } from './dashboard';
import express from 'express';
import request from 'supertest';

// Create test app
const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, _res, next) => {
  (req as any).userId = 'test-user-id';
  next();
});

app.use('/dashboard', dashboardRouter);

describe('Dashboard Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /dashboard', () => {
    it('should read paušální daň from users table, not settings', async () => {
      // Stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          draft_count: '0', sent_count: '1', paid_count: '2',
          overdue_count: '0', cancelled_count: '0',
          outstanding_amount: '10000', paid_amount: '20000', paid_this_month: '5000'
        }]
      });
      // Recent invoices
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Monthly revenue
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Monthly expenses
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Yearly expenses
      mockQuery.mockResolvedValueOnce({ rows: [{ total_expenses: '0' }] });
      // Update overdue
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Unmatched payments
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Paušální daň from users table
      mockQuery.mockResolvedValueOnce({
        rows: [{
          vat_payer: true,
          pausalni_dan_enabled: true,
          pausalni_dan_tier: 2,
          pausalni_dan_limit: 1500000
        }]
      });
      // Yearly invoiced
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_invoiced: '500000' }]
      });
      // Three-month VAT summary
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            month: '2026-04-01', period_end: '2026-06-20',
            net_revenue: '100000', output_vat: '21000', input_vat: '4000',
            excluded_foreign_invoice_count: '0', excluded_foreign_expense_count: '0'
          },
          {
            month: '2026-05-01', period_end: '2026-06-20',
            net_revenue: '50000', output_vat: '10500', input_vat: '2500',
            excluded_foreign_invoice_count: '1', excluded_foreign_expense_count: '0'
          },
          {
            month: '2026-06-01', period_end: '2026-06-20',
            net_revenue: '25000', output_vat: '5250', input_vat: '750',
            excluded_foreign_invoice_count: '0', excluded_foreign_expense_count: '2'
          }
        ]
      });

      const response = await request(app).get('/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.pausalniDan).toBeDefined();
      expect(response.body.pausalniDan.enabled).toBe(true);
      expect(response.body.pausalniDan.tier).toBe(2);
      expect(response.body.pausalniDan.limit).toBe(1500000);
      expect(response.body.pausalniDan.invoicedThisYear).toBe(500000);
      expect(response.body.pausalniDan.remaining).toBe(1000000);
      expect(response.body.vatSummary).toEqual({
        enabled: true,
        periodMonths: 3,
        periodStart: '2026-04-01',
        periodEnd: '2026-06-20',
        currency: 'CZK',
        netRevenue: 175000,
        outputVat: 36750,
        inputVat: 7250,
        estimatedVatDue: 29500,
        excludedForeignInvoiceCount: 1,
        excludedForeignExpenseCount: 2,
        months: [
          { month: '2026-04-01', netRevenue: 100000, outputVat: 21000, inputVat: 4000, estimatedVatDue: 17000 },
          { month: '2026-05-01', netRevenue: 50000, outputVat: 10500, inputVat: 2500, estimatedVatDue: 8000 },
          { month: '2026-06-01', netRevenue: 25000, outputVat: 5250, inputVat: 750, estimatedVatDue: 4500 }
        ]
      });

      // Verify the paušální daň query reads from users table, not settings
      const pausalniDanQuery = mockQuery.mock.calls[7][0];
      expect(pausalniDanQuery).toContain('FROM users');
      expect(pausalniDanQuery).not.toContain('FROM settings');
    });

    it('should handle user without paušální daň enabled', async () => {
      // Stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          draft_count: '0', sent_count: '0', paid_count: '0',
          overdue_count: '0', cancelled_count: '0',
          outstanding_amount: '0', paid_amount: '0', paid_this_month: '0'
        }]
      });
      // Recent invoices
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Monthly revenue
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Monthly expenses
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Yearly expenses
      mockQuery.mockResolvedValueOnce({ rows: [{ total_expenses: '0' }] });
      // Update overdue
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Unmatched payments
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Paušální daň - not enabled
      mockQuery.mockResolvedValueOnce({
        rows: [{
          vat_payer: false,
          pausalni_dan_enabled: false,
          pausalni_dan_tier: 1,
          pausalni_dan_limit: 1000000
        }]
      });
      // Yearly invoiced
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_invoiced: '0' }]
      });
      // Empty three-month VAT summary
      mockQuery.mockResolvedValueOnce({
        rows: [
          { month: '2026-04-01', period_end: '2026-06-20', net_revenue: '0', output_vat: '0', input_vat: '0', excluded_foreign_invoice_count: '0', excluded_foreign_expense_count: '0' },
          { month: '2026-05-01', period_end: '2026-06-20', net_revenue: '0', output_vat: '0', input_vat: '0', excluded_foreign_invoice_count: '0', excluded_foreign_expense_count: '0' },
          { month: '2026-06-01', period_end: '2026-06-20', net_revenue: '0', output_vat: '0', input_vat: '0', excluded_foreign_invoice_count: '0', excluded_foreign_expense_count: '0' }
        ]
      });

      const response = await request(app).get('/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.pausalniDan.enabled).toBe(false);
      expect(response.body.pausalniDan.remaining).toBe(1000000);
      expect(response.body.vatSummary.estimatedVatDue).toBe(0);
    });

    it('should calculate VAT from issued invoices and paid expenses by issue date', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ draft_count: '0', sent_count: '0', paid_count: '0', overdue_count: '0', cancelled_count: '0', outstanding_amount: '0', paid_amount: '0', paid_this_month: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_expenses: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ vat_payer: true, pausalni_dan_enabled: false, pausalni_dan_tier: 1, pausalni_dan_limit: 1000000 }] })
        .mockResolvedValueOnce({ rows: [{ total_invoiced: '0' }] })
        .mockResolvedValueOnce({ rows: [
          { month: '2026-06-01', period_end: '2026-06-20', net_revenue: '1000', output_vat: '210', input_vat: '42', excluded_foreign_invoice_count: '0', excluded_foreign_expense_count: '0' }
        ] });

      await request(app).get('/dashboard?vatMonths=6');

      const vatQuery = mockQuery.mock.calls[9][0];
      const vatQueryParams = mockQuery.mock.calls[9][1];
      expect(vatQuery).toContain("status IN ('sent', 'overdue', 'paid')");
      expect(vatQuery).toContain("status = 'paid'");
      expect(vatQuery).toContain('issue_date <= CURRENT_DATE');
      expect(vatQuery).toContain('vat_amount * exchange_rate');
      expect(vatQuery).toContain("$2::int * INTERVAL '1 month'");
      expect(vatQueryParams).toEqual(['test-user-id', 5]);
    });
  });
});
