import { CollapsibleVatBreakdown } from '../components/VatBreakdown';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, QrCode, Info } from 'lucide-react';
import { formatCurrency as formatCurrencyLocale, formatDate, getInitials } from '../utils/format';
import { useLineItems, LineItem } from '../hooks/useLineItems';
import InvoiceItemsEditor from '../components/InvoiceItemsEditor';
import { PageLoader } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';

interface Client {
  id: string;
  companyName: string;
  primaryEmail: string;
  secondaryEmail: string | null;
  address: string;
  ico: string;
  dic: string;
}

export default function InvoiceCreate() {
  const { t } = useTranslation('invoices');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const duplicateId = searchParams.get('duplicate');
  const preselectedClientId = searchParams.get('client');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [differentTaxDate, setDifferentTaxDate] = useState(false);
  const [tierInfo, setTierInfo] = useState<{ limit: number; invoiced: number } | null>(null);

  const [formData, setFormData] = useState({
    clientId: '',
    issueDate: new Date().toISOString().split('T')[0],
    deliveryDate: '',
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    currency: 'CZK',
    vatRate: 21,
    notes: '',
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
      // Load clients, settings and (best-effort) tier data in parallel
      const [clientsData, settings, dashboard] = await Promise.all([
        api.get('/clients'),
        api.get('/settings'),
        api.get('/dashboard').catch(() => null),
      ]);
      setClients(clientsData);

      if (dashboard?.pausalniDan?.enabled) {
        setTierInfo({
          limit: dashboard.pausalniDan.limit,
          invoiced: dashboard.pausalniDan.invoicedThisYear,
        });
      }

      if (isEdit) {
        const invoice = await api.get(`/invoices/${id}`);
        setDifferentTaxDate(Boolean(invoice.deliveryDate && invoice.deliveryDate.split('T')[0] !== invoice.issueDate.split('T')[0]));
        setFormData({
          clientId: invoice.clientId,
          issueDate: invoice.issueDate.split('T')[0],
          deliveryDate: invoice.deliveryDate?.split('T')[0] || '',
          dueDate: invoice.dueDate.split('T')[0],
          currency: invoice.currency,
          vatRate: invoice.vatRate,
          notes: invoice.notes || '',
        });
        setItems(invoice.items.map((item: LineItem) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          vatTreatment: item.vatTreatment,
          vatReason: item.vatReason,
          vatCode: item.vatCode,
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
          deliveryDate: today,
          dueDate,
          currency: invoice.currency,
          vatRate: invoice.vatRate,
          notes: invoice.notes || '',
        });
        setItems(invoice.items.map((item: LineItem) => ({
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
        // Apply default settings for new invoices
        const paymentTerms = settings.defaultPaymentTerms ?? 14;
        const dueDate = new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setFormData(prev => ({
          ...prev,
          vatRate: user?.vatPayer === false ? 0 : (settings.defaultVatRate ?? 21),
          dueDate,
          // Preselect the client when arriving from the contact list's new-invoice action
          clientId: preselectedClientId && clientsData.some((c: Client) => c.id === preselectedClientId)
            ? preselectedClientId
            : prev.clientId,
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
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
        deliveryDate: differentTaxDate ? formData.deliveryDate : formData.issueDate,
        vatRate: Number(formData.vatRate),
        items: items.map(item => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          vatRate: item.vatTreatment === 'exempt' ? 0 : Number(item.vatRate ?? formData.vatRate),
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
    return <PageLoader />;
  }

  const formatCurrency = (amount: number) => {
    return formatCurrencyLocale(amount, formData.currency);
  };

  const selectedClient = clients.find(c => c.id === formData.clientId) || null;

  // Tier impact (CZK invoices only — EUR needs a CNB rate we don't have client-side)
  const tierImpact =
    tierInfo && formData.currency === 'CZK' && total > 0
      ? {
          projected: tierInfo.invoiced + total,
          pct: Math.round(((tierInfo.invoiced + total) / tierInfo.limit) * 100),
          crosses: tierInfo.invoiced + total > tierInfo.limit,
        }
      : null;

  const title = isEdit ? t('create.titleEdit') : t('create.title');
  const submitLabel = saving
    ? t('create.saving')
    : isEdit
      ? t('create.saveChanges')
      : t('create.createInvoice');

  return (
    <div className="pb-28 lg:pb-0">
      {/* Desktop header bar */}
      <div className="hidden lg:flex items-center gap-4 -mx-7 -mt-7 mb-6 h-[60px] px-7 bg-surface border-b border-border">
        <button
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail.back')}
        </button>
        <div className="h-4 w-px bg-border-strong" />
        <h1 className="text-base font-semibold text-text">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => navigate('/invoices')} className="btn btn-secondary">
            {t('create.cancel')}
          </button>
          <button type="submit" form="invoice-form" disabled={saving} className="btn btn-primary">
            {submitLabel}
          </button>
        </div>
      </div>

      {/* Mobile header */}
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail.back')}
        </button>
        <h1 className="text-lg font-bold tracking-[-0.02em] text-text">{title}</h1>
      </div>

      <form id="invoice-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 lg:gap-5">
          {/* Left column */}
          <div className="space-y-4">
            {/* Client */}
            <div className="card">
              <h2 className="text-[15px] font-semibold text-text mb-4">{t('create.contactSection')}</h2>
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
                {selectedClient && (
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <span className="flex items-center justify-center h-[30px] w-[30px] rounded-[9px] bg-accent-soft text-accent text-[11px] font-semibold shrink-0">
                      {getInitials(selectedClient.companyName)}
                    </span>
                    <span className="text-xs text-text-faint tabular-nums">
                      {selectedClient.ico && <>IČO {selectedClient.ico} · </>}
                      {selectedClient.primaryEmail}
                    </span>
                  </div>
                )}
                {clients.length === 0 && (
                  <p className="text-sm text-text-muted mt-2">
                    {t('create.noContacts')}{' '}
                    <Link to="/clients" className="text-accent-link hover:underline">{t('create.addContact')}</Link>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div>
                  <label htmlFor="issueDate" className="label">{t('create.issueDate')}</label>
                  <input
                    type="date"
                    id="issueDate"
                    name="issueDate"
                    value={formData.issueDate}
                    onChange={handleChange}
                    className="input tabular-nums"
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
                    className="input tabular-nums"
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
              <label className="mt-3 flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                <input type="checkbox" checked={differentTaxDate}
                  onChange={e => {
                    setDifferentTaxDate(e.target.checked);
                    if (e.target.checked) setFormData(prev => ({ ...prev, deliveryDate: prev.issueDate }));
                  }} className="accent-accent" />
                {t('tax.differentDate')}
              </label>
              {differentTaxDate && <div className="mt-3 sm:max-w-xs">
                <label htmlFor="deliveryDate" className="label">{t('export.taxPointDate')}</label>
                <input type="date" id="deliveryDate" name="deliveryDate" className="input tabular-nums"
                  required value={formData.deliveryDate} onChange={handleChange} />
              </div>}
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
              keyPrefix="create"
              showTotals={false}
            />

            {/* Notes */}
            <div className="card">
              <h2 className="text-[15px] font-semibold text-text mb-3">{t('create.notesSection')}</h2>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="input"
                rows={3}
                maxLength={300}
                placeholder={t('create.notesPlaceholder')}
              />
              <p className="text-xs text-text-faint mt-1">
                {t('create.notesCharCount', { count: formData.notes.length })}
              </p>
              {/* A statement, not a control — QR is always on the PDF */}
              <div className="mt-3 pt-3 border-t border-hairline flex items-center gap-2 text-xs text-text-faint">
                <QrCode className="h-3.5 w-3.5 shrink-0" />
                <span>{t('create.qrAlwaysIncluded')}</span>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Totals */}
            <div className="card">
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] text-text-muted">{t('create.subtotal')}</span>
                  <span className="text-sm text-text tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-text-muted">{t('create.vat')}</span>
                  <span className="text-sm text-text tabular-nums">{formatCurrency(vatAmount)}</span>
                </div>
                <CollapsibleVatBreakdown items={items} defaultRate={Number(formData.vatRate)} formatCurrency={formatCurrency} />
                <div className="flex justify-between items-baseline pt-3 border-t border-hairline">
                  <span className="text-sm font-semibold text-text">{t('create.total')}</span>
                  <span className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-accent tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {tierImpact && (
                <div
                  className={`mt-4 flex items-start gap-2 bg-canvas rounded-[12px] px-3.5 py-3 text-xs ${
                    tierImpact.crosses ? 'text-danger' : 'text-text-muted'
                  }`}
                >
                  <Info className="h-4 w-4 shrink-0" />
                  <span className="tabular-nums">
                    {tierImpact.crosses
                      ? t('create.tierImpactCrosses', { amount: formatCurrencyLocale(tierImpact.projected, 'CZK') })
                      : t('create.tierImpact', {
                          amount: formatCurrencyLocale(tierImpact.projected, 'CZK'),
                          pct: tierImpact.pct,
                        })}
                  </span>
                </div>
              )}
            </div>

            {/* Preview — a document simulation, deliberately light in both themes */}
            <div className="card hidden lg:block">
              <h2 className="text-[15px] font-semibold text-text mb-4">{t('create.previewSection')}</h2>
              <div className="bg-[#fdfdff] border border-hairline rounded-[12px] p-[22px] text-[#1b1d29]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[15px] font-bold">Faktura</p>
                    <p className="text-[11px] text-[#7a7f99] tabular-nums">
                      {formatDate(formData.issueDate)} · {formatDate(formData.dueDate)}
                    </p>
                  </div>
                  <img src="/favicon.svg" alt="" className="h-6 w-6 rounded-[6px]" />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 text-[11px] leading-[1.55]">
                  <div>
                    <p className="font-semibold text-[#7a7f99] uppercase text-[10px]">Dodavatel</p>
                    <p className="font-medium">{user?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#7a7f99] uppercase text-[10px]">Odběratel</p>
                    <p className="font-medium">{selectedClient?.companyName || '—'}</p>
                    {selectedClient?.address && (
                      <p className="text-[#5c6079] whitespace-pre-line">{selectedClient.address}</p>
                    )}
                    {selectedClient?.ico && <p className="text-[#5c6079]">IČO {selectedClient.ico}</p>}
                  </div>
                </div>

                <div className="mt-4 border-t border-[#eef0f6] pt-2">
                  {items.filter(item => item.description).map((item, i) => (
                    <div key={i} className="grid grid-cols-[2.4fr_0.6fr_1fr] gap-2 py-1 text-[11px]">
                      <span className="truncate">{item.description}</span>
                      <span className="text-right tabular-nums text-[#5c6079]">
                        {item.quantity} {item.unit}
                      </span>
                      <span className="text-right tabular-nums">
                        {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                      </span>
                    </div>
                  ))}
                  {vatAmount > 0 && (
                    <div className="grid grid-cols-[1fr_auto] gap-2 py-1 text-[11px] border-t border-[#eef0f6] mt-1 pt-1.5">
                      <span className="text-[#5c6079]">{t('create.vat')}</span>
                      <span className="text-right tabular-nums">{formatCurrency(vatAmount)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-end justify-between mt-5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-[42px] w-[42px] rounded-[6px] bg-white border border-[#eef0f6]">
                      <QrCode className="h-7 w-7 text-[#1b1d29]" />
                    </span>
                    <span className="text-[10px] text-[#8b90a8] leading-tight">
                      QR platba
                      <br />
                      SPAYD
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#7a7f99]">K úhradě</p>
                    <p className="text-[17px] font-bold tabular-nums">{formatCurrency(total)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop-only duplicate of submit for the column bottom is unnecessary;
                mobile uses the sticky bar below */}
          </div>
        </div>
      </form>

      {/* Mobile sticky total bar */}
      <div className="lg:hidden fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] z-20 px-[18px] py-2.5 bg-surface border-t border-border flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] text-text-muted">{t('create.total')}</p>
          <p className="text-xl font-bold text-text tabular-nums leading-tight">{formatCurrency(total)}</p>
        </div>
        <button
          type="submit"
          form="invoice-form"
          disabled={saving}
          className="btn btn-primary rounded-[12px] py-3 px-6"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
