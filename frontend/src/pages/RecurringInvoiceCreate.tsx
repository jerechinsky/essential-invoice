import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { formatCurrency as formatCurrencyLocale, formatDate } from '../utils/format';
import { useLineItems, LineItem } from '../hooks/useLineItems';
import InvoiceItemsEditor from '../components/InvoiceItemsEditor';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/Spinner';

interface Client {
  id: string;
  companyName: string;
  primaryEmail: string;
}

export default function RecurringInvoiceCreate() {
  const { t } = useTranslation('invoices');
  const { user } = useAuth();
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

  const {
    items, setItems, handleItemChange, addItem, removeItem,
    subtotal, vatAmount, total,
  } = useLineItems(formData.vatRate);

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
        setItems(template.items.map((item: LineItem) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          vatTreatment: item.vatTreatment,
          vatReason: item.vatReason,
          vatCode: item.vatCode,
        })));
      } else {
        setFormData(prev => ({
          ...prev,
          vatRate: user?.vatPayer === false ? 0 : (settings.defaultVatRate ?? 21),
          paymentTerms: settings.defaultPaymentTerms ?? 14,
        }));
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error(t('common:errors.loadFailed'));
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
          vatRate: item.vatTreatment === 'exempt' ? 0 : Number(item.vatRate ?? formData.vatRate),
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
    return <PageLoader />;
  }

  const formatCurrency = (amount: number) => {
    return formatCurrencyLocale(amount, formData.currency);
  };

  const title = isEdit ? t('recurring.create.titleEdit') : t('recurring.create.title');
  const submitLabel = saving
    ? t('recurring.create.saving')
    : isEdit
      ? t('recurring.create.saveChanges')
      : t('recurring.create.createRecurring');

  // Inline control inside the schedule sentence
  const inlineControl = 'bg-surface text-text border border-border-strong rounded-[9px] px-2.5 py-1 text-sm focus:outline-hidden focus:border-accent align-baseline';
  const selectedClient = clients.find(c => c.id === formData.clientId);

  // Preview: the next three issue dates, so the rule is confirmed in plain dates
  const nextThree = (() => {
    const dates: Date[] = [];
    const from = formData.startDate ? new Date(formData.startDate) : new Date();
    const cursor = new Date(from.getFullYear(), from.getMonth(), Number(formData.dayOfMonth));
    if (cursor < from) cursor.setMonth(cursor.getMonth() + 1);
    for (let i = 0; i < 3; i++) {
      dates.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return dates;
  })();

  return (
    <div className="pb-28 lg:pb-0">
      {/* Header bar */}
      <div className="hidden lg:flex items-center gap-4 -mx-7 -mt-7 mb-6 h-[60px] px-7 bg-surface border-b border-border">
        <button
          onClick={() => navigate('/invoices?tab=recurring')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('tabs.recurring')}
        </button>
        <div className="h-4 w-px bg-border-strong" />
        <h1 className="text-base font-semibold text-text">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => navigate('/invoices?tab=recurring')} className="btn btn-secondary">
            {t('recurring.create.cancel')}
          </button>
          <button type="submit" form="recurring-form" disabled={saving} className="btn btn-primary">
            {submitLabel}
          </button>
        </div>
      </div>

      {/* Mobile header */}
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate('/invoices?tab=recurring')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('tabs.recurring')}
        </button>
        <h1 className="text-lg font-bold tracking-[-0.02em] text-text">{title}</h1>
      </div>

      <form id="recurring-form" onSubmit={handleSubmit} className="max-w-[900px] space-y-4">
        {/* The schedule, as a sentence rather than a grid of fields */}
        <div className="card">
          <h2 className="text-[15px] font-semibold text-text mb-4">{t('recurring.create.scheduleSection')}</h2>
          <p className="text-base leading-loose text-text-secondary">
            {t('recurring.create.sentencePart1')}{' '}
            <select
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              className={inlineControl}
              aria-label={t('recurring.create.selectContact')}
              required
            >
              <option value="">{t('recurring.create.selectContactPlaceholder')}</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.companyName}</option>
              ))}
            </select>{' '}
            {t('recurring.create.sentencePart2')}{' '}
            <select
              id="dayOfMonth"
              name="dayOfMonth"
              value={formData.dayOfMonth}
              onChange={handleChange}
              className={inlineControl}
              aria-label={t('recurring.create.dayOfMonth')}
              required
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <option key={day} value={day}>{day}.</option>
              ))}
            </select>{' '}
            {t('recurring.create.sentencePart3')}{' '}
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              className={`${inlineControl} tabular-nums`}
              aria-label={t('recurring.create.startDate')}
              required
            />.
          </p>

          {/* Preview footnote — confirms the rule means what the user thinks */}
          <div className="flex items-start gap-2 mt-4 bg-canvas rounded-[12px] px-3.5 py-3">
            <CalendarClock className="h-4 w-4 text-text-muted shrink-0 mt-0.5" />
            <p className="text-xs text-text-muted tabular-nums">
              {t('recurring.create.nextThree', {
                dates: nextThree.map(d => formatDate(d.toISOString())).join(' · '),
              })}
              {selectedClient && <> — {selectedClient.companyName}</>}
            </p>
          </div>

          {/* When it comes due */}
          <div className="mt-4 pt-4 border-t border-hairline">
            <p className="text-[13px] font-medium text-text mb-2">{t('recurring.create.whenDueHeading')}</p>
            <div className="space-y-2">
              {[
                { value: true, label: t('recurring.create.autoSendOption') },
                { value: false, label: t('recurring.create.draftOption') },
              ].map(({ value, label }) => (
                <label key={String(value)} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="autoSend"
                    checked={formData.autoSend === value}
                    onChange={() => setFormData(prev => ({ ...prev, autoSend: value }))}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text-secondary">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Ends + terms + currency */}
          <div className="mt-4 pt-4 border-t border-hairline grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="endDate" className="label">{t('recurring.create.endDate')}</label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="input tabular-nums"
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
                className="input tabular-nums"
                min="1"
                max="365"
              />
            </div>
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
          </div>
        </div>

        {/* Items */}
        <InvoiceItemsEditor
          items={items}
          onItemChange={handleItemChange}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          vatRate={formData.vatRate}
          showVat={user?.vatPayer !== false}
          subtotal={subtotal}
          vatAmount={vatAmount}
          total={total}
          formatCurrency={formatCurrency}
          keyPrefix="recurring.create"
        />

        {/* Notes */}
        <div className="card">
          <h2 className="text-[15px] font-semibold text-text mb-3">{t('recurring.create.notesSection')}</h2>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input"
            rows={3}
            maxLength={300}
            placeholder={t('recurring.create.notesPlaceholder')}
          />
          <p className="text-xs text-text-faint mt-1">
            {t('recurring.create.notesCharCount', { count: formData.notes.length })}
          </p>
        </div>
      </form>

      {/* Mobile sticky bar */}
      <div className="lg:hidden fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] z-20 px-[18px] py-2.5 bg-surface border-t border-border flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] text-text-muted">{t('recurring.create.total')}</p>
          <p className="text-xl font-bold text-text tabular-nums leading-tight">{formatCurrency(total)}</p>
        </div>
        <button type="submit" form="recurring-form" disabled={saving} className="btn btn-primary rounded-[12px] py-3 px-6">
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
