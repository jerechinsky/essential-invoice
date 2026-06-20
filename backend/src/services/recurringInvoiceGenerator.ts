import { query, pool } from '../db/init';
import { generateInvoiceNumber } from '../routes/invoices';
import { generateSpayd } from '../utils/validation';
import { sendInvoiceEmail } from './emailSender';
import { convertEurToCzk } from './cnbExchangeRate';
import { log } from '../utils/logger';

let generationInterval: NodeJS.Timeout | null = null;

interface RecurringInvoiceRow {
  id: string;
  user_id: string;
  client_id: string;
  currency: string;
  vat_rate: string;
  notes: string | null;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  next_generation_date: string | Date;
  payment_terms: number;
  auto_send: boolean;
  active: boolean;
}

interface GenerateResult {
  success: boolean;
  invoiceId?: string;
  error?: string;
}

export async function generateInvoiceFromRecurring(template: RecurringInvoiceRow): Promise<GenerateResult> {
  try {
    const vatRate = parseFloat(template.vat_rate);

    // Idempotency check: skip if an invoice was already generated for this template in the current billing period
    const existingInvoice = await query(
      `SELECT id FROM invoices
       WHERE recurring_invoice_id = $1
         AND DATE_TRUNC('month', issue_date::date) = DATE_TRUNC('month', CURRENT_DATE)`,
      [template.id]
    );
    if (existingInvoice.rows.length > 0) {
      log.info(`  Skipping template ${template.id} - invoice already generated this month`);
      return { success: false, error: 'Invoice already generated for this billing period' };
    }

    // Get template items
    const itemsResult = await query(
      'SELECT * FROM recurring_invoice_items WHERE recurring_invoice_id = $1 ORDER BY sort_order ASC',
      [template.id]
    );

    if (itemsResult.rows.length === 0) {
      return { success: false, error: 'No items in recurring template' };
    }

    // Calculate dates
    const issueDate = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + template.payment_terms * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate totals
    let subtotal = 0;
    for (const item of itemsResult.rows) {
      subtotal += parseFloat(item.quantity) * parseFloat(item.unit_price);
    }
    const vatAmount = subtotal * (vatRate / 100);
    const total = subtotal + vatAmount;

    // Get user's bank details for QR code
    const userResult = await query(
      'SELECT bank_account, bank_code, language FROM users WHERE id = $1',
      [template.user_id]
    );
    const user = userResult.rows[0];

    // Generate invoice number with retry
    const MAX_RETRIES = 3;
    let invoice;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { invoiceNumber, variableSymbol } = await generateInvoiceNumber(template.user_id, issueDate, attempt);

        // Generate QR payment data for CZK invoices
        let qrPaymentData = null;
        if (template.currency === 'CZK' && user?.bank_account && user?.bank_code) {
          qrPaymentData = generateSpayd(
            user.bank_account,
            user.bank_code,
            total,
            template.currency,
            variableSymbol,
            `${(user?.language === 'en' ? 'Invoice' : 'Faktura')} ${invoiceNumber}`
          );
        }

        // Fetch exchange rate for EUR invoices
        let exchangeRate: number | null = null;
        let totalCzk: number | null = null;
        if (template.currency === 'EUR') {
          const conversion = await convertEurToCzk(total, issueDate);
          if (conversion) {
            exchangeRate = conversion.rate;
            totalCzk = conversion.czkAmount;
          }
        }

        const invoiceResult = await query(
          `INSERT INTO invoices (user_id, client_id, invoice_number, variable_symbol, status, currency, issue_date, due_date, delivery_date, subtotal, vat_rate, vat_amount, total, notes, qr_payment_data, recurring_invoice_id, exchange_rate, total_czk)
           VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING *`,
          [template.user_id, template.client_id, invoiceNumber, variableSymbol, template.currency, issueDate, dueDate, issueDate, subtotal, vatRate, vatAmount, total, template.notes, qrPaymentData, template.id, exchangeRate, totalCzk]
        );

        invoice = invoiceResult.rows[0];
        break;
      } catch (err: any) {
        if (err.code === '23505' && err.constraint === 'invoices_user_invoice_number_key' && attempt < MAX_RETRIES) {
          continue;
        }
        throw err;
      }
    }

    if (!invoice) {
      return { success: false, error: 'Failed to generate invoice number' };
    }

    // Create invoice items
    for (let i = 0; i < itemsResult.rows.length; i++) {
      const item = itemsResult.rows[i];
      const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      await query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, total, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [invoice.id, item.description, item.quantity, item.unit, item.unit_price, itemTotal, i]
      );
    }

    // Advance next_generation_date by one month (day_of_month is 1-28, safe for all months)
    // Use string parsing to avoid timezone issues with Date objects
    const nextDateStr = template.next_generation_date instanceof Date
      ? template.next_generation_date.toISOString().split('T')[0]
      : String(template.next_generation_date);
    const [curYear, curMonth] = nextDateStr.split('-').map(Number);
    const newMonth = curMonth === 12 ? 1 : curMonth + 1;
    const newYear = curMonth === 12 ? curYear + 1 : curYear;
    const daysInNewMonth = new Date(Date.UTC(newYear, newMonth, 0)).getDate();
    const safeDay = Math.min(template.day_of_month, daysInNewMonth);
    const nextGenStr = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

    await query(
      'UPDATE recurring_invoices SET next_generation_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextGenStr, template.id]
    );

    log.info(`  Generated invoice ${invoice.invoice_number} from recurring template ${template.id}`);

    // Auto-send if enabled
    if (template.auto_send) {
      try {
        const clientResult = await query(
          `SELECT c.primary_email, c.secondary_email,
                  COALESCE(s.accountant_send_default, false) AS accountant_send_default
           FROM clients c
           LEFT JOIN settings s ON s.user_id = $2
           WHERE c.id = $1`,
          [template.client_id, template.user_id]
        );
        const client = clientResult.rows[0];
        if (client) {
          const sendResult = await sendInvoiceEmail(
            invoice.id,
            template.user_id,
            client.primary_email,
            null,
            undefined,
            client.accountant_send_default
          );
          if (sendResult.success) {
            await query(
              `UPDATE invoices SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
                 primary_email_sent_at = CURRENT_TIMESTAMP,
                 accountant_email_sent_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE accountant_email_sent_at END,
                 accountant_email_sent_to = CASE WHEN $1 THEN $2 ELSE accountant_email_sent_to END,
                 updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
              [!!sendResult.accountantSent, sendResult.accountantEmail || null, invoice.id]
            );
            log.info(`    Auto-sent invoice ${invoice.invoice_number}`);
            if (sendResult.accountantError) {
              log.warn(`    Accountant copy failed: ${sendResult.accountantError}`);
            }
          } else {
            log.error(`    Failed to auto-send: ${sendResult.error}`);
          }
        }
      } catch (sendError) {
        log.error(`    Auto-send error:`, sendError);
      }
    }

    return { success: true, invoiceId: invoice.id };
  } catch (error) {
    log.error('Generate invoice from recurring error:', error);
    return { success: false, error: 'Failed to generate invoice' };
  }
}

// Advisory lock ID for recurring invoice generation (arbitrary fixed number)
const RECURRING_INVOICE_LOCK_ID = 1001;

async function checkAndGenerateRecurring(): Promise<void> {
  const startTime = Date.now();

  // Use a dedicated client so lock and unlock happen on the same connection
  const client = await pool.connect();
  try {
    // Try to acquire advisory lock - if another instance holds it, skip this run
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [RECURRING_INVOICE_LOCK_ID]);
    if (!lockResult.rows[0].acquired) {
      log.info('Recurring invoice check skipped - another instance holds the lock');
      return;
    }

    try {
      log.info('Checking recurring invoices...');
      const today = new Date().toISOString().split('T')[0];

      const templates = await query(
        `SELECT * FROM recurring_invoices
         WHERE active = true
           AND next_generation_date <= $1
           AND (end_date IS NULL OR end_date >= $1)`,
        [today]
      );

      if (templates.rows.length === 0) {
        log.info('No recurring invoices due for generation');
        return;
      }

      log.info(`Found ${templates.rows.length} recurring invoice(s) due for generation`);

      for (const template of templates.rows) {
        try {
          await generateInvoiceFromRecurring(template);
        } catch (error) {
          log.error(`Failed to generate invoice for template ${template.id}:`, error);
        }
      }
    } catch (error) {
      log.error('Recurring invoice check error:', error);
    } finally {
      // Release the lock on the same connection that acquired it
      await client.query('SELECT pg_advisory_unlock($1)', [RECURRING_INVOICE_LOCK_ID]);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`Recurring invoice check complete (${duration}s)`);
  } finally {
    client.release();
  }
}

export function startRecurringInvoiceGeneration(): void {
  const intervalSeconds = parseInt(process.env.RECURRING_INVOICE_INTERVAL || '86400'); // Default 24 hours (in seconds)
  const intervalMs = intervalSeconds * 1000;

  log.info(`Starting recurring invoice generation service (interval: ${intervalSeconds}s)`);

  // Initial check
  checkAndGenerateRecurring().catch(err => log.error('Initial recurring invoice check failed:', err));

  // Set up recurring check
  generationInterval = setInterval(() => {
    checkAndGenerateRecurring().catch(err => log.error('Recurring invoice check failed:', err));
  }, intervalMs);
}

export function stopRecurringInvoiceGeneration(): void {
  if (generationInterval) {
    clearInterval(generationInterval);
    generationInterval = null;
    log.info('Recurring invoice generation stopped');
  }
}
