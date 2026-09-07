import { useState } from 'react';
import { CollapsibleVatBreakdown } from './VatBreakdown';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { LineItem } from '../hooks/useLineItems';

interface InvoiceItemsEditorProps {
  items: LineItem[];
  onItemChange: (index: number, field: keyof LineItem, value: string | number) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  vatRate: number | string;
  showVat?: boolean;
  subtotal: number;
  vatAmount: number;
  total: number;
  formatCurrency: (amount: number) => string;
  /** i18n key prefix within the invoices namespace, e.g. 'create' or 'recurring.create' */
  keyPrefix: string;
  /** Hide the inline totals block (InvoiceCreate renders totals in its own card) */
  showTotals?: boolean;
}

const columnHeader = 'text-[11px] uppercase font-semibold tracking-[.04em] text-text-faint';

/**
 * Wraps a field so it carries its own label below `md`, where the shared column
 * headers are hidden: a bare grid of unlabelled boxes gives no clue which one is
 * the quantity and which the price.
 */
function ItemField({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className={`${columnHeader} md:hidden block mb-1`}>{label}</span>
      {children}
    </div>
  );
}

/** One selector for the common case; extra inputs only for special treatments. */
function ItemVat({ item, index, defaultRate, onChange }: {
  item: LineItem; index: number; defaultRate: number;
  onChange: InvoiceItemsEditorProps['onItemChange'];
}) {
  const { t } = useTranslation('invoices');
  const [customRate, setCustomRate] = useState(false);
  const treatment = item.vatTreatment ?? 'standard';
  const rate = item.vatRate ?? defaultRate;
  const isCustom = customRate || ![0, 12, 21].includes(Number(rate));
  function select(value: string) {
    setCustomRate(value === 'custom');
    const nextTreatment = value === 'exempt' || value === 'reverse_charge' ? value : 'standard';
    onChange(index, 'vatTreatment', nextTreatment);
    // Remove metadata belonging to the previous treatment.
    if (nextTreatment !== treatment) {
      onChange(index, 'vatReason', '');
      onChange(index, 'vatCode', '');
    }
    if (nextTreatment === 'standard' && value !== 'custom') onChange(index, 'vatRate', Number(value));
    if (nextTreatment === 'reverse_charge' && treatment === 'exempt') onChange(index, 'vatRate', defaultRate);
  }
  return <>
    <ItemField label={t('tax.selector')} className="order-7 md:order-0 min-w-0">
      <select className="input min-w-0 text-[13px] px-2" aria-label={t('tax.selector')}
        value={treatment === 'standard' ? (isCustom ? 'custom' : String(rate)) : treatment}
        onChange={e => select(e.target.value)}>
        <option value="0">0 %</option>
        <option value="12">12 %</option>
        <option value="21">21 %</option>
        <option value="exempt">{t('tax.exemptShort')}</option>
        <option value="reverse_charge">{t('tax.reverseShort')}</option>
        <option value="custom">{t('tax.customRate')}</option>
      </select>
    </ItemField>
    {(treatment !== 'standard' || isCustom) && <div className="order-8 col-span-2 md:col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 pb-2">
      {(treatment === 'reverse_charge' || (treatment === 'standard' && isCustom)) && <label className="text-xs text-text-muted">
        {t('tax.rate')}
        <input type="number" className="input mt-1 tabular-nums" min="0" max="100" step="0.01"
          value={rate} required
          onChange={e => onChange(index, 'vatRate', e.target.value === '' ? '' : Number(e.target.value))} />
      </label>}
      {treatment === 'reverse_charge' && <label className="text-xs text-text-muted">
        {t('tax.code')}
        <input className="input mt-1" value={item.vatCode ?? ''} required maxLength={20} pattern="[0-9]+([.][0-9]+)?"
          onChange={e => onChange(index, 'vatCode', e.target.value)} />
      </label>}
      {treatment !== 'standard' && <label className="sm:col-span-2 text-xs text-text-muted">
        {t(treatment === 'exempt' ? 'tax.reason' : 'tax.note')}
        <input className="input mt-1" value={item.vatReason ?? ''} maxLength={300} required={treatment === 'exempt'}
          onChange={e => onChange(index, 'vatReason', e.target.value)} />
        {treatment === 'reverse_charge' && <span className="block mt-1">{t('tax.reverseChargeNotice')}</span>}
      </label>}
    </div>}
  </>;
}

