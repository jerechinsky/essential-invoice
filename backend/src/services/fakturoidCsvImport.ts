import { generateSpayd } from '../utils/validation';

export const MAX_FAKTUROID_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_FAKTUROID_ROWS = 5000;

export interface CsvImportIssue {
  row: number;
  message: string;
}

export interface FakturoidInvoice {
  externalId: string;
  invoiceNumber: string;
  variableSymbol: string;
  client: {
    name: string;
    email: string;
    phone: string;
    address: string;
    ico: string;
    dic: string;
  };
  description: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  currency: 'CZK' | 'EUR';
  issueDate: string;
  dueDate: string;
  deliveryDate: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  exchangeRate: number | null;
  totalCzk: number | null;
  paymentMethod: string;
  sentAt: string | null;
  paidAt: string | null;
}

export interface ParsedFakturoidCsv {
  totalRows: number;
  invoices: FakturoidInvoice[];
  issues: CsvImportIssue[];
  skippedRows: number;
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

const REQUIRED_COLUMNS = [
  'Id', 'Number', 'Variable symbol', 'Client name', 'Status', 'Issued on',
  'Due on', 'Currency', 'Subtotal', 'Total', 'Vat'
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function parseNumber(value: string, field: string): number {
  let normalized = value.trim().replace(/[\s\u00a0]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(',', '.');
  }
  const result = Number(normalized);
  if (!normalized || !Number.isFinite(result)) throw new Error(`${field} is not a valid number`);
  return result;
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  return parseNumber(value, 'Exchange rate');
}

function isTrue(value: string): boolean {
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

function parseDate(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${field} must use YYYY-MM-DD`);
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${field} is not a valid date`);
  }
  return normalized;
}

function parseTimestamp(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapStatus(row: Record<string, string>, today: string): FakturoidInvoice['status'] {
  const status = row.Status.trim().toLowerCase();
  if (row['Cancelled at']?.trim() || ['cancelled', 'canceled', 'uncollectible'].includes(status)) return 'cancelled';
  if (row['Paid on']?.trim() || status === 'paid') return 'paid';
  if (status === 'draft') return 'draft';
  if (status === 'overdue' || (status === 'open' && row['Due on'] < today)) return 'overdue';
  if (['open', 'sent'].includes(status)) return 'sent';
  throw new Error(`Unsupported Fakturoid status: ${row.Status || '(empty)'}`);
}

function buildAddress(row: Record<string, string>): string {
  const street = [row['Client street'], row['Client street2']].filter(Boolean).join(', ');
  const city = [row['Client zip'], row['Client city']].filter(Boolean).join(' ');
  return [street, city, row['Client country']].filter(Boolean).join('\n').slice(0, 1000);
}

function paymentMethod(value: string): string {
  const methods: Record<string, string> = {
    bank: 'bank_transfer', cash: 'cash', card: 'card', cod: 'cash_on_delivery', paypal: 'paypal'
  };
  return methods[value.trim().toLowerCase()] || value.trim().slice(0, 50) || 'bank_transfer';
}

export function parseFakturoidCsv(csv: string, today = new Date().toISOString().slice(0, 10)): ParsedFakturoidCsv {
  if (Buffer.byteLength(csv, 'utf8') > MAX_FAKTUROID_CSV_BYTES) {
    throw new Error('CSV file is larger than 5 MB');
  }

  const rows = parseCsv(csv.replace(/^\uFEFF/, '')).filter(row => row.some(value => value.trim()));
  if (rows.length === 0) throw new Error('CSV file is empty');
  if (rows.length - 1 > MAX_FAKTUROID_ROWS) throw new Error(`CSV contains more than ${MAX_FAKTUROID_ROWS} invoices`);

  const headers = rows[0].map(header => header.trim());
  const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missing.length > 0) throw new Error(`Not a supported Fakturoid invoice export. Missing columns: ${missing.join(', ')}`);

  const invoices: FakturoidInvoice[] = [];
  const issues: CsvImportIssue[] = [];
  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();
  let skippedRows = 0;

  for (let index = 1; index < rows.length; index++) {
    const values = rows[index];
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() || '']));
    const csvRow = index + 1;

    if (isTrue(row.Proforma || '') || isTrue(row['Partial proforma'] || '')) {
      issues.push({ row: csvRow, message: 'Proforma invoices are not imported' });
      skippedRows++;
      continue;
    }

    try {
      const externalId = row.Id;
      const invoiceNumber = row.Number;
      if (!externalId) throw new Error('Id is required');
      if (!invoiceNumber) throw new Error('Invoice number is required');
      if (invoiceNumber.length > 50) throw new Error('Invoice number is longer than 50 characters');
      if (!row['Client name']) throw new Error('Client name is required');
      if (seenIds.has(externalId) || seenNumbers.has(invoiceNumber)) {
        issues.push({ row: csvRow, message: 'Duplicate invoice in CSV' });
        skippedRows++;
        continue;
      }

      const currency = row.Currency.toUpperCase();
      if (currency !== 'CZK' && currency !== 'EUR') throw new Error(`Unsupported currency: ${row.Currency || '(empty)'}`);
      const issueDate = parseDate(row['Issued on'], 'Issued on');
      const dueDate = parseDate(row['Due on'], 'Due on');
      const deliveryDate = row['Taxable fulfillment due']
        ? parseDate(row['Taxable fulfillment due'], 'Taxable fulfillment due')
        : issueDate;
      const subtotal = parseNumber(row.Subtotal, 'Subtotal');
      const total = parseNumber(row.Total, 'Total');
      const vatAmount = row.Vat ? parseNumber(row.Vat, 'Vat') : total - subtotal;
      const vatRate = subtotal === 0 ? 0 : Math.round((vatAmount / subtotal) * 10000) / 100;
      const exchangeRate = currency === 'EUR' ? parseOptionalNumber(row['Exchange rate'] || '') : null;
      const nativeTotal = currency === 'EUR' && row['Native total']
        ? parseOptionalNumber(row['Native total'])
        : null;
      const fallbackDescription = `Fakturoid invoice ${invoiceNumber}`;

      invoices.push({
        externalId,
        invoiceNumber,
        variableSymbol: (row['Variable symbol'] || invoiceNumber.replace(/\D/g, '')).slice(0, 20),
        client: {
          name: row['Client name'].slice(0, 255),
          email: (row['Client email'] || '').slice(0, 255),
          phone: (row['Client phone'] || '').slice(0, 50),
          address: buildAddress(row),
          ico: (row['Client registration no'] || '').slice(0, 20),
          dic: (row['Client vat no'] || '').slice(0, 20)
        },
        description: (row.Subject || fallbackDescription).slice(0, 150),
        status: mapStatus(row, today),
        currency,
        issueDate,
        dueDate,
        deliveryDate,
        subtotal,
        vatRate,
        vatAmount,
        total,
        exchangeRate,
        totalCzk: nativeTotal,
        paymentMethod: paymentMethod(row['Payment method'] || ''),
        sentAt: parseTimestamp(row['Sent at'] || ''),
        paidAt: parseTimestamp(row['Paid on'] || '')
      });
      seenIds.add(externalId);
      seenNumbers.add(invoiceNumber);
    } catch (error) {
      issues.push({ row: csvRow, message: error instanceof Error ? error.message : 'Invalid row' });
      skippedRows++;
    }
  }

  return { totalRows: rows.length - 1, invoices, issues, skippedRows };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('cs-CZ');
}

