import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/init';
import { AuthRequest } from '../middleware/auth';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { sendInvoiceEmail } from '../services/emailSender';
import { generateSpayd, generateInvoiceNumber as renderInvoiceNumber } from '../utils/validation';
import { t, formatDateLocale, formatCurrencyLocale } from '../i18n/translations';
import { convertEurToCzk } from '../services/cnbExchangeRate';

export const invoiceRouter: ReturnType<typeof Router> = Router();

const DEFAULT_INVOICE_NUMBER_FORMAT = '{YYYY}{MM}{SEQ2}';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Match invoice numbers for one numbering period and capture their sequence.
type InvoiceNumberResetPeriod = 'monthly' | 'yearly';

function buildSequenceRegex(
  format: string,
  prefix: string,
  year: number,
  month: number,
  resetPeriod: InvoiceNumberResetPeriod
): RegExp {
  const tokenPattern = /\{(YYYY|YY|MM|SEQ(?:[2-4])?)\}/g;
  let pattern = escapeRegex(prefix);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(format)) !== null) {
    pattern += escapeRegex(format.slice(lastIndex, match.index));

    const token = match[1];
    if (token === 'YYYY') pattern += year.toString();
    else if (token === 'YY') pattern += year.toString().slice(-2);
    else if (token === 'MM') {
      pattern += resetPeriod === 'monthly'
        ? month.toString().padStart(2, '0')
        : '(?:0[1-9]|1[0-2])';
    } else {
      const width = token === 'SEQ' ? 0 : parseInt(token.slice(3), 10);
      pattern += width > 0 ? `(\\d{${width},})` : '(\\d+)';
    }

    lastIndex = match.index + match[0].length;
  }

  pattern += escapeRegex(format.slice(lastIndex));
  return new RegExp(`^${pattern}$`);
}

