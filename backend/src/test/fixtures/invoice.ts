import { calculateInvoiceTax } from '../../utils/money';

export function mixedInvoice(currency = 'CZK') {
  const calculation = calculateInvoiceTax([
    { quantity: 1.5, unitPrice: 999.99, vatRate: 21 },
    { quantity: 2, unitPrice: 250, vatRate: 12 },
    { quantity: 1, unitPrice: 300, vatTreatment: 'exempt', vatReason: '§ 57 zákona o DPH' },
    { quantity: 1, unitPrice: 1000, vatRate: 21, vatTreatment: 'reverse_charge', vatCode: '4' },
  ], 21);
  return { invoice: {
    id: 'd9cf5194-2136-4cae-8d88-18238278e147', invoice_number: 'FV20260901', variable_symbol: '20260901',
    status: 'sent', currency, issue_date: '2026-09-01', delivery_date: '2026-08-31', due_date: '2026-09-15',
    subtotal: calculation.subtotal, vat_rate: 21, vat_amount: calculation.vatAmount, total: calculation.total,
    exchange_rate: currency === 'EUR' ? 24.321 : null,
    total_czk: currency === 'EUR' ? Math.round(calculation.total * 24.321 * 100) / 100 : null,
    user_name: 'Jan Novák', user_company_name: 'Novák IT', user_address: 'Dlouhá 12, 110 00 Praha',
    user_ico: '87654321', user_dic: 'CZ87654321', user_vat_payer: true,
    user_bank_account: '123456789', user_bank_code: '0800',
    client_name: 'Klient & syn', client_address: 'Krátká 1, 602 00 Brno', client_ico: '12345678', client_dic: 'CZ12345678',
    notes: 'Děkujeme za spolupráci.',
  }, items: calculation.lines.map((line, i) => ({ ...line, vatCode: line.vatCode ?? '', description: ['Vývoj & konzultace <IT>', 'Snížená sazba', 'Osvobozené plnění', 'Stavební práce'][i], unit: 'ks', id: `line-${i}` })) };
}
