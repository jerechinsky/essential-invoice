import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Invoices from './Invoices';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDownloadPost = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('../utils/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    downloadPost: (...args: unknown[]) => mockDownloadPost(...args),
    download: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: vi.fn() }
}));

vi.mock('./RecurringInvoices', () => ({ default: () => <div>Recurring invoices</div> }));

function renderInvoices() {
  return render(<BrowserRouter><Invoices /></BrowserRouter>);
}

function resetLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  } });
}

describe('Fakturoid CSV import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalStorage();
    mockGet.mockResolvedValue([]);
  });

  it('previews and confirms an invoice import', async () => {
    mockPost
      .mockResolvedValueOnce({
        totalRows: 1,
        importable: 1,
        skipped: 0,
        issues: [],
        preview: [{
          invoiceNumber: '202615', clientName: 'Test s.r.o.', issueDate: '2026-06-16',
          total: 43560, currency: 'CZK', status: 'sent'
        }]
      })
      .mockResolvedValueOnce({ imported: 1, createdClients: 1, skippedExisting: 0 });

    renderInvoices();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));

    const file = new File(['Id,Number\n1,202615'], 'fakturoid.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue('Id,Number\n1,202615') });
    fireEvent.change(screen.getByLabelText('CSV export z Fakturoidu'), { target: { files: [file] } });

    await screen.findByText('Vybráno: fakturoid.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Zkontrolovat import' }));

    expect(await screen.findByText('Test s.r.o.')).toBeInTheDocument();
    expect(mockPost).toHaveBeenNthCalledWith(1, '/invoice-imports/fakturoid/preview', {
      csv: 'Id,Number\n1,202615'
    });

    fireEvent.click(screen.getByRole('button', { name: 'Importovat 1 faktur' }));
    await waitFor(() => expect(mockPost).toHaveBeenNthCalledWith(2, '/invoice-imports/fakturoid', {
      csv: 'Id,Number\n1,202615'
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Importováno 1 faktur, vytvořeno 1 kontaktů');
  });
});

describe('Invoice list editing', () => {
  const invoices = [
    { id: '11111111-1111-4111-8111-111111111111', invoiceNumber: '202601', variableSymbol: '202601', status: 'sent', currency: 'CZK', clientId: 'c1', clientName: 'Alpha', clientEmail: '', issueDate: '2026-06-01', dueDate: '2026-06-15', subtotal: 1000, vatAmount: 210, total: 1210, notes: 'Work', sentAt: null, paidAt: null, accountantEmailSentAt: null, createdAt: '' },
    { id: '22222222-2222-4222-8222-222222222222', invoiceNumber: '202602', variableSymbol: '202602', status: 'sent', currency: 'CZK', clientId: 'c2', clientName: 'Beta', clientEmail: '', issueDate: '2026-06-02', dueDate: '2026-06-16', subtotal: 2000, vatAmount: 420, total: 2420, notes: 'More work', sentAt: null, paidAt: null, accountantEmailSentAt: null, createdAt: '' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalStorage();
    mockGet.mockResolvedValue(invoices);
  });

  it('selects a checkbox range with Shift and batch updates it', async () => {
    mockPatch.mockResolvedValue({ updated: 2, invoices: invoices.map(invoice => ({ ...invoice, status: 'paid' })) });
    renderInvoices();
    const first = await screen.findByRole('checkbox', { name: 'Vybrat fakturu 202601' });
    const second = screen.getByRole('checkbox', { name: 'Vybrat fakturu 202602' });
    fireEvent.click(first);
    fireEvent.click(second, { shiftKey: true });
    expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hromadně upravit/ }));
    fireEvent.change(screen.getByLabelText('Stav'), { target: { value: 'paid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Použít na 2' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/invoices/batch', {
      ids: expect.arrayContaining(invoices.map(invoice => invoice.id)), status: 'paid',
    }));
  });

  it('shows optional VAT columns and persists the preference', async () => {
    renderInvoices();
    await screen.findByText('202601');
    fireEvent.click(screen.getByRole('button', { name: 'Sloupce' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'DPH' }));
    expect(screen.getByText('210,00 Kč')).toBeInTheDocument();
    expect(localStorage.getItem('essential-invoice.invoice-columns')).toContain('vatAmount');
  });

  it('downloads selected invoices as one ZIP and filters a custom date range', async () => {
    mockDownloadPost.mockResolvedValue(undefined);
    renderInvoices();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Vybrat fakturu 202601' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stáhnout ZIP' }));
    await waitFor(() => expect(mockDownloadPost).toHaveBeenCalledWith(
      '/invoices/batch-download', { ids: ['11111111-1111-4111-8111-111111111111'] }, expect.stringMatching(/^invoices-.*\.zip$/)
    ));

    fireEvent.change(screen.getByRole('combobox', { name: 'Vlastní období' }), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Do'), { target: { value: '2026-03-31' } });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/invoices?from=2026-01-01&to=2026-03-31'));
  });
});
