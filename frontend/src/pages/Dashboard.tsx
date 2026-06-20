import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { formatCurrency, getStatusLabel, getStatusColor } from '../utils/format';
import { useTheme } from '../context/ThemeContext';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Plus,
  CreditCard,
  Landmark,
  ChevronDown
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardData {
  stats: {
    draftCount: number;
    sentCount: number;
    paidCount: number;
    overdueCount: number;
    cancelledCount: number;
    outstandingAmount: number;
    paidAmount: number;
    paidThisMonth: number;
  };
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    currency: string;
    total: number;
    issueDate: string;
    dueDate: string;
    clientName: string;
  }>;
  monthlyRevenue: Array<{
    month: string;
    revenue: number;
    invoiceCount: number;
  }>;
  monthlyExpenses: Array<{
    month: string;
    expenses: number;
    expenseCount: number;
  }>;
  yearlyExpenses: number;
  unmatchedPayments: number;
  pausalniDan: {
    enabled: boolean;
    periodMonths: number;
    tier: number;
    limit: number;
    invoicedThisYear: number;
    remaining: number;
  };
  vatSummary: {
    enabled: boolean;
    periodStart: string | null;
    periodEnd: string | null;
    currency: 'CZK';
    netRevenue: number;
    outputVat: number;
    inputVat: number;
    estimatedVatDue: number;
    excludedForeignInvoiceCount: number;
    excludedForeignExpenseCount: number;
    months: Array<{
      month: string;
      netRevenue: number;
      outputVat: number;
      inputVat: number;
      estimatedVatDue: number;
    }>;
  };
}

