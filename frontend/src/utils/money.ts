// Monetary values are computed in JS floats before landing in DECIMAL columns.
// Round every intermediate value to 2 decimals so line totals sum exactly to
// the subtotal and total === subtotal + vatAmount (no haléř drift).

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LineItem {
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  vatTreatment?: 'standard' | 'exempt' | 'reverse_charge';
  vatReason?: string;
  vatCode?: string;
}

export interface VatBreakdown {
  vatRate: number;
  vatTreatment: NonNullable<LineItem['vatTreatment']>;
  base: number;
  vatAmount: number;
}

// Round at the rate/treatment level, preserving the original single-rate
// calculation. Cumulative allocation makes line taxes add up to each group.
export function calculateInvoiceTax(items: LineItem[], defaultRate: number) {
  const groups = new Map<string, VatBreakdown>();
  const lines = items.map(item => {
    const vatTreatment = item.vatTreatment ?? 'standard';
    const vatRate = vatTreatment === 'exempt' ? 0 : Number(item.vatRate ?? defaultRate);
    const key = `${vatTreatment}:${vatRate}`;
    const group = groups.get(key) ?? { vatRate, vatTreatment, base: 0, vatAmount: 0 };
    const total = calculateLineTotal(item);
    group.base = roundMoney(group.base + total);
    const tax = vatTreatment === 'standard' ? roundMoney(group.base * vatRate / 100) : 0;
    const vatAmount = roundMoney(tax - group.vatAmount);
    group.vatAmount = tax;
    groups.set(key, group);
    return { ...item, total, vatRate, vatTreatment, vatReason: item.vatReason?.trim() || '', vatAmount };
  });
  const breakdown = [...groups.values()];
  const subtotal = roundMoney(breakdown.reduce((sum, group) => sum + group.base, 0));
  const vatAmount = roundMoney(breakdown.reduce((sum, group) => sum + group.vatAmount, 0));
  return { lines, breakdown, subtotal, vatAmount, total: roundMoney(subtotal + vatAmount) };
}

export function summarizeStoredTax(items: (LineItem & { total?: number; vatAmount?: number })[], defaultRate: number): VatBreakdown[] {
  const calculated = calculateInvoiceTax(items, defaultRate);
  const groups = new Map<string, VatBreakdown>();
  items.forEach((item, index) => {
    const line = calculated.lines[index];
    const key = `${line.vatTreatment}:${line.vatRate}`;
    const group = groups.get(key) ?? { vatRate: line.vatRate, vatTreatment: line.vatTreatment, base: 0, vatAmount: 0 };
    group.base = roundMoney(group.base + (item.total ?? line.total));
    group.vatAmount = roundMoney(group.vatAmount + (item.vatAmount ?? line.vatAmount));
    groups.set(key, group);
  });
  return [...groups.values()];
}

export interface InvoiceTotals {
  subtotal: number;
  vatAmount: number;
  total: number;
}

export function calculateLineTotal(item: LineItem): number {
  return roundMoney(item.quantity * item.unitPrice);
}

export function calculateInvoiceTotals(items: LineItem[], vatRate: number): InvoiceTotals {
  const { subtotal, vatAmount, total } = calculateInvoiceTax(items, vatRate);
  return { subtotal, vatAmount, total };
}
