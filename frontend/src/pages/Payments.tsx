import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDialogKeyboard } from '../hooks/useDialogKeyboard';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { CreditCard, Search, Link2, Unlink, X, RefreshCw, Trash2 } from 'lucide-react';

interface Payment {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  currency: string;
  variableSymbol: string | null;
  senderName: string | null;
  senderAccount: string | null;
  message: string | null;
  transactionCode: string | null;
  transactionDate: string;
  matchedAt: string | null;
  matchMethod: string | null;
}

interface PotentialMatch {
  id: string;
  invoiceNumber: string;
  variableSymbol: string;
  clientName: string;
  total: number;
  currency: string;
  issueDate: string;
  matchScore: number;
  matchReason: string;
}

export default function Payments() {
  const { t } = useTranslation('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingEmails, setCheckingEmails] = useState(false);
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [search, setSearch] = useState('');
  // Match modal state
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  useDialogKeyboard(showMatchModal, () => setShowMatchModal(false));

  useEffect(() => {
    loadPayments();
  }, [filter]);

  async function loadPayments() {
    try {
      let url = '/payments';
      if (filter === 'matched') url += '?matched=true';
      else if (filter === 'unmatched') url += '?matched=false';

      const result = await api.get(url);
      setPayments(result);
    } catch (error) {
      console.error('Failed to load payments:', error);
    } finally {
      setLoading(false);
    }
  }

  async function openMatchModal(payment: Payment) {
    setSelectedPayment(payment);
    setShowMatchModal(true);
    setMatchLoading(true);

    try {
      const matches = await api.get(`/payments/${payment.id}/matches`);
      setPotentialMatches(matches);
    } catch (error) {
      console.error('Failed to load matches:', error);
      setPotentialMatches([]);
    } finally {
      setMatchLoading(false);
    }
  }

  async function handleMatch(invoiceId: string) {
    if (!selectedPayment) return;

    try {
      await api.post(`/payments/${selectedPayment.id}/match`, { invoiceId });
      toast.success(t('list.toast.matched'));
      setShowMatchModal(false);
      loadPayments();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('list.toast.matchFailed'));
    }
  }

  async function handleUnmatch(payment: Payment) {
    if (!confirm(t('list.confirm.unmatch'))) return;

    try {
      await api.post(`/payments/${payment.id}/unmatch`);
      toast.success(t('list.toast.unmatched'));
      loadPayments();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('list.toast.unmatchFailed'));
    }
  }

  async function handleDelete(payment: Payment) {
    if (!confirm(t('list.confirm.delete'))) return;

    try {
      await api.delete(`/payments/${payment.id}`);
      toast.success(t('list.toast.deleted'));
      loadPayments();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('list.toast.deleteFailed'));
    }
  }

  async function checkForNewPayments() {
    setCheckingEmails(true);

    try {
      await api.post('/payments/check-emails');
      toast.success(t('list.toast.checkSuccess'));
      loadPayments();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || t('list.toast.checkFailed'));
    } finally {
      setCheckingEmails(false);
    }
  }

  const filteredPayments = payments.filter(payment =>
    (payment.variableSymbol?.includes(search) ||
     payment.senderName?.toLowerCase().includes(search.toLowerCase()) ||
     payment.invoiceNumber?.includes(search))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('list.title')}</h1>
        <button
          onClick={checkForNewPayments}
          disabled={checkingEmails}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          title={t('list.checkEmailsTooltip')}
        >
          <RefreshCw className={`w-5 h-5 ${checkingEmails ? 'animate-spin' : ''}`} />
          <span>{checkingEmails ? t('list.checkingEmails') : t('list.checkEmails')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder={t('list.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t('list.filters.all')}
          </button>
          <button
            onClick={() => setFilter('unmatched')}
            className={`btn ${filter === 'unmatched' ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t('list.filters.unmatched')}
          </button>
          <button
            onClick={() => setFilter('matched')}
            className={`btn ${filter === 'matched' ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t('list.filters.matched')}
          </button>
        </div>
      </div>

      {/* Payments list */}
      <div className="card overflow-hidden">
        {filteredPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.date')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.sender')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.variableSymbol')}</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.amount')}</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.invoice')}</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">{t('list.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                      {formatDate(payment.transactionDate)}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{payment.senderName || '-'}</p>
                        {payment.message && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{payment.message}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-300">
                      {payment.variableSymbol || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">
                      +{formatCurrency(payment.amount, payment.currency)}
                    </td>
                    <td className="py-3 px-4">
                      {payment.invoiceId ? (
                        <Link
                          to={`/invoices/${payment.invoiceId}`}
                          className="text-indigo-600 hover:underline flex items-center space-x-1"
                        >
                          <Link2 className="h-4 w-4" />
                          <span>{payment.invoiceNumber}</span>
                        </Link>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {payment.invoiceId ? (
                        <button
                          onClick={() => handleUnmatch(payment)}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                          title={t('list.unmatchTooltip')}
                        >
                          <Unlink className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openMatchModal(payment)}
                            className="btn btn-secondary text-sm py-1 px-3"
                          >
                            {t('list.matchButton')}
                          </button>
                          <button
                            onClick={() => handleDelete(payment)}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title={t('list.deleteTooltip')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <CreditCard className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">{t('list.empty')}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              {t('list.emptyHint')}
            </p>
          </div>
        )}
      </div>

      {/* Match modal */}
      {showMatchModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('matchModal.title')}</h2>
              <button onClick={() => setShowMatchModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Payment details */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t('matchModal.paymentDetails.amount')}</span>
                  <span className="ml-2 font-medium text-green-600">
                    {formatCurrency(selectedPayment.amount, selectedPayment.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t('matchModal.paymentDetails.variableSymbol')}</span>
                  <span className="ml-2 font-mono">{selectedPayment.variableSymbol || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t('matchModal.paymentDetails.sender')}</span>
                  <span className="ml-2">{selectedPayment.senderName || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t('matchModal.paymentDetails.date')}</span>
                  <span className="ml-2">{formatDate(selectedPayment.transactionDate)}</span>
                </div>
              </div>
            </div>

            {/* Potential matches */}
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">{t('matchModal.potentialMatches')}</h3>
            {matchLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : potentialMatches.length > 0 ? (
              <div className="space-y-2">
                {potentialMatches.map(match => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{match.invoiceNumber}</span>
                        <span className={`badge ${
                          match.matchScore >= 80 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          match.matchScore >= 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {t('matchModal.matchScore', { score: match.matchScore })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{match.clientName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('list.table.variableSymbol')}: {match.variableSymbol} | {formatDate(match.issueDate)} | {formatCurrency(match.total, match.currency)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleMatch(match.id)}
                      className="btn btn-primary"
                    >
                      {t('matchModal.matchButton')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('matchModal.noMatches')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