export default function Dashboard() {
  const { resolvedTheme } = useTheme();
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language === 'en' ? 'en-US' : 'cs-CZ';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedVatMonths, setSelectedVatMonths] = useState(3);

  useEffect(() => {
    loadDashboard(selectedVatMonths);
  }, [selectedVatMonths]);

  async function loadDashboard(vatMonths: number) {
    try {
      const result = await api.get(`/dashboard?vatMonths=${vatMonths}`);
      setData(result);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  const availableYears = useMemo(() => {
    if (!data) return [new Date().getFullYear()];
    const years = new Set<number>();
    data.monthlyRevenue.forEach(item => years.add(new Date(item.month).getFullYear()));
    data.monthlyExpenses.forEach(item => years.add(new Date(item.month).getFullYear()));
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(selectedYear, i, 1);
      return {
        key: `${selectedYear}-${String(i + 1).padStart(2, '0')}`,
        name: date.toLocaleDateString(locale, { month: 'short' }),
        income: 0,
        expenses: 0,
      };
    });

    const monthMap = new Map(months.map(m => [m.key, m]));

    data.monthlyRevenue.forEach(item => {
      const d = new Date(item.month);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key);
      if (entry) entry.income = item.revenue;
    });

    data.monthlyExpenses.forEach(item => {
      const d = new Date(item.month);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key);
      if (entry) entry.expenses = item.expenses;
    });

    return months;
  }, [data, selectedYear]);

  const yearlyIncome = useMemo(() => chartData.reduce((sum, m) => sum + m.income, 0), [chartData]);
  const yearlyExpensesTotal = useMemo(() => chartData.reduce((sum, m) => sum + m.expenses, 0), [chartData]);
  const vatPeriodLabel = useMemo(() => {
    if (!data?.vatSummary?.periodStart || !data.vatSummary.periodEnd) return '';

    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' });
    const start = new Date(`${data.vatSummary.periodStart}T00:00:00`);
    const end = new Date(`${data.vatSummary.periodEnd}T00:00:00`);
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  }, [data, locale]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-gray-500 dark:text-gray-400">{t('loadError')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <Link to="/invoices/new" className="btn btn-primary flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>{t('newInvoice')}</span>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card-interactive min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.outstanding')}</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(data.stats.outstandingAmount)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full shrink-0">
              <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t('stats.outstandingDescription', { count: data.stats.sentCount + data.stats.overdueCount })}
          </p>
        </div>

        <div className="card-interactive min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.paidThisMonth')}</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(data.stats.paidThisMonth)}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full shrink-0">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t('stats.paidThisMonthDescription', { count: data.stats.paidCount })}
          </p>
        </div>

        <div className="card-interactive min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.overdue')}</p>
              <p className="text-2xl font-bold tabular-nums text-red-600">
                {data.stats.overdueCount}
              </p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t('stats.overdueDescription')}
          </p>
        </div>

        <div className="card-interactive min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.totalPaid')}</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(data.stats.paidAmount)}
              </p>
            </div>
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full shrink-0">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t('stats.totalPaidDescription')}
          </p>
        </div>
      </div>

      {/* Unmatched payments alert */}
      {data.unmatchedPayments > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-800 dark:text-yellow-300">
              {t('unmatchedPayments.message', { count: data.unmatchedPayments })}
            </span>
          </div>
          <Link to="/payments" className="text-yellow-600 dark:text-yellow-400 hover:underline font-medium">
            {t('unmatchedPayments.link')}
          </Link>
        </div>
      )}

      {/* Three-month VAT estimate */}
      {data.vatSummary?.enabled && (
        <section className="card" aria-labelledby="vat-summary-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-5">
            <div>
              <h2 id="vat-summary-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('vat.title')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('vat.description')}
              </p>
            </div>
            <div className="flex items-center gap-2 self-start">
              <label htmlFor="vat-period-months" className="text-xs text-gray-500 dark:text-gray-400">
                {t('vat.periodLabel')}
              </label>
              <div className="relative">
                <select
                  id="vat-period-months"
                  value={selectedVatMonths}
                  onChange={(event) => setSelectedVatMonths(Number(event.target.value))}
                  className="appearance-none rounded-lg bg-gray-100 dark:bg-gray-700 py-1.5 pl-3 pr-8 text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[1, 3, 6, 12].map(months => (
                    <option key={months} value={months}>{months}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
              </div>
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                {vatPeriodLabel}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('vat.netRevenue')}</p>
              <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-1">
                {formatCurrency(data.vatSummary.netRevenue)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('vat.netRevenueHelp')}</p>
            </div>

            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('vat.outputVat')}</p>
              <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 mt-1">
                {formatCurrency(data.vatSummary.outputVat)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('vat.outputVatHelp')}</p>
            </div>

            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('vat.inputVat')}</p>
              <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                − {formatCurrency(data.vatSummary.inputVat)}
              </p>
              <Link to="/expenses" className="inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1">
                {t('vat.manageExpenses')}
              </Link>
            </div>

            <div className={`rounded-lg border p-4 ${
              data.vatSummary.estimatedVatDue >= 0
                ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            }`}>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {data.vatSummary.estimatedVatDue >= 0 ? t('vat.estimatedDue') : t('vat.estimatedCredit')}
              </p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${
                data.vatSummary.estimatedVatDue >= 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-300'
              }`}>
                {formatCurrency(Math.abs(data.vatSummary.estimatedVatDue))}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('vat.formula')}</p>
            </div>
          </div>

          <div className="overflow-x-auto mt-5">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="py-2 pr-4 font-medium">{t('vat.table.month')}</th>
                  <th className="py-2 px-4 text-right font-medium">{t('vat.table.netRevenue')}</th>
                  <th className="py-2 px-4 text-right font-medium">{t('vat.table.outputVat')}</th>
                  <th className="py-2 px-4 text-right font-medium">{t('vat.table.inputVat')}</th>
                  <th className="py-2 pl-4 text-right font-medium">{t('vat.table.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.vatSummary.months.map((month) => (
                  <tr key={month.month} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">
                      {new Date(`${month.month}T00:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-gray-600 dark:text-gray-300">{formatCurrency(month.netRevenue)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-gray-600 dark:text-gray-300">{formatCurrency(month.outputVat)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-emerald-600 dark:text-emerald-400">− {formatCurrency(month.inputVat)}</td>
                    <td className={`py-3 pl-4 text-right tabular-nums font-medium ${
                      month.estimatedVatDue >= 0
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {formatCurrency(month.estimatedVatDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(data.vatSummary.excludedForeignInvoiceCount > 0 || data.vatSummary.excludedForeignExpenseCount > 0) && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {t('vat.foreignCurrencyWarning', {
                  invoiceCount: data.vatSummary.excludedForeignInvoiceCount,
                  expenseCount: data.vatSummary.excludedForeignExpenseCount
                })}
              </span>
            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">{t('vat.disclaimer')}</p>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly revenue & expenses chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('chart.totalRevenue')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(yearlyIncome - yearlyExpensesTotal)}
              </p>
            </div>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg px-3 py-1.5 pr-8 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex items-center space-x-4 mb-4">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('chart.income')}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('chart.expenses')}</span>
            </div>
          </div>
          {chartData.some(d => d.income > 0 || d.expenses > 0) ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: resolvedTheme === 'dark' ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.5)' }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className={`rounded-lg px-3 py-2 shadow-lg text-sm ${resolvedTheme === 'dark' ? 'bg-gray-800 border border-gray-700 text-gray-100' : 'bg-white border border-gray-200 text-gray-900'}`}>
                          <p className="font-medium mb-1">{label}</p>
                          {payload.map((entry) => (
                            <p key={entry.dataKey} className="flex items-center space-x-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                              <span className="text-gray-500 dark:text-gray-400">{entry.dataKey === 'income' ? t('chart.income') : t('chart.expenses')}:</span>
                              <span className="font-medium">{formatCurrency(entry.value as number)}</span>
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="income" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill={resolvedTheme === 'dark' ? '#475569' : '#cbd5e1'} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
              {t('chart.noData')}
            </div>
          )}

          {/* Paušální daň compact strip */}
          {data.pausalniDan?.enabled && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2 min-w-0">
                  <Landmark className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">
                    {t('pausalniDan.label', { tier: data.pausalniDan.tier })}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 text-right whitespace-nowrap ml-2">
                  {formatCurrency(data.pausalniDan.invoicedThisYear)} / {formatCurrency(data.pausalniDan.limit)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    (data.pausalniDan.invoicedThisYear / data.pausalniDan.limit) >= 0.9
                      ? 'bg-red-500'
                      : (data.pausalniDan.invoicedThisYear / data.pausalniDan.limit) >= 0.75
                      ? 'bg-yellow-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (data.pausalniDan.invoicedThisYear / data.pausalniDan.limit) * 100)}%`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-400 dark:text-gray-500">
                  {((data.pausalniDan.invoicedThisYear / data.pausalniDan.limit) * 100).toFixed(0)}%
                </span>
                <span className={`font-medium text-right whitespace-nowrap ml-2 ${
                  data.pausalniDan.remaining <= 0
                    ? 'text-red-600'
                    : (data.pausalniDan.invoicedThisYear / data.pausalniDan.limit) >= 0.9
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}>
                  {t('pausalniDan.remaining', { amount: formatCurrency(data.pausalniDan.remaining) })}
                </span>
              </div>
              {(data.pausalniDan.invoicedThisYear / data.pausalniDan.limit) >= 0.9 && (
                <div className={`flex items-center space-x-1.5 mt-2 text-xs ${
                  data.pausalniDan.remaining <= 0 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {data.pausalniDan.remaining <= 0
                      ? t('pausalniDan.limitExceeded')
                      : t('pausalniDan.approachingLimit')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('recentInvoices.title')}</h2>
            <Link to="/invoices" className="text-indigo-600 hover:underline text-sm">
              {t('recentInvoices.viewAll')}
            </Link>
          </div>
          <div className="space-y-3">
            {data.recentInvoices.length > 0 ? (
              data.recentInvoices.slice(0, 5).map((invoice) => (
                <Link
                  key={invoice.id}
                  to={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{invoice.clientName}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </p>
                    <span className={`badge ${getStatusColor(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                {t('recentInvoices.empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
