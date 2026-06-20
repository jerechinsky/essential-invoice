import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, Upload, X } from 'lucide-react';

interface Client {
  id: string;
  companyName: string;
  primaryEmail: string;
  ico?: string;
}

interface ParsedExpense {
  supplierIco: string;
  supplierInvoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  description: string;
}

interface ExactAmounts {
  amount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

export default function ExpenseCreate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('expenses');
  const isEdit = !!id;

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [exactAmounts, setExactAmounts] = useState<ExactAmounts | null>(null);

  const [formData, setFormData] = useState({
    clientId: '',
    supplierInvoiceNumber: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    currency: 'CZK',
    amount: '' as unknown as number,
    vatRate: 21,
    description: '',
    notes: '',
  });

  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const clientsData = await api.get('/clients');
      setClients(clientsData);

      if (isEdit) {
        const expense = await api.get(`/expenses/${id}`);
        setFormData({
          clientId: expense.clientId || '',
          supplierInvoiceNumber: expense.supplierInvoiceNumber || '',
          issueDate: expense.issueDate.split('T')[0],
          dueDate: expense.dueDate.split('T')[0],
          currency: expense.currency,
          amount: expense.amount,
          vatRate: expense.vatRate,
          description: expense.description || '',
          notes: expense.notes || '',
        });
        setExactAmounts({
          amount: expense.amount,
          vatRate: expense.vatRate,
          vatAmount: expense.vatAmount,
          total: expense.total,
        });
        if (expense.fileData) {
          setFileData(expense.fileData);
          setFileName(expense.fileName);
          setFileMimeType(expense.fileMimeType);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    if (name === 'amount' || name === 'vatRate') setExactAmounts(null);
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('create.attachment.allowedFormats'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('create.attachment.maxFileSize'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setFileData(base64);
      setFileName(file.name);
      setFileMimeType(file.type);
    };
    reader.readAsDataURL(file);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setParsing(true);
      try {
        const parsed = await api.uploadFile('/expenses/import/preview', file) as ParsedExpense;
        const supplier = clients.find(client => client.ico === parsed.supplierIco);
        setFormData(previous => ({
          ...previous,
          clientId: supplier?.id ?? previous.clientId,
          supplierInvoiceNumber: parsed.supplierInvoiceNumber,
          issueDate: parsed.issueDate,
          dueDate: parsed.dueDate,
          currency: parsed.currency,
          amount: parsed.amount,
          vatRate: parsed.vatRate,
          description: parsed.description,
        }));
        setExactAmounts({
          amount: parsed.amount,
          vatRate: parsed.vatRate,
          vatAmount: parsed.vatAmount,
          total: parsed.total,
        });
        toast.success(t('create.import.success'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('create.import.failed'));
      } finally {
        setParsing(false);
      }
    }
  }

  function removeFile() {
    setFileData(null);
    setFileName(null);
    setFileMimeType(null);
  }

  function calculateVatAmount(): number {
    if (exactAmounts && exactAmounts.amount === Number(formData.amount) && exactAmounts.vatRate === Number(formData.vatRate)) {
      return exactAmounts.vatAmount;
    }
    return Number(formData.amount) * (Number(formData.vatRate) / 100);
  }

  function calculateTotal(): number {
    if (exactAmounts && exactAmounts.amount === Number(formData.amount) && exactAmounts.vatRate === Number(formData.vatRate)) {
      return exactAmounts.total;
    }
    return Number(formData.amount) + calculateVatAmount();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (Number(formData.amount) <= 0) {
      toast.error(t('create.validation.enterAmount'));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        clientId: formData.clientId || null,
        supplierInvoiceNumber: formData.supplierInvoiceNumber || null,
        issueDate: formData.issueDate,
        dueDate: formData.dueDate,
        currency: formData.currency,
        amount: Number(formData.amount),
        vatRate: Number(formData.vatRate),
        ...(!isEdit && { vatAmount: calculateVatAmount(), total: calculateTotal() }),
        description: formData.description || null,
        notes: formData.notes || null,
        fileData,
        fileName,
        fileMimeType,
      };

      if (isEdit) {
        await api.put(`/expenses/${id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }

      navigate('/expenses');
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('create.toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const formatCurrencyLocal = (amount: number) => {
    const symbol = formData.currency === 'CZK' ? 'Kč' : 'EUR';
    return `${amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => navigate('/expenses')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {isEdit ? t('create.titleEdit') : t('create.titleNew')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier selection */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.supplier.title')}</h2>
          <div>
            <label htmlFor="clientId" className="label">{t('create.supplier.label')}</label>
            <select
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              className="input"
            >
              <option value="">{t('create.supplier.noSupplier')}</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Expense details */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.details.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="supplierInvoiceNumber" className="label">{t('create.details.supplierInvoiceNumber')}</label>
              <input
                type="text"
                id="supplierInvoiceNumber"
                name="supplierInvoiceNumber"
                value={formData.supplierInvoiceNumber}
                onChange={handleChange}
                className="input"
                maxLength={100}
                placeholder={t('create.details.supplierInvoiceNumberPlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="issueDate" className="label">{t('create.details.issueDate')}</label>
              <input
                type="date"
                id="issueDate"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="dueDate" className="label">{t('create.details.dueDate')}</label>
              <input
                type="date"
                id="dueDate"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="currency" className="label">{t('create.details.currency')}</label>
              <select
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="input"
              >
                <option value="CZK">CZK</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.amount.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="amount" className="label">{t('create.amount.taxBase')}</label>
              <input
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className="input"
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div>
              <label htmlFor="vatRate" className="label">{t('create.amount.vatRate')}</label>
              <select
                id="vatRate"
                name="vatRate"
                value={formData.vatRate}
                onChange={handleChange}
                className="input"
              >
                <option value="0">0%</option>
                <option value="12">12%</option>
                <option value="21">21%</option>
              </select>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col items-end space-y-2">
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-gray-600 dark:text-gray-300">{t('create.amount.taxBaseLabel')}</span>
                <span className="font-medium">{formatCurrencyLocal(Number(formData.amount))}</span>
              </div>
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-gray-600 dark:text-gray-300">{t('create.amount.vatLabel', { rate: formData.vatRate })}</span>
                <span className="font-medium">{formatCurrencyLocal(calculateVatAmount())}</span>
              </div>
              <div className="flex justify-between w-full max-w-xs text-lg">
                <span className="font-bold">{t('create.amount.total')}</span>
                <span className="font-bold text-indigo-600">{formatCurrencyLocal(calculateTotal())}</span>
              </div>
            </div>
          </div>
        </div>

        {/* File attachment */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('create.attachment.title')}</h2>
            {parsing && <span className="text-sm text-indigo-600">{t('create.import.parsing')}</span>}
          </div>
          {fileName ? (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300">{fileName}</span>
              <button
                type="button"
                onClick={removeFile}
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('create.attachment.uploadPrompt')}
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
              />
            </label>
          )}
        </div>

        {/* Description */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.description.title')}</h2>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="input"
            rows={2}
            maxLength={300}
            placeholder={t('create.description.placeholder')}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('create.description.charCount', { count: formData.description.length })}
          </p>
        </div>

        {/* Notes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.notes.title')}</h2>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input"
            rows={2}
            maxLength={300}
            placeholder={t('create.notes.placeholder')}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('create.notes.charCount', { count: formData.notes.length })}
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/expenses')}
            className="btn btn-secondary"
          >
            {t('create.buttons.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? t('create.buttons.saving') : (isEdit ? t('create.buttons.saveChanges') : t('create.buttons.createExpense'))}
          </button>
        </div>
      </form>
    </div>
  );
}
