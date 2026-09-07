import { query } from '../db/init';
import { calculateInvoiceTax } from '../utils/money';

export class ExportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function mapInvoiceItems(rows: any[], defaultRate: number) {
  const items = rows.map(item => ({
    id: item.id, description: item.description, quantity: Number(item.quantity),
    unit: item.unit, unitPrice: Number(item.unit_price),
    vatRate: Number(item.vat_rate ?? defaultRate),
    vatTreatment: item.vat_treatment ?? 'standard',
    vatReason: item.vat_reason ?? '', vatCode: item.vat_code ?? '',
  }));
  const calculated = calculateInvoiceTax(items, defaultRate);
  return calculated.lines.map((line, index) => ({ ...items[index], ...line,
    total: Number(rows[index].total ?? line.total),
    vatAmount: Number(rows[index].vat_amount ?? line.vatAmount),
  }));
}

export async function loadInvoiceDocument(invoiceId: string, userId: string) {
  const result = await query(`SELECT i.*,
    c.company_name AS client_name, c.address AS client_address, c.ico AS client_ico, c.dic AS client_dic,
    u.name AS user_name, u.company_name AS user_company_name, u.company_address AS user_address,
    u.company_ico AS user_ico, u.company_dic AS user_dic, u.vat_payer AS user_vat_payer,
    u.bank_account AS user_bank_account, u.bank_code AS user_bank_code
    FROM invoices i JOIN clients c ON c.id = i.client_id AND c.user_id = i.user_id JOIN users u ON u.id = i.user_id
    WHERE i.id = $1 AND i.user_id = $2`, [invoiceId, userId]);
  if (!result.rows.length) throw new ExportError('Invoice not found', 404);
  const invoice = result.rows[0];
  const items = await query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order, id', [invoiceId]);
  return { invoice, items: mapInvoiceItems(items.rows, Number(invoice.vat_rate)) };
}

// PostgreSQL DATE values may arrive as local-midnight Date objects.
export function documentDate(value: string | Date): string {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return String(value).slice(0, 10);
}

export function safeFilename(value: string): string {
  return String(value).normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 100) || 'document';
}
