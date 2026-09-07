import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/format';
import { Plus, Repeat, Play, Pause, Trash2 } from 'lucide-react';
import { PageLoader } from '../components/Spinner';
import { toast } from 'sonner';

interface RecurringInvoice {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  vatRate: number;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextGenerationDate: string;
  paymentTerms: number;
  autoSend: boolean;
  active: boolean;
  subtotal: number;
  total: number;
  createdAt: string;
}

/** Whole days from today until the given date (negative when past) */
function daysUntil(date: string): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function RecurringInvoices() {
  const { t } = useTranslation('invoices');
  const [templates, setTemplates] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const result = await api.get('/recurring-invoices');
      setTemplates(result);
    } catch (error) {
      console.error('Failed to load recurring invoices:', error);
      toast.error(t('common:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      await api.post(`/recurring-invoices/${id}/toggle`);
      loadTemplates();
    } catch (error) {
      console.error('Failed to toggle recurring invoice:', error);
      toast.error(t('common:errors.saveFailed'));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('recurring.list.confirmDelete'))) return;
    try {
      await api.delete(`/recurring-invoices/${id}`);
      loadTemplates();
    } catch (error) {
      console.error('Failed to delete recurring invoice:', error);
      toast.error(t('common:errors.deleteFailed'));
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  if (templates.length === 0) {
    return (
      <div className="card text-center py-12">
        <Repeat className="h-12 w-12 text-border-strong mx-auto mb-4" />
        <p className="text-sm text-text-muted">{t('recurring.list.emptyState')}</p>
        <Link to="/recurring/new" className="btn btn-primary mt-4 inline-flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>{t('recurring.list.createFirst')}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates.map((template) => {
        const days = daysUntil(template.nextGenerationDate);
        const total = template.total ?? template.subtotal * (1 + template.vatRate / 100);
        return (
          <div
            key={template.id}
            className={`bg-surface border border-border rounded-[20px] px-[22px] py-[18px] ${
              template.active ? '' : 'opacity-[.72]'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1.6fr_1.3fr_1fr_auto] gap-4 items-center">
              {/* Client */}
              <Link to={`/recurring/${template.id}`} className="flex items-center gap-3 min-w-0 group">
                <span className="flex items-center justify-center h-[34px] w-[34px] rounded-[11px] bg-accent-soft text-accent text-xs font-semibold shrink-0">
                  {getInitials(template.clientName)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-text truncate group-hover:text-accent transition-colors">
                    {template.clientName}
                  </span>
                  <span className="block text-xs text-text-faint truncate">{template.clientEmail}</span>
                </span>
              </Link>

              {/* The schedule, stated twice: when first, then the rule */}
              <div className="min-w-0">
                <p className="text-[13px] text-text-secondary tabular-nums">
                  {t('recurring.list.nextOn')}{' '}
                  <span className="font-semibold text-text">{formatDate(template.nextGenerationDate)}</span>
                  {days >= 0 && (
                    <span className="text-text-muted">
                      {' '}
                      — {days === 0 ? t('recurring.list.today') : t('recurring.list.inDays', { count: days })}
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-faint">
                  {t('recurring.list.monthlyOn', { day: template.dayOfMonth })} ·{' '}
                  {template.autoSend ? t('recurring.list.sendsItself') : t('recurring.list.savedAsDraft')}
                </p>
              </div>

              {/* Amount */}
              <p
                className={`text-[15px] font-semibold tabular-nums sm:text-right ${
                  template.active ? 'text-text' : 'text-text-faint'
                }`}
              >
                {formatCurrency(total, template.currency)}
              </p>

              {/* Status + actions */}
              <div className="flex items-center gap-2 sm:justify-end">
                <span
                  className={`badge gap-1 ${
                    template.active ? 'bg-success-bg text-success' : 'bg-neutral-chip-bg text-neutral-chip-fg'
                  }`}
                >
                  {template.active ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {template.active ? t('recurring.list.statusActive') : t('recurring.list.statusPaused')}
                </span>
                <button
                  onClick={() => handleToggle(template.id)}
                  className="p-1.5 rounded-lg text-text-faint hover:text-accent hover:bg-nav-hover transition-colors"
                  title={template.active ? t('recurring.list.togglePause') : t('recurring.list.toggleActivate')}
                >
                  {template.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="p-1.5 rounded-lg text-text-faint hover:text-danger hover:bg-nav-hover transition-colors"
                  title={t('recurring.list.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
