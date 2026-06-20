import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getExpenseStatusLabel, getExpenseStatusColor } from '../utils/format';
import {
  ArrowLeft,
  Edit,
  Trash2,
  CheckCircle,
  Download,
  XCircle
} from 'lucide-react';

interface Expense {
  id: string;
  expenseNumber: string;
  supplierInvoiceNumber: string | null;
  status: string;
  currency: string;
  clientId: string | null;
  clientName: string | null;
  clientAddress: string | null;
  clientIco: string | null;
  clientDic: string | null;
  clientEmail: string | null;
  issueDate: string;
  dueDate: string;
  deliveryDate: string | null;
  amount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  description: string | null;
  notes: string | null;
  fileData: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('expenses');
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpense();
  }, [id]);

  async function loadExpense() {
    try {
      const result = await api.get(`/expenses/${id}`);
      setExpense(result);
    } catch (error) {
      console.error('Failed to load expense:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid() {
    try {
      await api.post(`/expenses/${id}/mark-paid`);
      toast.success(t('detail.toast.markedPaid'));
      loadExpense();
    } catch (error) {
      toast.error(t('detail.toast.markPaidFailed'));
    }
  }

  async function handleMarkUnpaid() {
    try {
      await api.post(`/expenses/${id}/mark-unpaid`);
      toast.success(t('detail.toast.markedUnpaid'));
      loadExpense();
    } catch (error) {
      toast.error(t('detail.toast.markUnpaidFailed'));
    }
  }

  async function handleDelete() {
    if (!confirm(t('detail.confirm.delete'))) return;
    try {
      await api.delete(`/expenses/${id}`);
      navigate('/expenses');
    } catch (error) {
      toast.error(t('detail.toast.deleteFailed'));
    }
  }

  async function handleDownloadFile() {
    if (!expense?.fileName) return;
    try {
      await api.download(`/expenses/${id}/file`, expense.fileName);
    } catch (error) {
      toast.error(t('detail.toast.downloadFailed'));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!expense) {
    return <div className="text-center text-gray-500 dark:text-gray-400">{t('detail.notFound')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/expenses')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('detail.title', { number: expense.expenseNumber })}
            </h1>
            <span className={`badge ${getExpenseStatusColor(expense.status)}`}>
              {getExpenseStatusLabel(expense.status)}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Link to={`/expenses/${id}/edit`} className="btn btn-secondary flex items-center space-x-2">
            <Edit className="h-4 w-4" />
            <span>{t('detail.actions.edit')}</span>
          </Link>
          {expense.status === 'unpaid' && (
              <button onClick={handleMarkPaid} className="btn btn-success flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>{t('detail.actions.markPaid')}</span>
              </button>
          )}
          {expense.status === 'paid' && (
            <button onClick={handleMarkUnpaid} className="btn btn-secondary flex items-center space-x-2">
              <XCircle className="h-4 w-4" />
              <span>{t('detail.actions.markUnpaid')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Supplier info */}
          {expense.clientName && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.supplier.title')}</h2>
              <div className="space-y-2">
                <p className="font-medium text-gray-900 dark:text-gray-100">{expense.clientName}</p>
                {expense.clientAddress && <p className="text-gray-600 dark:text-gray-300">{expense.clientAddress}</p>}
                {expense.clientIco && <p className="text-gray-600 dark:text-gray-300">{t('detail.supplier.ico', { value: expense.clientIco })}</p>}
                {expense.clientDic && <p className="text-gray-600 dark:text-gray-300">{t('detail.supplier.dic', { value: expense.clientDic })}</p>}
                {expense.clientEmail && <p className="text-gray-600 dark:text-gray-300">{t('detail.supplier.email', { value: expense.clientEmail })}</p>}
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.amount.title')}</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">{t('detail.amount.taxBase')}</span>
                <span className="font-medium">{formatCurrency(expense.amount, expense.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">{t('detail.amount.vat', { rate: expense.vatRate })}</span>
                <span className="font-medium">{formatCurrency(expense.vatAmount, expense.currency)}</span>
              </div>
              <div className="flex justify-between text-lg border-t border-gray-200 dark:border-gray-700 pt-3">
                <span className="font-bold">{t('detail.amount.total')}</span>
                <span className="font-bold text-indigo-600">{formatCurrency(expense.total, expense.currency)}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {expense.description && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.description.title')}</h2>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{expense.description}</p>
            </div>
          )}

          {/* Attachment */}
          {expense.fileData && expense.fileName && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('detail.attachment.title')}</h2>
                <button onClick={handleDownloadFile} className="btn btn-secondary flex items-center space-x-2">
                  <Download className="h-4 w-4" />
                  <span>{t('detail.attachment.download')}</span>
                </button>
              </div>
              {expense.fileMimeType === 'application/pdf' ? (
                <object
                  data={`data:application/pdf;base64,${expense.fileData}`}
                  type="application/pdf"
                  className="w-full h-[500px] rounded border border-gray-200 dark:border-gray-700"
                >
                  <p className="p-4 text-gray-500 dark:text-gray-400 text-center">
                    {t('detail.attachment.pdfNotSupported')}
                  </p>
                </object>
              ) : (
                <img
                  src={`data:${expense.fileMimeType};base64,${expense.fileData}`}
                  alt={expense.fileName}
                  className="max-w-full rounded border border-gray-200 dark:border-gray-700"
                />
              )}
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.notes.title')}</h2>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.info.title')}</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.info.expenseNumber')}</dt>
                <dd className="font-medium">{expense.expenseNumber}</dd>
              </div>
              {expense.supplierInvoiceNumber && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('detail.info.invoiceNumber')}</dt>
                  <dd className="font-medium">{expense.supplierInvoiceNumber}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.info.issueDate')}</dt>
                <dd className="font-medium">{formatDate(expense.issueDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.info.dueDate')}</dt>
                <dd className="font-medium">{formatDate(expense.dueDate)}</dd>
              </div>
              {expense.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('detail.info.paidAt')}</dt>
                  <dd className="font-medium">{formatDate(expense.paidAt)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.actions.title')}</h2>
            <div className="space-y-2">
              <button
                onClick={handleDelete}
                className="btn btn-danger w-full flex items-center justify-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('detail.actions.delete')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
