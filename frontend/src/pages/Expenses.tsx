import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { formatCurrency, formatDate, getExpenseStatusLabel, getExpenseStatusColor } from '../utils/format';
import { Plus, Search, Filter, Receipt, Upload, Pencil, X, FileText, Copy, FileArchive } from 'lucide-react';
import ColumnPicker from '../components/ColumnPicker';
import { usePersistentColumns } from '../hooks/usePersistentColumns';
import { useRangeSelection } from '../hooks/useRangeSelection';
import { useDialogKeyboard } from '../hooks/useDialogKeyboard';
import { universalInvoiceChatGptPrompt, universalInvoiceExample } from '../utils/universalInvoiceImport';
import DateRangeFilter from '../components/DateRangeFilter';
import { getPresetDateRange, type DatePreset } from '../utils/dateRange';

interface Expense {
  id: string;
  expenseNumber: string;
  supplierInvoiceNumber: string | null;
  status: string;
  currency: string;
  clientId: string | null;
  clientName: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  description: string | null;
  notes: string | null;
  paidAt: string | null;
  hasFile: boolean;
}

type ExpenseColumn = 'number' | 'supplier' | 'invoiceNumber' | 'issueDate' | 'dueDate' | 'taxBase' | 'vatAmount' | 'total' | 'status' | 'description' | 'notes' | 'paidAt' | 'attachment';
const DEFAULT_EXPENSE_COLUMNS: ExpenseColumn[] = ['number', 'supplier', 'invoiceNumber', 'issueDate', 'dueDate', 'total', 'status'];

interface ImportResult {
  imported: Array<{ fileName: string; expenseNumber: string }>;
  failed: Array<{ fileName: string; error: string }>;
}

