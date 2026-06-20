import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { query } from '../db/init';
import { t, formatDateLocale, formatCurrencyLocale } from '../i18n/translations';

// pdfmake is a CJS module – require it
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmake = require('pdfmake/build/pdfmake.js');
const vfsFonts = require('pdfmake/build/vfs_fonts.js');

const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');
const plexVfs: Record<string, string> = {
  'IBMPlexSans-Regular.ttf': fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Regular.ttf')).toString('base64'),
  'IBMPlexSans-Bold.ttf': fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Bold.ttf')).toString('base64'),
  'IBMPlexSans-Italic.ttf': fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-Italic.ttf')).toString('base64'),
  'IBMPlexSans-BoldItalic.ttf': fs.readFileSync(path.join(fontsDir, 'IBMPlexSans-BoldItalic.ttf')).toString('base64'),
};
pdfmake.addVirtualFileSystem({ ...vfsFonts, ...plexVfs });
pdfmake.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
  IBMPlexSans: {
    normal: 'IBMPlexSans-Regular.ttf',
    bold: 'IBMPlexSans-Bold.ttf',
    italics: 'IBMPlexSans-Italic.ttf',
    bolditalics: 'IBMPlexSans-BoldItalic.ttf',
  },
};

import type { TDocumentDefinitions, Content, TableCell, Column } from 'pdfmake/interfaces';

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  variableSymbol: string;
  status: string;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  deliveryDate: Date;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  qrPaymentData: string;
  exchangeRate: number | null;
  totalCzk: number | null;
  // Client info
  clientName: string;
  clientAddress: string;
  clientIco: string;
  clientDic: string;
  // User (supplier) info
  userName: string;
  userCompanyName: string;
  userAddress: string;
  userIco: string;
  userDic: string;
  userVatPayer: boolean;
  userBankAccount: string;
  userBankCode: string;
  userCompanyRegisterInfo: string | null;
  userLogoDataUrl: string | null;
  invoicePdfTemplate: 'classic' | 'minimalistic';
  // Language
  language: string;
  // Items
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }>;
}

function formatCurrency(amount: number, currency: string, locale?: string): string {
  return formatCurrencyLocale(amount, currency, locale);
}

function formatDate(date: Date, locale?: string): string {
  return formatDateLocale(date, locale);
}

async function generateQRCodeDataURL(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: 150,
      margin: 1,
      errorCorrectionLevel: 'M'
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    return '';
  }
}

function getLogoDataUrl(logoData: string | null, logoMimeType: string | null): string | null {
  if (!logoData || !logoMimeType) return null;
  return `data:${logoMimeType};base64,${logoData}`;
}

const TEXT = '#111111';
const LABEL_GRAY = '#6b7280';
const DIVIDER = '#d1d5db';
const STRONG_DIVIDER = '#595959';
const PAGE_HEIGHT_A4 = 841.89;
const FOOTER_SIDE_MARGIN = 40;
const FOOTER_BOTTOM_INSET = 40;
const FOOTER_LINE_HEIGHT = 10.4;
const FOOTER_GAP = 4;
const PARTY_DETAILS_TO_IDS_GAP = 12;
const BLUE = '#2563eb';
const GRAY_BORDER = '#e5e7eb';

