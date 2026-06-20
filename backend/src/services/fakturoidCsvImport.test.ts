import { describe, expect, it, vi } from 'vitest';
import { importFakturoidInvoices, parseFakturoidCsv } from './fakturoidCsvImport';

const headers = [
  'Id', 'Proforma', 'Partial proforma', 'Number', 'Variable symbol', 'Client name',
  'Client street', 'Client street2', 'Client city', 'Client zip', 'Client country',
  'Client registration no', 'Client vat no', 'Subject', 'Status', 'Issued on',
  'Taxable fulfillment due', 'Due on', 'Sent at', 'Paid on', 'Cancelled at',
  'Payment method', 'Currency', 'Exchange rate', 'Subtotal', 'Total', 'Native total',
  'Vat', 'Client email', 'Client phone'
];

const baseRow: Record<string, string> = {
  Id: '59757691', Proforma: 'false', 'Partial proforma': 'false', Number: '202615',
  'Variable symbol': '202615', 'Client name': 'Trezor Company s.r.o.',
  'Client street': 'Kundratka 2359/17a', 'Client street2': '', 'Client city': 'Praha - Libeň',
  'Client zip': '18000', 'Client country': 'CZ', 'Client registration no': '02440032',
  'Client vat no': 'CZ02440032', Subject: 'Consulting, June', Status: 'open',
  'Issued on': '2026-06-16', 'Taxable fulfillment due': '2026-06-16', 'Due on': '2026-06-30',
  'Sent at': '', 'Paid on': '', 'Cancelled at': '', 'Payment method': 'bank', Currency: 'CZK',
  'Exchange rate': '1.0', Subtotal: '36000,0', Total: '43560,0', 'Native total': '43560,0',
  Vat: '7560.0', 'Client email': 'billing@example.com', 'Client phone': '+420123456789'
};

function encode(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function makeCsv(...rows: Array<Record<string, string>>): string {
  return [headers.join(','), ...rows.map(row => headers.map(header => encode(row[header] ?? '')).join(','))].join('\n');
}

describe('parseFakturoidCsv', () => {
  it('parses Fakturoid decimals, client data, totals and an overdue invoice', () => {
    const result = parseFakturoidCsv(makeCsv(baseRow), '2026-07-01');

    expect(result.totalRows).toBe(1);
    expect(result.issues).toEqual([]);
    expect(result.invoices[0]).toMatchObject({
      externalId: '59757691',
      invoiceNumber: '202615',
      description: 'Consulting, June',
      status: 'overdue',
      subtotal: 36000,
      vatRate: 21,
      vatAmount: 7560,
      total: 43560,
      paymentMethod: 'bank_transfer',
      client: {
        name: 'Trezor Company s.r.o.',
        email: 'billing@example.com',
        ico: '02440032',
        dic: 'CZ02440032'
      }
    });
    expect(result.invoices[0].client.address).toBe('Kundratka 2359/17a\n18000 Praha - Libeň\nCZ');
  });

  it('preserves paid status and EUR native totals', () => {
    const row = {
      ...baseRow, Id: '2', Number: '202616', 'Variable symbol': '202616', Status: 'paid',
      Currency: 'EUR', 'Exchange rate': '24,85', Subtotal: '100', Total: '121',
      'Native total': '3006,85', Vat: '21', 'Paid on': '2026-06-20'
    };
    const invoice = parseFakturoidCsv(makeCsv(row), '2026-06-21').invoices[0];

    expect(invoice.status).toBe('paid');
    expect(invoice.exchangeRate).toBe(24.85);
    expect(invoice.totalCzk).toBe(3006.85);
    expect(invoice.paidAt).toContain('2026-06-20');
  });

  it('supports quoted fields with commas, escaped quotes, and newlines', () => {
    const subject = 'Work, phase "A"\ncontinued';
    const invoice = parseFakturoidCsv(makeCsv({ ...baseRow, Subject: subject }), '2026-06-20').invoices[0];
    expect(invoice.description).toBe(subject);
  });

  it('skips proformas, duplicate rows, and invalid rows with an explanation', () => {
    const result = parseFakturoidCsv(makeCsv(
      { ...baseRow, Proforma: 'true' },
      baseRow,
      baseRow,
      { ...baseRow, Id: '3', Number: '3', Currency: 'USD' }
    ));

    expect(result.invoices).toHaveLength(1);
    expect(result.skippedRows).toBe(3);
    expect(result.issues.map(issue => issue.message)).toEqual([
      'Proforma invoices are not imported',
      'Duplicate invoice in CSV',
      'Unsupported currency: USD'
    ]);
  });

  it('rejects files that are not Fakturoid invoice exports', () => {
    expect(() => parseFakturoidCsv('Name,Amount\nTest,100')).toThrow('Not a supported Fakturoid invoice export');
  });
});

describe('importFakturoidInvoices', () => {
  it('creates a missing contact once and reuses it for multiple invoices', async () => {
    const parsed = parseFakturoidCsv(makeCsv(
      baseRow,
      { ...baseRow, Id: '2', Number: '202616', 'Variable symbol': '202616' }
    ));
    let invoiceSequence = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT invoice_number')) return { rows: [] };
      if (sql.includes('SELECT id, company_name')) return { rows: [] };
      if (sql.includes('SELECT bank_account')) return { rows: [{ bank_account: null, bank_code: null, language: 'cs' }] };
      if (sql.includes('INSERT INTO clients')) return { rows: [{ id: 'new-client' }] };
      if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: `invoice-${++invoiceSequence}` }] };
      return { rows: [] };
    });

    const result = await importFakturoidInvoices({ query }, 'user-1', parsed);

    expect(result).toEqual({ imported: 2, skippedExisting: 0, createdClients: 1 });
    expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO clients'))).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO invoice_items'))).toHaveLength(2);
  });

  it('reuses an existing contact and skips invoices already imported', async () => {
    const parsed = parseFakturoidCsv(makeCsv(
      baseRow,
      { ...baseRow, Id: '2', Number: '202616', 'Variable symbol': '202616' }
    ));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT invoice_number')) return { rows: [{ invoice_number: '202615', external_id: '59757691' }] };
      if (sql.includes('SELECT id, company_name')) return { rows: [{ id: 'existing-client', company_name: baseRow['Client name'], ico: baseRow['Client registration no'], dic: baseRow['Client vat no'] }] };
      if (sql.includes('SELECT bank_account')) return { rows: [{}] };
      if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: 'invoice-2' }] };
      return { rows: [] };
    });

    const result = await importFakturoidInvoices({ query }, 'user-1', parsed);

    expect(result).toEqual({ imported: 1, skippedExisting: 1, createdClients: 0 });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO clients'))).toBe(false);
  });
});
