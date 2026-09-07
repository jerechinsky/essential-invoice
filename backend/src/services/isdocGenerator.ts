import { roundMoney, summarizeStoredTax } from '../utils/money';
import { documentDate, ExportError, loadInvoiceDocument } from './invoiceDocument';

export function xmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
const element = (name: string, value: unknown) => `<${name}>${xmlEscape(value)}</${name}>`;
const money = (name: string, value: number) => element(name, roundMoney(value).toFixed(2));

// The app stores a free-form address. Preserve it in StreetName and leave
// unavailable structured fields empty instead of inventing a city/country.
function party(name: string, address: string, ico: string, dic: string) {
  return `<Party><PartyIdentification>${element('ID', ico)}</PartyIdentification>
    <PartyName>${element('Name', name)}</PartyName><PostalAddress>
    ${element('StreetName', address)}<BuildingNumber/><CityName/><PostalZone/>
    <Country><IdentificationCode/><Name/></Country></PostalAddress>
    ${dic ? `<PartyTaxScheme>${element('CompanyID', dic)}<TaxScheme>VAT</TaxScheme></PartyTaxScheme>` : ''}</Party>`;
}

export function buildISDOC({ invoice: row, items }: Awaited<ReturnType<typeof loadInvoiceDocument>>): string {
  const foreign = row.currency === 'EUR';
  const rate = foreign ? Number(row.exchange_rate) : 1;
  if (!Number.isFinite(rate) || rate <= 0) throw new ExportError(`Invoice ${row.invoice_number}: EUR exchange rate is missing`);
  if (!items.length) throw new ExportError(`Invoice ${row.invoice_number}: no line items`);
  const groups = summarizeStoredTax(items, Number(row.vat_rate));
  const subtotal = roundMoney(groups.reduce((sum, g) => sum + g.base, 0));
  const tax = roundMoney(groups.reduce((sum, g) => sum + g.vatAmount, 0));
  const total = roundMoney(subtotal + tax);
  if (![subtotal, tax, total].every(Number.isFinite) || subtotal !== Number(row.subtotal) || tax !== Number(row.vat_amount) || total !== Number(row.total)) {
    throw new ExportError(`Invoice ${row.invoice_number}: stored totals do not reconcile with its lines`);
  }
  const vatApplicable = row.user_vat_payer === true || tax > 0 || items.some(item => item.vatTreatment !== 'standard');
  const applicable = (treatment: string) => vatApplicable && treatment !== 'exempt';
  const local = (value: number) => roundMoney(value * rate);
  // Allocate conversion rounding across lines; group and document CZK totals
  // are sums of the converted lines. PayableRoundingAmount reconciles the
  // stored total_czk when conversion of the grand total differs by a cent.
  const converted = items.map(item => ({ base: local(item.total), tax: local(item.vatAmount) }));
  const localBase = roundMoney(converted.reduce((sum, line) => sum + line.base, 0));
  const localTax = roundMoney(converted.reduce((sum, line) => sum + line.tax, 0));
  const localTotal = roundMoney(localBase + localTax);
  const payable = foreign ? Number(row.total_czk ?? local(total)) : total;
  if (!Number.isFinite(payable)) throw new ExportError('Invalid CZK total');
  const pair = (name: string, value: number, localValue: number, currFirst = false) => {
    const a = money(name, localValue), b = foreign ? money(`${name}Curr`, value) : '';
    return currFirst ? b + a : a + b;
  };
  const lines = items.map((item, index) => {
    const isReverse = item.vatTreatment === 'reverse_charge';
    if (isReverse && !item.vatCode) throw new ExportError(`Invoice ${row.invoice_number}: reverse-charge supply code is missing`);
    if (item.vatTreatment === 'exempt' && !item.vatReason) throw new ExportError(`Invoice ${row.invoice_number}: exemption reason is missing`);
    const note = isReverse ? `Daň odvede zákazník. ${item.vatReason}`.trim() : item.vatReason;
    const c = converted[index];
    return `<InvoiceLine>${element('ID', index + 1)}
      <InvoicedQuantity unitCode="${xmlEscape(item.unit)}">${Number(item.quantity)}</InvoicedQuantity>
      ${pair('LineExtensionAmount', item.total, c.base, true)}
      ${pair('LineExtensionAmountTaxInclusive', roundMoney(item.total + item.vatAmount), roundMoney(c.base + c.tax), true)}
      ${money('LineExtensionTaxAmount', c.tax)}${money('UnitPrice', local(item.unitPrice))}
      ${money('UnitPriceTaxInclusive', local(item.unitPrice * (item.vatTreatment === 'standard' ? 1 + item.vatRate / 100 : 1)))}
      <ClassifiedTaxCategory>${element('Percent', item.vatRate)}<VATCalculationMethod>0</VATCalculationMethod>
      ${element('VATApplicable', applicable(item.vatTreatment))}
      ${isReverse ? `<LocalReverseCharge>${element('LocalReverseChargeCode', item.vatCode)}</LocalReverseCharge>` : ''}
      </ClassifiedTaxCategory>${note ? element('VATNote', note) : ''}
      <Item>${element('Description', item.description)}</Item></InvoiceLine>`;
  }).join('\n');
  const taxGroups = groups.map(group => {
    let baseCzk = 0, taxCzk = 0;
    items.forEach((item, index) => {
      if (item.vatRate === group.vatRate && item.vatTreatment === group.vatTreatment) {
        baseCzk = roundMoney(baseCzk + converted[index].base);
        taxCzk = roundMoney(taxCzk + converted[index].tax);
      }
    });
    const incl = roundMoney(group.base + group.vatAmount), inclCzk = roundMoney(baseCzk + taxCzk);
    return `<TaxSubTotal>${pair('TaxableAmount', group.base, baseCzk, true)}
      ${pair('TaxAmount', group.vatAmount, taxCzk, true)}${pair('TaxInclusiveAmount', incl, inclCzk, true)}
      ${pair('AlreadyClaimedTaxableAmount', 0, 0, true)}${pair('AlreadyClaimedTaxAmount', 0, 0, true)}${pair('AlreadyClaimedTaxInclusiveAmount', 0, 0, true)}
      ${pair('DifferenceTaxableAmount', group.base, baseCzk, true)}${pair('DifferenceTaxAmount', group.vatAmount, taxCzk, true)}${pair('DifferenceTaxInclusiveAmount', incl, inclCzk, true)}
      <TaxCategory>${element('Percent', group.vatRate)}<TaxScheme>VAT</TaxScheme>${element('VATApplicable', applicable(group.vatTreatment))}
      ${element('LocalReverseChargeFlag', group.vatTreatment === 'reverse_charge')}</TaxCategory></TaxSubTotal>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>1</DocumentType>${element('ID', row.invoice_number)}${element('UUID', row.id)}
  <IssuingSystem>Essential Invoice</IssuingSystem>${element('IssueDate', documentDate(row.issue_date))}
  ${element('TaxPointDate', documentDate(row.delivery_date || row.issue_date))}${element('VATApplicable', vatApplicable)}
  <ElectronicPossibilityAgreementReference/>${row.notes ? element('Note', row.notes) : ''}
  <LocalCurrencyCode>CZK</LocalCurrencyCode>${foreign ? '<ForeignCurrencyCode>EUR</ForeignCurrencyCode>' : ''}
  ${element('CurrRate', rate)}<RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty>${party(row.user_company_name || row.user_name, row.user_address, row.user_ico, row.user_dic)}</AccountingSupplierParty>
  <AccountingCustomerParty>${party(row.client_name, row.client_address, row.client_ico, row.client_dic)}</AccountingCustomerParty>
  <InvoiceLines>${lines}</InvoiceLines><TaxTotal>${taxGroups}${foreign ? money('TaxAmountCurr', tax) : ''}${money('TaxAmount', localTax)}</TaxTotal>
  <LegalMonetaryTotal>${pair('TaxExclusiveAmount', subtotal, localBase)}${pair('TaxInclusiveAmount', total, localTotal)}
    ${pair('AlreadyClaimedTaxExclusiveAmount', 0, 0)}${pair('AlreadyClaimedTaxInclusiveAmount', 0, 0)}
    ${pair('DifferenceTaxExclusiveAmount', subtotal, localBase)}${pair('DifferenceTaxInclusiveAmount', total, localTotal)}
    ${pair('PayableRoundingAmount', 0, roundMoney(payable - localTotal))}${pair('PaidDepositsAmount', 0, 0)}${pair('PayableAmount', total, payable)}
  </LegalMonetaryTotal>
  <PaymentMeans><Payment>${money('PaidAmount', foreign ? total : payable)}<PaymentMeansCode>42</PaymentMeansCode>
    <Details>${element('PaymentDueDate', documentDate(row.due_date))}${element('ID', row.user_bank_account)}${element('BankCode', row.user_bank_code)}
    <Name/><IBAN/><BIC/>${element('VariableSymbol', row.variable_symbol)}</Details>
  </Payment></PaymentMeans>
</Invoice>`;
}

export async function generateISDOC(invoiceId: string, userId: string) {
  const document = await loadInvoiceDocument(invoiceId, userId);
  return { xml: buildISDOC(document), invoiceNumber: document.invoice.invoice_number };
}
