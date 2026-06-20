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
      supplierInvoiceNumber: '4021043452',
      issueDate: '2026-06-03',
      dueDate: '2026-06-03',
      currency: 'CZK',
      amount: 660.33,
      vatRate: 21,
      vatAmount: 138.67,
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

  describe('POST /expenses', () => {
    it('should create an expense', async () => {
      // Mock for generateExpenseNumber COUNT query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Mock for INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-exp',
          expense_number: 'N20260201',
          status: 'unpaid',
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
      expect(response.body.status).toBe('unpaid');
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
          status: 'unpaid',
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
          status: 'unpaid',
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

    it('should reject editing a paid expense', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'paid' }] });

      const response = await request(app)
        .put('/expenses/exp-1')
        .send({ amount: 2000, description: 'test', notes: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('unpaid');
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
