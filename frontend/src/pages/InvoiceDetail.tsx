import VatBreakdown, { LineVatLabel } from '../components/VatBreakdown';
import type { LineItem } from '../hooks/useLineItems';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '../utils/format';
import { PageLoader, Spinner } from '../components/Spinner';
import {
  ArrowLeft,
  Download,
  Send,
  Edit,
  Copy,
  CheckCircle,
  XCircle,
  ChevronDown,
  Mail,
  Sparkles,
} from 'lucide-react';
import { useAI } from '../context/AIContext';
import ReminderComposer from '../components/ReminderComposer';
import { useObjectUrl, PDF_PREVIEW_PARAMS } from '../hooks/useObjectUrl';

interface InvoiceItem extends LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  variableSymbol: string;
  status: string;
  currency: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientSecondaryEmail: string | null;
  clientAddress: string;
  clientIco: string;
  clientDic: string;
  issueDate: string;
  dueDate: string;
  deliveryDate: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  exchangeRate: number | null;
  totalCzk: number | null;
  items: InvoiceItem[];
}

function overdueDays(dueDate: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000));
}

export default function InvoiceDetail() {
  const { t } = useTranslation('invoices');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendToSecondary, setSendToSecondary] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    emailBody: string;
    pdfBase64: string;
    recipients: { primary: string; secondary: string | null };
  } | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [customSubject, setCustomSubject] = useState<string | null>(null);
  const { aiStatus } = useAI();
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [paidDate, setPaidDate] = useState('');
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInvoice();
  }, [id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setSendMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showSendModal && id) {
      loadPreview();
    }
  }, [showSendModal, id]);

  // Browser-minted blob: URL rather than a data: URL carrying the whole PDF
  const pdfPreviewUrl = useObjectUrl(previewData?.pdfBase64 ?? null, 'application/pdf');

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewData(null);
    setCustomSubject(null);
    try {
      const result = await api.get(`/invoices/${id}/preview`);
      setPreviewData(result);
      setCustomMessage(result.emailBody);
      setSecondaryEmail(result.recipients.secondary || '');
      setSendToSecondary(!!result.recipients.secondary);
    } catch (error) {
      console.error('Failed to load preview:', error);
      toast.error(t('detail.previewError'));
      setShowSendModal(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadInvoice() {
    try {
      const result = await api.get(`/invoices/${id}`);
      setInvoice(result);
    } catch (error) {
      console.error('Failed to load invoice:', error);
      toast.error(t('common:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadISDOC() {
    if (!invoice) return;
    try {
      await api.download(`/invoices/${id}/isdoc`, `${invoice.invoiceNumber}.isdoc`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('detail.downloadError'));
    }
  }

  async function handleDownloadPDF() {
    if (!invoice) return;
    try {
      await api.download(`/invoices/${id}/pdf`, `${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      toast.error(t('detail.downloadError'));
    }
  }

  async function handleDownloadAndMarkSent() {
    if (!invoice) return;
    setSendMenuOpen(false);
    try {
      await api.download(`/invoices/${id}/pdf`, `${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      toast.error(t('detail.downloadError'));
      return;
    }
    try {
      await api.post(`/invoices/${id}/mark-sent`);
      toast.success(t('detail.markSentSuccess'));
      loadInvoice();
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || t('detail.markSentError'));
    }
  }

  async function handleSendInvoice() {
    setSending(true);
    try {
      await api.post(`/invoices/${id}/send`, {
        sendToSecondary: sendToSecondary && secondaryEmail.trim() !== '',
        secondaryEmail: sendToSecondary && secondaryEmail.trim() !== '' ? secondaryEmail.trim() : undefined,
        customMessage: customMessage !== previewData?.emailBody ? customMessage : undefined,
        customSubject: customSubject || undefined
      });
      toast.success(t('detail.sendSuccess'));
      setShowSendModal(false);
      setPreviewData(null);
      loadInvoice();
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || t('detail.sendError'));
    } finally {
      setSending(false);
    }
  }

  async function handleSendReminder(subject: string, body: string) {
    try {
      await api.post(`/invoices/${id}/send`, { customSubject: subject, customMessage: body });
      toast.success(t('detail.sendSuccess'));
      loadInvoice();
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || t('detail.sendError'));
      throw err;
    }
  }

  function openMarkPaidModal() {
    if (!invoice) return;
    setPaidDate(invoice.dueDate);
    setShowMarkPaidModal(true);
  }

  async function handleMarkPaid() {
    try {
      await api.post(`/invoices/${id}/mark-paid`, { paidAt: paidDate });
      toast.success(t('detail.markPaidSuccess'));
      setShowMarkPaidModal(false);
      loadInvoice();
    } catch (error) {
      toast.error(t('detail.markPaidError'));
    }
  }

  async function handleCancel() {
    if (!confirm(t('detail.confirmCancel'))) return;
    try {
      await api.post(`/invoices/${id}/cancel`);
      toast.success(t('detail.cancelSuccess'));
      loadInvoice();
    } catch (error) {
      toast.error(t('detail.cancelError'));
    }
  }

  async function handleDelete() {
    if (!confirm(t('detail.confirmDelete'))) return;
    try {
      await api.delete(`/invoices/${id}`);
      navigate('/invoices');
    } catch (error) {
      toast.error(t('detail.deleteError'));
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  if (!invoice) {
    return <div className="text-center text-text-muted">{t('detail.notFound')}</div>;
  }

  const isPayable = invoice.status === 'sent' || invoice.status === 'overdue';
  const showActionBar = isPayable || invoice.status === 'draft';

  const statusPill = (
    <span className={`badge gap-1.5 ${getStatusColor(invoice.status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {invoice.status === 'overdue'
        ? t('detail.overdueDays', { count: overdueDays(invoice.dueDate) })
        : getStatusLabel(invoice.status)}
    </span>
  );

  return (
    <div className={showActionBar ? 'pb-28 lg:pb-0' : ''}>
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
        <h1 className="text-base font-semibold text-text tabular-nums">{invoice.invoiceNumber}</h1>
        {statusPill}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleDownloadISDOC} className="btn btn-secondary">{t('export.isdoc')}</button>
          <button onClick={handleDownloadPDF} className="btn btn-secondary flex items-center space-x-2">
            <Download className="h-4 w-4" />
            <span>{t('detail.pdf')}</span>
          </button>
          <button
            onClick={() => navigate(`/invoices/new?duplicate=${id}`)}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <Copy className="h-4 w-4" />
            <span>{t('detail.duplicate')}</span>
          </button>
          {invoice.status === 'draft' && (
            <>
              <Link to={`/invoices/${id}/edit`} className="btn btn-secondary flex items-center space-x-2">
                <Edit className="h-4 w-4" />
                <span>{t('detail.edit')}</span>
              </Link>
              <SendMenu
                label={t('detail.send')}
                variant="primary"
                open={sendMenuOpen}
                setOpen={setSendMenuOpen}
                menuRef={sendMenuRef}
                onSendEmail={() => { setSendMenuOpen(false); setShowSendModal(true); }}
                onDownloadAndMarkSent={handleDownloadAndMarkSent}
                t={t}
              />
            </>
          )}
          {isPayable && (
            <>
              <SendMenu
                label={t('detail.sendAgain')}
                variant="secondary"
                open={sendMenuOpen}
                setOpen={setSendMenuOpen}
                menuRef={sendMenuRef}
                onSendEmail={() => { setSendMenuOpen(false); setShowSendModal(true); }}
                onDownloadAndMarkSent={handleDownloadAndMarkSent}
                t={t}
              />
              {aiStatus?.available && (
                <button onClick={() => setShowReminder(true)} className="btn btn-secondary flex items-center space-x-2">
                  <Sparkles className="h-4 w-4" />
                  <span>{t('detail.remind')}</span>
                </button>
              )}
              <button onClick={openMarkPaidModal} className="btn btn-primary flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>{t('detail.markPaid')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile: back link + hero card */}
      <div className="lg:hidden space-y-4 mb-4">
        <button
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail.back')}
        </button>
        <div className="card">
          <p className="text-[13px] text-text-muted tabular-nums">
            {invoice.invoiceNumber} · {invoice.clientName}
          </p>
          <p className="mt-1 text-[34px] leading-[1.05] font-bold tracking-[-0.03em] text-text tabular-nums">
            {formatCurrency(invoice.total, invoice.currency)}
          </p>
          <div className="mt-2">{statusPill}</div>
          <div className="mt-4"><VatBreakdown items={invoice.items} defaultRate={invoice.vatRate} formatCurrency={amount => formatCurrency(amount, invoice.currency)} /></div>
          <button onClick={handleDownloadISDOC} className="btn btn-secondary mt-4">{t('export.isdoc')}</button>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-5">
        {/* Left column — desktop only per spec (mobile shows hero + timeline + details) */}
        <div className="hidden lg:block space-y-4">
          {/* Client */}
          <div className="card">
            <h2 className="text-[15px] font-semibold text-text mb-4">{t('detail.clientSection')}</h2>
            <div className="flex justify-between gap-5">
              <div>
                <p className="text-[15px] font-semibold text-text">{invoice.clientName}</p>
                {invoice.clientAddress && (
                  <p className="mt-1 text-[13px] text-text-secondary whitespace-pre-line">{invoice.clientAddress}</p>
                )}
              </div>
              <dl className="space-y-2 text-right">
                {invoice.clientIco && (
                  <div>
                    <dt className="text-xs text-text-faint">{t('detail.clientIco')}</dt>
                    <dd className="text-[13px] text-text-secondary tabular-nums">{invoice.clientIco}</dd>
                  </div>
                )}
                {invoice.clientDic && (
                  <div>
                    <dt className="text-xs text-text-faint">{t('detail.clientDic')}</dt>
                    <dd className="text-[13px] text-text-secondary tabular-nums">{invoice.clientDic}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-text-faint">{t('detail.clientEmail')}</dt>
                  <dd className="text-[13px] text-text-secondary">{invoice.clientEmail}</dd>
                </div>
                {invoice.clientSecondaryEmail && (
                  <div>
                    <dt className="text-xs text-text-faint">{t('detail.clientSecondaryEmail')}</dt>
                    <dd className="text-[13px] text-text-secondary">{invoice.clientSecondaryEmail}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <h2 className="text-[15px] font-semibold text-text mb-4">{t('detail.itemsSection')}</h2>
            <div className="grid grid-cols-[2.6fr_0.9fr_1fr_1fr] gap-x-4 pb-2 border-b border-hairline">
              <span className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint">
                {t('detail.columnDescription')}
              </span>
              <span className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint text-right">
                {t('detail.columnQuantity')}
              </span>
              <span className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint text-right">
                {t('detail.columnUnitPrice')}
              </span>
              <span className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint text-right">
                {t('detail.columnTotal')}
              </span>
            </div>
            {invoice.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[2.6fr_0.9fr_1fr_1fr] gap-x-4 py-3 border-b border-hairline-soft last:border-b-0"
              >
                <span className="text-sm text-text">{item.description}<LineVatLabel item={item} defaultRate={invoice.vatRate} /></span>
                <span className="text-sm text-text-secondary text-right tabular-nums">
                  {item.quantity} {item.unit}
                </span>
                <span className="text-sm text-text-secondary text-right tabular-nums">
                  {formatCurrency(item.unitPrice, invoice.currency)}
                </span>
                <span className="text-sm font-medium text-text text-right tabular-nums">
                  {formatCurrency(item.total, invoice.currency)}
                </span>
              </div>
            ))}
            <div className="flex justify-end mt-4 pt-4 border-t border-hairline">
              <div className="min-w-[260px] space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] text-text-muted">{t('detail.subtotal')}</span>
                  <span className="text-sm text-text tabular-nums">
                    {formatCurrency(invoice.subtotal, invoice.currency)}
                  </span>
                </div>
                <VatBreakdown items={invoice.items} defaultRate={invoice.vatRate}
                  formatCurrency={amount => formatCurrency(amount, invoice.currency)} />
                <div className="flex justify-between items-baseline pt-2 border-t border-hairline">
                  <span className="text-sm font-semibold text-text">{t('detail.total')}</span>
                  <span className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-accent tabular-nums">
                    {formatCurrency(invoice.total, invoice.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="card">
              <h2 className="text-[15px] font-semibold text-text mb-3">{t('detail.notesSection')}</h2>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="card">
            <h2 className="text-[15px] font-semibold text-text mb-4">{t('detail.timeline.title')}</h2>
            <Timeline invoice={invoice} t={t} />
            {isPayable && (
              <button
                onClick={openMarkPaidModal}
                className="btn btn-secondary w-full mt-4"
              >
                {t('detail.markPaid')}
              </button>
            )}
          </div>

          {/* Details */}
          <div className="card">
            <h2 className="text-[15px] font-semibold text-text mb-4">{t('detail.infoSection')}</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('detail.variableSymbol')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{invoice.variableSymbol}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('detail.issueDate')}</dt>
                <dd className="text-sm font-medium text-text tabular-nums">{formatDate(invoice.issueDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[13px] text-text-muted">{t('detail.dueDate')}</dt>
                <dd
                  className={`text-sm font-medium tabular-nums ${
                    invoice.status === 'overdue' ? 'text-danger' : 'text-text'
                  }`}
                >
                  {formatDate(invoice.dueDate)}
                </dd>
              </div>
              {invoice.sentAt && (
                <div className="flex justify-between">
                  <dt className="text-[13px] text-text-muted">{t('detail.sentAt')}</dt>
                  <dd className="text-sm font-medium text-text tabular-nums">{formatDate(invoice.sentAt)}</dd>
                </div>
              )}
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-[13px] text-text-muted">{t('detail.paidAt')}</dt>
                  <dd className="text-sm font-medium text-text tabular-nums">{formatDate(invoice.paidAt)}</dd>
                </div>
              )}
              {invoice.currency === 'EUR' && invoice.exchangeRate && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-[13px] text-text-muted">{t('detail.exchangeRate')}</dt>
                    <dd className="text-sm font-medium text-text tabular-nums">
                      {invoice.exchangeRate.toFixed(4)} CZK/EUR
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[13px] text-text-muted">{t('detail.czkEquivalent')}</dt>
                    <dd className="text-sm font-medium text-text tabular-nums">
                      {formatCurrency(invoice.totalCzk!, 'CZK')}
                    </dd>
                  </div>
                </>
              )}
              {invoice.currency === 'EUR' && !invoice.exchangeRate && (
                <div className="text-xs text-danger mt-1">{t('detail.exchangeRateUnavailable')}</div>
              )}
            </dl>
          </div>

          {/* Destructive actions — text links, deliberately quiet */}
          <div className="flex items-center gap-5 px-1">
            {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
              <button
                onClick={handleCancel}
                className="text-[13px] text-text-muted hover:text-danger transition-colors"
              >
                {t('detail.cancelInvoice')}
              </button>
            )}
            <button onClick={handleDelete} className="text-[13px] text-danger hover:underline">
              {t('detail.deleteInvoice')}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      {showActionBar && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] z-20 px-[18px] py-2.5 bg-surface border-t border-border flex gap-2.5">
          {invoice.status === 'draft' ? (
            <>
              <Link
                to={`/invoices/${id}/edit`}
                className="flex-1 btn btn-secondary rounded-[12px] py-3.5 text-center"
              >
                {t('detail.edit')}
              </Link>
              <button
                onClick={() => setShowSendModal(true)}
                className="flex-1 btn btn-primary rounded-[12px] py-3.5"
              >
                {t('detail.send')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={openMarkPaidModal}
                className="flex-1 btn btn-secondary rounded-[12px] py-3.5"
              >
                {t('detail.markPaid')}
              </button>
              <button
                onClick={() => (aiStatus?.available ? setShowReminder(true) : setShowSendModal(true))}
                className="flex-1 btn btn-primary rounded-[12px] py-3.5"
              >
                {t('detail.remind')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Send preview modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-[18px] shadow-[0_30px_60px_-20px_rgba(27,29,41,.35)] w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-[22px] py-4 border-b border-hairline flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-text">
                {t('detail.sendModal.title')}
              </h2>
              <button
                onClick={() => { setShowSendModal(false); setPreviewData(null); }}
                className="p-1.5 rounded-lg text-text-faint hover:text-text hover:bg-nav-hover transition-colors"
                disabled={sending}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <Spinner />
              </div>
            ) : previewData ? (
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* PDF Preview */}
                <div className="lg:w-1/2 p-[22px] border-b lg:border-b-0 lg:border-r border-hairline overflow-auto">
                  <h3 className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint mb-2">{t('detail.sendModal.pdfPreview')}</h3>
                  <object
                    data={pdfPreviewUrl ? pdfPreviewUrl + PDF_PREVIEW_PARAMS : undefined}
                    type="application/pdf"
                    className="w-full h-[400px] lg:h-[calc(100%-2rem)] rounded-sm border border-border"
                  >
                    <p className="p-4 text-text-muted text-center">
                      {t('detail.sendModal.pdfNotSupported')}{' '}
                      <a
                        href={pdfPreviewUrl ?? undefined}
                        download={`${invoice.invoiceNumber}.pdf`}
                        className="text-accent-link hover:underline"
                      >
                        {t('detail.sendModal.downloadPdf')}
                      </a>
                    </p>
                  </object>
                </div>

                {/* Email Editor */}
                <div className="lg:w-1/2 p-[22px] flex flex-col overflow-auto">
                  <h3 className="text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint mb-2">{t('detail.sendModal.emailSection')}</h3>

                  {/* Subject */}
                  <div className="mb-4">
                    <label className="label">{t('detail.sendModal.subject')}</label>
                    <div className="px-3 py-2 bg-surface-sunken rounded-[9px] border border-border text-text-secondary text-sm">
                      {customSubject ?? previewData.subject}
                    </div>
                  </div>

                  {/* Recipients */}
                  <div className="mb-4">
                    <label className="label">{t('detail.sendModal.primaryEmail')}</label>
                    <div className="px-3 py-2 bg-surface-sunken rounded-[9px] border border-border text-text-secondary text-sm">
                      {previewData.recipients.primary}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">{t('detail.sendModal.secondaryEmail')}</label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={sendToSecondary}
                          onChange={(e) => setSendToSecondary(e.target.checked)}
                          className="rounded-sm accent-accent"
                        />
                        <span className="text-sm text-text-secondary">{t('detail.sendModal.sendToSecondary')}</span>
                      </label>
                    </div>
                    <input
                      type="email"
                      value={secondaryEmail}
                      onChange={(e) => setSecondaryEmail(e.target.value)}
                      className="input"
                      placeholder={t('detail.sendModal.secondaryEmailPlaceholder')}
                    />
                  </div>

                  {/* Message */}
                  <div className="flex-1 flex flex-col mb-4">
                    <label className="label">{t('detail.sendModal.message')}</label>
                    <textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="input flex-1 min-h-[200px] resize-none"
                      placeholder={t('detail.sendModal.messagePlaceholder')}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-hairline">
                    <p className="text-xs text-text-faint">{t('detail.sendModal.marksAsSent')}</p>
                    <div className="flex gap-2">
                    <button
                      onClick={() => { setShowSendModal(false); setPreviewData(null); }}
                      className="btn btn-secondary"
                      disabled={sending}
                    >
                      {t('detail.sendModal.cancel')}
                    </button>
                    <button
                      onClick={handleSendInvoice}
                      className="btn btn-primary flex items-center space-x-2"
                      disabled={sending}
                    >
                      <Send className="h-4 w-4" />
                      <span>{sending ? t('detail.sendModal.sending') : t('detail.sendModal.send')}</span>
                    </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Reminder composer */}
      <ReminderComposer
        open={showReminder}
        onClose={() => setShowReminder(false)}
        invoiceId={id!}
        invoiceNumber={invoice.invoiceNumber}
        overdueLabel={
          invoice.status === 'overdue'
            ? t('detail.overdueDays', { count: overdueDays(invoice.dueDate) })
            : null
        }
        onSend={handleSendReminder}
      />

      {/* Mark as paid modal */}
      {showMarkPaidModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-[18px] shadow-[0_30px_60px_-20px_rgba(27,29,41,.35)] w-full max-w-[460px] overflow-hidden">
            <div className="flex items-center justify-between px-[22px] py-4 border-b border-hairline">
              <h2 className="text-[15px] font-semibold text-text">{t('detail.markPaidModal.title')}</h2>
              <button
                onClick={() => setShowMarkPaidModal(false)}
                className="p-1.5 rounded-lg text-text-faint hover:text-text hover:bg-nav-hover transition-colors"
                aria-label={t('detail.markPaidModal.cancel')}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="p-[22px] space-y-4">
              {/* What is being settled */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-text-muted tabular-nums truncate">
                  {invoice.invoiceNumber} · {invoice.clientName}
                </span>
                <span className="text-[22px] font-bold tracking-[-0.02em] text-text tabular-nums shrink-0">
                  {formatCurrency(invoice.total, invoice.currency)}
                </span>
              </div>

              <div>
                <label className="label">{t('detail.markPaidModal.paidDate')}</label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="input tabular-nums"
                  autoFocus
                />
                {/* Quick picks — the two dates people actually mean */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPaidDate(new Date().toISOString().split('T')[0])}
                    className="px-3 py-1.5 rounded-full bg-surface-sunken text-[13px] font-medium text-text-secondary hover:text-text transition-colors"
                  >
                    {t('detail.markPaidModal.today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidDate(invoice.dueDate.split('T')[0])}
                    className="px-3 py-1.5 rounded-full bg-surface-sunken text-[13px] font-medium text-text-secondary hover:text-text transition-colors"
                  >
                    {t('detail.markPaidModal.onDueDate')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-faint">{t('detail.markPaidModal.paidDateHint')}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-[22px] py-3.5 bg-row-hover border-t border-hairline">
              <button onClick={() => setShowMarkPaidModal(false)} className="btn btn-secondary">
                {t('detail.markPaidModal.cancel')}
              </button>
              <button onClick={handleMarkPaid} className="btn btn-primary flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>{t('detail.markPaidModal.confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TimelineEvent {
  key: string;
  label: string;
  meta: string | null;
  state: 'done' | 'danger' | 'pending';
}

function Timeline({ invoice, t }: { invoice: Invoice; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const events: TimelineEvent[] = [
    {
      key: 'created',
      label: t('detail.timeline.created'),
      meta: formatDate(invoice.createdAt),
      state: 'done',
    },
  ];

  if (invoice.sentAt) {
    events.push({
      key: 'sent',
      label: t('detail.timeline.sent'),
      meta: `${formatDate(invoice.sentAt)} · ${invoice.clientEmail}`,
      state: 'done',
    });
  }

  if (invoice.status === 'overdue') {
    events.push({
      key: 'duePassed',
      label: t('detail.timeline.duePassed'),
      meta: formatDate(invoice.dueDate),
      state: 'danger',
    });
  }

  if (invoice.paidAt) {
    events.push({
      key: 'paid',
      label: t('detail.timeline.paid'),
      meta: formatDate(invoice.paidAt),
      state: 'done',
    });
  } else if (invoice.status === 'cancelled') {
    events.push({
      key: 'cancelled',
      label: t('detail.timeline.cancelled'),
      meta: null,
      state: 'pending',
    });
  } else {
    events.push({
      key: 'awaiting',
      label: t('detail.timeline.awaitingPayment'),
      meta: null,
      state: 'pending',
    });
  }

  const dotClass = (state: TimelineEvent['state']) =>
    state === 'danger' ? 'bg-danger' : state === 'pending' ? 'bg-border-strong' : 'bg-accent';

  return (
    <ol>
      {events.map((event, i) => (
        <li key={event.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-[9px] w-[9px] rounded-full shrink-0 ${dotClass(event.state)}`} />
            {i < events.length - 1 && <span className="w-px flex-1 bg-hairline my-1" />}
          </div>
          <div className={i < events.length - 1 ? 'pb-4' : ''}>
            <p
              className={`text-sm font-medium ${
                event.state === 'pending'
                  ? 'text-text-faint'
                  : event.state === 'danger'
                    ? 'text-danger'
                    : 'text-text'
              }`}
            >
              {event.label}
            </p>
            {event.meta && <p className="text-xs text-text-faint tabular-nums">{event.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface SendMenuProps {
  label: string;
  variant: 'primary' | 'secondary';
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onSendEmail: () => void;
  onDownloadAndMarkSent: () => void;
  t: (key: string) => string;
}

function SendMenu({ label, variant, open, setOpen, menuRef, onSendEmail, onDownloadAndMarkSent, t }: SendMenuProps) {
  const baseStyles = variant === 'primary'
    ? 'bg-accent text-white hover:bg-accent-hover'
    : 'bg-surface text-text border border-border-strong hover:bg-surface-sunken';
  const dividerStyles = variant === 'primary'
    ? 'border-l border-accent-hover'
    : 'border-l-0';

  return (
    <div className="relative inline-flex" ref={menuRef}>
      <button
        onClick={onSendEmail}
        className={`${baseStyles} px-4 py-2 rounded-l-[10px] text-sm font-medium transition-all duration-200 flex items-center space-x-2 active:scale-[0.97] ${variant === 'secondary' ? 'border-r-0' : ''}`}
      >
        <Send className="h-4 w-4" />
        <span>{label}</span>
      </button>
      <button
        onClick={() => setOpen(!open)}
        aria-label={t('detail.sendMenuToggle')}
        className={`${baseStyles} ${dividerStyles} px-2 py-2 rounded-r-[10px] text-sm font-medium transition-all duration-200 flex items-center active:scale-[0.97]`}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-surface rounded-[10px] shadow-lg border border-border overflow-hidden z-40 min-w-[260px]">
          <button
            onClick={onSendEmail}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left text-text-secondary hover:bg-nav-hover hover:text-text"
          >
            <Mail className="h-4 w-4" />
            <span>{t('detail.sendViaEmail')}</span>
          </button>
          <button
            onClick={onDownloadAndMarkSent}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left text-text-secondary hover:bg-nav-hover hover:text-text"
          >
            <Download className="h-4 w-4" />
            <span>{t('detail.downloadAndMarkSent')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
