import { roundMoney } from '../utils/money';
import { documentDate } from './invoiceDocument';

interface TaxGroup {
  rate: number;
  treatment: string;
  // Keep line amounts so EUR conversion reconciles with the exported ISDOC.
  lines: { base: number; vat: number }[];
  reasons?: string;
  codes?: string;
}

export interface DphDocument {
  direction: 'issued' | 'received';
  id: string;
  number: string;
  reference?: string | null;
  counterparty?: string | null;
  dic?: string | null;
  status: string;
  issueDate: string | Date;
  taxDate?: string | Date | null;
  currency: string;
  exchangeRate?: number | null;
  total: number;
  totalCzk?: number | null;
  source: string;
  groups: TaxGroup[];
}

const messages = {
  issue_date_selection: ['Výběr podle data vystavení nemusí odpovídat období DPH. Zvažte export podle data plnění.', 'Issue-date selection may not match the VAT period. Consider exporting by tax-point date.'],
  missing_tax_date: ['Chybí datum plnění; použito datum vystavení. Ověřte období DPH.', 'Tax-point date missing; issue date used. Review the VAT period.'],
  missing_document_number: ['Chybí evidenční číslo daňového dokladu dodavatele.', 'Supplier tax-document number is missing.'],
  missing_counterparty: ['Chybí název protistrany.', 'Counterparty name is missing.'],
  missing_source_file: ['U nákladu chybí příloha s podkladovým dokladem.', 'The expense has no supporting document attachment.'],
  missing_dic: ['Chybí DIČ protistrany. Ověřte, zda je pro toto plnění vyžadováno; není povinné u každého dokladu.', 'Counterparty VAT ID is missing. Check whether this transaction requires it; it is not mandatory for every document.'],
  missing_exchange_rate: ['Chybí platný uložený kurz EUR/CZK. Částky nejsou zahrnuty do součtů v CZK.', 'A valid stored EUR/CZK exchange rate is missing. Amounts are excluded from CZK totals.'],
  unsupported_currency: ['Nepodporovaná měna. Částky nejsou zahrnuty do součtů v CZK.', 'Unsupported currency. Amounts are excluded from CZK totals.'],
  invalid_amounts: ['Neplatné částky nebo sazba DPH. Skupina není zahrnuta do součtů v CZK.', 'Invalid amounts or VAT rate. The group is excluded from CZK totals.'],
  inconsistent_total: ['Uložená celková částka nesouhlasí se základy a DPH. Ověřte doklad.', 'Stored document total does not reconcile with bases and VAT. Review the document.'],
  missing_czk_total: ['Chybí platná uložená celková částka v CZK. Přepočet používá uložený kurz.', 'A valid stored CZK document total is missing. Conversion uses the stored exchange rate.'],
  inconsistent_czk_total: ['Uložená celková částka v CZK nesouhlasí s přepočtem celkové částky uloženým kurzem.', 'Stored CZK document total does not match conversion of the document total at the stored rate.'],
  classification_unconfirmed: ['Tuzemské, EU a ostatní zahraniční plnění není strukturovaně rozlišeno. Ověřte daňové zařazení.', 'Domestic, EU and other foreign transactions are not structurally classified. Review the tax classification.'],
  deduction_unconfirmed: ['DPH nákladu je pouze evidovaná. Nárok na odpočet, jeho výše a období uplatnění nejsou určeny.', 'Expense VAT is recorded VAT only. Deduction eligibility, amount and claim period are undetermined.'],
  special_treatment: ['Ověřte nulovou či nestandardní sazbu, osvobození nebo přenesení daňové povinnosti a související podklady.', 'Review the zero or nonstandard rate, exemption or reverse charge and supporting records.'],
} as const;

