import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Download } from 'lucide-react';

export default function InvoiceDownloadMenu({ onPdf, onIsdoc, align = 'end' }: {
  onPdf: () => void;
  onIsdoc: () => void;
  align?: 'start' | 'end';
}) {
  const { t } = useTranslation('invoices');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialIndex = useRef(0);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelectorAll('button')[initialIndex.current]?.focus();
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function choose(download: () => void) {
    setOpen(false);
    trigger.current?.focus();
    download();
  }

  function handleMenuKey(event: React.KeyboardEvent) {
    const options = Array.from(menu.current?.querySelectorAll('button') ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }

  return <div ref={root} className="relative inline-flex"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="btn btn-secondary flex items-center gap-2"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { initialIndex.current = 0; setOpen(value => !value); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          initialIndex.current = event.key === 'ArrowUp' ? 1 : 0;
          setOpen(true);
        }
      }}>
      <Download className="h-4 w-4" aria-hidden="true" />
      <span>{t('detail.download')}</span>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div ref={menu} id={id} role="menu" aria-label={t('detail.download')}
      onKeyDown={handleMenuKey}
      className={`absolute top-full ${align === 'start' ? 'left-0' : 'right-0'} mt-1 w-60 rounded-[10px] border border-border bg-surface shadow-lg overflow-hidden z-40`}>
      {([
        ['PDF', 'detail.pdfDescription', onPdf],
        ['ISDOC', 'detail.isdocDescription', onIsdoc],
      ] as const).map(([format, description, download]) => <button key={format}
        type="button" role="menuitem" tabIndex={-1} aria-label={format}
        onClick={() => choose(download)}
        className="block w-full px-4 py-3 text-left text-text hover:bg-nav-hover focus:bg-nav-hover focus:outline-none">
        <span className="block text-sm font-medium">{format}</span>
        <span className="block mt-0.5 text-xs text-text-muted">{t(description)}</span>
      </button>)}
    </div>}
  </div>;
}