function buildClassicDocumentDefinition(invoice: InvoiceData, qrCodeDataUrl: string): TDocumentDefinitions {
  const tr = t(invoice.language).pdf;
  const lang = invoice.language;

  // --- Header section ---
  const headerRight: Content = invoice.userLogoDataUrl
    ? { image: invoice.userLogoDataUrl, width: 150, alignment: 'right' as const }
    : {
        stack: [
          { text: invoice.userCompanyName || invoice.userName, bold: true, fontSize: 13, alignment: 'right' as const },
          ...(invoice.userAddress ? [{ text: invoice.userAddress, color: '#555', alignment: 'right' as const }] : []),
          ...(invoice.userIco ? [{ text: `IČO: ${invoice.userIco}`, color: '#555', alignment: 'right' as const }] : []),
          ...(invoice.userVatPayer && invoice.userDic ? [{ text: `DIČ: ${invoice.userDic}`, color: '#555', alignment: 'right' as const }] : []),
          ...(!invoice.userVatPayer ? [{ text: tr.nonVatPayer, color: '#555', alignment: 'right' as const }] : []),
        ],
      };

  const headerSection: Content = {
    columns: [
      {
        width: '*',
        stack: [
          { text: tr.invoice, fontSize: 26, bold: true, color: BLUE },
          { text: `${tr.invoiceNumberShort} ${invoice.invoiceNumber}`, fontSize: 13, color: '#666', margin: [0, 4, 0, 0] },
        ],
      },
      { width: '*', ...headerRight } as any,
    ],
    margin: [0, 0, 0, 12],
  };

  const headerLine: Content = {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: BLUE }],
    margin: [0, 0, 0, 20],
  };

  function buildPartyStack(title: string, name: string, address: string, ico: string, dic: string, showVatPayer: boolean = false): Column {
    const lines: Content[] = [];
    if (address) lines.push({ text: address, color: '#555' });
    if (ico) lines.push({ text: `IČO: ${ico}`, color: '#555' });
    if (showVatPayer) {
      lines.push({ text: tr.nonVatPayer, color: '#555' });
    } else if (dic) {
      lines.push({ text: `DIČ: ${dic}`, color: '#555' });
    }
    return {
      width: '*',
      stack: [
        { text: title, fontSize: 9, bold: true, color: '#666', margin: [0, 0, 0, 6] },
        { text: name, fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
        ...lines,
      ],
    };
  }

  const partiesSection: Content = {
    columns: [
      buildPartyStack(tr.supplier, invoice.userCompanyName || invoice.userName, invoice.userAddress, invoice.userIco, invoice.userDic, !invoice.userVatPayer),
      buildPartyStack(tr.customer, invoice.clientName, invoice.clientAddress, invoice.clientIco, invoice.clientDic),
    ],
    margin: [0, 0, 0, 18],
  };

  const datesSection: Content = {
    table: {
      widths: ['*', '*'],
      body: [
        [
          { text: tr.issueDate, fontSize: 8, color: '#666', alignment: 'center' as const },
          { text: tr.dueDate, fontSize: 8, color: '#666', alignment: 'center' as const },
        ],
        [
          { text: formatDate(invoice.issueDate, lang), fontSize: 11, bold: true, alignment: 'center' as const },
          { text: formatDate(invoice.dueDate, lang), fontSize: 11, bold: true, alignment: 'center' as const },
        ],
      ],
    },
    layout: {
      fillColor: () => '#f8fafc',
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
    margin: [0, 0, 0, 18],
  };

  const showUnitColumns = invoice.items.some(item => item.unit && item.unit.trim() !== '');
  const itemsHeaderRow: TableCell[] = showUnitColumns
    ? [
        { text: tr.description, style: 'tableHeader' },
        { text: tr.quantity, style: 'tableHeader', alignment: 'right' },
        { text: tr.unitPrice, style: 'tableHeader', alignment: 'right' },
        { text: tr.total, style: 'tableHeader', alignment: 'right' },
      ]
    : [
        { text: tr.description, style: 'tableHeader' },
        { text: tr.total, style: 'tableHeader', alignment: 'right' },
      ];

  const itemRows: TableCell[][] = invoice.items.map(item => showUnitColumns
    ? [
        { text: item.description },
        { text: `${item.quantity}${item.unit ? ' ' + item.unit : ''}`, alignment: 'right' as const },
        { text: formatCurrency(item.unitPrice, invoice.currency, lang), alignment: 'right' as const },
        { text: formatCurrency(item.total, invoice.currency, lang), alignment: 'right' as const },
      ]
    : [
        { text: item.description },
        { text: formatCurrency(item.total, invoice.currency, lang), alignment: 'right' as const },
      ]);

  const itemsSection: Content = {
    table: {
      headerRows: 1,
      widths: showUnitColumns ? ['*', 'auto', 'auto', 'auto'] : ['*', 'auto'],
      body: [itemsHeaderRow, ...itemRows],
    },
    layout: {
      fillColor: (rowIndex: number) => (rowIndex === 0 ? BLUE : null),
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 ? 0 : 1),
      vLineWidth: () => 0,
      hLineColor: () => GRAY_BORDER,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
    margin: [0, 0, 0, 18],
  };

  const totalsRows: any[] = [
    [
      { text: tr.subtotal },
      { text: formatCurrency(invoice.subtotal, invoice.currency, lang), alignment: 'right' as const },
    ],
  ];

  if (invoice.vatRate > 0) {
    totalsRows.push([
      { text: `${tr.vat} (${invoice.vatRate}%):` },
      { text: formatCurrency(invoice.vatAmount, invoice.currency, lang), alignment: 'right' as const },
    ]);
  }

  totalsRows.push([
    { text: tr.totalDue, bold: true, fontSize: 14, color: BLUE, margin: [0, 8, 0, 0] as [number, number, number, number] },
    { text: formatCurrency(invoice.total, invoice.currency, lang), bold: true, fontSize: 14, color: BLUE, alignment: 'right' as const, margin: [0, 8, 0, 0] as [number, number, number, number] },
  ]);

  if (invoice.currency === 'EUR' && invoice.exchangeRate && invoice.totalCzk) {
    totalsRows.push([
      { text: `${tr.exchangeRate} ${invoice.exchangeRate.toFixed(4)} CZK/EUR`, fontSize: 8, color: '#666' },
      { text: '', alignment: 'right' as const },
    ]);
    totalsRows.push([
      { text: tr.czkEquivalent, color: '#666' },
      { text: formatCurrency(invoice.totalCzk, 'CZK', lang), color: '#666', alignment: 'right' as const },
    ]);
  }

  const totalsTable: Column = {
    width: 250,
    table: {
      widths: ['*', 'auto'],
      body: totalsRows,
    },
    layout: {
      hLineWidth: (i: number) => (i > 0 && i < totalsRows.length ? 1 : 0),
      vLineWidth: () => 0,
      hLineColor: () => GRAY_BORDER,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
  };

  const totalsSection: Content = {
    columns: [
      { width: '*', text: '' },
      totalsTable,
    ],
    margin: [0, 0, 0, 16],
  };

  const paymentRows: Content[] = [
    {
      columns: [
        { width: 110, text: tr.accountNumber, color: '#666' },
        { width: '*', text: `${invoice.userBankAccount}/${invoice.userBankCode}`, bold: true },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      columns: [
        { width: 110, text: tr.variableSymbol, color: '#666' },
        { width: '*', text: invoice.variableSymbol, bold: true },
      ],
      margin: [0, 0, 0, 4],
    },
    {
      columns: [
        { width: 110, text: tr.amount, color: '#666' },
        { width: '*', text: formatCurrency(invoice.total, invoice.currency, lang), bold: true },
      ],
    },
  ];

  const paymentColumns: Column[] = [
    {
      width: '*',
      stack: [
        { text: tr.paymentDetails, fontSize: 12, bold: true, color: '#0369a1', margin: [0, 0, 0, 10] },
        ...paymentRows,
      ],
    },
  ];

  if (qrCodeDataUrl && invoice.currency === 'CZK') {
    paymentColumns.push({
      width: 'auto',
      stack: [
        { image: qrCodeDataUrl, width: 100, alignment: 'center' as const },
        { text: tr.qrPayment, fontSize: 8, color: '#666', alignment: 'center' as const, margin: [0, 4, 0, 0] },
      ],
    });
  }

  const paymentSection: Content = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            columns: paymentColumns,
            columnGap: 15,
          },
        ],
      ],
    },
    layout: {
      fillColor: () => '#f0f9ff',
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => '#bae6fd',
      vLineColor: () => '#bae6fd',
      paddingTop: () => 12,
      paddingBottom: () => 12,
      paddingLeft: () => 14,
      paddingRight: () => 14,
    },
    margin: [0, 0, 0, 0],
  };

  const notesSection: Content | null = invoice.notes
    ? {
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: tr.notes, bold: true, margin: [0, 0, 0, 4] },
              { text: invoice.notes },
            ],
          }]],
        },
        layout: {
          fillColor: () => '#fefce8',
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#fde047',
          vLineColor: () => '#fde047',
          paddingTop: () => 10,
          paddingBottom: () => 10,
          paddingLeft: () => 12,
          paddingRight: () => 12,
        },
        margin: [0, 16, 0, 0],
      }
    : null;

  const footerLine: Content = {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: GRAY_BORDER }],
    margin: [0, 20, 0, 10],
  };

  const footerText: Content = {
    text: `${tr.issuedOn} ${formatDate(new Date(), lang)} | ${tr.invoice} ${tr.invoiceNumberShort} ${invoice.invoiceNumber}`,
    alignment: 'center',
    color: '#666',
    fontSize: 8,
  };

  const footerRegisterInfo: Content | null = invoice.userCompanyRegisterInfo
    ? {
        text: invoice.userCompanyRegisterInfo,
        alignment: 'center',
        color: '#666',
        fontSize: 8,
        margin: [0, 4, 0, 0],
      }
    : null;

  const content: Content[] = [
    headerSection,
    headerLine,
    partiesSection,
    datesSection,
    itemsSection,
    totalsSection,
    paymentSection,
  ];

  if (notesSection) content.push(notesSection);
  content.push(footerLine);
  content.push(footerText);
  if (footerRegisterInfo) content.push(footerRegisterInfo);

  return {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 30],
    content,
    styles: {
      tableHeader: {
        color: 'white',
        bold: true,
        fontSize: 9,
      },
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.3,
    },
  };
}

