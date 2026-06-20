import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database query function and pool
const { mockQuery, mockClientQuery, mockClientRelease } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockClientQuery: vi.fn(),
  mockClientRelease: vi.fn(),
}));
vi.mock('../db/init.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: {
    connect: vi.fn().mockResolvedValue({
      query: (...args: unknown[]) => mockClientQuery(...args),
      release: mockClientRelease,
    }),
  },
}));

// Mock generateInvoiceNumber
vi.mock('../routes/invoices.js', () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue({
    invoiceNumber: 'FV20260301',
    variableSymbol: '20260301',
  })
}));

// Mock generateSpayd
vi.mock('../utils/validation.js', () => ({
  generateSpayd: vi.fn().mockReturnValue('SPD*1.0*ACC:CZ123*AM:12100*CC:CZK')
}));

// Mock sendInvoiceEmail
vi.mock('./emailSender.js', () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue({ success: true, sentTo: ['test@test.cz'] })
}));

// Mock logger to keep test output clean
vi.mock('../utils/logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

import { generateInvoiceFromRecurring } from './recurringInvoiceGenerator';
import { sendInvoiceEmail } from './emailSender';

// Helper: mock the idempotency check to return no existing invoice (allow generation)
function mockIdempotencyCheckPass() {
  mockQuery.mockResolvedValueOnce({ rows: [] });
}

// Helper: mock the idempotency check to return an existing invoice (block generation)
function mockIdempotencyCheckFail() {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-inv' }] });
}

describe('Recurring Invoice Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseTemplate = {
    id: 'ri-1',
    user_id: 'user-1',
    client_id: 'client-1',
    currency: 'CZK',
    vat_rate: '21',
    notes: 'Monthly retainer',
    day_of_month: 15,
    start_date: '2026-01-01',
    end_date: null,
    next_generation_date: '2026-03-15',
    payment_terms: 14,
    auto_send: false,
    active: true,
  };

  it('should generate an invoice from a recurring template', async () => {
    mockIdempotencyCheckPass();
    // Mock items query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { description: 'Consulting', quantity: '10.00', unit: 'hod', unit_price: '1000.00', sort_order: 0 }
      ]
    });
    // Mock user query (bank details)
    mockQuery.mockResolvedValueOnce({
      rows: [{ bank_account: '123456', bank_code: '0800' }]
    });
    // Mock invoice INSERT
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'inv-1',
        invoice_number: 'FV20260301',
        variable_symbol: '20260301',
        total: '12100.00',
      }]
    });
    // Mock item INSERT
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Mock next_generation_date UPDATE
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await generateInvoiceFromRecurring(baseTemplate);

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe('inv-1');

    // Verify idempotency check was called first
    expect(mockQuery.mock.calls[0][0]).toContain('SELECT id FROM invoices');
    expect(mockQuery.mock.calls[0][0]).toContain('recurring_invoice_id');

    // Verify invoice was created with correct data (call index shifted by +1 due to idempotency check)
    const insertCall = mockQuery.mock.calls[3];
    const insertSql = insertCall[0];
    const insertParams = insertCall[1];
    expect(insertSql).toContain('INSERT INTO invoices');
    expect(insertParams).toContain('user-1');
    expect(insertParams).toContain('client-1');
    expect(insertParams).toContain('CZK');
    expect(insertParams).toContain('ri-1'); // recurring_invoice_id

    // Verify next_generation_date was advanced
    const updateCall = mockQuery.mock.calls[5];
    const updateParams = updateCall[1];
    expect(updateParams[0]).toBe('2026-04-15'); // next month
    expect(updateParams[1]).toBe('ri-1');
  });

  it('should skip generation when invoice already exists for this billing period', async () => {
    mockIdempotencyCheckFail();

    const result = await generateInvoiceFromRecurring(baseTemplate);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already generated');
    // Should only have made the idempotency check query, nothing else
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('should return error when template has no items', async () => {
    mockIdempotencyCheckPass();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await generateInvoiceFromRecurring(baseTemplate);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No items');
  });

  it('should calculate totals correctly', async () => {
    mockIdempotencyCheckPass();
    mockQuery.mockResolvedValueOnce({
      rows: [
        { description: 'Item A', quantity: '2.00', unit: 'ks', unit_price: '500.00', sort_order: 0 },
        { description: 'Item B', quantity: '1.00', unit: 'ks', unit_price: '1000.00', sort_order: 1 },
      ]
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ bank_account: null, bank_code: null }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'inv-1', invoice_number: 'FV20260301', variable_symbol: '20260301', total: '2420.00' }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // item 1
    mockQuery.mockResolvedValueOnce({ rows: [] }); // item 2
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update next_gen

    await generateInvoiceFromRecurring(baseTemplate);

    // Check INSERT params: subtotal=2000, vatAmount=420, total=2420 (index shifted +1)
    const insertParams = mockQuery.mock.calls[3][1];
    expect(insertParams).toContain(2000);  // subtotal
    expect(insertParams).toContain(420);   // vatAmount (2000 * 0.21)
    expect(insertParams).toContain(2420);  // total
  });

  it('should auto-send when enabled', async () => {
    const autoSendTemplate = { ...baseTemplate, auto_send: true };

    mockIdempotencyCheckPass();
    mockQuery.mockResolvedValueOnce({
      rows: [{ description: 'Work', quantity: '1.00', unit: 'ks', unit_price: '1000.00', sort_order: 0 }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ bank_account: null, bank_code: null }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'inv-1', invoice_number: 'FV20260301', variable_symbol: '20260301', total: '1210.00' }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // item insert
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update next_gen
    // Mock client email lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{ primary_email: 'client@test.cz', secondary_email: null, accountant_send_default: true }]
    });
    // Mock status update after send
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await generateInvoiceFromRecurring(autoSendTemplate);

    expect(result.success).toBe(true);
    expect(sendInvoiceEmail).toHaveBeenCalledWith(
      'inv-1',
      'user-1',
      'client@test.cz',
      null,
      undefined,
      true
    );

    // Verify invoice status was updated to 'sent' (index shifted +1)
    const statusUpdateSql = mockQuery.mock.calls[7][0];
    expect(statusUpdateSql).toContain("status = 'sent'");
  });

  it('should not auto-send when disabled', async () => {
    mockIdempotencyCheckPass();
    mockQuery.mockResolvedValueOnce({
      rows: [{ description: 'Work', quantity: '1.00', unit: 'ks', unit_price: '1000.00', sort_order: 0 }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ bank_account: null, bank_code: null }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'inv-1', invoice_number: 'FV20260301', variable_symbol: '20260301', total: '1210.00' }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // item
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update next_gen

    await generateInvoiceFromRecurring(baseTemplate);

    expect(sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it('should advance next_generation_date correctly for each month', async () => {
    const templates = [
      { ...baseTemplate, next_generation_date: '2026-01-15', day_of_month: 15 },
      { ...baseTemplate, next_generation_date: '2026-12-15', day_of_month: 15 },
      { ...baseTemplate, next_generation_date: '2026-02-28', day_of_month: 28 },
    ];

    const expectedNextDates = ['2026-02-15', '2027-01-15', '2026-03-28'];

    for (let i = 0; i < templates.length; i++) {
      vi.clearAllMocks();

      mockIdempotencyCheckPass();
      mockQuery.mockResolvedValueOnce({
        rows: [{ description: 'Work', quantity: '1.00', unit: 'ks', unit_price: '100.00', sort_order: 0 }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ bank_account: null, bank_code: null }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: `inv-${i}`, invoice_number: 'FV123', variable_symbol: '123', total: '121.00' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // item
      mockQuery.mockResolvedValueOnce({ rows: [] }); // update next_gen

      await generateInvoiceFromRecurring(templates[i]);

      const updateParams = mockQuery.mock.calls[5][1];
      expect(updateParams[0]).toBe(expectedNextDates[i]);
    }
  });

  it('should use fresh dates (today) for generated invoices', async () => {
    mockIdempotencyCheckPass();
    mockQuery.mockResolvedValueOnce({
      rows: [{ description: 'Work', quantity: '1.00', unit: 'ks', unit_price: '100.00', sort_order: 0 }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ bank_account: null, bank_code: null }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'inv-1', invoice_number: 'FV123', variable_symbol: '123', total: '121.00' }]
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await generateInvoiceFromRecurring(baseTemplate);

    const insertParams = mockQuery.mock.calls[3][1];
    const today = new Date().toISOString().split('T')[0];
    // issueDate should be today
    expect(insertParams).toContain(today);
  });
});
