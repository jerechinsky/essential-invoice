import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { formatCurrency, formatDate, getExpenseStatusLabel, getExpenseStatusColor } from '../utils/format';
import { Plus, Search, Filter, Receipt, Upload } from 'lucide-react';

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
  total: number;
  hasFile: boolean;
}

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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    loadExpenses();
  }, [statusFilter]);

  async function loadExpenses() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const result = await api.get(`/expenses?${params}`);
      setExpenses(result);
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

  const filteredExpenses = expenses.filter(expense =>
    expense.expenseNumber.toLowerCase().includes(search.toLowerCase()) ||
    (expense.clientName && expense.clientName.toLowerCase().includes(search.toLowerCase())) ||
    (expense.supplierInvoiceNumber && expense.supplierInvoiceNumber.toLowerCase().includes(search.toLowerCase()))
  );

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
      </div>

      {/* Expense list */}
      <div className="card overflow-hidden">
        {filteredExpenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.number')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.supplier')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.invoiceNumber')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.issueDate')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.dueDate')}</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.amount')}</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-3 px-4">
                      <Link
                        to={`/expenses/${expense.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {expense.expenseNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
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
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                      {expense.supplierInvoiceNumber || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{formatDate(expense.issueDate)}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{formatDate(expense.dueDate)}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(expense.total, expense.currency)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`badge ${getExpenseStatusColor(expense.status)}`}>
                        {getExpenseStatusLabel(expense.status)}
                      </span>
                    </td>
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
    </div>
  );
}
