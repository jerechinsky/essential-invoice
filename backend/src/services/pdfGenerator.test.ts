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
    user_vat_payer: true,
    user_bank_account: '192000145399',
    user_bank_code: '0800',
    user_company_register_info: null,
    invoice_pdf_template: 'classic',
    user_language: 'cs',
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

  it('should add more space under party addresses and anchor the footer to the page bottom', async () => {
    const { __test__ } = await import('./pdfGenerator.js');

    const doc = __test__.buildMinimalisticDocumentDefinition({
      id: 'inv-1',
      invoiceNumber: 'FV2024001',
      variableSymbol: '2024001',
      status: 'sent',
      currency: 'CZK',
      issueDate: new Date('2024-01-15'),
      dueDate: new Date('2024-02-15'),
      deliveryDate: new Date('2024-01-15'),
      subtotal: 10000,
      vatRate: 21,
      vatAmount: 2100,
      total: 12100,
      notes: '',
      qrPaymentData: 'SPD*1.0',
      exchangeRate: null,
      totalCzk: null,
      clientName: 'Test Klient s.r.o.',
      clientAddress: 'Kundratka 2359/17, 18000 Praha',
      clientIco: '12345678',
      clientDic: 'CZ12345678',
      userName: 'Jan Novák',
      userCompanyName: 'Novák IT',
      userAddress: 'Neveklovice 44\n29413 Neveklovice',
      userIco: '87654321',
      userDic: 'CZ87654321',
      userVatPayer: true,
      userBankAccount: '192000145399',
      userBankCode: '0800',
      userCompanyRegisterInfo: 'Zapsáno v OR',
      userLogoDataUrl: null,
      invoicePdfTemplate: 'minimalistic',
      language: 'cs',
      items: [{
        description: 'Služby',
        quantity: 1,
        unit: '',
        unitPrice: 10000,
        total: 10000,
      }],
    }, 'data:image/png;base64,qr');

    const documentContent = doc.content as any[];
    const partiesSection = documentContent[1];
    expect(partiesSection.table.body[2][0].margin).toEqual([0, 12, 0, 0]);
    expect(partiesSection.table.body[2][2].margin).toEqual([0, 12, 0, 0]);

    const footer = (typeof doc.background === 'function'
      ? doc.background(1, {} as any)
      : doc.background) as any;
    expect(footer.absolutePosition).toEqual({ x: 40, y: 791.49 });
    expect(footer.stack).toEqual([{ text: 'Zapsáno v OR', fontSize: 8, color: '#6b7280' }]);
  });

  it('should keep the classic PDF template as the default and include registry footer text', async () => {
    const { __test__ } = await import('./pdfGenerator.js');

    const doc = __test__.buildClassicDocumentDefinition({
      id: 'inv-1',
      invoiceNumber: 'FV2024001',
      variableSymbol: '2024001',
      status: 'sent',
      currency: 'CZK',
      issueDate: new Date('2024-01-15'),
      dueDate: new Date('2024-02-15'),
      deliveryDate: new Date('2024-01-15'),
      subtotal: 10000,
      vatRate: 21,
      vatAmount: 2100,
      total: 12100,
      notes: '',
      qrPaymentData: 'SPD*1.0',
      exchangeRate: null,
      totalCzk: null,
      clientName: 'Test Klient s.r.o.',
      clientAddress: 'Kundratka 2359/17, 18000 Praha',
      clientIco: '12345678',
      clientDic: 'CZ12345678',
      userName: 'Jan Novák',
      userCompanyName: 'Novák IT',
      userAddress: 'Dodavatelská 456, Brno',
      userIco: '87654321',
      userDic: 'CZ87654321',
      userVatPayer: true,
      userBankAccount: '192000145399',
      userBankCode: '0800',
      userCompanyRegisterInfo: 'Společnost je zapsána v obchodním rejstříku',
      userLogoDataUrl: null,
      invoicePdfTemplate: 'classic',
      language: 'cs',
      items: [{
        description: 'Služby',
        quantity: 1,
        unit: '',
        unitPrice: 10000,
        total: 10000,
      }],
    }, 'data:image/png;base64,qr');

    expect(doc.defaultStyle?.font).toBe('Roboto');
    expect(doc.pageMargins).toEqual([30, 30, 30, 30]);
    expect(JSON.stringify(doc.content)).toContain('Společnost je zapsána v obchodním rejstříku');
  });
});
