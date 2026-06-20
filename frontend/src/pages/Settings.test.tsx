import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from './Settings';

// Mock the API
const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../utils/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: vi.fn()
  }
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Mail: () => <span data-testid="mail-icon" />,
  Server: () => <span data-testid="server-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
  CheckCircle: () => <span data-testid="check-icon" />,
  Eye: () => <span data-testid="eye-icon" />,
  EyeOff: () => <span data-testid="eye-off-icon" />,
  Calculator: () => <span data-testid="calculator-icon" />,
  Sparkles: () => <span data-testid="sparkles-icon" />
}));

const getVatSelect = () => document.querySelector('select[name="defaultVatRate"]') as HTMLSelectElement;
const getPdfTemplateSelect = () => document.querySelector('select[name="invoicePdfTemplate"]') as HTMLSelectElement;
const getInvoiceNumberFormatInput = () => document.querySelector('input[name="invoiceNumberFormat"]') as HTMLInputElement;
const getStartingSequenceInput = () => document.querySelector('input[name="invoiceNumberStartingSequence"]') as HTMLInputElement;
const getResetPeriodSelect = () => document.querySelector('select[name="invoiceNumberResetPeriod"]') as HTMLSelectElement;

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
  invoiceNumberFormat: '{YYYY}{MM}{SEQ2}',
  invoiceNumberStartingSequence: 1,
  invoiceNumberResetPeriod: 'monthly',
  invoicePdfTemplate: 'classic',
  defaultVatRate: 21,
  defaultPaymentTerms: 14,
  defaultExpensePaid: true,
  emailTemplate: null,
  emailSubjectTemplate: null,
  accountantEmail: null,
  accountantEmailTemplate: null,
  accountantEmailSubjectTemplate: null,
  accountantSendDefault: false,
  calculatorEnabled: false,
  perplexityApiKeySet: false
};

describe('Settings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load and display defaultVatRate: 0 correctly', async () => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultVatRate: 0 });

    render(<Settings />);

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

    render(<Settings />);

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

  it('should load and save client and accountant subject templates', async () => {
    mockGet.mockResolvedValueOnce({
      ...defaultSettings,
      emailSubjectTemplate: 'Invoice {{invoiceNumber}} for {{clientName}}',
      accountantEmailSubjectTemplate: 'Book {{invoiceNumber}}'
    });
    mockPut.mockResolvedValueOnce({ message: 'Settings updated successfully' });
    mockGet.mockResolvedValueOnce(defaultSettings);

    render(<Settings />);

    await waitFor(() => {
      expect(document.querySelector('input[name="emailSubjectTemplate"]')).toBeTruthy();
    });
    const clientSubject = document.querySelector(
      'input[name="emailSubjectTemplate"]'
    ) as HTMLInputElement;
    const accountantSubject = document.querySelector(
      'input[name="accountantEmailSubjectTemplate"]'
    ) as HTMLInputElement;

    expect(clientSubject.value).toBe('Invoice {{invoiceNumber}} for {{clientName}}');
    expect(accountantSubject.value).toBe('Book {{invoiceNumber}}');

    fireEvent.change(clientSubject, { target: { value: 'Updated {{invoiceNumber}}' } });
    fireEvent.change(accountantSubject, { target: { value: 'Archive {{invoiceNumber}}' } });
    fireEvent.click(screen.getByRole('button', { name: /uložit nastavení/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
        emailSubjectTemplate: 'Updated {{invoiceNumber}}',
        accountantEmailSubjectTemplate: 'Archive {{invoiceNumber}}'
      }));
    });
  });

  it('should not render paušální daň section', async () => {
    mockGet.mockResolvedValueOnce(defaultSettings);

    render(<Settings />);

    await waitFor(() => {
      expect(getVatSelect()).toBeTruthy();
    });

    // Paušální daň section should NOT be present (moved to Profile)
    expect(screen.queryByText('Paušální daň')).not.toBeInTheDocument();
    expect(screen.queryByText('Používám paušální daň')).not.toBeInTheDocument();
  });

  it('should load and save the minimalistic PDF template', async () => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, invoicePdfTemplate: 'minimalistic' });
    mockPut.mockResolvedValueOnce({ message: 'Settings updated successfully' });
    mockGet.mockResolvedValueOnce({ ...defaultSettings, invoicePdfTemplate: 'minimalistic' });

    render(<Settings />);

    await waitFor(() => {
      expect(getPdfTemplateSelect().value).toBe('minimalistic');
    });

    fireEvent.click(screen.getByRole('button', { name: /uložit nastavení/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
        invoicePdfTemplate: 'minimalistic'
      }));
    });
  });

  it('should load and save the default paid state for expenses', async () => {
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultExpensePaid: false });
    mockPut.mockResolvedValueOnce({ message: 'Settings updated successfully' });
    mockGet.mockResolvedValueOnce({ ...defaultSettings, defaultExpensePaid: true });

    render(<Settings />);

    const checkbox = await waitFor(() => {
      const element = document.querySelector('input[name="defaultExpensePaid"]') as HTMLInputElement;
      expect(element).not.toBeChecked();
      return element;
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /uložit nastavení/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({ defaultExpensePaid: true }));
    });
  });

  it('should load and save invoice numbering settings', async () => {
    mockGet.mockResolvedValueOnce({
      ...defaultSettings,
      invoiceNumberFormat: 'INV-{YYYY}-{SEQ4}',
      invoiceNumberStartingSequence: 42,
      invoiceNumberResetPeriod: 'yearly'
    });
    mockPut.mockResolvedValueOnce({ message: 'Settings updated successfully' });
    mockGet.mockResolvedValueOnce(defaultSettings);

    render(<Settings />);

    await waitFor(() => {
      expect(getInvoiceNumberFormatInput().value).toBe('INV-{YYYY}-{SEQ4}');
      expect(getStartingSequenceInput().value).toBe('42');
      expect(getResetPeriodSelect().value).toBe('yearly');
    });

    fireEvent.change(getInvoiceNumberFormatInput(), { target: { value: '{YY}/{SEQ3}' } });
    fireEvent.change(getStartingSequenceInput(), { target: { value: '8' } });
    fireEvent.change(getResetPeriodSelect(), { target: { value: 'monthly' } });

    fireEvent.click(screen.getByRole('button', { name: /uložit nastavení/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
        invoiceNumberFormat: '{YY}/{SEQ3}',
        invoiceNumberStartingSequence: 8,
        invoiceNumberResetPeriod: 'monthly'
      }));
    });
  });

  it('loads and saves accountant forwarding preferences', async () => {
    mockGet.mockResolvedValueOnce({
      ...defaultSettings,
      accountantEmail: 'accountant@example.com',
      accountantEmailTemplate: 'Invoice {{invoiceNumber}} for {{clientName}}',
      accountantSendDefault: true
    });
    mockPut.mockResolvedValueOnce({ message: 'Settings updated successfully' });
    mockGet.mockResolvedValueOnce(defaultSettings);

    render(<Settings />);

    const email = await screen.findByDisplayValue('accountant@example.com');
    expect(email).toBeInTheDocument();
    expect(screen.getByDisplayValue('Invoice {{invoiceNumber}} for {{clientName}}')).toBeInTheDocument();
    expect(document.querySelector('input[name="accountantSendDefault"]')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /uložit nastavení/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
        accountantEmail: 'accountant@example.com',
        accountantEmailTemplate: 'Invoice {{invoiceNumber}} for {{clientName}}',
        accountantSendDefault: true
      }));
    });
  });
});