export function buildDphPreparation(documents: DphDocument[], period: { from: string; to: string; basis: 'issue' | 'tax' }) {
  const register: unknown[][] = [['direction', 'document_id', 'internal_number', 'tax_document_number', 'counterparty', 'counterparty_dic', 'status',
    'issue_date', 'tax_point_date', 'tax_point_date_source', 'currency', 'exchange_rate_to_czk', 'vat_treatment', 'vat_rate', 'vat_reason', 'reverse_charge_code',
    'tax_base', 'recorded_vat', 'tax_base_czk', 'recorded_vat_czk', 'czk_conversion_status', 'deduction_status', 'jurisdiction_status', 'source_file']];
  const issues: unknown[][] = [['scope', 'direction', 'document_id', 'internal_number', 'code', 'message_cs', 'message_en']];
  const issue = (code: keyof typeof messages, doc?: DphDocument) => {
    issues.push([doc ? 'document' : 'period', doc?.direction ?? '', doc?.id ?? '', doc?.number ?? '', code, ...messages[code]]);
  };
  if (period.basis === 'issue') issue('issue_date_selection');
  const summaries = new Map<string, { direction: string; treatment: string; rate: number; base: number; vat: number; converted: number; excluded: number }>();

  for (const doc of documents) {
    if (!doc.taxDate) issue('missing_tax_date', doc);
    if (doc.direction === 'received' && !doc.reference?.trim()) issue('missing_document_number', doc);
    if (!doc.counterparty?.trim()) issue('missing_counterparty', doc);
    if (doc.direction === 'received' && !doc.source) issue('missing_source_file', doc);
    if (!doc.dic?.trim()) issue('missing_dic', doc);
    issue('classification_unconfirmed', doc);
    if (doc.direction === 'received') issue('deduction_unconfirmed', doc);
    if (doc.groups.some(g => (g.treatment !== 'unclassified' && g.treatment !== 'standard') || ![12, 21].includes(g.rate))) issue('special_treatment', doc);

    const rate = doc.currency === 'CZK' ? 1 : doc.currency === 'EUR' && Number.isFinite(doc.exchangeRate) && doc.exchangeRate! > 0 ? doc.exchangeRate! : null;
    if (rate === null) issue(doc.currency === 'EUR' ? 'missing_exchange_rate' : 'unsupported_currency', doc);
    if (doc.currency === 'EUR' && rate !== null) {
      if (doc.totalCzk == null || !Number.isFinite(doc.totalCzk)) issue('missing_czk_total', doc);
      else if (roundMoney(doc.total * rate) !== doc.totalCzk) issue('inconsistent_czk_total', doc);
    }
    const computedTotal = roundMoney(doc.groups.reduce((sum, g) => sum + g.lines.reduce((s, line) => s + line.base + line.vat, 0), 0));
    if (!Number.isFinite(doc.total) || computedTotal !== doc.total) issue('inconsistent_total', doc);

    for (const group of doc.groups) {
      const valid = Number.isFinite(group.rate) && group.rate >= 0 && group.rate <= 100 && group.lines.length > 0 &&
        group.lines.every(line => Number.isFinite(line.base) && Number.isFinite(line.vat));
      const converted = valid && rate !== null;
      if (!valid) issue('invalid_amounts', doc);
      const base = roundMoney(group.lines.reduce((sum, line) => sum + line.base, 0));
      const vat = roundMoney(group.lines.reduce((sum, line) => sum + line.vat, 0));
      const baseCzk = converted ? roundMoney(group.lines.reduce((sum, line) => sum + roundMoney(line.base * rate), 0)) : null;
      const vatCzk = converted ? roundMoney(group.lines.reduce((sum, line) => sum + roundMoney(line.vat * rate), 0)) : null;
      const deduction = doc.direction === 'received' ? 'unreviewed' : 'not_applicable';
      register.push([doc.direction, doc.id, doc.number, doc.direction === 'issued' ? doc.number : doc.reference ?? '', doc.counterparty, doc.dic, doc.status,
        documentDate(doc.issueDate), documentDate(doc.taxDate || doc.issueDate), doc.taxDate ? 'tax_point_date' : 'issue_date_fallback', doc.currency, rate,
        group.treatment, Number.isFinite(group.rate) ? group.rate : '', group.reasons, group.codes,
        Number.isFinite(base) ? base : '', Number.isFinite(vat) ? vat : '', baseCzk, vatCzk, converted ? 'converted' : 'excluded', deduction, 'unclassified', doc.source]);
      const key = `${doc.direction}:${group.treatment}:${group.rate}`;
      const summary = summaries.get(key) ?? { direction: doc.direction, treatment: group.treatment, rate: group.rate, base: 0, vat: 0, converted: 0, excluded: 0 };
      if (converted) {
        summary.base = roundMoney(summary.base + baseCzk!);
        summary.vat = roundMoney(summary.vat + vatCzk!);
        summary.converted++;
      } else summary.excluded++;
      summaries.set(key, summary);
    }
  }
  const summary: unknown[][] = [['direction', 'vat_treatment', 'vat_rate', 'currency', 'tax_base_czk', 'recorded_vat_czk',
    'converted_group_count', 'excluded_group_count', 'czk_totals_status', 'deduction_status']];
  [...summaries.values()].sort((a, b) => a.direction.localeCompare(b.direction) || a.treatment.localeCompare(b.treatment) || a.rate - b.rate)
    .forEach(s => summary.push([s.direction, s.treatment, Number.isFinite(s.rate) ? s.rate : '', 'CZK', s.converted ? s.base : '', s.converted ? s.vat : '',
      s.converted, s.excluded, s.excluded ? 'incomplete' : 'complete', s.direction === 'received' ? 'unreviewed' : 'not_applicable']));
  return { register, summary, issues, issueCount: issues.length - 1,
    excludedGroupCount: [...summaries.values()].reduce((sum, s) => sum + s.excluded, 0) };
}