export default function InvoiceItemsEditor({
  items,
  onItemChange,
  onAddItem,
  onRemoveItem,
  vatRate,
  showVat = true,
  subtotal,
  vatAmount,
  total,
  formatCurrency,
  keyPrefix,
  showTotals = true,
}: InvoiceItemsEditorProps) {
  const { t } = useTranslation('invoices', { keyPrefix });
  const { t: taxText } = useTranslation('invoices');
  const [vatRequested, setVatRequested] = useState(false);
  const vatVisible = showVat || vatRequested || items.some(item =>
    (item.vatTreatment && item.vatTreatment !== 'standard') || Number(item.vatRate ?? vatRate) > 0);
  const desktopColumns = vatVisible
    ? 'md:grid-cols-[minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_28px]'
    : 'md:grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_28px]';

  // Keyboard-first entry: Tab out of the last row's price field adds a row
  function handlePriceKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'Tab' && !e.shiftKey && index === items.length - 1) {
      onAddItem();
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[15px] font-semibold text-text">{t('itemsSection')}</h2>
        {!vatVisible && <button type="button" className="text-xs text-accent hover:underline py-2" onClick={() => setVatRequested(true)}>
          {taxText('tax.showControls')}
        </button>}
      </div>

      {/* Column headers (desktop) */}
      <div className={`hidden md:grid ${desktopColumns} gap-x-3 pb-2 border-b border-hairline`}>
        <span className={columnHeader}>{t('itemDescription')}</span>
        <span className={`${columnHeader} text-right`}>{t('itemQuantity')}</span>
        <span className={columnHeader}>{t('itemUnit')}</span>
        <span className={`${columnHeader} text-right`}>{t('itemUnitPrice')}</span>
        {vatVisible && <span className={columnHeader}>{taxText('tax.selector')}</span>}
        <span className={`${columnHeader} text-right`}>{t('itemTotal')}</span>
        <span />
      </div>

      {/* Below `md` each item is its own labelled card and the fields are
          re-ordered (title + remove, description, quantity/unit, price, total);
          from `md` up they collapse back into one row under the headers. */}
      <div className="space-y-3 md:space-y-0">
        {items.map((item, index) => (
          <div
            key={index}
            className={`grid grid-cols-2 ${desktopColumns} gap-x-3 gap-y-2.5 rounded-[14px] border border-hairline bg-surface-sunken p-3 md:gap-y-0 md:items-center md:rounded-none md:border-0 md:bg-transparent md:p-0 md:py-2`}
          >
            <span className={`${columnHeader} order-1 self-center md:hidden`}>
              {t('itemNumber', { number: index + 1 })}
            </span>

            <ItemField
              label={t('itemDescription')}
              className="order-3 col-span-2 md:order-0 md:col-span-1"
            >
              <input
                type="text"
                value={item.description}
                onChange={(e) => onItemChange(index, 'description', e.target.value)}
                className="input"
                placeholder={t('itemDescriptionPlaceholder')}
                aria-label={t('itemDescription')}
                maxLength={150}
                required
              />
            </ItemField>

            <ItemField label={t('itemQuantity')} className="order-4 md:order-0">
              <input
                type="number"
                value={item.quantity}
                onChange={(e) =>
                  onItemChange(index, 'quantity', e.target.value === '' ? ('' as unknown as number) : parseFloat(e.target.value))
                }
                className="input text-right tabular-nums"
                aria-label={t('itemQuantity')}
                min="0.01"
                step="0.01"
                required
              />
            </ItemField>

            <ItemField label={t('itemUnit')} className="order-5 md:order-0">
              <input
                type="text"
                value={item.unit}
                onChange={(e) => onItemChange(index, 'unit', e.target.value)}
                className="input"
                placeholder={t('itemUnitPlaceholder')}
                aria-label={t('itemUnit')}
              />
            </ItemField>

            <ItemField
              label={t('itemUnitPrice')}
              className={vatVisible ? "order-6 md:order-0" : "order-6 col-span-2 md:order-0 md:col-span-1"}
            >
              <input
                type="number"
                value={item.unitPrice}
                onChange={(e) =>
                  onItemChange(index, 'unitPrice', e.target.value === '' ? ('' as unknown as number) : parseFloat(e.target.value))
                }
                className="input text-right tabular-nums"
                onKeyDown={(e) => handlePriceKeyDown(e, index)}
                aria-label={t('itemUnitPrice')}
                min="0"
                step="0.01"
                required
              />
            </ItemField>

            {vatVisible && <ItemVat item={item} index={index} defaultRate={Number(vatRate)} onChange={onItemChange} />}

            <div className="order-9 col-span-2 flex items-center justify-between border-t border-hairline pt-2.5 md:order-0 md:col-span-1 md:block md:border-0 md:pt-0 md:text-right">
              <span className={`${columnHeader} md:hidden`}>{t('itemTotal')}</span>
              <span className="text-sm font-semibold text-text tabular-nums">
                {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onRemoveItem(index)}
              disabled={items.length === 1}
              className="order-2 justify-self-end self-center p-1.5 rounded-lg text-text-faint hover:text-danger hover:bg-nav-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed md:order-0"
              aria-label={t('removeItem')}
            >
              <X className="h-4 w-4" />
            </button>

          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onAddItem}
          className="flex items-center gap-1.5 bg-surface-sunken text-text text-sm font-medium rounded-[10px] px-3.5 py-2 hover:bg-nav-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{t('addItem')}</span>
        </button>
        <span className="hidden md:block text-xs text-text-faint">{t('addItemHint')}</span>
      </div>

      {showTotals && (
        <div className="mt-6 pt-6 border-t border-hairline">
          <div className="flex flex-col items-end space-y-2">
            <div className="flex justify-between w-full max-w-xs">
              <span className="text-[13px] text-text-muted">{t('subtotal')}</span>
              <span className="text-sm font-medium text-text tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full max-w-xs items-center">
              <span className="text-[13px] text-text-muted">{taxText('tax.selector')}</span>
              <span className="text-sm font-medium text-text tabular-nums">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="w-full max-w-xs"><CollapsibleVatBreakdown items={items} defaultRate={Number(vatRate)} formatCurrency={formatCurrency} /></div>
            <div className="flex justify-between w-full max-w-xs items-baseline">
              <span className="text-sm font-semibold text-text">{t('total')}</span>
              <span className="text-xl font-bold text-accent tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
