import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../utils/api';

export default function AccountantExport() {
  const { t } = useTranslation('invoices');
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const date = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [from, setFrom] = useState(date(previousMonth));
  const [to, setTo] = useState(date(new Date(now.getFullYear(), now.getMonth(), 0)));
  const [basis, setBasis] = useState('issue');
  const [busy, setBusy] = useState(false);
  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ from, to, basis });
      await api.download(`/exports/accountant?${params}`, `accountant-${from}-${to}.zip`);
      toast.success(t('export.success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('export.error'));
    } finally { setBusy(false); }
  }
  return <section className="card">
    <h3 className="text-[15px] font-semibold text-text">{t('export.title')}</h3>
    <p className="mt-3 text-sm text-text-muted">{t('export.description')}</p>
    <div className="mt-4 rounded-lg border border-border p-3">
      <h4 className="text-sm font-medium text-text">{t('export.dphTitle')}</h4>
      <p className="mt-1 text-sm text-text-muted">{t('export.dphDescription')}</p>
      <p className="mt-2 text-xs text-text-muted">{t('export.dphScope')}</p>
    </div>
    <form onSubmit={download} className="mt-4 grid grid-cols-1 sm:grid-cols-2  gap-3 items-end">
      <label className="label">{t('export.from')}
        <input className="input mt-1" type="date" required value={from} max={to} onChange={e => setFrom(e.target.value)} />
      </label>
      <label className="label">{t('export.to')}
        <input className="input mt-1" type="date" required value={to} min={from} onChange={e => setTo(e.target.value)} />
      </label>
      <label className="label">{t('export.basis')}
        <select className="input mt-1" aria-describedby="export-period-help" value={basis} onChange={e => setBasis(e.target.value)}>
          <option value="issue">{t('export.issueDate')}</option>
          <option value="tax">{t('export.taxPointDate')}</option>
        </select>
      </label>
      <button className="btn btn-secondary" disabled={busy} type="submit">{t(busy ? 'export.preparing' : 'export.download')}</button>
    </form>
    <p id="export-period-help" className="mt-3 text-xs text-text-muted">{t(basis === 'issue' ? 'export.dphIssueDateHint' : 'export.dphTaxDateHint')}</p>
    <p className="mt-3 text-xs text-text-faint">{t('export.scope')}</p>
  </section>;
}