// Generate an invoice number using the configured template and the next
// available sequence in the current month/year numbering period.
export async function generateInvoiceNumber(userId: string, issueDate: string, attempt: number = 0): Promise<{ invoiceNumber: string; variableSymbol: string }> {
  const date = new Date(issueDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const settingsResult = await query(
    'SELECT invoice_number_prefix, invoice_number_format, invoice_number_starting_sequence, invoice_number_reset_period FROM settings WHERE user_id = $1',
    [userId]
  );
  const settings = settingsResult.rows[0] || {};
  const prefix = settings.invoice_number_prefix || '';
  const format = settings.invoice_number_format || DEFAULT_INVOICE_NUMBER_FORMAT;
  const startingSequence = Math.max(1, parseInt(settings.invoice_number_starting_sequence, 10) || 1);
  const resetPeriod: InvoiceNumberResetPeriod = settings.invoice_number_reset_period === 'yearly' ? 'yearly' : 'monthly';

  const sequencePattern = buildSequenceRegex(format, prefix, year, month, resetPeriod);
  const existingInvoices = await query(
    'SELECT invoice_number, issue_date FROM invoices WHERE user_id = $1',
    [userId]
  );

  let highestSequence = 0;
  const invoicesInPeriod = existingInvoices.rows.filter(row => {
    const existingDate = new Date(row.issue_date);
    return existingDate.getFullYear() === year
      && (resetPeriod === 'yearly' || existingDate.getMonth() + 1 === month);
  });

  for (const row of invoicesInPeriod) {
    const match = sequencePattern.exec(row.invoice_number);
    if (!match) continue;

    const sequence = parseInt(match[1], 10);
    if (!isNaN(sequence) && sequence > highestSequence) highestSequence = sequence;
  }

  // Starting sequence only bootstraps a user who has no invoices yet. New
  // periods start at 1 after invoice history exists.
  const periodStart = existingInvoices.rows.length === 0 ? startingSequence : 1;
  const sequence = Math.max(highestSequence, periodStart - 1) + 1 + attempt;
  const invoiceNumber = `${prefix}${renderInvoiceNumber(format, sequence, year, month)}`;

  const variableSymbol = invoiceNumber.replace(/\D/g, '') || sequence.toString();

  return { invoiceNumber, variableSymbol };
}

// Get all invoices
invoiceRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, clientId, from, to, recurringId } = req.query;

    let sql = `
      SELECT i.*, c.company_name as client_name, c.primary_email as client_email
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.user_id = $1
    `;
    const params: any[] = [req.userId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND i.status = $${paramIndex++}`;
      params.push(status);
    }

    if (clientId) {
      sql += ` AND i.client_id = $${paramIndex++}`;
      params.push(clientId);
    }

    if (from) {
      sql += ` AND i.issue_date >= $${paramIndex++}`;
      params.push(from);
    }

    if (to) {
      sql += ` AND i.issue_date <= $${paramIndex++}`;
      params.push(to);
    }

    if (recurringId) {
      sql += ` AND i.recurring_invoice_id = $${paramIndex++}`;
      params.push(recurringId);
    }

    sql += ' ORDER BY i.issue_date DESC, i.created_at DESC';

    const result = await query(sql, params);

    const invoices = result.rows.map(row => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      variableSymbol: row.variable_symbol,
      status: row.status,
      currency: row.currency,
      clientId: row.client_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      deliveryDate: row.delivery_date,
      subtotal: parseFloat(row.subtotal),
      vatRate: parseFloat(row.vat_rate),
      vatAmount: parseFloat(row.vat_amount),
      total: parseFloat(row.total),
      notes: row.notes,
      sentAt: row.sent_at,
      paidAt: row.paid_at,
      recurringInvoiceId: row.recurring_invoice_id,
      exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : null,
      totalCzk: row.total_czk ? parseFloat(row.total_czk) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json(invoices);
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

// Get single invoice with items
invoiceRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const invoiceResult = await query(
      `SELECT i.*, c.company_name as client_name, c.primary_email as client_email,
              c.secondary_email as client_secondary_email, c.address as client_address,
              c.ico as client_ico, c.dic as client_dic, c.contact_person as client_contact
       FROM invoices i
       JOIN clients c ON i.client_id = c.id
       WHERE i.id = $1 AND i.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const itemsResult = await query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order ASC',
      [req.params.id]
    );

    const row = invoiceResult.rows[0];
    const invoice = {
      id: row.id,
      invoiceNumber: row.invoice_number,
      variableSymbol: row.variable_symbol,
      status: row.status,
      currency: row.currency,
      clientId: row.client_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      clientSecondaryEmail: row.client_secondary_email,
      clientAddress: row.client_address,
      clientIco: row.client_ico,
      clientDic: row.client_dic,
      clientContact: row.client_contact,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      deliveryDate: row.delivery_date,
      subtotal: parseFloat(row.subtotal),
      vatRate: parseFloat(row.vat_rate),
      vatAmount: parseFloat(row.vat_amount),
      total: parseFloat(row.total),
      notes: row.notes,
      paymentMethod: row.payment_method,
      qrPaymentData: row.qr_payment_data,
      sentAt: row.sent_at,
      paidAt: row.paid_at,
      primaryEmailSentAt: row.primary_email_sent_at,
      secondaryEmailSentAt: row.secondary_email_sent_at,
      exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : null,
      totalCzk: row.total_czk ? parseFloat(row.total_czk) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: itemsResult.rows.map(item => ({
        id: item.id,
        description: item.description,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        unitPrice: parseFloat(item.unit_price),
        total: parseFloat(item.total)
      }))
    };

    res.json(invoice);
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