function normalizeId(value: string): string {
  return value.replace(/\s/g, '').toUpperCase();
}

export async function importFakturoidInvoices(db: Queryable, userId: string, parsed: ParsedFakturoidCsv) {
  if (parsed.invoices.length === 0) {
    return { imported: 0, skippedExisting: 0, createdClients: 0 };
  }

  const invoiceNumbers = parsed.invoices.map(invoice => invoice.invoiceNumber);
  const externalIds = parsed.invoices.map(invoice => invoice.externalId);
  const existingResult = await db.query(
    `SELECT invoice_number, external_id FROM invoices
     WHERE user_id = $1
       AND (invoice_number = ANY($2::text[])
         OR (import_source = 'fakturoid' AND external_id = ANY($3::text[])))`,
    [userId, invoiceNumbers, externalIds]
  );
  const existingNumbers = new Set(existingResult.rows.map(row => row.invoice_number));
  const existingIds = new Set(existingResult.rows.map(row => row.external_id).filter(Boolean));

  const clientsResult = await db.query(
    'SELECT id, company_name, ico, dic FROM clients WHERE user_id = $1',
    [userId]
  );
  const byIco = new Map<string, string>();
  const byDic = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const client of clientsResult.rows) {
    if (client.ico) byIco.set(normalizeId(client.ico), client.id);
    if (client.dic) byDic.set(normalizeId(client.dic), client.id);
    byName.set(normalize(client.company_name), client.id);
  }

  const userResult = await db.query(
    'SELECT bank_account, bank_code, language FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  let imported = 0;
  let skippedExisting = 0;
  let createdClients = 0;

  for (const invoice of parsed.invoices) {
    if (existingNumbers.has(invoice.invoiceNumber) || existingIds.has(invoice.externalId)) {
      skippedExisting++;
      continue;
    }

    let clientId = (invoice.client.ico && byIco.get(normalizeId(invoice.client.ico)))
      || (invoice.client.dic && byDic.get(normalizeId(invoice.client.dic)))
      || byName.get(normalize(invoice.client.name));

    if (!clientId) {
      const clientResult = await db.query(
        `INSERT INTO clients
          (user_id, company_name, primary_email, address, ico, dic, contact_phone, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [userId, invoice.client.name, invoice.client.email, invoice.client.address || null,
          invoice.client.ico || null, invoice.client.dic || null, invoice.client.phone || null,
          'Imported from Fakturoid']
      );
      clientId = clientResult.rows[0].id;
      createdClients++;
      if (invoice.client.ico) byIco.set(normalizeId(invoice.client.ico), clientId!);
      if (invoice.client.dic) byDic.set(normalizeId(invoice.client.dic), clientId!);
      byName.set(normalize(invoice.client.name), clientId!);
    }

    let qrPaymentData: string | null = null;
    if (invoice.currency === 'CZK' && user?.bank_account && user?.bank_code) {
      qrPaymentData = generateSpayd(
        user.bank_account, user.bank_code, invoice.total, invoice.currency,
        invoice.variableSymbol, `${user.language === 'en' ? 'Invoice' : 'Faktura'} ${invoice.invoiceNumber}`
      );
    }

    const invoiceResult = await db.query(
      `INSERT INTO invoices
        (user_id, client_id, invoice_number, variable_symbol, status, currency,
         issue_date, due_date, delivery_date, subtotal, vat_rate, vat_amount, total,
         notes, payment_method, qr_payment_data, sent_at, paid_at, exchange_rate,
         total_czk, import_source, external_id)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, 'fakturoid', $21)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, clientId, invoice.invoiceNumber, invoice.variableSymbol, invoice.status,
        invoice.currency, invoice.issueDate, invoice.dueDate, invoice.deliveryDate,
        invoice.subtotal, invoice.vatRate, invoice.vatAmount, invoice.total,
        `Imported from Fakturoid (ID ${invoice.externalId})`, invoice.paymentMethod,
        qrPaymentData, invoice.sentAt, invoice.paidAt, invoice.exchangeRate,
        invoice.totalCzk, invoice.externalId]
    );

    if (!invoiceResult.rows[0]) {
      skippedExisting++;
      continue;
    }

    await db.query(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, total, sort_order)
       VALUES ($1, $2, 1, 'ks', $3, $3, 0)`,
      [invoiceResult.rows[0].id, invoice.description, invoice.subtotal]
    );
    imported++;
  }

  return { imported, skippedExisting, createdClients };
}
