import { useTranslation } from 'react-i18next';
import { summarizeStoredTax } from '../utils/money';
import type { LineItem } from '../hooks/useLineItems';

export function LineVatLabel({ item, defaultRate }: { item: LineItem; defaultRate: number }) {
  const { t } = useTranslation('invoices');
  return <span className="block text-xs text-text-muted mt-1 break-words">
    {item.vatTreatment && item.vatTreatment !== 'standard'
      ? t(`tax.${item.vatTreatment}`)
      : t('tax.rateLabel', { rate: item.vatRate ?? defaultRate })}
    {item.vatCode && ` · ${item.vatCode}`}
    {item.vatReason && ` · ${item.vatReason}`}
  </span>;
}

export default function VatBreakdown({ items, defaultRate, formatCurrency }: {
  items: LineItem[]; defaultRate: number; formatCurrency: (amount: number) => string;
}) {
  const { t } = useTranslation('invoices');
  return <div className="space-y-2" aria-label={t('tax.breakdown')}>
    {summarizeStoredTax(items, defaultRate).map(group => <div key={`${group.vatTreatment}:${group.vatRate}`}
      className="flex justify-between gap-3 text-xs text-text-muted">
      <span>{group.vatTreatment === 'standard' ? t('tax.rateLabel', { rate: group.vatRate }) : t(`tax.${group.vatTreatment}`)}
        <span className="block">{t('tax.base')}: {formatCurrency(group.base)}</span>
      </span>
      <span className="tabular-nums whitespace-nowrap">{formatCurrency(group.vatAmount)}</span>
    </div>)}
  </div>;
}

export function CollapsibleVatBreakdown(props: Parameters<typeof VatBreakdown>[0]) {
  const { t } = useTranslation('invoices');
  return <details className="text-xs text-text-muted">
    <summary className="cursor-pointer py-1 hover:text-text">{t('tax.breakdown')}</summary>
    <div className="pt-2"><VatBreakdown {...props} /></div>
  </details>;
}
