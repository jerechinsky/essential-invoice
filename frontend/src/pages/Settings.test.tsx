import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from './Settings';

// Mock the API
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDownload = vi.fn();

vi.mock('../utils/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    download: (...args: unknown[]) => mockDownload(...args),
    post: vi.fn()
  }
}));

const mockSetTheme = vi.fn();
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme: mockSetTheme }),
}));

const mockLogout = vi.fn();
const mockUpdateProfile = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      name: 'Jan Dvořák',
      email: 'jan@dvorak.cz',
      companyName: 'Dvořák s.r.o.',
      vatPayer: true,
      hasLogo: false,
      language: 'cs',
    },
    token: 'test-token',
    updateProfile: mockUpdateProfile,
    logout: mockLogout,
  }),
}));

// Every lucide icon stubs out, so adding an icon never breaks these tests.
// No JSX in here — the factory is hoisted above the JSX runtime import.
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, () => null]));
});

const getVatSelect = () => document.querySelector('select[name="defaultVatRate"]') as HTMLSelectElement;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/:section" element={<Settings />} />
      </Routes>
    </MemoryRouter>
  );
}

const defaultSettings = {
  smtpHost: null,
  smtpPort: 587,
  smtpUser: null,
  smtpPasswordSet: false,
  smtpSecure: true,
  smtpFromEmail: null,
  smtpFromName: null,
  imapHost: null,
  imapPort: 993,
  imapUser: null,
  imapPasswordSet: false,
  imapTls: true,
  bankNotificationEmail: null,
  emailPollingInterval: 300,
  invoiceNumberPrefix: '',
  invoiceNumberFormat: 'YYYYMM##',
  defaultVatRate: 21,
  defaultPaymentTerms: 14,
  emailTemplate: null,
  calculatorEnabled: false,
  aiApiKeySet: false,
  aiApiUrl: null,
  aiModel: null
};

