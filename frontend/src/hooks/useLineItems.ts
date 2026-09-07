import { useState } from 'react';
import { calculateInvoiceTax } from '../utils/money';

export interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate?: number;
  vatTreatment?: 'standard' | 'exempt' | 'reverse_charge';
  vatReason?: string;
  vatCode?: string;
  vatAmount?: number;
  total?: number;
}

export function emptyLineItem(): LineItem {
  return { description: '', quantity: 1, unit: 'ks', unitPrice: '' as unknown as number };
}

/**
 * Shared state + calculations for invoice line items
 * (used by InvoiceCreate and RecurringInvoiceCreate).
 */
export function useLineItems(vatRate: number | string) {
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()]);

  function handleItemChange(index: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value, ...(field === 'vatTreatment' && value === 'exempt' ? { vatRate: 0 } : {}) } : item
    ));
  }

  function addItem() {
    setItems(prev => [...prev, emptyLineItem()]);
  }

  function removeItem(index: number) {
    setItems(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const { subtotal, vatAmount, total, breakdown } = calculateInvoiceTax(
    items.map(item => ({ ...item, quantity: Number(item.quantity) || 0, unitPrice: Number(item.unitPrice) || 0 })),
    Number(vatRate) || 0
  );

  return { items, setItems, handleItemChange, addItem, removeItem, subtotal, vatAmount, total, breakdown };
}
