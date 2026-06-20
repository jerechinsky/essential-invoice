import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatCurrency as formatCurrencyLocale } from '../utils/format';

interface Client {
  id: string;
  companyName: string;
  primaryEmail: string;
  secondaryEmail: string | null;
  address: string;
  ico: string;
  dic: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export default function InvoiceCreate() {
  const { t } = useTranslation('invoices');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const duplicateId = searchParams.get('duplicate');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    currency: 'CZK',
    vatRate: 21,
    notes: '',
  });

  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit: '', unitPrice: '' as unknown as number }
  ]);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      // Load clients and settings in parallel
      const [clientsData, settings] = await Promise.all([
        api.get('/clients'),
        api.get('/settings')
      ]);
      setClients(clientsData);

      if (isEdit) {
        const invoice = await api.get(`/invoices/${id}`);
        setFormData({
          clientId: invoice.clientId,
          issueDate: invoice.issueDate.split('T')[0],
          dueDate: invoice.dueDate.split('T')[0],
          currency: invoice.currency,
          vatRate: invoice.vatRate,
          notes: invoice.notes || '',
        });
        setItems(invoice.items.map((item: InvoiceItem) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        })));
      } else if (duplicateId) {
        // Duplicate an existing invoice with fresh dates
        const paymentTerms = settings.defaultPaymentTerms ?? 14;
        const today = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const invoice = await api.get(`/invoices/${duplicateId}`);
        setFormData({
          clientId: invoice.clientId,
          issueDate: today,
          dueDate,
          currency: invoice.currency,
          vatRate: invoice.vatRate,
          notes: invoice.notes || '',
        });
        setItems(invoice.items.map((item: InvoiceItem) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        })));
      } else {
        // Apply default settings for new invoices
        const paymentTerms = settings.defaultPaymentTerms ?? 14;
        const dueDate = new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setFormData(prev => ({
          ...prev,
          vatRate: settings.defaultVatRate ?? 21,
          dueDate,
        }));
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  function handleItemChange(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  }

  function addItem() {
    setItems(prev => [...prev, { description: '', quantity: 1, unit: '', unitPrice: '' as unknown as number }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  }

  function calculateSubtotal(): number {
    return items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
  }

  function calculateVat(): number {
    return calculateSubtotal() * (formData.vatRate / 100);
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateVat();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!formData.clientId) {
      toast.error(t('create.validationSelectContact'));
      return;
    }

    if (items.some(item => !item.description || item.unitPrice <= 0)) {
      toast.error(t('create.validationFillItems'));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        vatRate: Number(formData.vatRate),
        items: items.map(item => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      };

      if (isEdit) {
        await api.put(`/invoices/${id}`, payload);
      } else {
        await api.post('/invoices', payload);
      }

      navigate('/invoices');
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('create.saveError'));
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

  const formatCurrency = (amount: number) => {
    return formatCurrencyLocale(amount, formData.currency);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => navigate('/invoices')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {isEdit ? t('create.titleEdit') : t('create.title')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client selection */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.contactSection')}</h2>
          <div>
            <label htmlFor="clientId" className="label">{t('create.selectContact')}</label>
            <select
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">{t('create.selectContactPlaceholder')}</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.companyName} ({client.primaryEmail})
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {t('create.noContacts')}{' '}
                <a href="/clients" className="text-indigo-600 hover:underline">{t('create.addContact')}</a>
              </p>
            )}
          </div>
        </div>

        {/* Invoice details */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.detailsSection')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="issueDate" className="label">{t('create.issueDate')}</label>
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
              <label htmlFor="dueDate" className="label">{t('create.dueDate')}</label>
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
              <label htmlFor="currency" className="label">{t('create.currency')}</label>
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

        {/* Items */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('create.itemsSection')}</h2>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>{t('create.addItem')}</span>
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-4 items-end">
                <div className="col-span-12 md:col-span-5">
                  <label className="label">{t('create.itemDescription')} <span className="text-gray-400 dark:text-gray-500 font-normal">({item.description.length}/150)</span></label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    className="input"
                    placeholder={t('create.itemDescriptionPlaceholder')}
                    maxLength={150}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="label">{t('create.itemQuantity')}</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value === '' ? '' as unknown as number : parseFloat(e.target.value))}
                    className="input"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <label className="label">{t('create.itemUnit')}</label>
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                    className="input"
                    placeholder={t('create.itemUnitPlaceholder')}
                  />
                </div>
                <div className="col-span-4 md:col-span-3">
                  <label className="label">{t('create.itemUnitPrice')}</label>
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value === '' ? '' as unknown as number : parseFloat(e.target.value))}
                    className="input"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className="col-span-12 md:col-span-1">
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="btn btn-secondary p-2 w-full"
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4 mx-auto" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col items-end space-y-2">
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-gray-600 dark:text-gray-300">{t('create.subtotal')}</span>
                <span className="font-medium">{formatCurrency(calculateSubtotal())}</span>
              </div>
              <div className="flex justify-between w-full max-w-xs items-center">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600 dark:text-gray-300">{t('create.vat')}</span>
                  <select
                    name="vatRate"
                    value={formData.vatRate}
                    onChange={handleChange}
                    className="input w-20 py-1"
                  >
                    <option value="0">0%</option>
                    <option value="12">12%</option>
                    <option value="21">21%</option>
                  </select>
                </div>
                <span className="font-medium">{formatCurrency(calculateVat())}</span>
              </div>
              <div className="flex justify-between w-full max-w-xs text-lg">
                <span className="font-bold">{t('create.total')}</span>
                <span className="font-bold text-indigo-600">{formatCurrency(calculateTotal())}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('create.notesSection')}</h2>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input"
            rows={3}
            maxLength={300}
            placeholder={t('create.notesPlaceholder')}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('create.notesCharCount', { count: formData.notes.length })}
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="btn btn-secondary"
          >
            {t('create.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? t('create.saving') : (isEdit ? t('create.saveChanges') : t('create.createInvoice'))}
          </button>
        </div>
      </form>
    </div>
  );
}