describe('Settings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it.each([undefined, 'classic', 'minimalistic'])('loads the PDF theme without making the form dirty: %s', async (invoicePdfTemplate) => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, invoicePdfTemplate });
    renderAt('/settings/invoicing');
    const select = await screen.findByRole('combobox', { name: 'Šablona PDF faktury' });
    expect(select).toHaveValue(invoicePdfTemplate || 'classic');
    expect(screen.queryByRole('button', { name: /uložit nastavení/i })).not.toBeInTheDocument();
  });

  it.each([['classic', 'minimalistic'], ['minimalistic', 'classic']])('saves a theme change from %s to %s and reloads it', async (from, to) => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, invoicePdfTemplate: from });
    mockPut.mockResolvedValueOnce({});
    mockGet.mockResolvedValueOnce({ ...defaultSettings, invoicePdfTemplate: to });
    renderAt('/settings/invoicing');
    const select = await screen.findByRole('combobox', { name: 'Šablona PDF faktury' });
    fireEvent.change(select, { target: { value: to } });
    fireEvent.click(screen.getByRole('button', { name: /uložit nastavení/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({ invoicePdfTemplate: to })));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(select).toHaveValue(to);
    await waitFor(() => expect(screen.queryByRole('button', { name: /uložit nastavení/i })).not.toBeInTheDocument());
  });

  it('discards an unsaved PDF theme change', async () => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, invoicePdfTemplate: 'minimalistic' });
    renderAt('/settings/invoicing');
    const select = await screen.findByRole('combobox', { name: 'Šablona PDF faktury' });
    fireEvent.change(select, { target: { value: 'classic' } });
    fireEvent.click(screen.getByRole('button', { name: /zahodit/i }));
    expect(select).toHaveValue('minimalistic');
    expect(mockPut).not.toHaveBeenCalled();
  });
  it('should load and display defaultVatRate: 0 correctly', async () => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultVatRate: 0 });

    renderAt('/settings/invoicing');

    await waitFor(() => {
      const vatSelect = getVatSelect();
      expect(vatSelect).toBeTruthy();
      expect(vatSelect.value).toBe('0');
    });
  });

  it('should save defaultVatRate: 0 and reload correctly', async () => {
    // Initial load with VAT 21
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultVatRate: 21 });
    mockPut.mockResolvedValueOnce({ message: 'Settings updated successfully' });
    // After save, backend returns with VAT 0
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultVatRate: 0 });

    renderAt('/settings/invoicing');

    // Wait for initial load
    await waitFor(() => {
      const vatSelect = getVatSelect();
      expect(vatSelect).toBeTruthy();
      expect(vatSelect.value).toBe('21');
    });

    // Change VAT to 0%
    const vatSelect = getVatSelect();
    fireEvent.change(vatSelect, { target: { value: '0' } });

    expect(vatSelect.value).toBe('0');

    // Click save
    const saveButton = screen.getByRole('button', { name: /uložit nastavení/i });
    fireEvent.click(saveButton);

    // Wait for save and reload
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
        defaultVatRate: 0
      }));
    });

    // After reload, VAT should still be 0
    await waitFor(() => {
      expect(getVatSelect().value).toBe('0');
    });
  });

  it('offers the full three-way theme choice in its own section', async () => {
    mockGet.mockResolvedValueOnce(defaultSettings);

    renderAt('/settings/appearance');
    await waitFor(() => expect(screen.getByRole('button', { name: /Světlý/ })).toBeInTheDocument());

    // All three options, including system — the user menu only toggles light/dark
    expect(screen.getByRole('button', { name: /Systémový/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Tmavý/ }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');

    // Appearance applies immediately, so there is nothing to save here
    expect(screen.queryByRole('button', { name: /uložit nastavení/i })).not.toBeInTheDocument();
  });

  it('reveals the save bar only once something changes, and discard puts it away', async () => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultVatRate: 21 });

    renderAt('/settings/invoicing');
    await waitFor(() => expect(getVatSelect().value).toBe('21'));

    // Nothing edited yet — no save affordance
    expect(screen.queryByRole('button', { name: /uložit nastavení/i })).not.toBeInTheDocument();

    fireEvent.change(getVatSelect(), { target: { value: '12' } });

    expect(screen.getByRole('button', { name: /uložit nastavení/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /zahodit/i }));

    expect(getVatSelect().value).toBe('21');
    expect(screen.queryByRole('button', { name: /uložit nastavení/i })).not.toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should not render paušální daň section', async () => {
    mockGet.mockResolvedValueOnce(defaultSettings);

    renderAt('/settings/invoicing');

    await waitFor(() => {
      expect(getVatSelect()).toBeTruthy();
    });

    // Paušální daň section should NOT be present (moved to Profile)
    expect(screen.queryByText('Paušální daň')).not.toBeInTheDocument();
    expect(screen.queryByText('Používám paušální daň')).not.toBeInTheDocument();
  });

  describe('mobile index', () => {
    it('lists every section with its current value, profile sections included', async () => {
      mockGet.mockResolvedValueOnce({ ...defaultSettings, smtpHost: 'smtp.seznam.cz' });

      renderAt('/settings');
      await waitFor(() => expect(screen.getByTestId('settings-index')).toBeInTheDocument());
      // The desktop nav renders alongside (hidden by CSS), so scope to the index
      const index = within(screen.getByTestId('settings-index'));

      // Profile rows drill into /profile/*, settings rows into /settings/*
      expect(index.getByRole('link', { name: /Firemní údaje/ })).toHaveAttribute('href', '/profile/company');
      expect(index.getByRole('link', { name: /Výchozí hodnoty faktur/ })).toHaveAttribute('href', '/settings/invoicing');

      // Trailing values summarise state without opening anything
      expect(index.getByText('21 % · 14 dní')).toBeInTheDocument();
      expect(index.getByText('Připojeno')).toBeInTheDocument();
      expect(index.getByText('Plátce DPH')).toBeInTheDocument();
    });

    it('saves the calculator toggle immediately, with no save bar', async () => {
      mockGet.mockResolvedValueOnce(defaultSettings);
      mockPut.mockResolvedValueOnce({});

      renderAt('/settings');
      await waitFor(() => expect(screen.getByTestId('settings-index')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('switch', { name: 'Zapnout kalkulačku' }));

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({ calculatorEnabled: true }));
      });

      expect(screen.queryByRole('button', { name: /uložit nastavení/i })).not.toBeInTheDocument();
    });
  });
});

it('opens accountant exports from the settings index and downloads without saving settings', async () => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(defaultSettings);
  mockDownload.mockResolvedValue(undefined);
  renderAt('/settings');
  const index = await screen.findByTestId('settings-index');
  fireEvent.click(within(index).getByRole('link', { name: 'Exporty' }));
  const download = await screen.findByRole('button', { name: 'Stáhnout ZIP' });
  expect(download.closest('form')?.parentElement?.closest('form')).toBeNull();
  fireEvent.click(download);
  await waitFor(() => expect(mockDownload).toHaveBeenCalled());
  expect(mockPut).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Uložit změny' })).not.toBeInTheDocument();
});
