import { zipSync } from 'fflate';
import { query } from '../db/init';
import { generateInvoicePDF } from './pdfGenerator';
import { buildISDOC } from './isdocGenerator';
import { documentDate, ExportError, loadInvoiceDocument, safeFilename } from './invoiceDocument';
import { roundMoney, summarizeStoredTax } from '../utils/money';
import { buildDphPreparation, dphReadme, type DphDocument } from './dphPreparation';

export function csv(rows: unknown[][]): Buffer {
  // Quote every cell and neutralize spreadsheet formulas, including leading
  // whitespace/control characters. Numeric values retain their numeric form.
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return Buffer.from('\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n', 'utf8');
}

export function validatePeriod(from: unknown, to: unknown, basis: unknown) {
  const validDate = (value: unknown): value is string => typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) {
    throw new ExportError('Choose a valid date range of at most 367 days');
  }
  if (basis !== 'issue' && basis !== 'tax') throw new ExportError('Date basis must be issue or tax');
  return { from, to, basis: basis as 'issue' | 'tax' };
}

export async function generateAccountantExport(userId: string, period: ReturnType<typeof validatePeriod>) {
  const { from, to, basis } = period;
  // The only interpolated SQL comes from this closed enum, never user input.
  const dateColumn = basis === 'tax' ? 'COALESCE(delivery_date, issue_date)' : 'issue_date';
  const invoices = await query(`SELECT id FROM invoices WHERE user_id = $1
    AND ${dateColumn} BETWEEN $2::date AND $3::date AND status IN ('sent', 'paid', 'overdue')
    ORDER BY issue_date, id LIMIT 501`, [userId, from, to]);
  const expenses = await query(`SELECT e.id, e.expense_number, e.supplier_invoice_number, e.status, e.currency,
    e.issue_date, e.due_date, e.delivery_date, e.amount, e.vat_rate, e.vat_amount, e.total,
    e.exchange_rate, e.total_czk, e.paid_at, e.description, e.notes, e.file_name,
    COALESCE(length(e.file_data), 0) AS file_size,
    c.company_name AS supplier_name, c.ico AS supplier_ico, c.dic AS supplier_dic
    FROM expenses e LEFT JOIN clients c ON c.id = e.client_id AND c.user_id = e.user_id
    WHERE e.user_id = $1 AND ${basis === 'tax' ? 'COALESCE(e.delivery_date, e.issue_date)' : 'e.issue_date'} BETWEEN $2::date AND $3::date
    ORDER BY e.issue_date, e.id LIMIT 501`, [userId, from, to]);
  if (invoices.rows.length + expenses.rows.length > 500) throw new ExportError('More than 500 documents; choose a shorter period', 413);
  const MAX_BYTES = 100 * 1024 * 1024;
  if (expenses.rows.reduce((sum, e) => sum + Number(e.file_size) * 0.75, 0) > MAX_BYTES) {
    throw new ExportError('Attachments exceed 100 MB; choose a shorter period', 413);
  }
  const files: Record<string, Uint8Array> = Object.create(null);
  let bytes = 0;
  const add = (name: string, data: Buffer) => {
    bytes += data.byteLength;
    if (bytes > MAX_BYTES) throw new ExportError('Export exceeds 100 MB; choose a shorter period', 413);
    files[name] = data;
  };
  const invoiceCsv: unknown[][] = [['id', 'invoice_number', 'variable_symbol', 'client', 'client_ico', 'client_dic', 'status', 'issue_date', 'tax_point_date', 'due_date', 'currency', 'subtotal', 'vat', 'total', 'exchange_rate', 'total_czk', 'paid_at', 'pdf', 'isdoc']];
  const lineCsv: unknown[][] = [['invoice_id', 'invoice_number', 'line', 'description', 'quantity', 'unit', 'unit_price', 'currency', 'tax_base', 'vat_rate', 'vat_treatment', 'vat_reason', 'reverse_charge_code', 'vat', 'total']];
  const expenseCsv: unknown[][] = [['id', 'expense_number', 'supplier_invoice_number', 'supplier', 'supplier_ico', 'supplier_dic', 'status', 'issue_date', 'tax_point_date', 'due_date', 'currency', 'tax_base', 'vat_rate', 'vat', 'total', 'exchange_rate', 'total_czk', 'paid_at', 'description', 'notes', 'attachment']];
  const vatCsv: unknown[][] = [['invoice_id', 'invoice_number', 'currency', 'vat_treatment', 'vat_rate', 'tax_base', 'vat', 'exchange_rate']];
  const dphDocuments: DphDocument[] = [];
  for (const { id } of invoices.rows) {
    const document = await loadInvoiceDocument(id, userId);
    const { invoice: i, items } = document;
    const stem = `issued/${safeFilename(i.invoice_number)}_${id}`;
    add(`${stem}.isdoc`, Buffer.from(buildISDOC(document), 'utf8'));
    add(`${stem}.pdf`, await generateInvoicePDF(id, userId));
    invoiceCsv.push([id, i.invoice_number, i.variable_symbol, i.client_name, i.client_ico, i.client_dic, i.status,
      documentDate(i.issue_date), documentDate(i.delivery_date || i.issue_date), documentDate(i.due_date), i.currency,
      Number(i.subtotal), Number(i.vat_amount), Number(i.total), i.exchange_rate == null ? '' : Number(i.exchange_rate),
      i.currency === 'CZK' ? Number(i.total) : i.total_czk == null ? '' : Number(i.total_czk),
      i.paid_at ? documentDate(i.paid_at) : '', `${stem}.pdf`, `${stem}.isdoc`]);
    items.forEach((line, index) => lineCsv.push([id, i.invoice_number, index + 1, line.description, line.quantity, line.unit,
      line.unitPrice, i.currency, line.total, line.vatRate, line.vatTreatment, line.vatReason, line.vatCode, line.vatAmount, roundMoney(line.total + line.vatAmount)]));
    const taxGroups = summarizeStoredTax(items, Number(i.vat_rate));
    taxGroups.forEach(g => vatCsv.push([id, i.invoice_number, i.currency, g.vatTreatment, g.vatRate, g.base, g.vatAmount, i.exchange_rate == null ? '' : Number(i.exchange_rate)]));
    dphDocuments.push({ direction: 'issued', id, number: i.invoice_number, counterparty: i.client_name, dic: i.client_dic, status: i.status,
      issueDate: i.issue_date, taxDate: i.delivery_date, currency: i.currency, exchangeRate: i.exchange_rate == null ? null : Number(i.exchange_rate),
      total: Number(i.total), totalCzk: i.total_czk == null ? null : Number(i.total_czk), source: `${stem}.pdf`,
      groups: taxGroups.map(group => {
        const lines = items.filter(line => line.vatRate === group.vatRate && line.vatTreatment === group.vatTreatment);
        return { rate: group.vatRate, treatment: group.vatTreatment, lines: lines.map(line => ({ base: line.total, vat: line.vatAmount })),
          reasons: [...new Set(lines.map(line => line.vatReason).filter(Boolean))].join(' | '),
          codes: [...new Set(lines.map(line => line.vatCode).filter(Boolean))].join(' | ') };
      }) });
  }
  for (const e of expenses.rows) {
    let attachment = '';
    if (Number(e.file_size) > 0) {
      const result = await query('SELECT file_data FROM expenses WHERE id = $1 AND user_id = $2', [e.id, userId]);
      if (!result.rows[0]?.file_data) throw new ExportError('An expense attachment changed during export; try again', 409);
      attachment = `received/${safeFilename(e.expense_number)}_${e.id}_${safeFilename(e.file_name || 'attachment')}`;
      add(attachment, Buffer.from(result.rows[0].file_data, 'base64'));
    }
    expenseCsv.push([e.id, e.expense_number, e.supplier_invoice_number, e.supplier_name, e.supplier_ico, e.supplier_dic, e.status,
      documentDate(e.issue_date), documentDate(e.delivery_date || e.issue_date), documentDate(e.due_date), e.currency,
      Number(e.amount), Number(e.vat_rate), Number(e.vat_amount), Number(e.total), e.exchange_rate == null ? '' : Number(e.exchange_rate),
      e.currency === 'CZK' ? Number(e.total) : e.total_czk == null ? '' : Number(e.total_czk),
      e.paid_at ? documentDate(e.paid_at) : '', e.description, e.notes, attachment]);
    dphDocuments.push({ direction: 'received', id: e.id, number: e.expense_number, reference: e.supplier_invoice_number,
      counterparty: e.supplier_name, dic: e.supplier_dic, status: e.status, issueDate: e.issue_date, taxDate: e.delivery_date,
      currency: e.currency, exchangeRate: e.exchange_rate == null ? null : Number(e.exchange_rate), total: Number(e.total),
      totalCzk: e.total_czk == null ? null : Number(e.total_czk), source: attachment,
      groups: [{ rate: Number(e.vat_rate), treatment: 'unclassified', lines: [{ base: Number(e.amount), vat: Number(e.vat_amount) }] }] });
  }
  add('issued-invoices.csv', csv(invoiceCsv));
  add('issued-lines.csv', csv(lineCsv));
  add('issued-vat.csv', csv(vatCsv));
  add('received-expenses.csv', csv(expenseCsv));
  const dph = buildDphPreparation(dphDocuments, period);
  add('dph/summary.csv', csv(dph.summary));
  add('dph/register.csv', csv(dph.register));
  add('dph/issues.csv', csv(dph.issues));
  add('dph/README.txt', Buffer.from(dphReadme(period), 'utf8'));
  add('manifest.json', Buffer.from(JSON.stringify({ formatVersion: 2, generatedAt: new Date().toISOString(), ...period,
    issuedInvoices: invoices.rows.length, receivedExpenses: expenses.rows.length,
    dphPreparation: { issueCount: dph.issueCount, excludedGroupCount: dph.excludedGroupCount, inputVatDeductibility: 'unreviewed', filingXml: false },
    includedInvoiceStatuses: ['sent', 'paid', 'overdue'], files: Object.keys(files) }, null, 2)));
  add('README.txt', Buffer.from(`Essential Invoice - účetní podklady / accountant package\nPeriod: ${from} - ${to} (inclusive)\nDate basis: ${basis === 'tax' ? 'delivery_date, falling back to issue_date' : 'issue_date'}\n\nCSV: UTF-8 with BOM, semicolon delimiter, quoted cells, decimal point.\nText starting with spreadsheet formula characters is prefixed with an apostrophe.\nThe issued-* and received-expenses CSV amounts are in the document currency. Missing EUR conversions are empty, never treated as CZK.\nissued-vat.csv contains issued invoice VAT bases and taxes by rate/treatment, not a tax return.\nExpense VAT remains at document level; no input-VAT deductibility is inferred.\nDPH preparation: dph/summary.csv, dph/register.csv, dph/issues.csv and bilingual dph/README.txt.\nReceived VAT is recorded VAT only, not a confirmed deduction. No VAT payable is calculated.\nThe DPH pack uses this same selection and stored EUR/CZK rates; review incomplete totals and all flagged items.\nDraft/cancelled invoices and recurring templates are excluded. Paid and unpaid expenses are included.\nPDF and ISDOC parties use current company/client details. Free-form addresses are preserved without guessing structured address fields.\nISDOC is unsigned version 6.0.2, for ordinary invoices, including domestic reverse charge.\nThis package contains no VAT return or control-statement XML.\n`));
  return Buffer.from(zipSync(files, { level: 1 }));
}