export default function Expenses() {
  const { t } = useTranslation('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showUniversalImport, setShowUniversalImport] = useState(false);
  const [universalText, setUniversalText] = useState('');
  const [universalFiles, setUniversalFiles] = useState<File[]>([]);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchStatus, setBatchStatus] = useState<'paid' | 'unpaid'>('paid');
  const [batchLoading, setBatchLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const { visibleColumns, toggleColumn } = usePersistentColumns<ExpenseColumn>('essential-invoice.expense-columns', DEFAULT_EXPENSE_COLUMNS);
  const selection = useRangeSelection<string>();

  useEffect(() => {
    loadExpenses();
  }, [statusFilter, datePreset, customFrom, customTo]);

  async function loadExpenses() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const range = datePreset === 'custom' ? { from: customFrom, to: customTo } : getPresetDateRange(datePreset);
      if (range?.from) params.append('from', range.from);
      if (range?.to) params.append('to', range.to);

      const result = await api.get(`/expenses?${params}`);
      setExpenses(result);
      const availableIds = new Set<string>(result.map((expense: Expense) => expense.id));
      selection.setSelectedIds(current => new Set([...current].filter(id => availableIds.has(id))));
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchImport(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (files.length > 10) {
      toast.error(t('list.import.tooMany'));
      return;
    }
    const oversizedFile = files.find(file => file.size > 5 * 1024 * 1024);
    if (oversizedFile) {
      toast.error(t('list.import.fileTooLarge', { fileName: oversizedFile.name }));
      return;
    }

    setImporting(true);
    try {
      const result = await api.uploadFiles('/expenses/import', files) as ImportResult;
      setImportResult(result);
      await loadExpenses();
      if (result.imported.length) toast.success(t('list.import.success', { count: result.imported.length }));
      if (result.failed.length) toast.error(t('list.import.failed', { count: result.failed.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('list.import.requestFailed'));
    } finally {
      setImporting(false);
    }
  }

  function closeUniversalImport() {
    if (!importing) setShowUniversalImport(false);
  }

  async function copyUniversalPrompt() {
    try {
      await navigator.clipboard.writeText(universalInvoiceChatGptPrompt);
      toast.success(t('list.universal.promptCopied'));
    } catch {
      toast.error(t('list.universal.copyFailed'));
    }
  }

  async function handleUniversalImport() {
    if (!universalFiles.length || !universalText.trim()) {
      toast.error(t('list.universal.required'));
      return;
    }
    if (universalFiles.length > 10) {
      toast.error(t('list.import.tooManyFiles'));
      return;
    }
    const oversizedFile = universalFiles.find(file => file.size > 5 * 1024 * 1024);
    if (oversizedFile) {
      toast.error(t('list.import.fileTooLarge', { fileName: oversizedFile.name }));
      return;
    }

    setImporting(true);
    try {
      const result = await api.uploadFilesWithFields(
        '/expenses/import/universal', universalFiles, { data: universalText }
      ) as ImportResult;
      setImportResult(result);
      await loadExpenses();
      if (result.imported.length) toast.success(t('list.import.success', { count: result.imported.length }));
      if (result.failed.length) toast.error(t('list.import.failed', { count: result.failed.length }));
      setShowUniversalImport(false);
      setUniversalFiles([]);
      setUniversalText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('list.import.requestFailed'));
    } finally {
      setImporting(false);
    }
  }

  const filteredExpenses = expenses.filter(expense =>
    expense.expenseNumber.toLowerCase().includes(search.toLowerCase()) ||
    (expense.clientName && expense.clientName.toLowerCase().includes(search.toLowerCase())) ||
    (expense.supplierInvoiceNumber && expense.supplierInvoiceNumber.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredIds = filteredExpenses.map(expense => expense.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selection.selectedIds.has(id));
  const columnOptions: Array<{ id: ExpenseColumn; label: string }> = [
    ['number', t('list.table.number')], ['supplier', t('list.table.supplier')], ['invoiceNumber', t('list.table.invoiceNumber')],
    ['issueDate', t('list.table.issueDate')], ['dueDate', t('list.table.dueDate')], ['taxBase', t('list.table.taxBase')],
    ['vatAmount', t('list.table.vatAmount')], ['total', t('list.table.amount')], ['status', t('list.table.status')],
    ['description', t('list.table.description')], ['notes', t('list.table.notes')], ['paidAt', t('list.table.paidAt')],
    ['attachment', t('list.table.attachment')],
  ].map(([id, label]) => ({ id: id as ExpenseColumn, label }));

  function closeBatchEdit() {
    if (!batchLoading) setShowBatchEdit(false);
  }

  async function handleBatchUpdate() {
    setBatchLoading(true);
    try {
      const result = await api.patch('/expenses/batch', { ids: [...selection.selectedIds], status: batchStatus });
      const updates = new Map<string, Partial<Expense>>(result.expenses.map((expense: Partial<Expense> & { id: string }) => [expense.id, expense]));
      setExpenses(current => current.map(expense => ({ ...expense, ...(updates.get(expense.id) || {}) })));
      toast.success(t('list.batchSuccess', { count: result.updated }));
      setShowBatchEdit(false);
      selection.clear();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('list.batchError'));
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleBatchDownload() {
    if (selection.selectedIds.size > 50) {
      toast.error(t('list.downloadLimit'));
      return;
    }
    setDownloadLoading(true);
    try {
      await api.downloadPost('/expenses/batch-download', { ids: [...selection.selectedIds] }, `expense-documents-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('list.batchDownloadError'));
    } finally {
      setDownloadLoading(false);
    }
  }

  useDialogKeyboard(showBatchEdit, closeBatchEdit, handleBatchUpdate, batchLoading);
  useDialogKeyboard(showUniversalImport, closeUniversalImport, handleUniversalImport, importing);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('list.title')}</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowUniversalImport(true)} disabled={importing} className="btn btn-secondary flex items-center space-x-2 disabled:opacity-60">
            <FileText className="h-4 w-4" />
            <span>{t('list.universal.button')}</span>
          </button>
          <label className={`btn btn-secondary flex items-center space-x-2 ${importing ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <Upload className="h-4 w-4" />
            <span>{importing ? t('list.import.importing') : t('list.import.button')}</span>
            <input type="file" accept=".pdf,application/pdf" multiple disabled={importing} onChange={handleBatchImport} className="hidden" />
          </label>
          <Link to="/expenses/new" className="btn btn-primary flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>{t('list.newExpense')}</span>
          </Link>
        </div>
      </div>

      {importResult && importResult.failed.length > 0 && (
        <div className="card border border-amber-200 dark:border-amber-800">
          <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">{t('list.import.result')}</p>
          <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
            {importResult.failed.map(item => <li key={item.fileName}>{item.fileName}: {item.error}</li>)}
          </ul>
        </div>
      )}

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
            <option value="unpaid">{t('list.unpaid')}</option>
            <option value="paid">{t('list.paid')}</option>
          </select>
        </div>
        <ColumnPicker label={t('list.columns')} options={columnOptions} visibleColumns={visibleColumns} onToggle={toggleColumn} />
      </div>
      <DateRangeFilter preset={datePreset} from={customFrom} to={customTo} onPresetChange={setDatePreset} onFromChange={setCustomFrom} onToChange={setCustomTo} labels={{ all: t('list.dateAll'), lastMonth: t('list.dateLastMonth'), lastThreeMonths: t('list.dateLastThreeMonths'), custom: t('list.dateCustom'), from: t('list.dateFrom'), to: t('list.dateTo') }} />

      {selection.selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/20">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{t('list.selectedCount', { count: selection.selectedIds.size })}</span>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={selection.clear} className="btn btn-secondary">{t('list.clearSelection')}</button><button type="button" onClick={handleBatchDownload} disabled={downloadLoading} className="btn btn-secondary flex items-center gap-2 disabled:opacity-50"><FileArchive className="h-4 w-4" />{downloadLoading ? t('list.preparingDownload') : t('list.downloadSelected')}</button><button type="button" onClick={() => setShowBatchEdit(true)} className="btn btn-primary flex items-center gap-2"><Pencil className="h-4 w-4" />{t('list.batchEdit')}</button></div>
        </div>
      )}

      {/* Expense list */}
      <div className="card overflow-hidden">
        {filteredExpenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="w-10 py-3 px-4"><input type="checkbox" aria-label={t('list.selectAll')} checked={allFilteredSelected} onChange={event => selection.selectAll(filteredIds, event.target.checked)} className="rounded border-gray-300 text-indigo-600" /></th>
                  {columnOptions.map(column => visibleColumns.has(column.id) && <th key={column.id} className={`${['taxBase', 'vatAmount', 'total'].includes(column.id) ? 'text-right' : column.id === 'status' ? 'text-center' : 'text-left'} py-3 px-4 font-medium text-gray-500 dark:text-gray-400`}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense, index) => (
                  <tr key={expense.id} className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selection.selectedIds.has(expense.id) ? 'bg-indigo-50/60 dark:bg-indigo-900/10' : ''}`}>
                    <td className="py-3 px-4"><input type="checkbox" aria-label={t('list.selectExpense', { number: expense.expenseNumber })} checked={selection.selectedIds.has(expense.id)} onClick={event => selection.toggle(expense.id, index, event.currentTarget.checked, event.shiftKey, filteredIds)} onChange={() => undefined} className="rounded border-gray-300 text-indigo-600" /></td>
                    {visibleColumns.has('number') && <td className="py-3 px-4">
                      <Link
                        to={`/expenses/${expense.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {expense.expenseNumber}
                      </Link>
                    </td>}
                    {visibleColumns.has('supplier') && <td className="py-3 px-4">
                      {expense.clientId && expense.clientName ? (
                        <Link
                          to={`/clients/${expense.clientId}`}
                          className="text-gray-900 dark:text-gray-100 hover:underline"
                        >
                          {expense.clientName}
                        </Link>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>}
                    {visibleColumns.has('invoiceNumber') && <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                      {expense.supplierInvoiceNumber || '-'}
                    </td>}
                    {visibleColumns.has('issueDate') && <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{formatDate(expense.issueDate)}</td>}
                    {visibleColumns.has('dueDate') && <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{formatDate(expense.dueDate)}</td>}
                    {visibleColumns.has('taxBase') && <td className="py-3 px-4 text-right">{formatCurrency(expense.amount, expense.currency)}</td>}
                    {visibleColumns.has('vatAmount') && <td className="py-3 px-4 text-right">{formatCurrency(expense.vatAmount, expense.currency)}</td>}
                    {visibleColumns.has('total') && <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(expense.total, expense.currency)}
                    </td>}
                    {visibleColumns.has('status') && <td className="py-3 px-4 text-center">
                      <span className={`badge ${getExpenseStatusColor(expense.status)}`}>
                        {getExpenseStatusLabel(expense.status)}
                      </span>
                    </td>}
                    {visibleColumns.has('description') && <td className="max-w-xs truncate py-3 px-4 text-gray-600 dark:text-gray-300" title={expense.description || ''}>{expense.description || '-'}</td>}
                    {visibleColumns.has('notes') && <td className="max-w-xs truncate py-3 px-4 text-gray-600 dark:text-gray-300" title={expense.notes || ''}>{expense.notes || '-'}</td>}
                    {visibleColumns.has('paidAt') && <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{expense.paidAt ? formatDate(expense.paidAt) : '-'}</td>}
                    {visibleColumns.has('attachment') && <td className="py-3 px-4 text-center">{expense.hasFile ? t('list.yes') : t('list.no')}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">{t('list.empty')}</p>
            <Link to="/expenses/new" className="btn btn-primary mt-4 inline-flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>{t('list.addFirst')}</span>
            </Link>
          </div>
        )}
      </div>

      {showBatchEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="expense-batch-title">
          <div className="card w-full max-w-md">
            <div className="mb-5 flex items-center justify-between"><h2 id="expense-batch-title" className="text-lg font-semibold">{t('list.batchTitle')}</h2><button type="button" onClick={closeBatchEdit} aria-label={t('list.close')}><X className="h-5 w-5" /></button></div>
            <label className="block"><span className="label">{t('list.table.status')}</span><select value={batchStatus} onChange={event => setBatchStatus(event.target.value as 'paid' | 'unpaid')} className="input"><option value="paid">{t('list.paid')}</option><option value="unpaid">{t('list.unpaid')}</option></select></label>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeBatchEdit} className="btn btn-secondary">{t('list.cancel')}</button><button type="button" onClick={handleBatchUpdate} disabled={batchLoading} className="btn btn-primary disabled:opacity-50">{batchLoading ? t('list.saving') : t('list.applyToSelected', { count: selection.selectedIds.size })}</button></div>
          </div>
        </div>
      )}

      {showUniversalImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="universal-import-title">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div><h2 id="universal-import-title" className="text-lg font-semibold">{t('list.universal.title')}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('list.universal.help')}</p></div>
              <button type="button" onClick={closeUniversalImport} aria-label={t('list.close')}><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
              <p className="text-sm text-indigo-900 dark:text-indigo-100">{t('list.universal.promptHelp')}</p>
              <button type="button" onClick={copyUniversalPrompt} className="btn btn-secondary mt-3 flex items-center gap-2"><Copy className="h-4 w-4" />{t('list.universal.copyPrompt')}</button>
            </div>
            <label className="block">
              <span className="label">{t('list.universal.files')}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple onChange={event => setUniversalFiles(Array.from(event.target.files ?? []))} className="input file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-700" />
            </label>
            {universalFiles.length > 0 && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{universalFiles.map(file => file.name).join(', ')}</p>}
            <label className="mt-4 block">
              <span className="label">{t('list.universal.data')}</span>
              <textarea value={universalText} onChange={event => setUniversalText(event.target.value)} placeholder={universalInvoiceExample} rows={16} spellCheck={false} className="input h-auto font-mono text-sm" />
            </label>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('list.universal.matching')}</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeUniversalImport} className="btn btn-secondary">{t('list.cancel')}</button><button type="button" onClick={handleUniversalImport} disabled={importing} className="btn btn-primary disabled:opacity-50">{importing ? t('list.import.importing') : t('list.universal.import')}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
