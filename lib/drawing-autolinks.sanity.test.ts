/**
 * @jest-environment node
 *
 * Automatic sheet links: the sheet-number regex, detail callouts, matching
 * against the job's current sheets, and placing a text run's characters in
 * the 1000-wide reference space through the pdf.js viewport transform.
 */
import { describe, test, expect } from '@jest/globals';
import { findSheetRefs, buildSheetIndex, itemBox, computeAutoLinks, mulTransform, autoLinkLabel, type SheetRow } from './drawing-autolinks';

const rows: SheetRow[] = [
  { id: 'a501-old', sheet_number: 'A-501', title: 'Wall Sections', status: 'superseded', created_at: '2026-01-01' },
  { id: 'a501', sheet_number: 'A-501', title: 'Wall Sections', status: 'current', created_at: '2026-03-01' },
  { id: 'm201', sheet_number: 'M2.01', title: 'Mechanical Plan', status: 'current' },
  { id: 'e101', sheet_number: 'E 101', title: 'Lighting', status: null },
  { id: 's31', sheet_number: 'S3.1', title: 'Framing', status: 'current' },
  { id: 'self', sheet_number: 'A-101', title: 'Floor Plan', status: 'current' },
];
// Letter page at scale 1: PDF y-up → viewport y-down.
const VT = [1, 0, 0, -1, 0, 792];
const VW = 612;

describe('findSheetRefs', () => {
  test('finds common sheet numbers and detail callouts', () => {
    const r = findSheetRefs('SEE 5/A-501, M2.01 AND E-101; S3.1');
    expect(r.map((x) => x.sheet)).toEqual(['A-501', 'M2.01', 'E-101', 'S3.1']);
    expect(r[0]).toMatchObject({ text: '5/A-501', detail: '5', start: 4, end: 11 });
    expect(r[1].detail).toBeNull();
  });
  test('ignores lowercase and tokens glued to other words', () => {
    expect(findSheetRefs('a-501 2X4 ABC123')).toEqual([]);
  });
});

describe('buildSheetIndex', () => {
  test('current revision wins, superseded and the open sheet are left out, keys normalized', () => {
    const idx = buildSheetIndex(rows, 'A101');
    expect(idx.get('A501')?.id).toBe('a501');
    expect(idx.get('E101')?.id).toBe('e101');
    expect(idx.has('A101')).toBe(false);
    expect(idx.size).toBe(4);
  });
});

describe('itemBox', () => {
  test('maps a substring through the viewport transform into reference units', () => {
    const b = itemBox({ str: 'SEE 5/A-501', transform: [10, 0, 0, 10, 100, 700], width: 60 }, VT, VW, 4, 11)!;
    const k = 1000 / 612;
    expect(b.x).toBeCloseTo((100 + (60 * 4) / 11) * k - 2, 0);
    expect(b.y).toBeCloseTo((92 - 10) * k - 2, 0);
    expect(b.w).toBeCloseTo((60 - (60 * 4) / 11) * k + 4, 0);
    expect(b.h).toBeCloseTo(12.2 * k + 4, 0);
  });
  test('scale-independent: a 2x viewport gives the same reference box', () => {
    const it = { str: 'A-501', transform: [10, 0, 0, 10, 100, 700], width: 30 };
    const a = itemBox(it, VT, VW, 0, 5)!;
    const b = itemBox(it, [2, 0, 0, -2, 0, 1584], VW * 2, 0, 5)!;
    expect(b.x).toBeCloseTo(a.x, 1); expect(b.y).toBeCloseTo(a.y, 1); expect(b.w).toBeCloseTo(a.w, 1);
  });
  test('rotated (vertical) text gets a tall box', () => {
    const b = itemBox({ str: 'A-501', transform: [0, 10, -10, 0, 300, 300], width: 30 }, VT, VW, 0, 5)!;
    expect(b.h).toBeGreaterThan(b.w);
  });
  test('bad input returns null', () => {
    expect(itemBox({ str: '', transform: [1, 0, 0, 1, 0, 0], width: 0 }, VT, VW, 0, 0)).toBeNull();
    expect(itemBox({ str: 'A-1', transform: [1, 0, 0, 1, 0, 0], width: 10 }, VT, 0, 0, 3)).toBeNull();
  });
  test('mulTransform matches pdf.js Util.transform', () => {
    expect(mulTransform(VT, [10, 0, 0, 10, 100, 700])).toEqual([10, 0, 0, -10, 100, 92]);
  });
});

describe('computeAutoLinks', () => {
  const idx = buildSheetIndex(rows, 'A101');
  const items = [
    { str: 'SEE 5/A-501', transform: [10, 0, 0, 10, 100, 700], width: 60 },
    { str: 'A-101', transform: [10, 0, 0, 10, 500, 40], width: 30 }, // own title block
    { str: 'R-30 INSULATION', transform: [8, 0, 0, 8, 100, 600], width: 80 }, // no such sheet
    { str: 'M2.01', transform: [8, 0, 0, 8, 300, 500], width: 30 },
  ];
  test('keeps only references to existing sheets on the job', () => {
    const out = computeAutoLinks(items, VT, VW, idx);
    expect(out.map((l) => [l.sheetId, l.detail])).toEqual([['a501', '5'], ['m201', null]]);
    expect(autoLinkLabel(out[0])).toBe('Go to detail 5 on A-501 — Wall Sections');
    expect(autoLinkLabel(out[1])).toBe('Go to M2.01 — Mechanical Plan');
  });
  test('skips a reference already covered by a hand-drawn link, and duplicates', () => {
    const first = computeAutoLinks(items, VT, VW, idx)[0];
    const out = computeAutoLinks([...items, items[0]], VT, VW, idx, { skip: [first.box] });
    expect(out.map((l) => l.sheetId)).toEqual(['m201']);
  });
  test('nothing to match → nothing drawn', () => {
    expect(computeAutoLinks(items, VT, VW, new Map())).toEqual([]);
  });
});
