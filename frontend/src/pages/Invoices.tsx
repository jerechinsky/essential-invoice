import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '../utils/format';
import { Plus, Search, FileText, Download, Check } from 'lucide-react';
import RecurringInvoices from './RecurringInvoices';
import { PageLoader } from '../components/Spinner';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  invoiceNumber: string;
  variableSymbol: string;
  status: string;
  currency: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  issueDate: string;
  dueDate: string;
  total: number;
  totalCzk: number | null;
  createdAt: string;
}

// Live-count filters shown in the toolbar segmented control (desktop)
const DESKTOP_FILTERS = ['', 'draft', 'sent', 'paid', 'overdue'] as const;
// Mobile chip row per spec: All / Overdue / Sent / Paid
const MOBILE_FILTERS = ['', 'overdue', 'sent', 'paid'] as const;

// CZK value for cross-currency sums (EUR invoices carry totalCzk from CNB rates)
const czkOf = (inv: Invoice) => inv.totalCzk ?? inv.total;

export default function Invoices() {
  const { t } = useTranslation('invoices');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'recurring' ? 'recurring' : 'invoices';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (activeTab === 'invoices') {
      loadInvoices();
    }
  }, [activeTab]);

  async function loadInvoices() {
    setLoading(true);
    try {
      const result = await api.get('/invoices');
      setInvoices(result);
    } catch (error) {
      console.error('Failed to load invoices:', error);
      toast.error(t('common:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  // Status filtering is client-side; counts come from the full list, not the filtered subset
  const counts = useMemo(() => {
    const c: Record<string, number> = { '': invoices.length };
    for (const inv of invoices) {
      c[inv.status] = (c[inv.status] || 0) + 1;
    }
    return c;
  }, [invoices]);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          (!statusFilter || invoice.status === statusFilter) &&
          (invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
            invoice.clientName.toLowerCase().includes(search.toLowerCase()))
      ),
    [invoices, statusFilter, search]
  );

  const outstandingCzk = useMemo(
    () =>
      invoices
        .filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
        .reduce((sum, inv) => sum + czkOf(inv), 0),
    [invoices]
  );

  const filteredTotalCzk = useMemo(
    () => filteredInvoices.reduce((sum, inv) => sum + czkOf(inv), 0),
    [filteredInvoices]
  );

  const hasActiveFilters = statusFilter !== '' || search !== '';
  const allFilteredSelected =
    filteredInvoices.length > 0 && filteredInvoices.every((inv) => selectedIds.has(inv.id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredInvoices.map((inv) => inv.id)));
  }

  async function handleDownloadPDF(invoiceId: string, invoiceNumber: string) {
    try {
      await api.download(`/invoices/${invoiceId}/pdf`, `${invoiceNumber}.pdf`);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error(t('common:errors.downloadFailed'));
    }
  }

  async function handleBulkDownload() {
    setBulkBusy(true);
    const selected = invoices.filter((inv) => selectedIds.has(inv.id));
    for (const inv of selected) {
      await handleDownloadPDF(inv.id, inv.invoiceNumber);
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

  async function handleBulkMarkPaid() {
    const payable = invoices.filter(
      (inv) => selectedIds.has(inv.id) && inv.status !== 'paid' && inv.status !== 'cancelled'
    );
    if (payable.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(payable.map((inv) => api.post(`/invoices/${inv.id}/mark-paid`, {})));
      toast.success(t('list.bulkMarkPaidSuccess', { count: payable.length }));
    } catch (error) {
      console.error('Failed to mark invoices as paid:', error);
      toast.error(t('common:errors.saveFailed'));
    } finally {
      setBulkBusy(false);
      setSelectedIds(new Set());
      loadInvoices();
    }
  }

  function setTab(tab: 'invoices' | 'recurring') {
    if (tab === 'recurring') {
      setSearchParams({ tab: 'recurring' });
    } else {
      setSearchParams({});
    }
  }

  function clearFilters() {
    setStatusFilter('');
    setSearch('');
  }

  const filterLabel = (status: string) =>
    status === '' ? t('list.statusAll') : getStatusLabel(status);

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-text">{t('title')}</h1>
          {activeTab === 'invoices' && !loading && (
            <p className="mt-1 text-[13px] text-text-muted">
              {t('list.countSummary', {
                count: invoices.length,
                amount: formatCurrency(outstandingCzk, 'CZK'),
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:gap-3">
          {/* One-off / Recurring segmented control */}
          <div className="flex shrink-0 bg-surface border border-border rounded-[10px] p-[3px]">
            <button
              onClick={() => setTab('invoices')}
              className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
                activeTab === 'invoices'
                  ? 'bg-surface-sunken text-text'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {t('tabs.invoices')}
            </button>
            <button
              onClick={() => setTab('recurring')}
              className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
                activeTab === 'recurring'
                  ? 'bg-surface-sunken text-text'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {t('tabs.recurring')}
            </button>
          </div>
          {/* Below lg this is icon-only: the title, the segmented control and a
              full Czech label ("Nová opakovaná") do not fit on a 390px row, and
              the label is the part that gets squeezed. One-off invoices are
              created from the bottom nav instead, so their button stays hidden. */}
          <Link
            to={activeTab === 'recurring' ? '/recurring/new' : '/invoices/new'}
            aria-label={activeTab === 'recurring' ? t('newRecurring') : t('newInvoice')}
            className={`btn btn-primary shrink-0 items-center gap-2 ${
              activeTab === 'recurring' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">
              {activeTab === 'recurring' ? t('newRecurring') : t('newInvoice')}
            </span>
          </Link>
        </div>
      </div>


      {activeTab === 'recurring' ? (
        <RecurringInvoices />
      ) : loading ? (
        <PageLoader />
      ) : (
        <>
          {/* Mobile: chip row + cards */}
          <div className="lg:hidden space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-faint" />
              <input
                type="text"
                placeholder={t('list.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-sunken rounded-[9px] pl-9 pr-3 py-2 text-sm text-text placeholder-text-faint focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(79,70,229,.12)]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MOBILE_FILTERS.map((status) => {
                const active = statusFilter === status;
                return (
                  <button
                    key={status || 'all'}
                    onClick={() => setStatusFilter(status)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                      active
                        ? 'bg-accent text-white'
                        : status === 'overdue'
                          ? 'bg-danger-bg text-danger'
                          : 'bg-surface border border-border text-text-secondary'
                    }`}
                  >
                    {filterLabel(status)}
                  </button>
                );
              })}
            </div>

            {filteredInvoices.length > 0 ? (
              <div className="space-y-2.5">
                {filteredInvoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-3 bg-surface border border-border rounded-[16px] px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-text truncate">{invoice.clientName}</p>
                      <p className="text-xs text-text-faint tabular-nums">
                        {invoice.invoiceNumber} · {t('list.due')} {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[15px] font-semibold text-text tabular-nums">
                        {formatCurrency(invoice.total, invoice.currency)}
                      </p>
                      <span className={`badge ${getStatusColor(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                filtered={hasActiveFilters}
                onClearFilters={clearFilters}
                t={t}
              />
            )}
          </div>

          {/* Desktop: table card */}
          <div className="hidden lg:block bg-surface border border-border rounded-[20px] overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-faint" />
                <input
                  type="text"
                  placeholder={t('list.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-surface-sunken rounded-[9px] pl-9 pr-3 py-2 text-sm text-text placeholder-text-faint focus:outline-hidden focus:shadow-[0_0_0_3px_rgba(79,70,229,.12)]"
                />
              </div>
              <div className="ml-auto flex bg-surface border border-border rounded-[10px] p-[3px]">
                {DESKTOP_FILTERS.map((status) => {
                  const active = statusFilter === status;
                  return (
                    <button
                      key={status || 'all'}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                        status === 'overdue' ? 'font-semibold text-danger' : 'font-medium'
                      } ${
                        active
                          ? 'bg-surface-sunken' + (status === 'overdue' ? '' : ' text-text')
                          : status === 'overdue'
                            ? 'hover:bg-surface-sunken'
                            : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {filterLabel(status)} {counts[status] || 0}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bulk bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-4 px-5 py-2.5 bg-[#f7f7fd] dark:bg-[#1b1e2c] border-b border-hairline">
                <span className="text-[13px] font-semibold text-text">
                  {t('list.selected', { n: selectedIds.size })}
                </span>
                <div className="h-4 w-px bg-border-strong" />
                <button
                  onClick={handleBulkDownload}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-hover disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('list.bulkDownload')}
                </button>
                <button
                  onClick={handleBulkMarkPaid}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-hover disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t('list.bulkMarkPaid')}
                </button>
              </div>
            )}

            {filteredInvoices.length > 0 ? (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[32px_1.1fr_1.6fr_0.9fr_0.9fr_1fr_1fr_40px] gap-x-4 items-center px-5 py-2.5 border-b border-hairline">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label={t('list.selectAll')}
                    className="h-4 w-4 rounded-sm accent-accent"
                  />
                  {[
                    t('list.columnNumber'),
                    t('list.columnContact'),
                    t('list.columnIssueDate'),
                    t('list.columnDueDate'),
                  ].map((label) => (
                    <span
                      key={label}
                      className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint"
                    >
                      {label}
                    </span>
                  ))}
                  <span className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint text-right">
                    {t('list.columnAmount')}
                  </span>
                  <span className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint text-right">
                    {t('list.columnStatus')}
                  </span>
                  <span />
                </div>

                {/* Rows */}
                {filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="grid grid-cols-[32px_1.1fr_1.6fr_0.9fr_0.9fr_1fr_1fr_40px] gap-x-4 items-center px-5 py-[13px] border-b border-hairline-soft last:border-b-0 hover:bg-row-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(invoice.id)}
                      onChange={() => toggleSelected(invoice.id)}
                      aria-label={invoice.invoiceNumber}
                      className="h-4 w-4 rounded-sm accent-accent"
                    />
                    <Link
                      to={`/invoices/${invoice.id}`}
                      className="text-[13px] font-medium tabular-nums text-text hover:text-accent"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                    <Link
                      to={`/clients/${invoice.clientId}`}
                      className="text-sm text-text-secondary hover:text-text truncate"
                    >
                      {invoice.clientName}
                    </Link>
                    <span className="text-sm text-text-secondary tabular-nums">
                      {formatDate(invoice.issueDate)}
                    </span>
                    <span className="text-sm text-text-secondary tabular-nums">
                      {formatDate(invoice.dueDate)}
                    </span>
                    <span className="text-sm font-semibold text-text tabular-nums text-right">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </span>
                    <span className="justify-self-end">
                      <span className={`badge ${getStatusColor(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </span>
                    <button
                      onClick={() => handleDownloadPDF(invoice.id, invoice.invoiceNumber)}
                      className="justify-self-end p-1.5 rounded-lg text-text-faint hover:text-accent hover:bg-nav-hover transition-colors"
                      title={t('list.downloadPdf')}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-hairline text-[13px]">
                  <span className="text-text-muted">
                    {t('list.shownOf', { shown: filteredInvoices.length, total: invoices.length })}
                  </span>
                  <span className="text-text-muted">
                    {t('list.footerTotal')}{' '}
                    <span className="font-semibold text-text tabular-nums">
                      {formatCurrency(filteredTotalCzk, 'CZK')}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <EmptyState filtered={hasActiveFilters} onClearFilters={clearFilters} t={t} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({
  filtered,
  onClearFilters,
  t,
}: {
  filtered: boolean;
  onClearFilters: () => void;
  t: (key: string) => string;
}) {
  if (filtered) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-text-muted">{t('list.noMatch')}</p>
        <button
          onClick={onClearFilters}
          className="mt-2 text-sm font-medium text-accent-link hover:underline"
        >
          {t('list.clearFilters')}
        </button>
      </div>
    );
  }
  return (
    <div className="text-center py-12">
      <FileText className="h-12 w-12 text-border-strong mx-auto mb-4" />
      <p className="text-sm text-text-muted">{t('list.emptyState')}</p>
      <Link to="/invoices/new" className="btn btn-primary mt-4 inline-flex items-center space-x-2">
        <Plus className="h-4 w-4" />
        <span>{t('list.createFirst')}</span>
      </Link>
    </div>
  );
}