function buildMinimalisticDocumentDefinition(invoice: InvoiceData, qrCodeDataUrl: string): TDocumentDefinitions {
  const tr = t(invoice.language).pdf;
  const lang = invoice.language;

  // Short gray dash used as a Fakturoid-style section marker
  const sectionDash = (): Content => ({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 16, y2: 0, lineWidth: 1, lineColor: LABEL_GRAY }],
    margin: [0, 0, 0, 6],
  });

  // Label (gray, left) + value (right-aligned) row
  const labelValueRow = (label: string, value: string): Content => ({
    columns: [
      { width: '*', text: label, color: LABEL_GRAY, lineHeight: 1.0 },
      { width: 'auto', text: value, alignment: 'right' as const, color: TEXT, lineHeight: 1.0 },
    ],
    margin: [0, 0, 0, 1.5],
  });

  // Blank vertical gap
  const gap = (size: number): Content => ({ text: '', margin: [0, size, 0, 0] });

  // --- Header section ---
  const headerLeft: Content = invoice.userLogoDataUrl
    ? { image: invoice.userLogoDataUrl, width: 140 }
    : { text: '' };

  const headerRight: Content = {
    stack: [
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 242.5, y2: 0, lineWidth: 1.5, lineColor: STRONG_DIVIDER }],
        margin: [0, 0, 0, 10],
      },
      {
        text: [
          { text: `${tr.invoice} `, fontSize: 18, bold: true, color: '#000000' },
          { text: invoice.invoiceNumber, fontSize: 18, bold: true, color: '#5E5E5E' },
        ],
        alignment: 'left',
      },
      { text: tr.taxDocument, fontSize: 8, color: LABEL_GRAY, alignment: 'left', margin: [0, 3, 0, 0] },
    ],
  };

  const headerSection: Content = {
    columns: [
      { width: '*', stack: [headerLeft] },
      { width: 30, text: '' },
      { width: '*', stack: [headerRight] },
    ],
    margin: [0, 0, 0, 22],
  };

  // --- Parties & info section (aligned 3-col table) ---
  const empty: Content = { text: '' };

  // Header pair (dash + label)
  const partiesHeader: [Content, Content] = [
    { stack: [sectionDash(), { text: tr.supplier, fontSize: 8, color: LABEL_GRAY, lineHeight: 1.0 }] },
    { stack: [sectionDash(), { text: tr.customer, fontSize: 8, color: LABEL_GRAY, lineHeight: 1.0 }] },
  ];

  // Name + address pair (variable height, but both sides occupy max → next rows align)
  const supplierNameAddr: Content[] = [
    { text: invoice.userCompanyName || invoice.userName, bold: true, fontSize: 10, lineHeight: 1.0, color: TEXT, margin: [0, 8, 0, 2] },
  ];
  if (invoice.userAddress) supplierNameAddr.push({ text: invoice.userAddress, color: TEXT, lineHeight: 1.0 });
  const customerNameAddr: Content[] = [
    { text: invoice.clientName, bold: true, fontSize: 10, lineHeight: 1.0, color: TEXT, margin: [0, 8, 0, 2] },
  ];
  if (invoice.clientAddress) customerNameAddr.push({ text: invoice.clientAddress, color: TEXT, lineHeight: 1.0 });

  // IČO + DIČ pairs (always render both rows on both sides — pad with empty)
  const supplierIcoCell: Content = invoice.userIco ? labelValueRow('IČO', invoice.userIco) : empty;
  const customerIcoCell: Content = invoice.clientIco ? labelValueRow('IČO', invoice.clientIco) : empty;

  let supplierDicCell: Content = empty;
  if (invoice.userVatPayer && invoice.userDic) supplierDicCell = labelValueRow('DIČ', invoice.userDic);
  else if (!invoice.userVatPayer) supplierDicCell = labelValueRow('DIČ', tr.nonVatPayer);
  const customerDicCell: Content = invoice.clientDic ? labelValueRow('DIČ', invoice.clientDic) : empty;

  // Pay info (left) vs dates (right) — pad to same length for row alignment
  const supplierPayRows: Content[] = [];
  if (invoice.userBankAccount) {
    supplierPayRows.push(labelValueRow(tr.bankAccount, `${invoice.userBankAccount}/${invoice.userBankCode}`));
  }
  supplierPayRows.push(labelValueRow(tr.variableSymbol, invoice.variableSymbol));
  supplierPayRows.push(labelValueRow(tr.paymentMethod, tr.paymentMethodTransfer));

  const customerDateRows: Content[] = [
    labelValueRow(tr.issueDate, formatDate(invoice.issueDate, lang)),
    labelValueRow(tr.dueDate, formatDate(invoice.dueDate, lang)),
  ];
  if (invoice.deliveryDate) {
    customerDateRows.push(labelValueRow(tr.deliveryDate, formatDate(invoice.deliveryDate, lang)));
  }

  const maxPayRows = Math.max(supplierPayRows.length, customerDateRows.length);
  while (supplierPayRows.length < maxPayRows) supplierPayRows.push(empty);
  while (customerDateRows.length < maxPayRows) customerDateRows.push(empty);

  // Assemble all paired rows. Using stack margin (rather than gap rows) so a
  // multi-line address on either side actually pushes the IČO/DIČ rows down.
  const pairedRows: Array<[Content, Content]> = [
    partiesHeader,
    [
      { stack: supplierNameAddr },
      { stack: customerNameAddr },
    ],
    [gap(PARTY_DETAILS_TO_IDS_GAP), gap(PARTY_DETAILS_TO_IDS_GAP)],
    [supplierIcoCell, customerIcoCell],
    [supplierDicCell, customerDicCell],
    [gap(14), gap(14)],
  ];
  for (let i = 0; i < maxPayRows; i++) {
    pairedRows.push([supplierPayRows[i], customerDateRows[i]]);
  }

  const partiesBody: TableCell[][] = pairedRows.map(([left, right]) => [left, '', right]);

  const partiesSection: Content = {
    table: {
      widths: ['*', 30, '*'],
      body: partiesBody,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 20],
  };

  // --- Items table ---
  const showUnitColumns = invoice.items.some(item => item.unit && item.unit.trim() !== '');
  const showVat = invoice.vatRate > 0;

  type ItemColumn = 'description' | 'quantity' | 'vat' | 'price';
  const itemsColumns: ItemColumn[] = ['description'];
  if (showUnitColumns) itemsColumns.push('quantity');
  if (showVat) itemsColumns.push('vat');
  itemsColumns.push('price');

  const itemsHeaderRow: TableCell[] = itemsColumns.map(col => {
    const base = { fontSize: 8, color: LABEL_GRAY, lineHeight: 1.0 } as const;
    switch (col) {
      case 'description': return { text: '', ...base };
      case 'quantity': return { text: tr.quantity.toUpperCase(), ...base, alignment: 'right' as const };
      case 'vat': return { text: tr.vat, ...base, alignment: 'right' as const };
      case 'price': return { text: tr.priceLabel, ...base, alignment: 'right' as const };
    }
  });

  const itemsWidths: Array<string | number> = itemsColumns.map(col => col === 'description' ? '*' : 'auto');

  const itemRows: TableCell[][] = invoice.items.map(item => itemsColumns.map(col => {
    switch (col) {
      case 'description': return { text: item.description, color: TEXT, lineHeight: 1.0 };
      case 'quantity': return { text: `${item.quantity}${item.unit ? ' ' + item.unit : ''}`, alignment: 'right' as const, color: TEXT, lineHeight: 1.0 };
      case 'vat': return { text: `${invoice.vatRate} %`, alignment: 'right' as const, color: TEXT, lineHeight: 1.0 };
      case 'price': return { text: formatCurrency(item.total, invoice.currency, lang), alignment: 'right' as const, color: TEXT, lineHeight: 1.0 };
    }
  }));

  const itemsSection: Content = {
    table: {
      headerRows: 1,
      widths: itemsWidths,
      body: [itemsHeaderRow, ...itemRows],
    },
    layout: {
      hLineWidth: (i: number, node: any) => {
        if (i === 1) return 1; // below header
        if (i === node.table.body.length) return 1; // below last row
        return 0;
      },
      vLineWidth: () => 0,
      hLineColor: () => DIVIDER,
      paddingTop: (i: number) => i === 0 ? 0 : 4,
      paddingBottom: () => 4,
      paddingLeft: (i: number) => i === 0 ? 0 : 14,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 18],
  };

  // --- QR + totals row ---
  const totalsStack: Content[] = [
    {
      columns: [
        { width: '*', text: tr.subtotal, color: LABEL_GRAY },
        { width: 'auto', text: formatCurrency(invoice.subtotal, invoice.currency, lang), alignment: 'right' as const, color: TEXT },
      ],
      margin: [0, 0, 0, 4],
    },
  ];
  if (showVat) {
    totalsStack.push({
      columns: [
        { width: '*', text: `${tr.vat} ${invoice.vatRate} %`, color: LABEL_GRAY },
        { width: 'auto', text: formatCurrency(invoice.vatAmount, invoice.currency, lang), alignment: 'right' as const, color: TEXT },
      ],
      margin: [0, 0, 0, 6],
    });
  }
  totalsStack.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 355, y2: 0, lineWidth: 1.5, lineColor: STRONG_DIVIDER }],
    margin: [0, 0, 0, 6],
  });
  totalsStack.push({
    columns: [
      { width: '*', text: '' },
      { width: 'auto', text: formatCurrency(invoice.total, invoice.currency, lang), alignment: 'right' as const, bold: true, fontSize: 18, color: TEXT },
    ],
  });
  if (invoice.currency === 'EUR' && invoice.exchangeRate && invoice.totalCzk) {
    totalsStack.push({
      columns: [
        { width: '*', text: `${tr.exchangeRate} ${invoice.exchangeRate.toFixed(4)} CZK/EUR`, fontSize: 8, color: LABEL_GRAY },
        { width: 'auto', text: '', alignment: 'right' as const },
      ],
      margin: [0, 8, 0, 0],
    });
    totalsStack.push({
      columns: [
        { width: '*', text: tr.czkEquivalent, fontSize: 9, color: LABEL_GRAY },
        { width: 'auto', text: formatCurrency(invoice.totalCzk, 'CZK', lang), fontSize: 9, color: LABEL_GRAY, alignment: 'right' as const },
      ],
      margin: [0, 2, 0, 0],
    });
  }

  const qrStack: Content = qrCodeDataUrl && invoice.currency === 'CZK'
    ? {
        stack: [
          {
            table: {
              widths: [84],
              body: [[{ image: qrCodeDataUrl, width: 84, height: 84 }]],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => DIVIDER,
              vLineColor: () => DIVIDER,
              paddingTop: () => 11,
              paddingBottom: () => 11,
              paddingLeft: () => 11,
              paddingRight: () => 11,
            },
          },
          { text: tr.qrPayment, fontSize: 8, color: LABEL_GRAY },
        ],
      }
    : { text: '' };

  const qrTotalsSection: Content = {
    columns: [
      { width: 130, stack: [qrStack] },
      { width: '*', stack: totalsStack },
    ],
    columnGap: 30,
    margin: [0, 0, 0, 24],
  };

  // --- Notes section (plain, no box) ---
  const notesSection: Content | null = invoice.notes
    ? {
        stack: [
          sectionDash(),
          { text: tr.notes, fontSize: 9, color: LABEL_GRAY, margin: [0, 0, 0, 6] },
          { text: invoice.notes, color: TEXT },
        ],
        margin: [0, 16, 0, 0],
      }
    : null;

  // --- Assemble document ---
  const content: Content[] = [
    headerSection,
    partiesSection,
    itemsSection,
    qrTotalsSection,
  ];
  if (notesSection) content.push(notesSection);

  // Page-anchored footer (bottom-left): registry text if configured,
  // otherwise keep the generated-on fallback.
  const footerLines: Content[] = invoice.userCompanyRegisterInfo
    ? [{ text: invoice.userCompanyRegisterInfo, fontSize: 8, color: LABEL_GRAY }]
    : [{ text: `${tr.issuedOn} ${formatDate(new Date(), lang)}`, fontSize: 8, color: LABEL_GRAY }];

  const footerHeight = footerLines.reduce<number>((height, _line, index) => {
    if (index === 0) return FOOTER_LINE_HEIGHT;
    return height + FOOTER_GAP + FOOTER_LINE_HEIGHT;
  }, 0);
  const footerY = PAGE_HEIGHT_A4 - FOOTER_BOTTOM_INSET - footerHeight;

  return {
    pageSize: 'A4',
    // top, left, bottom, right? pdfmake order: [left, top, right, bottom]
    pageMargins: [40, 40, 40, 70],
    content,
    background: () => ({
      stack: footerLines,
      absolutePosition: { x: FOOTER_SIDE_MARGIN, y: footerY },
    }),
    defaultStyle: {
      font: 'IBMPlexSans',
      fontSize: 10,
      lineHeight: 1.0,
      color: TEXT,
    },
  };
}

