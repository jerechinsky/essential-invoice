import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDialogKeyboard } from '../hooks/useDialogKeyboard';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '../utils/format';
import {
  ArrowLeft,
  Download,
  Send,
  Edit,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  ChevronDown,
  Mail,
} from 'lucide-react';

interface InvoiceItem {
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
  accountantEmailSentAt: string | null;
  accountantEmailSentTo: string | null;
  paidAt: string | null;
  exchangeRate: number | null;
  totalCzk: number | null;
  items: InvoiceItem[];
}

export default function InvoiceDetail() {
  const { t } = useTranslation('invoices');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendToSecondary, setSendToSecondary] = useState(false);
  const [sendToAccountant, setSendToAccountant] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    emailBody: string;
    pdfBase64: string;
    recipients: { primary: string; secondary: string | null };
    accountant: {
      email: string | null;
      subject: string;
      emailBody: string;
      sendByDefault: boolean;
      sentAt: string | null;
      sentTo: string | null;
    };
  } | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [accountantMessage, setAccountantMessage] = useState('');
  const [accountantSubject, setAccountantSubject] = useState('');
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [paidDate, setPaidDate] = useState('');
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
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

  function closeSendModal() {
    if (!sending) {
      setShowSendModal(false);
      setPreviewData(null);
    }
  }

  useDialogKeyboard(showSendModal, closeSendModal, handleSendInvoice, sending || previewLoading || !previewData);
  useDialogKeyboard(showMarkPaidModal, () => setShowMarkPaidModal(false), handleMarkPaid);

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const result = await api.get(`/invoices/${id}/preview`);
      setPreviewData(result);
      setCustomSubject(result.subject);
      setCustomMessage(result.emailBody);
      setSecondaryEmail(result.recipients.secondary || '');
      setSendToSecondary(!!result.recipients.secondary);
      setAccountantMessage(result.accountant.emailBody);
      setAccountantSubject(result.accountant.subject);
      setSendToAccountant(result.accountant.sendByDefault);
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
    } finally {
      setLoading(false);
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
      const result = await api.post(`/invoices/${id}/send`, {
        sendToSecondary: sendToSecondary && secondaryEmail.trim() !== '',
        secondaryEmail: sendToSecondary && secondaryEmail.trim() !== '' ? secondaryEmail.trim() : undefined,
        customMessage: customMessage !== previewData?.emailBody ? customMessage : undefined,
        customSubject: customSubject !== previewData?.subject ? customSubject : undefined,
        sendToAccountant,
        accountantMessage: sendToAccountant && accountantMessage !== previewData?.accountant.emailBody
          ? accountantMessage
          : undefined,
        accountantSubject: sendToAccountant && accountantSubject !== previewData?.accountant.subject
          ? accountantSubject
          : undefined
      });
      if (sendToAccountant && !result.accountantSent) {
        toast.warning(t('detail.accountantSendError'));
      } else {
        toast.success(t('detail.sendSuccess'));
      }
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!invoice) {
    return <div className="text-center text-gray-500 dark:text-gray-400">{t('detail.notFound')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/invoices')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('detail.title', { number: invoice.invoiceNumber })}
            </h1>
            <span className={`badge ${getStatusColor(invoice.status)}`}>
              {getStatusLabel(invoice.status)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
          {(invoice.status === 'sent' || invoice.status === 'overdue') && (
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
              <button onClick={openMarkPaidModal} className="btn btn-success flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>{t('detail.markPaid')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Invoice details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Client info */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.clientSection')}</h2>
            <div className="space-y-2">
              <p className="font-medium text-gray-900 dark:text-gray-100">{invoice.clientName}</p>
              {invoice.clientAddress && <p className="text-gray-600 dark:text-gray-300">{invoice.clientAddress}</p>}
              {invoice.clientIco && <p className="text-gray-600 dark:text-gray-300">{t('detail.clientIco')} {invoice.clientIco}</p>}
              {invoice.clientDic && <p className="text-gray-600 dark:text-gray-300">{t('detail.clientDic')} {invoice.clientDic}</p>}
              <p className="text-gray-600 dark:text-gray-300">{t('detail.clientEmail')} {invoice.clientEmail}</p>
              {invoice.clientSecondaryEmail && (
                <p className="text-gray-600 dark:text-gray-300">{t('detail.clientSecondaryEmail')} {invoice.clientSecondaryEmail}</p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.itemsSection')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 font-medium text-gray-500 dark:text-gray-400">{t('detail.columnDescription')}</th>
                    <th className="text-right py-2 font-medium text-gray-500 dark:text-gray-400">{t('detail.columnQuantity')}</th>
                    <th className="text-right py-2 font-medium text-gray-500 dark:text-gray-400">{t('detail.columnUnitPrice')}</th>
                    <th className="text-right py-2 font-medium text-gray-500 dark:text-gray-400">{t('detail.columnTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-3">{item.description}</td>
                      <td className="py-3 text-right">{item.quantity} {item.unit}</td>
                      <td className="py-3 text-right">{formatCurrency(item.unitPrice, invoice.currency)}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(item.total, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700">
                    <td colSpan={3} className="py-2 text-right font-medium">{t('detail.subtotal')}</td>
                    <td className="py-2 text-right">{formatCurrency(invoice.subtotal, invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="py-2 text-right font-medium">{t('detail.vatWithRate', { rate: invoice.vatRate })}</td>
                    <td className="py-2 text-right">{formatCurrency(invoice.vatAmount, invoice.currency)}</td>
                  </tr>
                  <tr className="text-lg">
                    <td colSpan={3} className="py-2 text-right font-bold">{t('detail.total')}</td>
                    <td className="py-2 text-right font-bold text-indigo-600">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.notesSection')}</h2>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Dates */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.infoSection')}</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.variableSymbol')}</dt>
                <dd className="font-medium">{invoice.variableSymbol}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.issueDate')}</dt>
                <dd className="font-medium">{formatDate(invoice.issueDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.dueDate')}</dt>
                <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
              </div>
              {invoice.sentAt && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('detail.sentAt')}</dt>
                  <dd className="font-medium">{formatDate(invoice.sentAt)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 dark:text-gray-400">{t('detail.accountantDelivery')}</dt>
                <dd className={`font-medium text-right ${invoice.accountantEmailSentAt ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {invoice.accountantEmailSentAt
                    ? t('detail.accountantSent', {
                        date: formatDate(invoice.accountantEmailSentAt),
                        email: invoice.accountantEmailSentTo || ''
                      })
                    : t('detail.accountantNotSent')}
                </dd>
              </div>
              {invoice.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('detail.paidAt')}</dt>
                  <dd className="font-medium">{formatDate(invoice.paidAt)}</dd>
                </div>
              )}
              {invoice.currency === 'EUR' && invoice.exchangeRate && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('detail.exchangeRate')}</dt>
                    <dd className="font-medium">{invoice.exchangeRate.toFixed(4)} CZK/EUR</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('detail.czkEquivalent')}</dt>
                    <dd className="font-medium">{formatCurrency(invoice.totalCzk!, 'CZK')}</dd>
                  </div>
                </>
              )}
              {invoice.currency === 'EUR' && !invoice.exchangeRate && (
                <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  {t('detail.exchangeRateUnavailable')}
                </div>
              )}
            </dl>
          </div>

          {/* Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('detail.actionsSection')}</h2>
            <div className="space-y-2">
              {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                <button
                  onClick={handleCancel}
                  className="btn btn-secondary w-full flex items-center justify-center space-x-2"
                >
                  <XCircle className="h-4 w-4" />
                  <span>{t('detail.cancelInvoice')}</span>
                </button>
              )}
              <button
                onClick={handleDelete}
                className="btn btn-danger w-full flex items-center justify-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('detail.deleteInvoice')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Send preview modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('detail.sendModal.title')}
              </h2>
              <button
                onClick={() => { setShowSendModal(false); setPreviewData(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                disabled={sending}
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : previewData ? (
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* PDF Preview */}
                <div className="lg:w-1/2 p-4 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 overflow-auto">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('detail.sendModal.pdfPreview')}</h3>
                  <object
                    data={`data:application/pdf;base64,${previewData.pdfBase64}`}
                    type="application/pdf"
                    className="w-full h-[400px] lg:h-[calc(100%-2rem)] rounded border border-gray-200 dark:border-gray-700"
                  >
                    <p className="p-4 text-gray-500 dark:text-gray-400 text-center">
                      {t('detail.sendModal.pdfNotSupported')}{' '}
                      <a
                        href={`data:application/pdf;base64,${previewData.pdfBase64}`}
                        download={`${invoice.invoiceNumber}.pdf`}
                        className="text-indigo-600 hover:underline"
                      >
                        {t('detail.sendModal.downloadPdf')}
                      </a>
                    </p>
                  </object>
                </div>

                {/* Email Editor */}
                <div className="lg:w-1/2 p-4 flex flex-col overflow-auto">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('detail.sendModal.emailSection')}</h3>

                  {/* Subject */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('detail.sendModal.subject')}</label>
                    <input
                      type="text"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      className="input"
                    />
                  </div>

                  {/* Recipients */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('detail.sendModal.primaryEmail')}</label>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                      {previewData.recipients.primary}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500 dark:text-gray-400">{t('detail.sendModal.secondaryEmail')}</label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={sendToSecondary}
                          onChange={(e) => setSendToSecondary(e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t('detail.sendModal.sendToSecondary')}</span>
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
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('detail.sendModal.message')}</label>
                    <textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="input flex-1 min-h-[200px] resize-none"
                      placeholder={t('detail.sendModal.messagePlaceholder')}
                    />
                  </div>

                  {/* Accountant copy */}
                  <div className="mb-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('detail.sendModal.accountantCopy')}
                      </h3>
                      <label className={`flex items-center space-x-2 ${previewData.accountant.email ? '' : 'opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={sendToAccountant}
                          onChange={(e) => setSendToAccountant(e.target.checked)}
                          disabled={!previewData.accountant.email}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {t('detail.sendModal.sendToAccountant')}
                        </span>
                      </label>
                    </div>
                    {previewData.accountant.email ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {t('detail.sendModal.accountantEmail')}
                          </label>
                          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                            {previewData.accountant.email}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {t('detail.sendModal.accountantSubject')}
                          </label>
                          <input
                            type="text"
                            value={accountantSubject}
                            onChange={(e) => setAccountantSubject(e.target.value)}
                            className="input"
                            disabled={!sendToAccountant}
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {t('detail.sendModal.accountantMessage')}
                          </label>
                          <textarea
                            value={accountantMessage}
                            onChange={(e) => setAccountantMessage(e.target.value)}
                            className="input min-h-[160px] resize-y"
                            disabled={!sendToAccountant}
                          />
                        </div>
                        {previewData.accountant.sentAt && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {t('detail.sendModal.accountantPreviouslySent', {
                              date: formatDate(previewData.accountant.sentAt),
                              email: previewData.accountant.sentTo || ''
                            })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        {t('detail.sendModal.accountantNotConfigured')}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
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
            ) : null}
          </div>
        </div>
      )}

      {/* Mark as paid modal */}
      {showMarkPaidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('detail.markPaidModal.title')}
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('detail.markPaidModal.paidDate')}
              </label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="input"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('detail.markPaidModal.paidDateHint')}
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowMarkPaidModal(false)}
                className="btn btn-secondary"
              >
                {t('detail.markPaidModal.cancel')}
              </button>
              <button
                onClick={handleMarkPaid}
                className="btn btn-success flex items-center space-x-2"
              >
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
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600';
  const dividerStyles = variant === 'primary'
    ? 'border-indigo-500'
    : 'border-gray-300 dark:border-gray-600';

  return (
    <div className="relative inline-flex" ref={menuRef}>
      <button
        onClick={onSendEmail}
        className={`${baseStyles} px-4 py-2 rounded-l-lg font-medium transition-all duration-200 flex items-center space-x-2 active:scale-[0.97]`}
      >
        <Send className="h-4 w-4" />
        <span>{label}</span>
      </button>
      <button
        onClick={() => setOpen(!open)}
        aria-label={t('detail.sendMenuToggle')}
        className={`${baseStyles} ${dividerStyles} px-2 py-2 rounded-r-lg font-medium transition-all duration-200 border-l flex items-center active:scale-[0.97]`}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-40 min-w-[260px]">
          <button
            onClick={onSendEmail}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Mail className="h-4 w-4" />
            <span>{t('detail.sendViaEmail')}</span>
          </button>
          <button
            onClick={onDownloadAndMarkSent}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Download className="h-4 w-4" />
            <span>{t('detail.downloadAndMarkSent')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
