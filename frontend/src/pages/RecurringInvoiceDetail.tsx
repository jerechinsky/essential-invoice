import VatBreakdown, { LineVatLabel } from '../components/VatBreakdown';
import type { LineItem } from '../hooks/useLineItems';
import { calculateInvoiceTax } from '../utils/money';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '../utils/format';
import { PageLoader } from '../components/Spinner';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Play,
  Pause,
  Zap,
} from 'lucide-react';

interface RecurringItem extends LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

interface RecurringTemplate {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  vatRate: number;
  notes: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextGenerationDate: string;
  paymentTerms: number;
  autoSend: boolean;
  active: boolean;
  items: RecurringItem[];
}

interface GeneratedInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  total: number;
  currency: string;
}

export default function RecurringInvoiceDetail() {
  const { t } = useTranslation('invoices');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<RecurringTemplate | null>(null);
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [templateData, invoicesData] = await Promise.all([
        api.get(`/recurring-invoices/${id}`),
        api.get(`/invoices?recurringId=${id}`),
      ]);
      setTemplate(templateData);
      setGeneratedInvoices(invoicesData);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error(t('common:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    try {
      const result = await api.post(`/recurring-invoices/${id}/toggle`);
      setTemplate(prev => prev ? { ...prev, active: result.active } : null);
      toast.success(result.active ? t('recurring.detail.activatedSuccess') : t('recurring.detail.pausedSuccess'));
    } catch (error) {
      toast.error(t('recurring.detail.toggleError'));
    }
  }

  async function handleGenerateNow() {
    setGenerating(true);
    try {
      await api.post(`/recurring-invoices/${id}/generate-now`);
      toast.success(t('recurring.detail.generateSuccess'));
      loadData();
    } catch (error) {
      toast.error(t('recurring.detail.generateError'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('recurring.detail.confirmDelete'))) return;
    try {
      await api.delete(`/recurring-invoices/${id}`);
      navigate('/invoices?tab=recurring');
    } catch (error) {
      toast.error(t('recurring.detail.deleteError'));
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  if (!template) {
    return <div className="text-center text-text-muted">{t('recurring.detail.notFound')}</div>;
  }

  const columnHeader = 'text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint';

  const { subtotal, total } = calculateInvoiceTax(template.items, template.vatRate);

  return (
    <div>
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
        <h1 className="text-base font-semibold text-text">
          {t('recurring.detail.title', { clientName: template.clientName })}
        </h1>
        <span className={`badge gap-1 ${template.active ? 'bg-success-bg text-success' : 'bg-neutral-chip-bg text-neutral-chip-fg'}`}>
          {template.active ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {template.active ? t('recurring.detail.statusActive') : t('recurring.detail.statusPaused')}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleToggle} className="btn btn-secondary flex items-center space-x-2">
            {template.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{template.active ? t('recurring.detail.pause') : t('recurring.detail.activate')}</span>
          </button>
          <Link to={`/recurring/${id}/edit`} className="btn btn-secondary flex items-center space-x-2">
            <Edit className="h-4 w-4" />
            <span>{t('recurring.detail.edit')}</span>
          </Link>
          <button onClick={handleGenerateNow} disabled={generating} className="btn btn-primary flex items-center space-x-2">
            <Zap className="h-4 w-4" />
            <span>{generating ? t('recurring.detail.generating') : t('recurring.detail.generateNow')}</span>
          </button>
        </div>
      </div>

      {/* Mobile header */}
      <div className="lg:hidden space-y-3 mb-4">
        <button
          onClick={() => navigate('/invoices?tab=recurring')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('tabs.recurring')}
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-bold tracking-[-0.02em] text-text">
            {t('recurring.detail.title', { clientName: template.clientName })}
          </h1>
          <span className={`badge ${template.active ? 'bg-success-bg text-success' : 'bg-neutral-chip-bg text-neutral-chip-fg'}`}>
            {template.active ? t('recurring.detail.statusActive') : t('recurring.detail.statusPaused')}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleToggle} className="btn btn-secondary flex-1">
            {template.active ? t('recurring.detail.pause') : t('recurring.detail.activate')}
          </button>
          <button onClick={handleGenerateNow} disabled={generating} className="btn btn-primary flex-1">
            {generating ? t('recurring.detail.generating') : t('recurring.detail.generateNow')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-5">
        <div className="space-y-4">
          {/* Items */}
          <div className="card">
            <h2 className="text-[15px] font-semibold text-text mb-4">{t('recurring.detail.itemsSection')}</h2>
            <div className="grid grid-cols-[2.6fr_0.9fr_1fr_1fr] gap-x-4 pb-2 border-b border-hairline">
              <span className={columnHeader}>{t('recurring.detail.columnDescription')}</span>
              <span className={`${columnHeader} text-right`}>{t('recurring.detail.columnQuantity')}</span>
              <span className={`${columnHeader} text-right`}>{t('recurring.detail.columnUnitPrice')}</span>
              <span className={`${columnHeader} text-right`}>{t('recurring.detail.columnTotal')}</span>
            </div>
            {template.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[2.6fr_0.9fr_1fr_1fr] gap-x-4 py-3 border-b border-hairline-soft last:border-b-0"
              >
                <span className="text-sm text-text">{item.description}<LineVatLabel item={item} defaultRate={template.vatRate} /></span>
                <span className="text-sm text-text-secondary text-right tabular-nums">{item.quantity} {item.unit}</span>
                <span className="text-sm text-text-secondary text-right tabular-nums">{formatCurrency(item.unitPrice, template.currency)}</span>
                <span className="text-sm font-medium text-text text-right tabular-nums">{formatCurrency(item.quantity * item.unitPrice, template.currency)}</span>
              </div>
            ))}
            <div className="flex justify-end mt-4 pt-4 border-t border-hairline">
              <div className="min-w-[260px] space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] text-text-muted">{t('recurring.detail.subtotal')}</span>
                  <span className="text-sm text-text tabular-nums">{formatCurrency(subtotal, template.currency)}</span>
                </div>
                <VatBreakdown items={template.items} defaultRate={template.vatRate}
                  formatCurrency={amount => formatCurrency(amount, template.currency)} />
                <div className="flex justify-between items-baseline pt-2 border-t border-hairline">
                  <span className="text-sm font-semibold text-text">{t('recurring.detail.total')}</span>
                  <span className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-accent tabular-nums">
                    {formatCurrency(total, template.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {template.notes && (
            <div className="card">
              <h2 className="text-[15px] font-semibold text-text mb-4">{t('recurring.detail.notesSection')}</h2>
              <p className="text-text-secondary whitespace-pre-wrap">{template.notes}</p>
            </div>
          )}

          {/* Generated invoices */}
          {generatedInvoices.length > 0 && (
            <div className="card">
              <h2 className="text-[15px] font-semibold text-text mb-4">{t('recurring.detail.generatedInvoicesSection')}</h2>
              <div>
                {generatedInvoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className="flex items-center gap-3 py-2.5 border-b border-hairline-soft last:border-b-0 hover:bg-row-hover -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <span className="text-[13px] font-medium text-text tabular-nums">{invoice.invoiceNumber}</span>
                    <span className="text-xs text-text-faint tabular-nums">{formatDate(invoice.issueDate)}</span>
                    <span className="ml-auto text-sm font-semibold text-text tabular-nums">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </span>
                    <span className={`badge ${getStatusColor(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-[15px] font-semibold text-text mb-4">{t('recurring.detail.scheduleSection')}</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('recurring.detail.dayOfMonth')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{template.dayOfMonth}.</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('recurring.detail.startDate')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{formatDate(template.startDate)}</dd>
              </div>
              {template.endDate && (
                <div className="flex justify-between">
                  <dt className="text-[13px] text-text-muted">{t('recurring.detail.endDate')}</dt>
                  <dd className="text-sm font-medium text-text tabular-nums">{formatDate(template.endDate)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('recurring.detail.nextGeneration')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{formatDate(template.nextGenerationDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('recurring.detail.paymentTerms')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{t('recurring.detail.paymentTermsDays', { count: template.paymentTerms })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('recurring.detail.autoSend')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{template.autoSend ? t('recurring.detail.autoSendYes') : t('recurring.detail.autoSendNo')}</dd>
              </div>
            </dl>
          </div>

          <div className="px-1">
            <button onClick={handleDelete} className="flex items-center gap-1.5 text-[13px] text-danger hover:underline">
              <Trash2 className="h-3.5 w-3.5" />
              {t('recurring.detail.deleteRecurring')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
