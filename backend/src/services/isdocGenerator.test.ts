import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildISDOC, xmlEscape } from './isdocGenerator';
import { mixedInvoice } from '../test/fixtures/invoice';

const schema = fileURLToPath(new URL('../test/fixtures/isdoc/isdoc-invoice-6.0.2.xsd', import.meta.url));

describe('ISDOC 6.0.2', () => {
  it.each(['CZK', 'EUR'])('validates mixed VAT %s invoices against the official XSD', currency => {
    const xml = buildISDOC(mixedInvoice(currency));
    expect(() => execFileSync('xmllint', ['--noout', '--nonet', '--schema', schema, '-'], { input: xml, stdio: ['pipe', 'pipe', 'pipe'] })).not.toThrow();
    expect(xml).toContain('<Percent>12</Percent>');
    expect(xml).toContain('<LocalReverseChargeCode>4</LocalReverseChargeCode>');
    expect(xml).toContain('<VATNote>§ 57 zákona o DPH</VATNote>');
    expect(xml).toContain('Vývoj &amp; konzultace &lt;IT&gt;');
    expect(xml).toContain('<TaxPointDate>2026-08-31</TaxPointDate>');
    if (currency === 'EUR') {
      expect(xml).toContain('<ForeignCurrencyCode>EUR</ForeignCurrencyCode>');
      expect(xml).toContain('<CurrRate>24.321</CurrRate>');
      expect(xml).toContain('<PayableAmountCurr>');
    } else expect(xml).not.toContain('AmountCurr>');
  });


  it('includes XML-safe supplier registration and validates it against the official schema', () => {
    const doc = mixedInvoice();
    Object.assign(doc.invoice, { user_company_register_info: 'Zápis <s.r.o.> & soud, oddíl C, vložka 123456' });
    const xml = buildISDOC(doc);
    expect(xml).toContain('<RegisterIdentification><Preformatted>Zápis &lt;s.r.o.&gt; &amp; soud, oddíl C, vložka 123456</Preformatted></RegisterIdentification>');
    expect(xml.split('<RegisterIdentification>')).toHaveLength(2);
    execFileSync('xmllint', ['--noout', '--nonet', '--schema', schema, '-'], { input: xml, stdio: ['pipe', 'pipe', 'pipe'] });
  });

  it('exports non-VAT payers without contradictory taxable lines', () => {
    const doc = mixedInvoice();
    doc.items = [{ ...doc.items[0], quantity: 1, unitPrice: 100, total: 100, vatRate: 0, vatAmount: 0 }];
    Object.assign(doc.invoice, { user_vat_payer: false, subtotal: 100, vat_amount: 0, total: 100 });
    const xml = buildISDOC(doc);
    expect(xml).not.toContain('<VATApplicable>true</VATApplicable>');
    execFileSync('xmllint', ['--noout', '--nonet', '--schema', schema, '-'], { input: xml, stdio: ['pipe', 'pipe', 'pipe'] });
  });

  it('refuses missing exchange rates or inconsistent recorded totals', () => {
    const doc = mixedInvoice('EUR');
    doc.invoice.exchange_rate = null;
    expect(() => buildISDOC(doc)).toThrow('exchange rate is missing');
    const broken = mixedInvoice();
    broken.invoice.vat_amount += 1;
    expect(() => buildISDOC(broken)).toThrow('do not reconcile');
  });

  it('requires the reverse-charge supply code', () => {
    const doc = mixedInvoice();
    doc.items[3].vatCode = '';
    expect(() => buildISDOC(doc)).toThrow('supply code is missing');
  });

  it('escapes XML metacharacters and removes forbidden control bytes', () => {
    expect(xmlEscape('\u0000<&"\'')).toBe('&lt;&amp;&quot;&apos;');
  });
});
