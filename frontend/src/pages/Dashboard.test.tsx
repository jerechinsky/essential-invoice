import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

const mockGet = vi.fn();

vi.mock('../utils/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args)
  }
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light' })
}));

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const dashboardData = {
  stats: {
    draftCount: 0,
    sentCount: 1,
    paidCount: 1,
    overdueCount: 0,
    cancelledCount: 0,
    outstandingAmount: 12100,
    paidAmount: 24200,
    paidThisMonth: 24200
  },
  recentInvoices: [],
  monthlyRevenue: [],
  monthlyExpenses: [],
  yearlyExpenses: 0,
  unmatchedPayments: 0,
  pausalniDan: {
    enabled: false,
    tier: 1,
    limit: 1000000,
    invoicedThisYear: 0,
    remaining: 1000000
  },
  vatSummary: {
    enabled: true,
    periodMonths: 3,
    periodStart: '2026-04-01',
    periodEnd: '2026-06-20',
    currency: 'CZK',
    netRevenue: 150000,
    outputVat: 31500,
    inputVat: 6300,
    estimatedVatDue: 25200,
    excludedForeignInvoiceCount: 0,
    excludedForeignExpenseCount: 0,
    months: [
      { month: '2026-04-01', netRevenue: 50000, outputVat: 10500, inputVat: 2100, estimatedVatDue: 8400 },
      { month: '2026-05-01', netRevenue: 50000, outputVat: 10500, inputVat: 2100, estimatedVatDue: 8400 },
      { month: '2026-06-01', netRevenue: 50000, outputVat: 10500, inputVat: 2100, estimatedVatDue: 8400 }
    ]
  }
};

function renderDashboard() {
  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
}

describe('Dashboard VAT summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the configurable VAT estimate for VAT payers', async () => {
    mockGet.mockResolvedValueOnce(dashboardData);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Odhad DPH' })).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith('/dashboard?vatMonths=3');
    expect(screen.getByText('Odhad DPH k odložení')).toBeInTheDocument();
    expect(screen.getByText('DPH z faktur − DPH z nákladů')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zkontrolovat zaplacené náklady' })).toHaveAttribute('href', '/expenses');
  });

  it('does not render the VAT estimate for non-VAT payers', async () => {
    mockGet.mockResolvedValueOnce({
      ...dashboardData,
      vatSummary: { ...dashboardData.vatSummary, enabled: false }
    });

    renderDashboard();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/dashboard?vatMonths=3');
    });

    expect(screen.queryByRole('region', { name: 'Odhad DPH' })).not.toBeInTheDocument();
  });

  it('reloads the VAT summary when the period changes', async () => {
    mockGet
      .mockResolvedValueOnce(dashboardData)
      .mockResolvedValueOnce({
        ...dashboardData,
        vatSummary: { ...dashboardData.vatSummary, periodMonths: 6 }
      });

    renderDashboard();

    const periodSelect = await screen.findByRole('combobox', { name: 'Měsíce' });
    fireEvent.change(periodSelect, { target: { value: '6' } });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/dashboard?vatMonths=6');
    });
  });
});
