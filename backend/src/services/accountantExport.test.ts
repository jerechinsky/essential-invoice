import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { query } from '../db/init';
import { csv, generateAccountantExport, validatePeriod } from './accountantExport';
import { loadInvoiceDocument } from './invoiceDocument';
import { mixedInvoice } from '../test/fixtures/invoice';

vi.mock('../db/init', () => ({ query: vi.fn() }));
vi.mock('./pdfGenerator', () => ({ generateInvoicePDF: vi.fn(async () => Buffer.from('%PDF-1.7 test')) }));
vi.mock('./invoiceDocument', async importOriginal => ({ ...await importOriginal<any>(), loadInvoiceDocument: vi.fn() }));
const period = { from: '2026-09-01', to: '2026-09-30', basis: 'issue' as const };
const result = (rows: any[]) => ({ rows } as any);
describe('accountant package', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('includes reconcilable CSVs, PDFs, ISDOC and owned attachments with safe names', async () => {
    const doc = mixedInvoice();
    vi.mocked(loadInvoiceDocument).mockResolvedValue(doc);
    vi.mocked(query).mockResolvedValueOnce(result([{ id: doc.invoice.id }]))
      .mockResolvedValueOnce(result([{ id: 'expense-id', expense_number: '../receipt', currency: 'CZK', issue_date: '2026-09-01', due_date: '2026-09-20',
        amount: '100', vat_rate: '21', vat_amount: '21', total: '121', file_name: '../../receipt.pdf', file_size: 4, description: '=CMD()' }]))
      .mockResolvedValueOnce(result([{ file_data: Buffer.from('receipt').toString('base64') }]));
    const files = unzipSync(await generateAccountantExport('owner', period));
    expect(Object.keys(files)).toContain('manifest.json');
    expect(Object.keys(files).filter(name => name.endsWith('.isdoc'))).toHaveLength(1);
    const attachment = Object.keys(files).find(name => name.startsWith('received/'))!;
    expect(attachment).not.toContain('../');
    expect(strFromU8(files[attachment])).toBe('receipt');
    expect(strFromU8(files['received-expenses.csv'])).toContain("'=CMD()");
    expect(strFromU8(files['issued-lines.csv'])).toContain('reverse_charge');
    expect(strFromU8(files['issued-vat.csv'])).toContain('exempt');
    expect(loadInvoiceDocument).toHaveBeenCalledWith(doc.invoice.id, 'owner');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('user_id = $2'), ['expense-id', 'owner']);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("status IN ('sent', 'paid', 'overdue')"), ['owner', period.from, period.to]);
  });
  it('exports a useful empty period with headers and zero counts', async () => {
    vi.mocked(query).mockResolvedValue(result([]));
    const files = unzipSync(await generateAccountantExport('owner', { ...period, basis: 'tax' }));
    expect(JSON.parse(strFromU8(files['manifest.json']))).toMatchObject({ issuedInvoices: 0, receivedExpenses: 0, basis: 'tax' });
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('COALESCE(delivery_date, issue_date)'), ['owner', period.from, period.to]);
  });
  it('rejects large selections before rendering documents', async () => {
    vi.mocked(query).mockResolvedValueOnce(result(Array.from({ length: 501 }, (_, i) => ({ id: String(i) })))).mockResolvedValueOnce(result([]));
    await expect(generateAccountantExport('owner', period)).rejects.toThrow('500 documents');
    expect(loadInvoiceDocument).not.toHaveBeenCalled();
  });
  it.each([['2026-02-30', '2026-03-01'], ['2026-09-30', '2026-09-01'], ['2024-01-01', '2026-01-01'], ['bad', '2026-09-01']])('rejects invalid periods %s to %s', (from, to) => {
    expect(() => validatePeriod(from, to, 'issue')).toThrow();
  });
  it('escapes delimiters, quotes, newlines and formulas without changing numeric negatives', () => {
    expect(csv([['a;"b\nc', ' \t=1+1', -12.5]]).toString()).toBe('\ufeff"a;""b\nc";"\' \t=1+1";"-12.5"\r\n');
  });
});
