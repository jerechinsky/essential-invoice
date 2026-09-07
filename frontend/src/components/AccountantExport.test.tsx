import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AccountantExport from './AccountantExport';
import { api } from '../utils/api';
import { toast } from 'sonner';

vi.mock('../utils/api', () => ({ api: { download: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it('downloads the chosen accounting period and basis through the authenticated API', async () => {
  vi.mocked(api.download).mockResolvedValue(undefined);
  render(<AccountantExport />);
  fireEvent.click(screen.getByText('Export pro účetní'));
  fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2026-08-01' } });
  fireEvent.change(screen.getByLabelText('Do'), { target: { value: '2026-08-31' } });
  fireEvent.change(screen.getByLabelText('Vybrat doklady podle'), { target: { value: 'tax' } });
  fireEvent.click(screen.getByRole('button', { name: 'Stáhnout ZIP' }));
  await waitFor(() => expect(api.download).toHaveBeenCalledWith('/exports/accountant?from=2026-08-01&to=2026-08-31&basis=tax', 'accountant-2026-08-01-2026-08-31.zip'));
  expect(toast.success).toHaveBeenCalled();
});

it('shows export validation failures and makes retry available', async () => {
  vi.mocked(api.download).mockRejectedValue(new Error('EUR exchange rate is missing'));
  render(<AccountantExport />);
  fireEvent.click(screen.getByText('Export pro účetní'));
  fireEvent.click(screen.getByRole('button', { name: 'Stáhnout ZIP' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('EUR exchange rate is missing'));
  expect(screen.getByRole('button', { name: 'Stáhnout ZIP' })).toBeEnabled();
});