export function dphReadme(period: { from: string; to: string; basis: 'issue' | 'tax' }) {
  return `DPH podklady / VAT preparation pack
Období / Period: ${period.from} - ${period.to}
Výběr / Selection: ${period.basis === 'tax' ? 'datum plnění / tax-point date' : 'datum vystavení / issue date'}

ČESKY
summary.csv: Přehled v CZK podle směru (issued = vydané, received = přijaté), sazby a režimu DPH.
register.csv: Pracovní evidence pro účely DPH, jeden řádek na doklad/sazbu/režim, s odkazem na podklad v ZIP (source_file).
issues.csv: Kontrola úplnosti a položky k posouzení účetní; zprávy jsou česky i anglicky.

Částky received jsou pouze evidovaná DPH, nikoli potvrzený nárok na odpočet. Neurčujeme období uplatnění odpočtu ani daň k úhradě.
Tuzemské, EU a ostatní zahraniční plnění není strukturovaně rozlišeno. Režim přijatých dokladů je unclassified (neurčený).
Datum plnění při absenci nahrazuje datum vystavení a je označeno issue_date_fallback. Datum dříve automaticky doplněné aplikací nelze rozeznat od potvrzeného data.
Všechny soubory používají stejný výběr dokladů jako hlavní export. Výběr podle data vystavení nemusí odpovídat období DPH; ani datum plnění nákladu neurčuje období odpočtu.
CZK částky používají uložené kurzy EUR/CZK bez ověření jejich vhodnosti pro DPH. Základ i daň se přepočítají a zaokrouhlí na dvě desetinná místa po položkách, stejně jako v ISDOC.
Souhrn je součtem CZK částek z evidence. Zaokrouhlení může způsobit rozdíl oproti přepočtu celkové částky dokladu; nejde o zaokrouhlení daňového přiznání.
Při chybějícím kurzu či neplatných částkách zůstává doklad v evidenci, CZK částky jsou prázdné a souhrn je incomplete (neúplný), s počtem vynechaných skupin. Prázdná částka není nula.
complete znamená pouze úplný přepočet zahrnutých skupin, nikoli úplné nebo správné podání DPH. Chybějící DIČ nemusí být u každého dokladu chybou.
Ověřte zejména zálohy, opravné doklady, zahraniční plnění a plnění mimo aplikaci. Tento balíček není přiznání k DPH, kontrolní ani souhrnné hlášení a neobsahuje jejich XML.
Stávající validace PDF/ISDOC může zastavit celý ZIP, například při chybějícím kurzu vydané EUR faktury; issues.csv tuto kontrolu neobchází.

ENGLISH
summary.csv: CZK totals by direction (issued/received), VAT rate and treatment.
register.csv: Working VAT register, one row per document/rate/treatment, linked to a supporting file inside the ZIP (source_file).
issues.csv: Completeness checks and accountant review items, with Czech and English messages.

Received amounts are recorded VAT only, not confirmed deductions. No deduction claim period or VAT payable is calculated.
Domestic, EU and other foreign transactions are not structurally classified. Received-document treatment is unclassified.
Missing tax-point dates fall back to issue dates (issue_date_fallback). Dates previously auto-filled by the app cannot be distinguished from confirmed dates.
All files use the main export's document selection. Issue-date selection may not match the VAT period; an expense tax-point date does not determine its deduction claim period either.
CZK amounts use stored EUR/CZK rates without checking their suitability for VAT. Bases and taxes are converted and rounded to two decimals per line, matching ISDOC.
Summary amounts sum the CZK register amounts. Rounding may differ from conversion of the document grand total; this is not tax-return rounding.
Missing rates or invalid amounts retain the document in the register with blank CZK amounts. Summaries are marked incomplete and count excluded groups. Blank does not mean zero.
complete only means all included groups were converted, not that a VAT filing is complete or correct. Missing VAT IDs are not necessarily errors.
Review advances, corrective documents, foreign transactions and transactions outside this app. This pack is not a VAT return, control statement or EU sales list and includes no filing XML.
Existing PDF/ISDOC validation can still stop the entire ZIP, for example for an issued EUR invoice without a rate; issues.csv does not bypass that validation.
`;
}
