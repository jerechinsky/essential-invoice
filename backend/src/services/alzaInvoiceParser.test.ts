import { describe, expect, it } from 'vitest';
import { extractTextFromPdf, parseAlzaInvoiceText } from './alzaInvoiceParser';

const alzaText = `Faktura - 4021043452
Prodávající: Alza.cz a.s.
Datum vystavení: 03.06.2026
Datum splatnosti: 03.06.2026
Kód Popis Ks Cena ks bez DPH DPH DPH% Cena Záruka
JS029d2 Webkamera Logitech HD Webcam 1 660,33 660,33 138,67 21 799,00 24 AL
d C270
Celkem: 799,00 Kč
Sazba Základ DPH
21 % 660,33 138,67`;

describe('Alza invoice parser', () => {
  it('extracts the requested expense fields', () => {
    expect(parseAlzaInvoiceText(alzaText)).toEqual({
      supplier: 'Alza.cz a.s.',
      supplierIco: '27082440',
      supplierDic: 'CZ27082440',
      supplierAddress: 'Jankovcova 1522/53, 17000 Praha 7',
      supplierInvoiceNumber: '4021043452',
      issueDate: '2026-06-03',
      dueDate: '2026-06-03',
      currency: 'CZK',
      amount: 660.33,
      vatRate: 21,
      vatAmount: 138.67,
      roundingAmount: 0,
      total: 799,
      description: 'Webkamera Logitech HD Webcam C270',
    });
  });

  it('rejects unsupported suppliers', () => {
    expect(() => parseAlzaInvoiceText(alzaText.replace('Alza.cz a.s.', 'Other s.r.o.')))
      .toThrow('Only Alza.cz invoices');
  });

  it('extracts wrapped descriptions from multiple items including a negative discount', () => {
    const multiItemText = `Faktura - 4015374902
Prodávající: Alza.cz a.s.
Datum vystavení: 09.04.2026
Datum splatnosti: 09.04.2026
Kód Popis Ks Cena ks bez DPH DPH DPH% Cena Záruka
APWCB Datový kabel AlzaPower MagCore 2in1 2 230,58 461,16 96,84 21 558,00 36 AlzaP
082d USB-A to Micro USB/USB-C 15W 1m
černý
SL190r Nehmotný produkt Doprava - AlzaBox 1 57,02 57,02 11,98 21 69,00 0 AL
SL083d6 Nehmotný produkt Sleva na dopravné - 1 -57,02 -57,02 -11,98 21 -69,00 0 AL
6 AlzaPlus+
Celkem: 558,00 Kč
Sazba Základ DPH
21 % 461,16 96,84`;

    expect(parseAlzaInvoiceText(multiItemText).description).toBe(
      'Datový kabel AlzaPower MagCore 2in1 USB-A to Micro USB/USB-C 15W 1m černý, ' +
      'Nehmotný produkt Doprava - AlzaBox, Nehmotný produkt Sleva na dopravné - AlzaPlus+'
    );
  });

  it('uses Alza final total including its explicit rounding amount', () => {
    const roundedText = alzaText
      .replace('Celkem: 799,00 Kč', 'Celkem: 800,00 Kč')
      .replace('Sazba Základ DPH', 'Zaokrouhlení: 1,00 Kč\nSazba Základ DPH');

    const parsed = parseAlzaInvoiceText(roundedText);
    expect(parsed.roundingAmount).toBe(1);
    expect(parsed.total).toBe(800);
  });

  it('extracts positioned text through an embedded ToUnicode map', () => {
    const pdf = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Font /ToUnicode 2 0 R >>
endobj
2 0 obj
<< /Length 120 >>
stream
1 beginbfchar
<0041> <0041>
endbfchar
endstream
endobj
3 0 obj
<< /Font << /F0 1 0 R >> >>
endobj
4 0 obj
<< /Length 40 >>
stream
BT /F0 10 Tf 10 20 Td <0041> Tj ET
endstream
endobj
%%EOF`, 'latin1');

    expect(extractTextFromPdf(pdf)).toBe('A');
  });
});
