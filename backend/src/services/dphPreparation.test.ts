import { describe, expect, it } from 'vitest';
import { buildDphPreparation, type DphDocument } from './dphPreparation';

const period = { from: '2026-09-01', to: '2026-09-30', basis: 'tax' as const };
const document = (overrides: Partial<DphDocument> = {}): DphDocument => ({
  direction: 'issued', id: 'invoice-1', number: 'FV1', counterparty: 'Client', dic: 'CZ12345678', status: 'sent',
  issueDate: '2026-09-02', taxDate: '2026-09-01', currency: 'CZK', total: 121, source: 'issued/FV1.pdf',
  groups: [{ rate: 21, treatment: 'standard', lines: [{ base: 100, vat: 21 }] }], ...overrides,
});
const records = (rows: unknown[][]) => rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, i) => [String(key), row[i]])));
const codes = (rows: unknown[][]) => records(rows).map(row => row.code);

describe('DPH preparation', () => {
  it('separates directions, rates and treatments and preserves recorded taxes rather than recalculating them', () => {
    const pack = buildDphPreparation([
      document({ total: 552.99, groups: [
        { rate: 21, treatment: 'standard', lines: [{ base: 100, vat: 20.99 }] },
        { rate: 12, treatment: 'standard', lines: [{ base: 100, vat: 12 }] },
        { rate: 0, treatment: 'exempt', lines: [{ base: 200, vat: 0 }], reasons: '§ 57' },
        { rate: 21, treatment: 'reverse_charge', lines: [{ base: 120, vat: 0 }], codes: '4' },
      ] }),
      document({ id: 'invoice-2' }),
      document({ direction: 'received', id: 'expense-1', number: 'N1', reference: 'SUP-99', status: 'unpaid',
        groups: [{ rate: 21, treatment: 'unclassified', lines: [{ base: 100, vat: 21 }] }] }),
    ], period);
    expect(records(pack.summary)).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'issued', vat_treatment: 'standard', vat_rate: 21, tax_base_czk: 200, recorded_vat_czk: 41.99, converted_group_count: 2 }),
      expect.objectContaining({ direction: 'issued', vat_treatment: 'standard', vat_rate: 12, tax_base_czk: 100, recorded_vat_czk: 12 }),
      expect.objectContaining({ vat_treatment: 'exempt', tax_base_czk: 200, recorded_vat_czk: 0 }),
      expect.objectContaining({ vat_treatment: 'reverse_charge', tax_base_czk: 120, recorded_vat_czk: 0 }),
      expect.objectContaining({ direction: 'received', tax_base_czk: 100, recorded_vat_czk: 21, deduction_status: 'unreviewed' }),
    ]));
    expect(records(pack.register)).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_id: 'invoice-1', vat_reason: '§ 57', source_file: 'issued/FV1.pdf' }),
      expect.objectContaining({ document_id: 'expense-1', internal_number: 'N1', tax_document_number: 'SUP-99', jurisdiction_status: 'unclassified' }),
    ]));
    expect(codes(pack.issues)).toContain('deduction_unconfirmed');
    expect(codes(pack.issues)).not.toContain('inconsistent_total');
  });

  it('converts stored EUR amounts per line and sums the rounded CZK register, matching ISDOC rounding', () => {
    const pack = buildDphPreparation([
      document({ currency: 'EUR', exchangeRate: 24.321, total: 0.8, totalCzk: 19.46,
        groups: [{ rate: 21, treatment: 'standard', lines: [{ base: 0.33, vat: 0.07 }, { base: 0.33, vat: 0.07 }] }] }),
      document({ id: 'invoice-2' }),
    ], period);
    expect(records(pack.register)[0]).toMatchObject({ currency: 'EUR', exchange_rate_to_czk: 24.321,
      tax_base: 0.66, recorded_vat: 0.14, tax_base_czk: 16.06, recorded_vat_czk: 3.4 });
    expect(records(pack.summary)[0]).toMatchObject({ currency: 'CZK', tax_base_czk: 116.06, recorded_vat_czk: 24.4, czk_totals_status: 'complete' });
    expect(codes(pack.issues)).not.toContain('inconsistent_czk_total');
  });

  it.each([null, 0, -1, NaN, Infinity])('retains documents with invalid EUR rate %s and marks partial CZK totals', exchangeRate => {
    const expense = document({ direction: 'received', currency: 'EUR', exchangeRate, reference: 'SUP-1',
      groups: [{ rate: 21, treatment: 'unclassified', lines: [{ base: 100, vat: 21 }] }] });
    const pack = buildDphPreparation([expense, { ...expense, id: 'expense-2', currency: 'CZK' }], period);
    expect(records(pack.register)[0]).toMatchObject({ tax_base: 100, recorded_vat: 21, tax_base_czk: null, recorded_vat_czk: null, czk_conversion_status: 'excluded' });
    expect(records(pack.summary)[0]).toMatchObject({ tax_base_czk: 100, recorded_vat_czk: 21, converted_group_count: 1, excluded_group_count: 1, czk_totals_status: 'incomplete' });
    expect(codes(pack.issues)).toContain('missing_exchange_rate');
    expect(pack.excludedGroupCount).toBe(1);
    const missingOnly = buildDphPreparation([expense], period);
    expect(records(missingOnly.summary)[0]).toMatchObject({ tax_base_czk: '', recorded_vat_czk: '', converted_group_count: 0 });
  });

  it('flags absent references, parties, attachments and tax dates without inventing them', () => {
    const pack = buildDphPreparation([document({ direction: 'received', number: 'N1', reference: ' ', dic: '', counterparty: '', source: '', taxDate: null,
      issueDate: new Date(2026, 8, 2) })], { ...period, basis: 'issue' });
    expect(codes(pack.issues)).toEqual(expect.arrayContaining(['issue_date_selection', 'missing_document_number', 'missing_dic',
      'missing_counterparty', 'missing_source_file', 'missing_tax_date', 'classification_unconfirmed', 'deduction_unconfirmed']));
    expect(records(pack.register)[0]).toMatchObject({ tax_point_date: '2026-09-02', tax_point_date_source: 'issue_date_fallback', source_file: '' });
    expect(records(pack.issues).find(row => row.code === 'missing_dic')?.message_en).toContain('not mandatory for every document');
    expect(codes(buildDphPreparation([], period).issues)).not.toContain('issue_date_selection');
  });

  it('flags inconsistent totals and excludes malformed groups without polluting valid totals', () => {
    const pack = buildDphPreparation([
      document({ total: 999, currency: 'EUR', exchangeRate: 25, totalCzk: 0 }),
      document({ id: 'broken', groups: [{ rate: 21, treatment: 'standard', lines: [{ base: NaN, vat: 21 }] }] }),
      document({ id: 'unsupported', currency: 'USD' }),
    ], period);
    expect(codes(pack.issues)).toEqual(expect.arrayContaining(['inconsistent_total', 'inconsistent_czk_total', 'invalid_amounts', 'unsupported_currency']));
    expect(records(pack.summary)[0]).toMatchObject({ tax_base_czk: 2500, recorded_vat_czk: 525, excluded_group_count: 2 });
    expect(records(pack.register)[1]).toMatchObject({ tax_base: '', tax_base_czk: null, czk_conversion_status: 'excluded' });
  });

  it('exports empty periods with headers, and distinguishes genuine zero amounts from excluded amounts', () => {
    const empty = buildDphPreparation([], period);
    expect(empty.summary).toHaveLength(1);
    expect(empty.register).toHaveLength(1);
    expect(empty.issues).toHaveLength(1);
    expect(empty.issueCount).toBe(0);
    const pack = buildDphPreparation([document({ total: 0, groups: [{ rate: 0, treatment: 'standard', lines: [{ base: 0, vat: 0 }] }] })], period);
    expect(records(pack.summary)[0]).toMatchObject({ tax_base_czk: 0, recorded_vat_czk: 0, czk_totals_status: 'complete' });
  });
});
