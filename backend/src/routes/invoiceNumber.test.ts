import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../db/init.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args)
}));

vi.mock('../services/pdfGenerator.js', () => ({ generateInvoicePDF: vi.fn() }));
vi.mock('../services/emailSender.js', () => ({ sendInvoiceEmail: vi.fn() }));
vi.mock('../services/cnbExchangeRate.js', () => ({ convertEurToCzk: vi.fn() }));

import { generateInvoiceNumber } from './invoices';

describe('invoice number generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the configured starting sequence for the first invoice', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          invoice_number_prefix: '',
          invoice_number_format: 'INV-{YYYY}-{SEQ4}',
          invoice_number_starting_sequence: 42,
          invoice_number_reset_period: 'yearly'
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(generateInvoiceNumber('user-1', '2026-04-15T12:00:00')).resolves.toEqual({
      invoiceNumber: 'INV-2026-0042',
      variableSymbol: '20260042'
    });
  });

  it('continues after the highest sequence in the current period', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          invoice_number_prefix: 'F',
          invoice_number_format: '{YYYY}{SEQ2}',
          invoice_number_starting_sequence: 1,
          invoice_number_reset_period: 'yearly'
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          { invoice_number: 'F202601', issue_date: '2026-01-10' },
          { invoice_number: 'F202607', issue_date: '2026-03-10' },
          { invoice_number: 'F202508', issue_date: '2025-12-10' }
        ]
      });

    await expect(generateInvoiceNumber('user-1', '2026-04-15T12:00:00')).resolves.toEqual({
      invoiceNumber: 'F202608',
      variableSymbol: '202608'
    });
  });

  it('starts a new monthly period at one when invoice history exists', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          invoice_number_prefix: '',
          invoice_number_format: '{YYYY}{MM}{SEQ2}',
          invoice_number_starting_sequence: 99,
          invoice_number_reset_period: 'monthly'
        }]
      })
      .mockResolvedValueOnce({ rows: [{ invoice_number: '20260412', issue_date: '2026-04-15' }] });

    await expect(generateInvoiceNumber('user-1', '2026-05-15T12:00:00')).resolves.toEqual({
      invoiceNumber: '20260501',
      variableSymbol: '20260501'
    });
  });

  it('keeps a yearly sequence while rendering the invoice month', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          invoice_number_prefix: '',
          invoice_number_format: '{SEQ3}{MM}{YY}',
          invoice_number_starting_sequence: 1,
          invoice_number_reset_period: 'yearly'
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          { invoice_number: '0010126', issue_date: '2026-01-10' },
          { invoice_number: '0070526', issue_date: '2026-05-10' },
          { invoice_number: '0151225', issue_date: '2025-12-10' }
        ]
      });

    await expect(generateInvoiceNumber('user-1', '2026-06-15T12:00:00')).resolves.toEqual({
      invoiceNumber: '0080626',
      variableSymbol: '0080626'
    });
  });
});
