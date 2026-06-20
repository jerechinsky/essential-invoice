import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Invoices from './Invoices';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('../utils/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    download: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args) }
}));

vi.mock('./RecurringInvoices', () => ({ default: () => <div>Recurring invoices</div> }));

function renderInvoices() {
  return render(<BrowserRouter><Invoices /></BrowserRouter>);
}

describe('Fakturoid CSV import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
