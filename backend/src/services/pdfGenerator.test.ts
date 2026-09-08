import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbInit from '../db/init';

// Mock database query
vi.mock('../db/init.js', () => ({
  query: vi.fn(),
}));

// Mock qrcode
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  },
}));

const mockQuery = vi.mocked(dbInit.query);

function makeInvoiceRow(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-1',
    invoice_number: 'FV2024001',
    variable_symbol: '2024001',
    status: 'sent',
    currency: 'CZK',
    issue_date: new Date('2024-01-15'),
    due_date: new Date('2024-02-15'),
    delivery_date: new Date('2024-01-15'),
    subtotal: '10000.00',
    vat_rate: '21',
    vat_amount: '2100.00',
    total: '12100.00',
    notes: null,
    qr_payment_data: 'SPD*1.0*ACC:CZ6508000000192000145399*AM:12100.00*CC:CZK*MSG:Faktura FV2024001*X-VS:2024001',
    client_name: 'Test Klient s.r.o.',
    client_address: 'Testovací 123, Praha 1',
    client_ico: '12345678',
    client_dic: 'CZ12345678',
    user_name: 'Jan Novák',
    user_company_name: 'Novák IT',
    user_address: 'Dodavatelská 456, Brno',
    user_ico: '87654321',
    user_dic: 'CZ87654321',
    user_bank_account: '192000145399',
    user_bank_code: '0800',
    user_logo_data: null,
    user_logo_mime_type: null,
    ...overrides,
  };
}

function makeItemRows() {
  return [
    {
      description: 'Vývoj webové aplikace',
      quantity: '40',
      unit: 'hod',
      unit_price: '200.00',
      total: '8000.00',
      sort_order: 1,
    },
    {
      description: 'Konzultace',
      quantity: '10',
      unit: 'hod',
      unit_price: '200.00',
      total: '2000.00',
      sort_order: 2,
    },
  ];
}

const mockQueryResult = (rows: any[]) => ({
  rows,
  rowCount: rows.length,
  command: 'SELECT' as const,
  oid: 0,
  fields: [],
});

describe('generateInvoicePDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a valid PDF buffer starting with %PDF', async () => {
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([makeInvoiceRow()]))
      .mockResolvedValueOnce(mockQueryResult(makeItemRows()));

    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    const buffer = await generateInvoicePDF('inv-1', 'user-1');

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should generate PDF for CZK invoice with QR code', async () => {
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([makeInvoiceRow()]))
      .mockResolvedValueOnce(mockQueryResult(makeItemRows()));

    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    const buffer = await generateInvoicePDF('inv-1', 'user-1');

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should generate PDF for EUR invoice without QR code', async () => {
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([makeInvoiceRow({ currency: 'EUR', qr_payment_data: null })]))
      .mockResolvedValueOnce(mockQueryResult(makeItemRows()));

    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    const buffer = await generateInvoicePDF('inv-1', 'user-1');

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should generate PDF with notes', async () => {
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([makeInvoiceRow({ notes: 'Děkujeme za spolupráci.' })]))
      .mockResolvedValueOnce(mockQueryResult(makeItemRows()));

    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    const buffer = await generateInvoicePDF('inv-1', 'user-1');

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should generate PDF with logo', async () => {
    // 1x1 transparent PNG as base64
    const logoPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([makeInvoiceRow({
        user_logo_data: logoPng,
        user_logo_mime_type: 'image/png',
      })]))
      .mockResolvedValueOnce(mockQueryResult(makeItemRows()));

    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    const buffer = await generateInvoicePDF('inv-1', 'user-1');

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('should throw when invoice is not found', async () => {
    mockQuery.mockResolvedValueOnce(mockQueryResult([]));

    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    await expect(generateInvoicePDF('missing', 'user-1')).rejects.toThrow('Invoice not found');
  });
  it.each(['minimalistic', 'classic', null, 'unknown'])('renders the selected theme or classic fallback: %s', async (invoice_pdf_template) => {
    mockQuery.mockResolvedValueOnce(mockQueryResult([makeInvoiceRow({ invoice_pdf_template })]))
      .mockResolvedValueOnce(mockQueryResult(makeItemRows()));
    const { generateInvoicePDF } = await import('./pdfGenerator.js');
    const buffer = await generateInvoicePDF('inv-1', 'user-1');
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain(invoice_pdf_template === 'minimalistic' ? 'IBMPlexSans' : 'Roboto');
    const [sql, values] = mockQuery.mock.calls[0];
    expect(sql).toContain('LEFT JOIN settings s ON s.user_id = u.id');
    expect(sql).toContain('i.id = $1 AND i.user_id = $2');
    expect(values).toEqual(['inv-1', 'user-1']);
  });

});

function makeDefinitionInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-1', invoiceNumber: '20260901', variableSymbol: '20260901', status: 'sent',
    currency: 'CZK', issueDate: new Date('2026-09-01'), dueDate: new Date('2026-09-15'),
    deliveryDate: new Date('2026-09-01'), subtotal: 4000, vatRate: 21, vatAmount: 330, total: 4330,
    notes: 'Děkujeme za spolupráci.', qrPaymentData: '', exchangeRate: null, totalCzk: null,
    clientName: 'Test Klient s.r.o.', clientAddress: 'Testovací 123, Praha', clientIco: '12345678', clientDic: 'CZ12345678',
    userName: 'Jan Novák', userCompanyName: 'Novák IT', userAddress: 'Dodavatelská 456\nBrno', userIco: '87654321',
    userDic: 'CZ87654321', userVatPayer: true, userBankAccount: '192000145399', userBankCode: '0800',
    userLogoDataUrl: null, language: 'cs',
    items: [
      { description: 'Standard service', quantity: 2, unit: '', unitPrice: 500, total: 1000, vatRate: 21, vatAmount: 210 },
      { description: 'Reduced rate', quantity: 1, unit: 'ks', unitPrice: 1000, total: 1000, vatRate: 12, vatAmount: 120 },
      { description: 'Exempt service', quantity: 1, unit: 'ks', unitPrice: 1000, total: 1000, vatTreatment: 'exempt' as const, vatRate: 0, vatAmount: 0, vatReason: 'Exemption reason' },
      { description: 'Reverse charge service', quantity: 1, unit: 'ks', unitPrice: 1000, total: 1000, vatTreatment: 'reverse_charge' as const, vatRate: 21, vatAmount: 0, vatReason: 'Reverse charge reason' },
    ], ...overrides,
  };
}

describe('minimalistic PDF content', () => {
  it.each(['cs', 'en'])('preserves mixed VAT, tax reasons, quantities without units and totals in %s', async (language) => {
    const { __test__ } = await import('./pdfGenerator.js');
    const { t, formatCurrencyLocale } = await import('../i18n/translations');
    const invoice = makeDefinitionInvoice({ language });
    const doc = __test__.buildMinimalisticDocumentDefinition(invoice, '');
    const content = JSON.stringify(doc.content);
    for (const text of [t(language).pdf.exempt, t(language).pdf.reverseChargeNotice, 'Exemption reason', 'Reverse charge reason', '21 %', '12 %', formatCurrencyLocale(4330, 'CZK', language)]) {
      expect(content).toContain(text);
    }
    const table = (doc.content as any[])[2].table;
    expect(table.body[1][1].text).toBe('2');
    expect(table.body[1].slice(1).every((cell: any) => cell.noWrap)).toBe(true);
    expect(doc.defaultStyle?.font).toBe('IBMPlexSans');
    expect(doc.footer).toBeDefined();
  });

  it('does not label non-VAT invoices as tax documents or expose supplier VAT ID', async () => {
    const { __test__ } = await import('./pdfGenerator.js');
    const doc = __test__.buildMinimalisticDocumentDefinition(makeDefinitionInvoice({ userVatPayer: false, items: [], vatRate: 0, vatAmount: 0 }), '');
    const text = JSON.stringify(doc.content);
    expect(text).toContain('Neplátce DPH');
    expect(text).not.toContain('CZ87654321');
    expect(text).not.toContain('DAŇOVÝ DOKLAD');
    expect((doc.content as any[])[2].table.body[0]).toHaveLength(3);
  });

  it('preserves EUR conversion and omits CZK QR payment for EUR', async () => {
    const { __test__ } = await import('./pdfGenerator.js');
    const doc = __test__.buildMinimalisticDocumentDefinition(makeDefinitionInvoice({ currency: 'EUR', exchangeRate: 25.1234, totalCzk: 108784.822 }), 'QR-DATA');
    const text = JSON.stringify(doc.content);
    expect(text).toContain('25.1234 CZK/EUR');
    expect(text).not.toContain('QR-DATA');
  });
});
