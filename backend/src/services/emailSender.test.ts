import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockSendMail } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSendMail: vi.fn()
}));

vi.mock('../db/init.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args)
}));

vi.mock('./pdfGenerator.js', () => ({
  generateInvoicePDF: vi.fn().mockResolvedValue(Buffer.from('pdf'))
}));

vi.mock('../utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('smtp-password')
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail }))
  }
}));

import { sendInvoiceEmail } from './emailSender';

const settings = {
  smtp_host: 'smtp.example.com',
  smtp_port: 587,
  smtp_user: 'sender@example.com',
  smtp_password: 'encrypted',
  smtp_secure: true,
  smtp_from_email: 'sender@example.com',
  smtp_from_name: 'Supplier Ltd.',
  email_template: null,
  email_subject_template: null,
  accountant_email: 'accountant@example.com',
  accountant_email_template: 'Invoice {{invoiceNumber}} for {{clientName}}, issued {{issueDate}}.',
  accountant_email_subject_template: null
};

const invoice = {
  invoice_number: 'INV-42',
  total: '1210.00',
  currency: 'CZK',
  issue_date: '2026-06-20',
  due_date: '2026-07-04',
  client_name: 'Client s.r.o.'
};

function mockBaseQueries() {
  mockQuery
    .mockResolvedValueOnce({ rows: [settings] })
    .mockResolvedValueOnce({ rows: [{ language: 'en' }] })
    .mockResolvedValueOnce({ rows: [invoice] })
    .mockResolvedValue({ rows: [] });
}

describe('sendInvoiceEmail accountant forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'sent' });
  });

  it('sends a separate accountant message with invoice context', async () => {
    mockBaseQueries();

    const result = await sendInvoiceEmail(
      'invoice-1',
      'user-1',
      'client@example.com',
      null,
      undefined,
      true
    );

    expect(result).toMatchObject({
      success: true,
      accountantSent: true,
      sentTo: ['client@example.com', 'accountant@example.com']
    });
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[1][0]).toMatchObject({
      to: 'accountant@example.com',
      subject: 'Invoice No. INV-42 – Client s.r.o.',
      text: expect.stringContaining('Invoice INV-42 for Client s.r.o.')
    });
  });

  it('reports an accountant-only failure without treating the client send as failed', async () => {
    mockBaseQueries();
    mockSendMail
      .mockResolvedValueOnce({ messageId: 'client-sent' })
      .mockRejectedValueOnce(new Error('Accountant mailbox rejected'));

    const result = await sendInvoiceEmail(
      'invoice-1',
      'user-1',
      'client@example.com',
      null,
      undefined,
      true
    );

    expect(result).toMatchObject({
      success: true,
      accountantSent: false,
      accountantError: 'Accountant mailbox rejected',
      sentTo: ['client@example.com']
    });
    expect(mockQuery.mock.calls.some(([sql]) =>
      String(sql).includes("'failed'")
    )).toBe(true);
  });

  it('renders saved subject templates for the client and accountant', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{
        ...settings,
        email_subject_template: '{{clientName}}: invoice {{invoiceNumber}} due {{dueDate}}',
        accountant_email_subject_template: 'Book {{invoiceNumber}} / {{total}}'
      }] })
      .mockResolvedValueOnce({ rows: [{ language: 'en' }] })
      .mockResolvedValueOnce({ rows: [invoice] })
      .mockResolvedValue({ rows: [] });

    await sendInvoiceEmail('invoice-1', 'user-1', 'client@example.com', null, undefined, true);

    expect(mockSendMail.mock.calls[0][0].subject).toBe('Client s.r.o.: invoice INV-42 due 7/4/2026');
    expect(mockSendMail.mock.calls[1][0].subject).toBe('Book INV-42 / 1,210.00 Kč');
  });

  it('uses one-off subject overrides when provided', async () => {
    mockBaseQueries();

    await sendInvoiceEmail(
      'invoice-1',
      'user-1',
      'client@example.com',
      null,
      undefined,
      true,
      undefined,
      'Client override',
      'Accountant override'
    );

    expect(mockSendMail.mock.calls[0][0].subject).toBe('Client override');
    expect(mockSendMail.mock.calls[1][0].subject).toBe('Accountant override');
  });
});
