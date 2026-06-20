import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '../utils/format';
import { Plus, Search, Filter, FileText, Download, Upload, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import RecurringInvoices from './RecurringInvoices';

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
  createdAt: string;
}

interface ImportPreview {
  totalRows: number;
  importable: number;
  skipped: number;
  issues: Array<{ row: number; message: string }>;
  preview: Array<{
    invoiceNumber: string;
    clientName: string;
    issueDate: string;
    total: number;
    currency: string;
    status: string;
  }>;
}

export default function Invoices() {
  const { t } = useTranslation('invoices');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'recurring' ? 'recurring' : 'invoices';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'invoices') {
      loadInvoices();
    }
  }, [statusFilter, activeTab]);

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const result = await api.get(`/invoices?${params}`);
      setInvoices(result);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredInvoices = invoices.filter(invoice =>
    invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    invoice.clientName.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDownloadPDF(invoiceId: string, invoiceNumber: string) {
    try {
      await api.download(`/invoices/${invoiceId}/pdf`, `${invoiceNumber}.pdf`);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  }

  function setTab(tab: 'invoices' | 'recurring') {
    if (tab === 'recurring') {
      setSearchParams({ tab: 'recurring' });
    } else {
      setSearchParams({});
    }
  }

  function closeImport() {
    setShowImport(false);
    setImportCsv('');
    setImportFileName('');
    setImportPreview(null);
    setImportError('');
  }

  async function handleImportFile(file?: File) {
    setImportPreview(null);
    setImportError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setImportError(t('import.fileTooLarge'));
      return;
    }
    try {
      setImportCsv(await file.text());
      setImportFileName(file.name);
    } catch {
      setImportError(t('import.readError'));
    }
  }

  async function previewImport() {
    setImportLoading(true);
    setImportError('');
    try {
      const result = await api.post('/invoice-imports/fakturoid/preview', { csv: importCsv });
      setImportPreview(result);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t('import.previewError'));
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmImport() {
    setImportLoading(true);
    setImportError('');
    try {
      const result = await api.post('/invoice-imports/fakturoid', { csv: importCsv });
      closeImport();
      toast.success(t('import.success', { imported: result.imported, clients: result.createdClients }));
      await loadInvoices();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t('import.importError'));
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'invoices' && (
            <button onClick={() => setShowImport(true)} className="btn btn-secondary flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>{t('import.open')}</span>
            </button>
          )}
          <Link
            to={activeTab === 'recurring' ? '/recurring/new' : '/invoices/new'}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>{activeTab === 'recurring' ? t('newRecurring') : t('newInvoice')}</span>
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setTab('invoices')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'invoices'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300'
            }`}
          >
            {t('tabs.invoices')}
          </button>
          <button
            onClick={() => setTab('recurring')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'recurring'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300'
            }`}
          >
            {t('tabs.recurring')}
          </button>
        </nav>
      </div>

      {activeTab === 'recurring' ? (
        <RecurringInvoices />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('list.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-auto"
              >
                <option value="">{t('list.allStatuses')}</option>
                <option value="draft">{t('common:status.draft')}</option>
                <option value="sent">{t('common:status.sent')}</option>
                <option value="paid">{t('common:status.paid')}</option>
                <option value="overdue">{t('common:status.overdue')}</option>
                <option value="cancelled">{t('common:status.cancelled')}</option>
              </select>
            </div>
          </div>

          {/* Invoice list */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {filteredInvoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnNumber')}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnContact')}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnIssueDate')}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnDueDate')}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnAmount')}</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnStatus')}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.columnActions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-3 px-4">
                            <Link
                              to={`/invoices/${invoice.id}`}
                              className="font-medium text-indigo-600 hover:underline"
                            >
                              {invoice.invoiceNumber}
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <Link
                              to={`/clients/${invoice.clientId}`}
                              className="text-gray-900 dark:text-gray-100 hover:underline"
                            >
                              {invoice.clientName}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{formatDate(invoice.issueDate)}</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{formatDate(invoice.dueDate)}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatCurrency(invoice.total, invoice.currency)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`badge ${getStatusColor(invoice.status)}`}>
                              {getStatusLabel(invoice.status)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDownloadPDF(invoice.id, invoice.invoiceNumber)}
                              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg"
                              title={t('list.downloadPdf')}
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">{t('list.emptyState')}</p>
                  <Link to="/invoices/new" className="btn btn-primary mt-4 inline-flex items-center space-x-2">
                    <Plus className="h-4 w-4" />
                    <span>{t('list.createFirst')}</span>
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="fakturoid-import-title">
          <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 id="fakturoid-import-title" className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('import.title')}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('import.description')}</p>
              </div>
              <button onClick={closeImport} className="p-1 text-gray-400 hover:text-gray-600" aria-label={t('import.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <span className="label">{t('import.fileLabel')}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => handleImportFile(event.target.files?.[0])}
                className="input file:mr-4 file:border-0 file:bg-transparent file:text-indigo-600 file:font-medium"
              />
            </label>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('import.fileHint')}</p>

            {importFileName && !importPreview && (
              <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{t('import.selectedFile', { name: importFileName })}</p>
            )}
            {importError && (
              <div className="mt-4 flex gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importPreview && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3"><div className="text-2xl font-semibold">{importPreview.totalRows}</div><div className="text-xs text-gray-500">{t('import.totalRows')}</div></div>
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3"><div className="text-2xl font-semibold text-green-700 dark:text-green-300">{importPreview.importable}</div><div className="text-xs text-gray-500">{t('import.importable')}</div></div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3"><div className="text-2xl font-semibold text-amber-700 dark:text-amber-300">{importPreview.skipped}</div><div className="text-xs text-gray-500">{t('import.skipped')}</div></div>
                </div>

                {importPreview.preview.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="p-2 text-left">{t('list.columnNumber')}</th><th className="p-2 text-left">{t('list.columnContact')}</th><th className="p-2 text-left">{t('list.columnIssueDate')}</th><th className="p-2 text-right">{t('list.columnAmount')}</th></tr></thead>
                      <tbody>{importPreview.preview.map(invoice => <tr key={invoice.invoiceNumber} className="border-t border-gray-200 dark:border-gray-700"><td className="p-2">{invoice.invoiceNumber}</td><td className="p-2">{invoice.clientName}</td><td className="p-2">{formatDate(invoice.issueDate)}</td><td className="p-2 text-right">{formatCurrency(invoice.total, invoice.currency)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}

                {importPreview.issues.length > 0 && (
                  <details className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                    <summary className="cursor-pointer font-medium text-amber-800 dark:text-amber-200">{t('import.issues', { count: importPreview.issues.length })}</summary>
                    <ul className="mt-2 space-y-1 text-amber-700 dark:text-amber-300">{importPreview.issues.map((issue, index) => <li key={`${issue.row}-${index}`}>{t('import.issueRow', { row: issue.row, message: issue.message })}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeImport} className="btn btn-secondary">{t('import.cancel')}</button>
              {!importPreview ? (
                <button onClick={previewImport} disabled={!importCsv || importLoading} className="btn btn-primary disabled:opacity-50">
                  {importLoading ? t('import.checking') : t('import.previewButton')}
                </button>
              ) : (
                <button onClick={confirmImport} disabled={importPreview.importable === 0 || importLoading} className="btn btn-primary disabled:opacity-50">
                  {importLoading ? t('import.importing') : t('import.confirm', { count: importPreview.importable })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