export const __test__ = {
  buildClassicDocumentDefinition,
  buildMinimalisticDocumentDefinition,
};

export async function generateInvoicePDF(invoiceId: string, userId: string): Promise<Buffer> {
  // Fetch invoice data
  const invoiceResult = await query(`
    SELECT i.*,
      c.company_name as client_name, c.address as client_address,
      c.ico as client_ico, c.dic as client_dic,
      u.name as user_name, u.company_name as user_company_name,
      u.company_address as user_address, u.company_ico as user_ico,
      u.company_dic as user_dic, u.vat_payer as user_vat_payer,
      u.company_register_info as user_company_register_info,
      u.bank_account as user_bank_account,
      u.bank_code as user_bank_code, u.language as user_language,
      u.logo_data as user_logo_data, u.logo_mime_type as user_logo_mime_type,
      s.invoice_pdf_template as invoice_pdf_template
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    JOIN users u ON i.user_id = u.id
    LEFT JOIN settings s ON s.user_id = u.id
    WHERE i.id = $1 AND i.user_id = $2
  `, [invoiceId, userId]);

  if (invoiceResult.rows.length === 0) {
    throw new Error('Invoice not found');
  }

  const row = invoiceResult.rows[0];

  // Fetch invoice items
  const itemsResult = await query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order ASC',
    [invoiceId]
  );

  // Get logo as data URL if exists
  const userLogoDataUrl = getLogoDataUrl(row.user_logo_data, row.user_logo_mime_type);

  const invoiceData: InvoiceData = {
    id: row.id,
    invoiceNumber: row.invoice_number,
    variableSymbol: row.variable_symbol,
    status: row.status,
    currency: row.currency,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    deliveryDate: row.delivery_date,
    subtotal: parseFloat(row.subtotal),
    vatRate: parseFloat(row.vat_rate),
    vatAmount: parseFloat(row.vat_amount),
    total: parseFloat(row.total),
    notes: row.notes,
    qrPaymentData: row.qr_payment_data,
    exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : null,
    totalCzk: row.total_czk ? parseFloat(row.total_czk) : null,
    clientName: row.client_name,
    clientAddress: row.client_address,
    clientIco: row.client_ico,
    clientDic: row.client_dic,
    userName: row.user_name,
    userCompanyName: row.user_company_name,
    userAddress: row.user_address,
    userIco: row.user_ico,
    userDic: row.user_dic,
    userVatPayer: row.user_vat_payer !== false, // Default to true if null
    userBankAccount: row.user_bank_account,
    userBankCode: row.user_bank_code,
    userCompanyRegisterInfo: row.user_company_register_info,
    invoicePdfTemplate: row.invoice_pdf_template === 'minimalistic' ? 'minimalistic' : 'classic',
    language: row.user_language || 'cs',
    userLogoDataUrl,
    items: itemsResult.rows.map(item => ({
      description: item.description,
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      unitPrice: parseFloat(item.unit_price),
      total: parseFloat(item.total)
    }))
  };

  // Generate QR code for CZK invoices
  let qrCodeDataUrl = '';
  if (invoiceData.qrPaymentData && invoiceData.currency === 'CZK') {
    qrCodeDataUrl = await generateQRCodeDataURL(invoiceData.qrPaymentData);
  }

  const docDefinition = invoiceData.invoicePdfTemplate === 'minimalistic'
    ? buildMinimalisticDocumentDefinition(invoiceData, qrCodeDataUrl)
    : buildClassicDocumentDefinition(invoiceData, qrCodeDataUrl);

  // Generate PDF buffer (pdfmake 0.3+ returns a Promise from getBuffer)
  const pdf = pdfmake.createPdf(docDefinition);
  const buffer: Uint8Array = await pdf.getBuffer();
  return Buffer.from(buffer);
}
