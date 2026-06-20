import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database query function
const mockQuery = vi.fn();
const mockParseAlzaInvoice = vi.fn();
vi.mock('../db/init.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args)
}));
vi.mock('../services/alzaInvoiceParser.js', () => ({
  parseAlzaInvoice: (...args: unknown[]) => mockParseAlzaInvoice(...args)
}));

// Import after mocking
import { expenseRouter } from './expenses';
import express from 'express';
import request from 'supertest';

// Create test app
const app = express();
app.use(express.json({ limit: '10mb' }));

// Mock auth middleware
app.use((req, _res, next) => {
  (req as any).userId = 'test-user-id';
  next();
});

app.use('/expenses', expenseRouter);

describe('Expenses Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseAlzaInvoice.mockReturnValue({
      supplier: 'Alza.cz a.s.',
      supplierIco: '27082440',
      supplierDic: 'CZ27082440',
      supplierAddress: 'Jankovcova 1522/53, 17000 Praha 7',
      supplierInvoiceNumber: '4021043452',
      issueDate: '2026-06-03',
      dueDate: '2026-06-03',
      currency: 'CZK',
      amount: 660.33,
      vatRate: 21,
      vatAmount: 138.67,
      roundingAmount: 0,
      total: 799,
      description: 'Webkamera Logitech HD Webcam C270',
    });
  });

  describe('Alza PDF import', () => {
    it('previews a single invoice without saving it', async () => {
      const response = await request(app)
        .post('/expenses/import/preview')
        .attach('file', Buffer.from('%PDF-test'), { filename: 'alza.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(response.body.amount).toBe(660.33);
      expect(response.body.description).toBe('Webkamera Logitech HD Webcam C270');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('imports a batch and attaches each source PDF', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // duplicate check
        .mockResolvedValueOnce({ rows: [{ id: 'alza-client' }] }) // supplier match
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // expense number
        .mockResolvedValueOnce({ rows: [{ id: 'expense-1' }] }); // insert

      const response = await request(app)
        .post('/expenses/import')
        .attach('files', Buffer.from('%PDF-test'), { filename: 'alza.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(response.body.imported).toHaveLength(1);
      expect(response.body.failed).toHaveLength(0);
      expect(response.body.imported[0].supplierInvoiceNumber).toBe('4021043452');
      expect(mockQuery.mock.calls[3][1]).toContain(Buffer.from('%PDF-test').toString('base64'));
      expect(mockQuery.mock.calls[3][0]).toContain("'paid'");
      expect(mockQuery.mock.calls[3][0]).toContain('CURRENT_TIMESTAMP');
    });

    it('reports duplicate invoices as per-file failures', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'already-imported' }] });

      const response = await request(app)
        .post('/expenses/import')
        .attach('files', Buffer.from('%PDF-test'), { filename: 'duplicate.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(response.body.imported).toHaveLength(0);
      expect(response.body.failed[0].error).toContain('already been imported');
    });

    it('creates and assigns the Alza supplier when no matching IČO exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // duplicate check
        .mockResolvedValueOnce({ rows: [] }) // supplier lookup
        .mockResolvedValueOnce({ rows: [{ id: 'created-alza-client' }] }) // supplier insert
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // expense number
        .mockResolvedValueOnce({ rows: [{ id: 'expense-1' }] }); // expense insert

      const response = await request(app)
        .post('/expenses/import')
        .attach('files', Buffer.from('%PDF-test'), { filename: 'alza.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO clients');
      expect(mockQuery.mock.calls[2][1]).toEqual([
        'test-user-id',
        'Alza.cz a.s.',
        'Jankovcova 1522/53, 17000 Praha 7',
        '27082440',
        'CZ27082440',
        'Automatically created from Alza expense PDF import',
      ]);
      expect(mockQuery.mock.calls[4][1]).toContain('created-alza-client');
    });
  });

  describe('universal invoice import', () => {
    const universalText = `=== INVOICE ===
FILE: supplier-invoice.pdf
SUPPLIER: Example Systems s.r.o.
ICO: 12345678
DIC: CZ12345678
ADDRESS: Main 1, Prague
INVOICE_NUMBER: 2026-001
ISSUE_DATE: 2026-06-01
DUE_DATE: 2026-06-15
CURRENCY: CZK
TAX_BASE: 1000.00
VAT_RATE: 21
VAT_AMOUNT: 210.00
ROUNDING: 0.00
TOTAL: 1210.00
PAID: no
DESCRIPTION: Cloud subscription
NOTES: -
=== END ===`;

    it('imports structured data and attaches the matching source file', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'supplier-client' }] }) // supplier match
        .mockResolvedValueOnce({ rows: [] }) // duplicate check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // expense number
        .mockResolvedValueOnce({ rows: [{ id: 'expense-1' }] }); // insert

      const response = await request(app)
        .post('/expenses/import/universal')
        .field('data', universalText)
        .attach('files', Buffer.from('%PDF-test'), { filename: 'supplier-invoice.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(response.body.failed).toEqual([]);
      expect(response.body.imported[0]).toMatchObject({
        fileName: 'supplier-invoice.pdf', supplierInvoiceNumber: '2026-001', expenseNumber: 'N20260601',
      });
      expect(mockQuery.mock.calls[3][1]).toContain('unpaid');
      expect(mockQuery.mock.calls[3][1]).toContain(Buffer.from('%PDF-test').toString('base64'));
    });

    it('rejects unmatched filenames before writing anything', async () => {
      const response = await request(app)
        .post('/expenses/import/universal')
        .field('data', universalText)
        .attach('files', Buffer.from('%PDF-test'), { filename: 'different.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(422);
      expect(response.body.error).toContain('Missing files: supplier-invoice.pdf');
      expect(response.body.error).toContain('Files without invoice data: different.pdf');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('GET /expenses', () => {
    it('should return list of expenses', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'exp-1',
          expense_number: 'N20260201',
          supplier_invoice_number: 'FV-001',
          status: 'unpaid',
          currency: 'CZK',
          client_id: 'client-1',
          client_name: 'Test Company',
          issue_date: '2026-02-01',
          due_date: '2026-02-15',
          delivery_date: null,
          amount: '1000.00',
          vat_rate: '21.00',
          vat_amount: '210.00',
          total: '1210.00',
          description: 'Test expense',
          notes: null,
          file_name: 'invoice.pdf',
          file_mime_type: 'application/pdf',
          paid_at: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
        }]
      });

      const response = await request(app).get('/expenses');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].expenseNumber).toBe('N20260201');
      expect(response.body[0].total).toBe(1210);
      expect(response.body[0].hasFile).toBe(true);
      // file_data should not be in list response
      expect(response.body[0].fileData).toBeUndefined();
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/expenses?status=paid');

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('e.status = $2');
      expect(params).toContain('paid');
    });
  });

  describe('GET /expenses/:id', () => {
    it('should return single expense with file data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'exp-1',
          expense_number: 'N20260201',
          supplier_invoice_number: 'FV-001',
          status: 'unpaid',
          currency: 'CZK',
          client_id: 'client-1',
          client_name: 'Test Company',
          client_address: 'Test Address',
          client_ico: '12345678',
          client_dic: 'CZ12345678',
          client_email: 'test@test.cz',
          issue_date: '2026-02-01',
          due_date: '2026-02-15',
          delivery_date: null,
          amount: '1000.00',
          vat_rate: '21.00',
          vat_amount: '210.00',
          total: '1210.00',
          description: 'Test',
          notes: null,
          file_data: 'base64data',
          file_name: 'invoice.pdf',
          file_mime_type: 'application/pdf',
          paid_at: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
        }]
      });

      const response = await request(app).get('/expenses/exp-1');

      expect(response.status).toBe(200);
      expect(response.body.fileData).toBe('base64data');
      expect(response.body.clientName).toBe('Test Company');
    });

    it('should return 404 for non-existent expense', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/expenses/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /expenses/batch', () => {
    it('updates payment status for the selected user expenses', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', status: 'paid', paid_at: '2026-06-20T10:00:00Z' }] });

      const response = await request(app).patch('/expenses/batch').send({
        ids: ['11111111-1111-4111-8111-111111111111'],
        status: 'paid',
      });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(1);
      expect(mockQuery.mock.calls[0][0]).toContain('id = ANY($3::uuid[])');
      expect(mockQuery.mock.calls[0][1]).toEqual(['paid', 'test-user-id', ['11111111-1111-4111-8111-111111111111']]);
    });

    it('rejects unsupported batch statuses', async () => {
      const response = await request(app).patch('/expenses/batch').send({
        ids: ['11111111-1111-4111-8111-111111111111'],
        status: 'cancelled',
      });
      expect(response.status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('POST /expenses/batch-download', () => {
    it('returns selected attachments in one ZIP archive', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{
        id: '11111111-1111-4111-8111-111111111111', expense_number: 'N202601',
        file_name: 'supplier.pdf', file_data: Buffer.from('%PDF-test').toString('base64'),
      }] });

      const response = await request(app).post('/expenses/batch-download').send({
        ids: ['11111111-1111-4111-8111-111111111111'],
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/zip');
      expect(Buffer.from(response.body).readUInt32LE(0)).toBe(0x04034b50);
    });
  });

  describe('POST /expenses', () => {
    it('should create an expense', async () => {
      // Mock for generateExpenseNumber COUNT query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Mock for INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-exp',
          expense_number: 'N20260201',
          status: 'paid',
          total: '1210.00',
        }]
      });

      const response = await request(app)
        .post('/expenses')
        .send({
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          amount: 1000,
          vatRate: 21,
          currency: 'CZK',
        });

      expect(response.status).toBe(201);
      expect(response.body.expenseNumber).toBe('N20260201');
      expect(response.body.status).toBe('paid');
      expect(mockQuery.mock.calls[1][1]).toContain('paid');
      expect(mockQuery.mock.calls[1][0]).toContain('CURRENT_TIMESTAMP');
    });

    it('should create an unpaid expense when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-exp', expense_number: 'N20260201', status: 'unpaid', total: '1210.00' }]
      });

      const response = await request(app)
        .post('/expenses')
        .send({
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          amount: 1000,
          vatRate: 21,
          paid: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('unpaid');
      expect(mockQuery.mock.calls[1][1]).toContain('unpaid');
    });

    it('should create expense with client', async () => {
      // Mock client check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'client-1' }] });
      // Mock for generateExpenseNumber
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Mock INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-exp',
          expense_number: 'N20260201',
          status: 'paid',
          total: '1210.00',
        }]
      });

      const response = await request(app)
        .post('/expenses')
        .send({
          clientId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          amount: 1000,
          vatRate: 21,
        });

      expect(response.status).toBe(201);
    });

    it('should reject invalid amount', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          amount: -100,
        });

      expect(response.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should compute VAT correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-exp',
          expense_number: 'N20260201',
          status: 'paid',
          total: '1210.00',
        }]
      });

      await request(app)
        .post('/expenses')
        .send({
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          amount: 1000,
          vatRate: 21,
        });

      // Check the INSERT call (second mock call)
      const insertCall = mockQuery.mock.calls[1];
      const params = insertCall[1];
      // vatAmount should be 210 (1000 * 0.21)
      expect(params).toContain(210);
      // total should be 1210 (1000 + 210)
      expect(params).toContain(1210);
    });

    it('should preserve an imported rounded VAT amount and final total', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-exp', expense_number: 'N20260201', status: 'paid', total: '800.00' }]
      });

      await request(app)
        .post('/expenses')
        .send({
          issueDate: '2026-02-01',
          dueDate: '2026-02-01',
          amount: 660.33,
          vatRate: 21,
          vatAmount: 138.67,
          total: 800,
        });

      const params = mockQuery.mock.calls[1][1];
      expect(params).toContain(138.67);
      expect(params).toContain(800);
    });
  });

  describe('PUT /expenses/:id', () => {
    it('should update an unpaid expense', async () => {
      // Mock status check
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'unpaid' }] });
      // Mock for current values
      mockQuery.mockResolvedValueOnce({ rows: [{ amount: '1000.00', vat_rate: '21.00' }] });
      // Mock UPDATE
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'exp-1',
          expense_number: 'N20260201',
          status: 'unpaid',
          total: '2420.00',
        }]
      });

      const response = await request(app)
        .put('/expenses/exp-1')
        .send({
          amount: 2000,
          description: 'Updated',
          notes: 'Updated notes',
        });

      expect(response.status).toBe(200);
    });

    it('should update a paid expense without changing its payment status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'paid' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ amount: '1000.00', vat_rate: '21.00', vat_amount: '210.00', total: '1210.00' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'exp-1', expense_number: 'N20260201', status: 'paid', total: '2420.00' }]
      });

      const response = await request(app)
        .put('/expenses/exp-1')
        .send({ amount: 2000, description: 'test', notes: 'test' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('paid');
    });

    it('should preserve an explicitly entered gross total when editing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'paid' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ amount: '1000.00', vat_rate: '21.00', vat_amount: '210.00', total: '1210.00' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'exp-1', expense_number: 'N20260201', status: 'paid', total: '1209.99' }]
      });

      const response = await request(app)
        .put('/expenses/exp-1')
        .send({ amount: 1000, vatRate: 21, total: 1209.99, description: null, notes: null });

      expect(response.status).toBe(200);
      const updateParams = mockQuery.mock.calls[2][1];
      expect(updateParams).toContain(209.99);
      expect(updateParams).toContain(1209.99);
    });

    it('should return 404 for non-existent expense', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/expenses/non-existent')
        .send({ amount: 2000, description: 'test', notes: 'test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /expenses/:id', () => {
    it('should delete an expense', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'exp-1' }] });

      const response = await request(app).delete('/expenses/exp-1');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent expense', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).delete('/expenses/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /expenses/:id/mark-paid', () => {
    it('should mark expense as paid', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'exp-1',
          status: 'paid',
          paid_at: '2026-02-04T00:00:00Z',
        }]
      });

      const response = await request(app).post('/expenses/exp-1/mark-paid');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('paid');

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("status = 'paid'");
      expect(sql).toContain('paid_at = CURRENT_TIMESTAMP');
    });

    it('should return 404 if already paid or not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).post('/expenses/exp-1/mark-paid');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /expenses/:id/mark-unpaid', () => {
    it('should mark expense as unpaid', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'exp-1',
          status: 'unpaid',
          paid_at: null,
        }]
      });

      const response = await request(app).post('/expenses/exp-1/mark-unpaid');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('unpaid');

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("status = 'unpaid'");
      expect(sql).toContain('paid_at = NULL');
    });

    it('should return 404 if not paid or not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).post('/expenses/exp-1/mark-unpaid');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /expenses/:id/file', () => {
    it('should download attached file', async () => {
      const fileContent = Buffer.from('test file content').toString('base64');
      mockQuery.mockResolvedValueOnce({
        rows: [{
          file_data: fileContent,
          file_name: 'invoice.pdf',
          file_mime_type: 'application/pdf',
        }]
      });

      const response = await request(app).get('/expenses/exp-1/file');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('invoice.pdf');
    });

    it('should return 404 if no file attached', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          file_data: null,
          file_name: null,
          file_mime_type: null,
        }]
      });

      const response = await request(app).get('/expenses/exp-1/file');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('No file');
    });

    it('should return 404 for non-existent expense', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/expenses/non-existent/file');

      expect(response.status).toBe(404);
    });
  });
});
