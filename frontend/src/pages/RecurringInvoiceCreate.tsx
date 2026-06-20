import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

interface Client {
  id: string;
  companyName: string;
  primaryEmail: string;
}

interface RecurringItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export default function RecurringInvoiceCreate() {
  const { t } = useTranslation('invoices');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    currency: 'CZK',
    vatRate: 21,
    notes: '',
    dayOfMonth: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    paymentTerms: 14,
    autoSend: false,
  });

  const [items, setItems] = useState<RecurringItem[]>([
    { description: '', quantity: 1, unit: '', unitPrice: '' as unknown as number }
  ]);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [clientsData, settings] = await Promise.all([
        api.get('/clients'),
        api.get('/settings')
      ]);
      setClients(clientsData);

      if (isEdit) {
        const template = await api.get(`/recurring-invoices/${id}`);
        setFormData({
          clientId: template.clientId,
          currency: template.currency,
          vatRate: template.vatRate,
          notes: template.notes || '',
          dayOfMonth: template.dayOfMonth,
          startDate: template.startDate?.split('T')[0] || '',
          endDate: template.endDate?.split('T')[0] || '',
          paymentTerms: template.paymentTerms,
          autoSend: template.autoSend,
        });
        setItems(template.items.map((item: RecurringItem) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        })));
      } else {
        setFormData(prev => ({
          ...prev,
          vatRate: settings.defaultVatRate ?? 21,
          paymentTerms: settings.defaultPaymentTerms ?? 14,
        }));
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  }

  function handleItemChange(index: number, field: keyof RecurringItem, value: string | number) {
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
    return calculateSubtotal() * (Number(formData.vatRate) / 100);
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateVat();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.clientId) {
      toast.error(t('recurring.create.validationSelectContact'));
      return;
    }

    if (items.some(item => !item.description || item.unitPrice <= 0)) {
      toast.error(t('recurring.create.validationFillItems'));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        vatRate: Number(formData.vatRate),
        dayOfMonth: Number(formData.dayOfMonth),
        paymentTerms: Number(formData.paymentTerms),
        endDate: formData.endDate || undefined,
        items: items.map(item => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      };

      if (isEdit) {
        await api.put(`/recurring-invoices/${id}`, payload);
      } else {
        await api.post('/recurring-invoices', payload);
      }

      navigate('/invoices?tab=recurring');
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('recurring.create.saveError'));
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
    const symbol = formData.currency === 'CZK' ? 'Kč' : 'EUR';
    return `${amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => navigate('/invoices?tab=recurring')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {isEdit ? t('recurring.create.titleEdit') : t('recurring.create.title')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client selection */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('recurring.create.contactSection')}</h2>
          <div>
            <label htmlFor="clientId" className="label">{t('recurring.create.selectContact')}</label>
            <select
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">{t('recurring.create.selectContactPlaceholder')}</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.companyName} ({client.primaryEmail})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('recurring.create.scheduleSection')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="dayOfMonth" className="label">{t('recurring.create.dayOfMonth')}</label>
              <select
                id="dayOfMonth"
                name="dayOfMonth"
                value={formData.dayOfMonth}
                onChange={handleChange}
                className="input"
                required
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>{day}.</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="startDate" className="label">{t('recurring.create.startDate')}</label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label htmlFor="endDate" className="label">{t('recurring.create.endDate')}</label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="input"
                placeholder={t('recurring.create.endDatePlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="paymentTerms" className="label">{t('recurring.create.paymentTerms')}</label>
              <input
                type="number"
                id="paymentTerms"
                name="paymentTerms"
                value={formData.paymentTerms}
                onChange={handleChange}
                className="input"
                min="1"
                max="365"
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="currency" className="label">{t('recurring.create.currency')}</label>
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
            <div className="flex items-center pt-6">
              <input
                type="checkbox"
                id="autoSend"
                name="autoSend"
                checked={formData.autoSend}
                onChange={handleChange}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
              />
              <label htmlFor="autoSend" className="text-sm text-gray-700 dark:text-gray-300">
                {t('recurring.create.autoSend')}
              </label>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('recurring.create.itemsSection')}</h2>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>{t('recurring.create.addItem')}</span>
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-4 items-end">
                <div className="col-span-12 md:col-span-5">
                  <label className="label">{t('recurring.create.itemDescription')} <span className="text-gray-400 dark:text-gray-500 font-normal">({item.description.length}/150)</span></label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    className="input"
                    placeholder={t('recurring.create.itemDescriptionPlaceholder')}
                    maxLength={150}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="label">{t('recurring.create.itemQuantity')}</label>
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
                  <label className="label">{t('recurring.create.itemUnit')}</label>
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                    className="input"
                    placeholder={t('recurring.create.itemUnitPlaceholder')}
                  />
                </div>
                <div className="col-span-4 md:col-span-3">
                  <label className="label">{t('recurring.create.itemUnitPrice')}</label>
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
                <span className="text-gray-600 dark:text-gray-300">{t('recurring.create.subtotal')}</span>
                <span className="font-medium">{formatCurrency(calculateSubtotal())}</span>
              </div>
              <div className="flex justify-between w-full max-w-xs items-center">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600 dark:text-gray-300">{t('recurring.create.vat')}</span>
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
                <span className="font-bold">{t('recurring.create.total')}</span>
                <span className="font-bold text-indigo-600">{formatCurrency(calculateTotal())}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('recurring.create.notesSection')}</h2>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input"
            rows={3}
            maxLength={300}
            placeholder={t('recurring.create.notesPlaceholder')}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('recurring.create.notesCharCount', { count: formData.notes.length })}
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/invoices?tab=recurring')}
            className="btn btn-secondary"
          >
            {t('recurring.create.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? t('recurring.create.saving') : (isEdit ? t('recurring.create.saveChanges') : t('recurring.create.createRecurring'))}
          </button>
        </div>
      </form>
    </div>
  );
}
