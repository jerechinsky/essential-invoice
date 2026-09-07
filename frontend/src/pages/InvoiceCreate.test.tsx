import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InvoiceCreate from './InvoiceCreate';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../utils/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: vi.fn(),
  },
}));

const authUser = { name: 'Jan Novák', vatPayer: true };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

vi.mock('lucide-react', () => {
  const icon = (name: string) => () => <span data-testid={`${name}-icon`} />;
  return {
    ArrowLeft: icon('arrowleft'),
    QrCode: icon('qrcode'),
    Info: icon('info'),
    Plus: icon('plus'),
    X: icon('x'),
  };
});

const clients = [
  {
    id: 'client-1',
    companyName: 'Ateliér Vlna',
    primaryEmail: 'vlna@example.com',
    secondaryEmail: null,
    address: 'Dlouhá 12, Praha',
    ico: '12345678',
    dic: 'CZ12345678',
  },
];

const settings = { defaultVatRate: 21, defaultPaymentTerms: 14 };

const dashboard = {
  pausalniDan: { enabled: true, tier: 1, limit: 1500000, invoicedThisYear: 800000, remaining: 700000 },
};

function setupApi() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/clients') return Promise.resolve(clients);
    if (url === '/settings') return Promise.resolve(settings);
    if (url === '/dashboard') return Promise.resolve(dashboard);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function renderPage(path = '/invoices/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices/new" element={<InvoiceCreate />} />
        <Route path="/invoices/:id/edit" element={<InvoiceCreate />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('InvoiceCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser.vatPayer = true;
    mockGet.mockReset();
    mockPost.mockReset();
    setupApi();
  });

  it('inherits the saved rate and changes VAT on individual lines without a totals selector', async () => {
    renderPage();
    const vat = await screen.findByRole('combobox', { name: 'DPH' });
    expect(vat).toHaveValue('21');
    expect(screen.queryByText('Výchozí')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sazba DPH (%)')).not.toBeInTheDocument();
    fireEvent.change(vat, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Přidat položku' }));
    expect(screen.getAllByRole('combobox', { name: 'DPH' }).map(el => (el as HTMLSelectElement).value)).toEqual(['12', '21']);
    expect(screen.getByText('Rozpis DPH').closest('details')).not.toHaveAttribute('open');
  });

  it('defaults a non-VAT payer to zero tax and offers VAT controls on demand', async () => {
    authUser.vatPayer = false;
    renderPage();
    const showVat = await screen.findByRole('button', { name: 'Nastavit DPH u položek' });
    expect(screen.queryByRole('combobox', { name: 'DPH' })).not.toBeInTheDocument();
    fireEvent.click(showVat);
    expect(screen.getByRole('combobox', { name: 'DPH' })).toHaveValue('0');
  });

  it('uses the issue date unless a different tax-point date is enabled', async () => {
    // Keep the form mounted while checking both payloads.
    mockPost.mockImplementation(() => new Promise(() => {}));
    renderPage();
    await screen.findByLabelText('Popis *');
    const override = screen.getByRole('checkbox', { name: 'Jiné datum zdanitelného plnění' });
    expect(screen.queryByLabelText('Datum zdanitelného plnění')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Vyberte kontakt *'), { target: { value: 'client-1' } });
    fireEvent.change(screen.getByLabelText('Popis *'), { target: { value: 'Služby' } });
    fireEvent.change(screen.getByLabelText('Cena za jednotku *'), { target: { value: '100' } });
    fireEvent.click(override);
    const taxDate = screen.getByLabelText('Datum zdanitelného plnění');
    fireEvent.change(taxDate, { target: { value: '2026-08-31' } });
    fireEvent.submit(document.getElementById('invoice-form')!);
    await waitFor(() => expect(mockPost).toHaveBeenLastCalledWith('/invoices', expect.objectContaining({ deliveryDate: '2026-08-31' })));
    fireEvent.click(override);
    fireEvent.change(screen.getByLabelText('Datum vystavení *'), { target: { value: '2026-09-02' } });
    fireEvent.submit(document.getElementById('invoice-form')!);
    await waitFor(() => expect(mockPost).toHaveBeenLastCalledWith('/invoices', expect.objectContaining({ deliveryDate: '2026-09-02' })));
  });

  it('shows the tier impact note recomputed from the items', async () => {
    renderPage();
    await screen.findByLabelText('Popis *');

    // Fill an item worth 100 000 → 121 000 with VAT → 921 000 of 1 500 000 = 61%
    fireEvent.change(screen.getAllByLabelText('Popis *')[0], { target: { value: 'Konzultace' } });
    fireEvent.change(screen.getAllByLabelText('Cena za jednotku *')[0], { target: { value: '100000' } });

    await waitFor(() => {
      expect(screen.getByText(/61\s?% limitu paušální daně/)).toBeInTheDocument();
    });
  });

  it('switches the tier note to the crossing warning when over the limit', async () => {
    renderPage();
    await screen.findByLabelText('Popis *');

    fireEvent.change(screen.getAllByLabelText('Popis *')[0], { target: { value: 'Velká zakázka' } });
    fireEvent.change(screen.getAllByLabelText('Cena za jednotku *')[0], { target: { value: '800000' } });

    await waitFor(() => {
      expect(screen.getByText(/nad limit paušální daně/)).toBeInTheDocument();
    });
  });

  it('adds a row when tabbing out of the last price field', async () => {
    renderPage();
    await screen.findByLabelText('Popis *');

    expect(screen.getAllByLabelText('Popis *')).toHaveLength(1);
    const priceInput = screen.getAllByLabelText('Cena za jednotku *')[0];
    fireEvent.keyDown(priceInput, { key: 'Tab' });
    expect(screen.getAllByLabelText('Popis *')).toHaveLength(2);
  });

  it('submits the line treatment, reason and rate without adding supplier VAT', async () => {
    renderPage();
    await screen.findByLabelText('Popis *');
    fireEvent.change(screen.getByLabelText('Vyberte kontakt *'), { target: { value: 'client-1' } });
    fireEvent.change(screen.getByLabelText('Popis *'), { target: { value: 'Osvobozené plnění' } });
    fireEvent.change(screen.getByLabelText('Cena za jednotku *'), { target: { value: '300' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'DPH' }), { target: { value: 'exempt' } });
    fireEvent.change(screen.getByLabelText('Důvod osvobození / odkaz na zákon'), { target: { value: '§ 57' } });
    expect(screen.queryByRole('spinbutton', { name: 'Sazba DPH (%)' })).not.toBeInTheDocument();
    fireEvent.submit(document.getElementById('invoice-form')!);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/invoices', expect.objectContaining({
      items: [expect.objectContaining({ vatRate: 0, vatTreatment: 'exempt', vatReason: '§ 57', unitPrice: 300 })],
    })));
  });

  it('keeps historical VAT and a different tax date visible when a non-VAT payer edits an invoice', async () => {
    authUser.vatPayer = false;
    mockGet.mockImplementation((url: string) => Promise.resolve(
      url === '/clients' ? clients : url === '/settings' ? settings : url === '/dashboard' ? dashboard : {
        clientId: 'client-1', issueDate: '2026-09-01', deliveryDate: '2026-08-31', dueDate: '2026-09-15',
        currency: 'CZK', vatRate: 21,
        items: [{ description: 'Služby', quantity: 1, unit: 'ks', unitPrice: 100, vatRate: 12, vatTreatment: 'standard' }],
      }
    ));
    renderPage('/invoices/existing/edit');
    expect(await screen.findByRole('combobox', { name: 'DPH' })).toHaveValue('12');
    expect(screen.getByRole('checkbox', { name: 'Jiné datum zdanitelného plnění' })).toBeChecked();
    expect(screen.getByLabelText('Datum zdanitelného plnění')).toHaveValue('2026-08-31');
  });

  it('retains custom rates and clears special-treatment metadata when returning to standard VAT', async () => {
    renderPage();
    const vat = await screen.findByRole('combobox', { name: 'DPH' });
    fireEvent.change(vat, { target: { value: 'reverse_charge' } });
    fireEvent.change(screen.getByLabelText('Kód předmětu plnění pro tuzemské přenesení DPH'), { target: { value: '4' } });
    fireEvent.change(vat, { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Sazba DPH (%)'), { target: { value: '19.5' } });
    expect(screen.queryByLabelText('Kód předmětu plnění pro tuzemské přenesení DPH')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Vyberte kontakt *'), { target: { value: 'client-1' } });
    fireEvent.change(screen.getByLabelText('Popis *'), { target: { value: 'Služby' } });
    fireEvent.change(screen.getByLabelText('Cena za jednotku *'), { target: { value: '100' } });
    fireEvent.submit(document.getElementById('invoice-form')!);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/invoices', expect.objectContaining({
      items: [expect.objectContaining({ vatRate: 19.5, vatTreatment: 'standard', vatCode: '', vatReason: '' })],
    })));
  });

  it('renders the QR always-included statement, not a toggle', async () => {
    renderPage();
    await screen.findByLabelText('Popis *');
    expect(screen.getByText('QR platební kód je vždy součástí PDF.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /QR/ })).not.toBeInTheDocument();
  });
});
