import { inflateSync } from 'node:zlib';

export interface ParsedAlzaInvoice {
  supplier: 'Alza.cz a.s.';
  supplierIco: '27082440';
  supplierDic: 'CZ27082440';
  supplierAddress: 'Jankovcova 1522/53, 17000 Praha 7';
  supplierInvoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: 'CZK';
  amount: number;
  vatRate: number;
  vatAmount: number;
  roundingAmount: number;
  total: number;
  description: string;
}

interface PdfObject {
  id: number;
  source: string;
  stream?: Buffer;
}

function readPdfObjects(pdf: Buffer): PdfObject[] {
  const source = pdf.toString('latin1');
  const starts = [...source.matchAll(/(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/g)];

  return starts.flatMap((match, index) => {
    const objectStart = match.index! + match[0].indexOf(match[1]);
    const objectEnd = index + 1 < starts.length ? starts[index + 1].index! : source.length;
    const objectSource = source.slice(objectStart, objectEnd);
    const streamMarker = objectSource.match(/stream\r?\n/);
    let stream: Buffer | undefined;

    if (streamMarker?.index !== undefined) {
      const streamStart = objectStart + streamMarker.index + streamMarker[0].length;
      const relativeEnd = objectSource.lastIndexOf('endstream');
      if (relativeEnd > streamMarker.index) {
        const rawStream = pdf.subarray(streamStart, objectStart + relativeEnd);
        try {
          stream = /\/FlateDecode\b/.test(objectSource)
            ? inflateSync(rawStream, { maxOutputLength: 10 * 1024 * 1024 })
            : rawStream;
        } catch {
          // Unsupported or malformed streams are ignored. Required text is validated later.
        }
      }
    }

    return [{ id: Number(match[1]), source: objectSource, stream }];
  });
}

function unicodeFromHex(hex: string): string {
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length % 2 !== 0) return '';
  let result = '';
  for (let i = 0; i < bytes.length; i += 2) {
    result += String.fromCharCode(bytes.readUInt16BE(i));
  }
  return result;
}

function parseCMap(source: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const match of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(match[1].toUpperCase(), unicodeFromHex(match[2]));
    }
  }

  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const match of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const start = parseInt(match[1], 16);
      const end = parseInt(match[2], 16);
      const unicodeStart = parseInt(match[3], 16);
      const width = match[1].length;
      for (let code = start; code <= end; code += 1) {
        map.set(code.toString(16).toUpperCase().padStart(width, '0'), String.fromCodePoint(unicodeStart + code - start));
      }
    }
  }

  return map;
}

function decodeHexText(hex: string, cmap: Map<string, string>): string {
  const widths = [...new Set([...cmap.keys()].map(key => key.length))].sort((a, b) => b - a);
  let result = '';
  let offset = 0;

  while (offset < hex.length) {
    const width = widths.find(candidate => cmap.has(hex.slice(offset, offset + candidate).toUpperCase()));
    if (!width) {
      offset += widths.at(-1) ?? 2;
      continue;
    }
    result += cmap.get(hex.slice(offset, offset + width).toUpperCase());
    offset += width;
  }

  return result;
}

export function extractTextFromPdf(pdf: Buffer): string {
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('The uploaded file is not a PDF');
  }

  const objects = readPdfObjects(pdf);
  const byId = new Map(objects.map(object => [object.id, object]));
  const fontCMaps = new Map<string, Map<string, string>>();

  for (const object of objects) {
    for (const font of object.source.matchAll(/\/(F\d+)\s+(\d+)\s+\d+\s+R/g)) {
      const fontObject = byId.get(Number(font[2]));
      const toUnicodeId = fontObject?.source.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1];
      const cmapStream = toUnicodeId ? byId.get(Number(toUnicodeId))?.stream : undefined;
      if (cmapStream) fontCMaps.set(font[1], parseCMap(cmapStream.toString('latin1')));
    }
  }

  const lines: string[] = [];
  for (const object of objects) {
    const content = object.stream?.toString('latin1');
    if (!content?.includes('BT') || !content.includes('Tj')) continue;

    const blocks: Array<{ x: number; y: number; text: string }> = [];
    for (const textBlock of content.matchAll(/BT([\s\S]*?)ET/g)) {
      const fontName = textBlock[1].match(/\/(F\d+)\s+[\d.]+\s+Tf/)?.[1];
      const position = textBlock[1].match(/(-?[\d.]+)\s+(-?[\d.]+)\s+Td/);
      const cmap = fontName ? fontCMaps.get(fontName) : undefined;
      if (!cmap || !position) continue;

      const fragments: string[] = [];
      for (const shownText of textBlock[1].matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        fragments.push(decodeHexText(shownText[1], cmap));
      }
      if (fragments.length) {
        blocks.push({ x: Number(position[1]), y: Number(position[2]), text: fragments.join('').trim() });
      }
    }

    blocks.sort((a, b) => Math.abs(a.y - b.y) > 2.5 ? b.y - a.y : a.x - b.x);
    let currentLine: typeof blocks = [];
    for (const block of blocks) {
      if (currentLine.length && Math.abs(currentLine[0].y - block.y) > 2.5) {
        lines.push(currentLine.sort((a, b) => a.x - b.x).map(item => item.text).filter(Boolean).join(' '));
        currentLine = [];
      }
      currentLine.push(block);
    }
    if (currentLine.length) lines.push(currentLine.sort((a, b) => a.x - b.x).map(item => item.text).filter(Boolean).join(' '));
  }

  if (!lines.length) {
    throw new Error('This PDF has no supported embedded text layer');
  }

  return lines.join('\n');
}