// Create invoice
invoiceRouter.post('/',
  body('clientId').isUUID(),
  body('issueDate').isISO8601(),
  body('dueDate').isISO8601(),
  body('items').isArray({ min: 1 }),
  body('items.*.description').isLength({ max: 150 }).withMessage('Item description must not exceed 150 characters'),
  body('notes').optional().isLength({ max: 300 }).withMessage('Notes must not exceed 300 characters'),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { clientId, issueDate, dueDate, deliveryDate, items, notes, currency = 'CZK', vatRate = 21 } = req.body;

    try {
      // Verify client belongs to user
      const clientCheck = await query(
        'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
        [clientId, req.userId]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid client' });
      }

      // Calculate totals
      let subtotal = 0;
      for (const item of items) {
        subtotal += item.quantity * item.unitPrice;
      }
      const vatAmount = subtotal * (vatRate / 100);
      const total = subtotal + vatAmount;

      // Get user's bank details for QR code
      const userResult = await query(
        'SELECT bank_account, bank_code, language FROM users WHERE id = $1',
        [req.userId]
      );
      const user = userResult.rows[0];

      // Retry loop to handle race conditions with invoice number generation
      const MAX_RETRIES = 3;
      let invoice;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Generate invoice number based on issue date
          const { invoiceNumber, variableSymbol } = await generateInvoiceNumber(req.userId!, issueDate, attempt);

          // Generate QR payment data (SPAYD format) for CZK invoices
          let qrPaymentData = null;
          if (currency === 'CZK' && user.bank_account && user.bank_code) {
            qrPaymentData = generateSpayd(
              user.bank_account,
              user.bank_code,
              total,
              currency,
              variableSymbol,
              `${user.language === 'en' ? 'Invoice' : 'Faktura'} ${invoiceNumber}`
            );
          }

          // Fetch exchange rate for EUR invoices
          let exchangeRate: number | null = null;
          let totalCzk: number | null = null;
          if (currency === 'EUR') {
            const conversion = await convertEurToCzk(total, issueDate);
            if (conversion) {
              exchangeRate = conversion.rate;
              totalCzk = conversion.czkAmount;
            }
          }

          // Create invoice
          const invoiceResult = await query(
            `INSERT INTO invoices (user_id, client_id, invoice_number, variable_symbol, status, currency, issue_date, due_date, delivery_date, subtotal, vat_rate, vat_amount, total, notes, qr_payment_data, exchange_rate, total_czk)
             VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [req.userId, clientId, invoiceNumber, variableSymbol, currency, issueDate, dueDate, deliveryDate || issueDate, subtotal, vatRate, vatAmount, total, notes, qrPaymentData, exchangeRate, totalCzk]
          );

          invoice = invoiceResult.rows[0];
          break; // Success, exit retry loop
        } catch (err: any) {
          // Retry on duplicate key violation (race condition between concurrent requests)
          if (err.code === '23505' && err.constraint === 'invoices_user_invoice_number_key' && attempt < MAX_RETRIES) {
            continue;
          }
          throw err;
        }
      }

      // Create invoice items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemTotal = item.quantity * item.unitPrice;
        await query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [invoice.id, item.description, item.quantity, item.unit || null, item.unitPrice, itemTotal, i]
        );
      }

      res.status(201).json({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        variableSymbol: invoice.variable_symbol,
        status: invoice.status,
        currency: invoice.currency,
        total: parseFloat(invoice.total)
      });
    } catch (error) {
      console.error('Create invoice error:', error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
);

// Update invoice
invoiceRouter.put('/:id',
  body('items').optional().isArray({ min: 1 }),
  body('items.*.description').optional().isLength({ max: 150 }).withMessage('Item description must not exceed 150 characters'),
  body('notes').optional().isLength({ max: 300 }).withMessage('Notes must not exceed 300 characters'),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { clientId, issueDate, dueDate, deliveryDate, items, notes, currency, vatRate, status } = req.body;

    try {
      // Check invoice exists and is draft (can only edit drafts)
      const invoiceCheck = await query(
        'SELECT status, issue_date, currency, invoice_number, variable_symbol, total FROM invoices WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId]
      );

      if (invoiceCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoiceCheck.rows[0].status !== 'draft' && !status) {
        return res.status(400).json({ error: 'Can only edit draft invoices' });
      }

      // If only updating status
      if (status && !items) {
        await query(
          `UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
          [status, req.params.id, req.userId]
        );
        return res.json({ message: 'Invoice status updated' });
      }

      // Calculate totals if items provided
      let subtotal = 0;
      let vatAmount = 0;
      let total = 0;
      const actualVatRate = vatRate ?? 21;

      if (items) {
        for (const item of items) {
          subtotal += item.quantity * item.unitPrice;
        }
        vatAmount = subtotal * (actualVatRate / 100);
        total = subtotal + vatAmount;

        // Delete existing items
        await query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);

        // Create new items
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemTotal = item.quantity * item.unitPrice;
          await query(
            `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, total, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.params.id, item.description, item.quantity, item.unit || null, item.unitPrice, itemTotal, i]
          );
        }
      }

      // Fetch exchange rate for EUR invoices when items are recalculated
      let exchangeRate: number | null = null;
      let totalCzk: number | null = null;
      const effectiveCurrency = currency || invoiceCheck.rows[0].currency;
      if (items && effectiveCurrency === 'EUR') {
        const effectiveIssueDate = issueDate || invoiceCheck.rows[0].issue_date;
        const conversion = await convertEurToCzk(total, typeof effectiveIssueDate === 'string' ? effectiveIssueDate : new Date(effectiveIssueDate).toISOString().split('T')[0]);
        if (conversion) {
          exchangeRate = conversion.rate;
          totalCzk = conversion.czkAmount;
        }
      }

      // Regenerate QR payment data when totals or currency change so the SPAYD
      // payload reflects the edited amount instead of the original draft amount.
      let qrPaymentData: string | null | undefined = undefined;
      if (items || currency) {
        if (effectiveCurrency === 'CZK') {
          const userResult = await query(
            'SELECT bank_account, bank_code, language FROM users WHERE id = $1',
            [req.userId]
          );
          const user = userResult.rows[0];
          if (user?.bank_account && user?.bank_code) {
            const qrTotal = items ? total : null;
            const effectiveTotal = qrTotal ?? parseFloat(invoiceCheck.rows[0].total ?? '0');
            qrPaymentData = generateSpayd(
              user.bank_account,
              user.bank_code,
              effectiveTotal,
              'CZK',
              invoiceCheck.rows[0].variable_symbol,
              `${user.language === 'en' ? 'Invoice' : 'Faktura'} ${invoiceCheck.rows[0].invoice_number}`
            );
          } else {
            qrPaymentData = null;
          }
        } else {
          qrPaymentData = null;
        }
      }

      // Update invoice
      const result = await query(
        `UPDATE invoices SET
          client_id = COALESCE($1, client_id),
          issue_date = COALESCE($2, issue_date),
          due_date = COALESCE($3, due_date),
          delivery_date = COALESCE($4, delivery_date),
          currency = COALESCE($5, currency),
          vat_rate = COALESCE($6, vat_rate),
          subtotal = COALESCE($7, subtotal),
          vat_amount = COALESCE($8, vat_amount),
          total = COALESCE($9, total),
          notes = $10,
          status = COALESCE($11, status),
          exchange_rate = COALESCE($14, exchange_rate),
          total_czk = COALESCE($15, total_czk),
          qr_payment_data = CASE WHEN $16::boolean THEN $17 ELSE qr_payment_data END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $12 AND user_id = $13
         RETURNING *`,
        [clientId, issueDate, dueDate, deliveryDate, currency, actualVatRate,
         items ? subtotal : null, items ? vatAmount : null, items ? total : null,
         notes, status, req.params.id, req.userId, exchangeRate, totalCzk,
         qrPaymentData !== undefined, qrPaymentData ?? null]
      );

      res.json({
        id: result.rows[0].id,
        invoiceNumber: result.rows[0].invoice_number,
        status: result.rows[0].status,
        total: parseFloat(result.rows[0].total)
      });
    } catch (error) {
      console.error('Update invoice error:', error);
      res.status(500).json({ error: 'Failed to update invoice' });
    }
  }
);

// Delete invoice
invoiceRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const invoiceCheck = await query(
      'SELECT status FROM invoices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    await query('DELETE FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// Generate PDF
invoiceRouter.get('/:id/pdf', async (req: AuthRequest, res: Response) => {
  try {
    const pdfBuffer = await generateInvoicePDF(req.params.id as string, req.userId!);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${req.params.id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Preview invoice email before sending
invoiceRouter.get('/:id/preview', async (req: AuthRequest, res: Response) => {
  try {
    // Get invoice with client details
    const invoiceResult = await query(
      `SELECT i.invoice_number, i.total, i.currency, i.due_date, i.status,
              c.company_name as client_name, c.primary_email, c.secondary_email
       FROM invoices i
       JOIN clients c ON i.client_id = c.id
       WHERE i.id = $1 AND i.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot preview cancelled invoice' });
    }

    // Get user settings for email template
    const settingsResult = await query(
      'SELECT smtp_from_name, email_template FROM settings WHERE user_id = $1',
      [req.userId]
    );

    const settings = settingsResult.rows[0] || {};

    // Get user language
    const userResult = await query('SELECT language FROM users WHERE id = $1', [req.userId]);
    const language = userResult.rows[0]?.language || 'cs';
    const tr = t(language).email;

    const template = settings.email_template || tr.defaultTemplate;
    const emailBody = template
      .replace(/\{\{invoiceNumber\}\}/g, invoice.invoice_number)
      .replace(/\{\{total\}\}/g, formatCurrencyLocale(parseFloat(invoice.total), invoice.currency, language))
      .replace(/\{\{dueDate\}\}/g, formatDateLocale(invoice.due_date, language))
      .replace(/\{\{clientName\}\}/g, invoice.client_name)
      .replace(/\{\{senderName\}\}/g, settings.smtp_from_name || tr.supplierFallback);

    const subject = tr.invoiceSubject.replace('{{number}}', invoice.invoice_number);

    // Generate PDF as base64
    const pdfBuffer = await generateInvoicePDF(req.params.id as string, req.userId!);
    const pdfBase64 = pdfBuffer.toString('base64');

    res.json({
      subject,
      emailBody,
      pdfBase64,
      recipients: {
        primary: invoice.primary_email,
        secondary: invoice.secondary_email
      }
    });
  } catch (error) {
    console.error('Preview invoice error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Send invoice via email
invoiceRouter.post('/:id/send', async (req: AuthRequest, res: Response) => {
  const { sendToSecondary = false, secondaryEmail, customMessage } = req.body;

  try {
    // Check invoice exists and is not draft
    const invoiceCheck = await query(
      `SELECT i.*, c.primary_email, c.secondary_email, c.company_name as client_name
       FROM invoices i
       JOIN clients c ON i.client_id = c.id
       WHERE i.id = $1 AND i.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceCheck.rows[0];

    if (invoice.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot send cancelled invoice' });
    }

    // Use provided secondary email or fall back to client's secondary email
    const effectiveSecondaryEmail = sendToSecondary
      ? (secondaryEmail || invoice.secondary_email)
      : null;

    // Send email
    const result = await sendInvoiceEmail(
      req.params.id as string,
      req.userId!,
      invoice.primary_email,
      effectiveSecondaryEmail,
      customMessage
    );

    if (result.success) {
      // Update invoice status to sent
      await query(
        `UPDATE invoices SET
          status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
          sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
          primary_email_sent_at = CURRENT_TIMESTAMP,
          secondary_email_sent_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE secondary_email_sent_at END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [!!effectiveSecondaryEmail, req.params.id]
      );

      res.json({ message: 'Invoice sent successfully', sentTo: result.sentTo });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send invoice' });
    }
  } catch (error) {
    console.error('Send invoice error:', error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

// Mark invoice as sent manually (used when user downloads PDF and delivers it themselves)
invoiceRouter.post('/:id/mark-sent', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE invoices SET
        status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
        sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status != 'cancelled'
       RETURNING *`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or cancelled' });
    }

    res.json({ message: 'Invoice marked as sent', invoice: result.rows[0] });
  } catch (error) {
    console.error('Mark sent error:', error);
    res.status(500).json({ error: 'Failed to mark invoice as sent' });
  }
});

// Mark invoice as paid manually
invoiceRouter.post('/:id/mark-paid',
  body('paidAt').optional().isISO8601(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { paidAt } = req.body;

    try {
      const result = await query(
        `UPDATE invoices SET
          status = 'paid',
          paid_at = COALESCE($1, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3 AND status != 'cancelled'
         RETURNING *`,
        [paidAt, req.params.id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found or already cancelled' });
      }

      res.json({ message: 'Invoice marked as paid', invoice: result.rows[0] });
    } catch (error) {
      console.error('Mark paid error:', error);
      res.status(500).json({ error: 'Failed to mark invoice as paid' });
    }
  }
);

// Cancel invoice
invoiceRouter.post('/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE invoices SET
        status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status NOT IN ('paid')
       RETURNING *`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or already paid' });
    }

    res.json({ message: 'Invoice cancelled', invoice: result.rows[0] });
  } catch (error) {
    console.error('Cancel invoice error:', error);
    res.status(500).json({ error: 'Failed to cancel invoice' });
  }
});
