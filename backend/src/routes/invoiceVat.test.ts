import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { invoiceRouter } from './invoices';
import { query } from '../db/init';
import { convertEurToCzk } from '../services/cnbExchangeRate';

const client = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('../db/init', () => ({ query: vi.fn(), pool: { connect: vi.fn(async () => client) } }));
vi.mock('../services/emailSender', () => ({ sendInvoiceEmail: vi.fn() }));
vi.mock('../services/pdfGenerator', () => ({ generateInvoicePDF: vi.fn() }));
vi.mock('../services/cnbExchangeRate', () => ({ convertEurToCzk: vi.fn() }));
const result = (rows: any[]) => ({ rows } as any);
const userId = 'owner';
const invoiceId = 'a13136c9-0fb2-4531-bfa2-523dc7f3629f';
const payload = () => ({ clientId: '79aa5de4-cec1-4e0a-b581-a0211c4fc527', issueDate: '2026-09-01', dueDate: '2026-09-15', vatRate: 21,
  items: [{ description: 'Service', quantity: 1, unitPrice: 100, vatRate: 21 }, { description: 'Reduced', quantity: 1, unitPrice: 100, vatRate: 12 }] });

describe('invoice line VAT API', () => {
  const app = express();
  app.use(express.json(), (req: any, _res, next) => { req.userId = userId; next(); });
  app.use('/invoices', invoiceRouter);
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM clients')) return result([{ id: payload().clientId }]);
      if (sql.includes('FROM users')) return result([{}]);
      if (sql.includes('COUNT(*)')) return result([{ count: '0' }]);
      if (sql.includes('FROM invoices')) return result([{ id: invoiceId, status: 'draft', vat_rate: 12, currency: 'EUR', total: '233', invoice_number: 'FV1' }]);
      return result([]);
    });
    client.query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes('INSERT INTO invoices')) return result([{ id: invoiceId, invoice_number: 'FV1', total: params[11] }]);
      if (sql.includes('UPDATE invoices')) return result([{ id: invoiceId, invoice_number: 'FV1', total: params[8] }]);
      return result([]);
    });
  });
  it('stores distinct rates and calculated taxes atomically, ignoring supplied totals', async () => {
    const data = payload();
    Object.assign(data.items[0], { vatAmount: 999, total: 999 });
    await request(app).post('/invoices').send(data).expect(201);
    const invoice = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO invoices'))!;
    expect(invoice[1].slice(8, 12)).toEqual([200, 21, 33, 233]);
    const lines = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO invoice_items'));
    expect(lines.map(([, values]) => values.slice(7, 11))).toEqual([[21, 'standard', '', 21], [12, 'standard', '', 12]]);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), [data.clientId, userId]);
  });
  it.each([
    { vatRate: -1 }, { vatRate: 101 }, { vatTreatment: 'unknown' },
    { vatTreatment: 'exempt', vatRate: 0 }, { vatTreatment: 'exempt', vatRate: 21, vatReason: 'Law' },
    { vatTreatment: 'reverse_charge' },
  ])('rejects invalid VAT fields before writing: %j', async fields => {
    const data = payload(); Object.assign(data.items[0], fields);
    await request(app).post('/invoices').send(data).expect(400);
    expect(client.query).not.toHaveBeenCalled();
  });
  it('stores exemption reasons and reverse-charge codes with zero supplier tax', async () => {
    const data = payload();
    Object.assign(data.items[0], { vatTreatment: 'exempt', vatRate: 0, vatReason: '§ 57' });
    Object.assign(data.items[1], { vatTreatment: 'reverse_charge', vatRate: 21, vatCode: '4' });
    await request(app).post('/invoices').send(data).expect(201);
    const lines = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO invoice_items'));
    expect(lines[0][1].slice(7)).toEqual([0, 'exempt', '§ 57', 0, '']);
    expect(lines[1][1].slice(7)).toEqual([21, 'reverse_charge', '', 0, '4']);
  });
  it('uses the saved fallback rate on edit and clears EUR conversion when switching to CZK', async () => {
    await request(app).put(`/invoices/${invoiceId}`).send({ currency: 'CZK', items: [{ description: 'Item', quantity: 1, unitPrice: 100 }] }).expect(200);
    const update = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE invoices'))!;
    expect(update[1].slice(5, 9)).toEqual([12, 100, 12, 112]);
    expect(update[1].slice(13, 15)).toEqual([null, null]);
    expect(update[1][17]).toBe(true);
  });
  it('converts the mixed-rate grand total for EUR invoices', async () => {
    vi.mocked(convertEurToCzk).mockResolvedValue({ rate: 25, czkAmount: 5825 } as any);
    await request(app).post('/invoices').send({ ...payload(), currency: 'EUR' }).expect(201);
    expect(convertEurToCzk).toHaveBeenCalledWith(233, '2026-09-01');
  });
  it('rolls back if a line fails', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO invoices')) return result([{ id: invoiceId }]);
      if (sql.includes('INSERT INTO invoice_items')) throw new Error('write failure');
      return result([]);
    });
    await request(app).post('/invoices').send(payload()).expect(500);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
  it('does not read lines or export an invoice belonging to another user', async () => {
    vi.mocked(query).mockResolvedValue(result([]));
    await request(app).get(`/invoices/${invoiceId}/isdoc`).expect(404);
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('i.user_id = $2'), [invoiceId, userId]);
  });
});