function parseCzechNumber(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid amount: ${value}`);
  return parsed;
}

function parseCzechDate(value: string): string {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) throw new Error(`Invalid date: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function requiredMatch(text: string, pattern: RegExp, field: string): string {
  const value = text.match(pattern)?.[1]?.trim();
  if (!value) throw new Error(`Could not find ${field} on the Alza invoice`);
  return value;
}

function parseDescriptions(text: string): string {
  const table = text.match(/Kód\s+Popis[\s\S]*?Záruka\s*\n([\s\S]*?)\nCelkem:/i)?.[1] ?? '';
  const descriptions: string[] = [];
  const money = '-?[\\d .]+,\\d{2}';
  const itemPattern = new RegExp(
    `^\\S+\\s+(.+?)\\s+\\d+(?:[.,]\\d+)?\\s+${money}\\s+${money}\\s+${money}\\s+\\d{1,2}\\s+${money}(?:\\s+.*)?$`
  );

  for (const line of table.split('\n').map(value => value.trim()).filter(Boolean)) {
    const item = line.match(itemPattern);
    if (item) {
      descriptions.push(item[1].trim());
      continue;
    }

    if (descriptions.length) {
      const continuation = line.replace(/^\S+\s+/, '').trim();
      if (continuation) descriptions[descriptions.length - 1] += ` ${continuation}`;
    }
  }

  return descriptions.join(', ');
}

export function parseAlzaInvoiceText(text: string): ParsedAlzaInvoice {
  const normalized = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  if (!/Alza\.cz a\.s\./i.test(normalized)) {
    throw new Error('Only Alza.cz invoices are supported at the moment');
  }

  const supplierInvoiceNumber = requiredMatch(normalized, /Faktura\s*-\s*(\d{6,})/i, 'invoice number');
  const issueDate = parseCzechDate(requiredMatch(normalized, /Datum vystavení:\s*(\d{2}\.\d{2}\.\d{4})/i, 'issue date'));
  const dueDate = parseCzechDate(requiredMatch(normalized, /Datum splatnosti:\s*(\d{2}\.\d{2}\.\d{4})/i, 'due date'));
  const vatRows = [...normalized.matchAll(/(?:^|\n)\s*(\d{1,2})\s*%\s+([\d .]+,\d{2})\s+([\d .]+,\d{2})(?:\s|$)/gm)];
  if (!vatRows.length) throw new Error('Could not find the VAT summary on the Alza invoice');
  if (vatRows.length > 1) throw new Error('Alza invoices with multiple VAT rates are not supported yet');
  const vat = vatRows[0];

  const totals = [...normalized.matchAll(/Celkem:\s*([\d .]+,\d{2})\s*Kč/gi)];
  if (!totals.length) throw new Error('Could not find the total on the Alza invoice');

  const description = parseDescriptions(normalized);
  if (!description) throw new Error('Could not find an item description on the Alza invoice');

  const amount = parseCzechNumber(vat[2]);
  const vatAmount = parseCzechNumber(vat[3]);
  const rounding = normalized.match(/Zaokrouhlení:\s*(-?[\d .]+,\d{2})\s*Kč/i)?.[1];
  const roundingAmount = rounding ? parseCzechNumber(rounding) : 0;
  const total = parseCzechNumber(totals[totals.length - 1][1]);
  if (Math.abs(amount + vatAmount + roundingAmount - total) > 0.02) {
    throw new Error('The Alza invoice totals do not add up');
  }

  return {
    supplier: 'Alza.cz a.s.',
    supplierIco: '27082440',
    supplierDic: 'CZ27082440',
    supplierAddress: 'Jankovcova 1522/53, 17000 Praha 7',
    supplierInvoiceNumber,
    issueDate,
    dueDate,
    currency: 'CZK',
    amount,
    vatRate: Number(vat[1]),
    vatAmount,
    roundingAmount,
    total,
    description,
  };
}

export function parseAlzaInvoice(pdf: Buffer): ParsedAlzaInvoice {
  return parseAlzaInvoiceText(extractTextFromPdf(pdf));
}
