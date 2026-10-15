/**
 * @jest-environment node
 *
 * The leveling grid: gaps plugged with the row median of those who priced the
 * line, a line nobody priced left as an unpriced gap (never a made-up figure),
 * the plug switchable off, outliers over 25% above the row median, columns
 * sorted low → high on the leveled total, vs-low and spread, stored per-line
 * amounts read defensively, and a CSV a spreadsheet cannot execute.
 */
import { describe, test, expect } from '@jest/globals';
import { buildLevelingGrid, parseLineAmounts, parseAlternates, toLevelingCsv, median, normalizeBidSheet, readBidLines, parseBond, moneyToCents } from './bid-leveling';
import type { ScopeLine, Bidder } from './bidleveling';

const lines: ScopeLine[] = [
  { id: 'L1', description: 'Framing' },
  { id: 'L2', description: 'Board' },
  { id: 'L3', description: 'Finish' },
];

/* Cents. A: priced everything. B: excluded Finish. C: high on Framing, did not
   quote Board. */
const bidders: Bidder[] = [
  { id: 'A', name: 'Alpha', baseBidCents: 3_000_000, scope: [
    { scopeLineId: 'L1', status: 'included', valueCents: 1_000_000 },
    { scopeLineId: 'L2', status: 'included', valueCents: 1_000_000 },
    { scopeLineId: 'L3', status: 'included', valueCents: 1_000_000 },
  ] },
  { id: 'B', name: 'Bravo', baseBidCents: 2_200_000, scope: [
    { scopeLineId: 'L1', status: 'included', valueCents: 1_100_000 },
    { scopeLineId: 'L2', status: 'included', valueCents: 1_100_000 },
    { scopeLineId: 'L3', status: 'excluded' },
  ] },
  { id: 'C', name: 'Charlie', baseBidCents: 3_000_000, scope: [
    { scopeLineId: 'L1', status: 'included', valueCents: 1_600_000 },
    { scopeLineId: 'L3', status: 'included', valueCents: 1_400_000 },
  ] },
];

describe('bid leveling grid', () => {
  test('median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(3); // round((2+3)/2)
  });

  test('gaps plugged with the row median and leveled totals', () => {
    const g = buildLevelingGrid(lines, bidders);
    const finish = g.rows.find((r) => r.lineId === 'L3')!;
    expect(finish.medianCents).toBe(1_200_000); // median of A 1.0M, C 1.4M
    const bravoFinish = finish.cells.find((c) => c.bidderId === 'B')!;
    expect(bravoFinish.kind).toBe('excluded');
    expect(bravoFinish.tone).toBe('gap');
    expect(bravoFinish.plugCents).toBe(1_200_000);

    const board = g.rows.find((r) => r.lineId === 'L2')!;
    expect(board.medianCents).toBe(1_050_000);
    const charlieBoard = board.cells.find((c) => c.bidderId === 'C')!;
    expect(charlieBoard.kind).toBe('not_quoted');
    expect(charlieBoard.plugCents).toBe(1_050_000);

    const col = (id: string) => g.columns.find((c) => c.id === id)!;
    expect(col('A').leveledCents).toBe(3_000_000);
    expect(col('B').leveledCents).toBe(3_400_000);
    expect(col('C').leveledCents).toBe(4_050_000);
    expect(col('B').plugCount).toBe(1);
  });

  test('columns sorted low to high on leveled total, vs low and spread', () => {
    const g = buildLevelingGrid(lines, bidders);
    expect(g.columns.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(g.columns[0].isLowLeveled).toBe(true);
    expect(g.columns[1].vsLowCents).toBe(400_000);
    expect(g.columns[1].vsLowPct).toBe(13.3);
    expect(g.spreadCents).toBe(1_050_000);
    expect(g.spreadPct).toBe(35);
  });

  test('plug off levels on the bids as submitted, and re-sorts', () => {
    const g = buildLevelingGrid(lines, bidders, { plugGaps: false });
    expect(g.columns.map((c) => c.id)).toEqual(['B', 'A', 'C']);
    expect(g.columns.every((c) => c.plugCents === 0)).toBe(true);
    expect(g.columns.find((c) => c.id === 'B')!.leveledCents).toBe(2_200_000);
  });

  test('outlier > 25% above row median, lowest per row', () => {
    const g = buildLevelingGrid(lines, bidders);
    const framing = g.rows.find((r) => r.lineId === 'L1')!;
    expect(framing.medianCents).toBe(1_100_000);
    const tone = (id: string) => framing.cells.find((c) => c.bidderId === id)!.tone;
    expect(tone('A')).toBe('low');
    expect(tone('B')).toBeNull();
    expect(tone('C')).toBe('outlier'); // 1.6M > 1.1M × 1.25
  });

  test('a gap nobody priced is not given a number', () => {
    const noLines: Bidder[] = [
      { id: 'X', name: 'X', baseBidCents: 100_000, scope: [{ scopeLineId: 'L1', status: 'included' }] },
      { id: 'Y', name: 'Y', baseBidCents: 90_000, scope: [{ scopeLineId: 'L1', status: 'excluded' }] },
    ];
    const g = buildLevelingGrid([lines[0]], noLines);
    const y = g.columns.find((c) => c.id === 'Y')!;
    expect(y.plugCents).toBe(0);
    expect(y.unpricedGapCount).toBe(1);
    expect(y.leveledCents).toBe(90_000);
    expect(g.rows[0].cells.find((c) => c.bidderId === 'Y')!.unpricedGap).toBe(true);
    expect(g.rows[0].cells.find((c) => c.bidderId === 'X')!.kind).toBe('included');
  });

  test('stored per-line amounts and alternates parse onto known lines only', () => {
    const ids = ['L1', 'L2'];
    expect(parseLineAmounts([{ itemId: 'L1', amount: 1250.5 }, { itemId: 'ZZ', amount: 9 }, { id: 'L2', total: '2,000', status: 'excluded' }], ids))
      .toEqual({ L1: { amountCents: 125_050 }, L2: { amountCents: 200_000, status: 'excluded' } });
    expect(parseLineAmounts({ L1: 10, nope: 5 }, ids)).toEqual({ L1: { amountCents: 1000 } });
    expect(parseLineAmounts(null, ids)).toEqual({});
    expect(parseLineAmounts('not json', ids)).toEqual({});
    expect(parseAlternates({ alternate_amounts: [{ label: 'Upgrade', amount: 500 }, { label: 'Deduct', amount: -200 }] }))
      .toEqual([{ key: 'Alt 1', description: 'Upgrade', valueCents: 50_000, kind: 'add' }, { key: 'Alt 2', description: 'Deduct', valueCents: 20_000, kind: 'deduct' }]);
    expect(parseAlternates({ alternate_1: 300, alternate_2: 0, alternates: 'Paint' }))
      .toEqual([{ key: 'Alt 1', description: 'Paint (1)', valueCents: 30_000, kind: 'add' }]);
    expect(parseAlternates({})).toEqual([]);
  });

  test('CSV quotes text and defuses formulas', () => {
    const g = buildLevelingGrid(lines, bidders, { extras: { B: { exclusions: '=HYPERLINK("x"), finish by others' } } });
    const csv = toLevelingCsv(g, 'Drywall');
    const rows = csv.trim().split('\r\n');
    expect(rows[1]).toBe('Scope,Row median,Alpha,Bravo,Charlie');
    expect(rows.find((r) => r.startsWith('Finish'))).toBe('Finish,12000.00,10000.00,Excluded (plug 12000.00),14000.00');
    expect(csv).toContain(`"'=HYPERLINK(""x""), finish by others"`);
    expect(rows.find((r) => r.startsWith('Leveled total'))).toBe('Leveled total,,30000.00,34000.00,40500.00');
  });
});

describe('bidder price sheet: portal writer ⇄ leveling reader', () => {
  const ids = ['L1', 'L2', 'L3', 'L4'];
  const names = { L1: 'Framing', L2: 'Board', L3: 'Finish', L4: 'Cleanup' };

  test('round trip: what the portal stores is what leveling reads', () => {
    const r = normalizeBidSheet({
      lines: [
        { itemId: 'L1', status: 'priced', amount: 12500.555 },
        { itemId: 'L2', status: 'included', amount: 999 },
        { itemId: 'L3', status: 'excluded' },
      ],
      alternates: [{ label: 'Level 5 finish', amount: 4200, kind: 'add' }, { label: '', amount: '' }, { label: 'Owner-supplied board', amount: '1,500', kind: 'deduct' }],
      bond: { status: 'priced', amount: 1800 },
    }, ids, names);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linesTotalCents).toBe(1_250_056);
    expect(r.pricedLineCount).toBe(1);
    expect(r.bondIncluded).toBe(false);
    /* Every package line is stored; the one not mentioned is Not quoted. */
    expect(r.unitPriceItems!.lines.map((l) => l.status)).toEqual(['priced', 'included', 'excluded', 'not_quoted']);
    expect(r.unitPriceItems!.linesTotal).toBe(12500.56);

    /* Through JSON, as the jsonb column stores it. */
    const stored = JSON.parse(JSON.stringify(r.unitPriceItems));
    expect(parseLineAmounts(stored, ids)).toEqual({
      L1: { amountCents: 1_250_056 },
      L2: { amountCents: null, status: 'included' },
      L3: { amountCents: null, status: 'excluded' },
      L4: { amountCents: null, status: 'not_quoted' },
    });
    expect(readBidLines(stored, ids)).toEqual([
      { itemId: 'L1', status: 'priced', amount: 12500.56 },
      { itemId: 'L2', status: 'included', amount: null },
      { itemId: 'L3', status: 'excluded', amount: null },
      { itemId: 'L4', status: 'not_quoted', amount: null },
    ]);
    expect(parseBond(stored)).toEqual({ status: 'priced', amountCents: 180_000 });
    expect(parseAlternates({ alternate_amounts: JSON.parse(JSON.stringify(r.alternateAmounts)) })).toEqual([
      { key: 'Alt 1', description: 'Level 5 finish', valueCents: 420_000, kind: 'add' },
      { key: 'Alt 2', description: 'Owner-supplied board', valueCents: 150_000, kind: 'deduct' },
    ]);
  });

  test('a stored not-quoted line levels as a gap, an included one does not', () => {
    const r = normalizeBidSheet({ lines: [{ itemId: 'L1', status: 'priced', amount: 100 }, { itemId: 'L2', status: 'included' }] }, ['L1', 'L2', 'L3']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const amounts = parseLineAmounts(r.unitPriceItems, ['L1', 'L2', 'L3']);
    expect(amounts.L3.status).toBe('not_quoted');
    expect(amounts.L2.status).toBe('included');
  });

  test('server validation: known lines only, numbers ≥ 0, no repeats', () => {
    const bad = (input: Parameters<typeof normalizeBidSheet>[0]) => {
      const r = normalizeBidSheet(input, ids, names);
      return r.ok ? null : r.error;
    };
    expect(bad({ lines: [{ itemId: 'OTHER-PACKAGE', status: 'priced', amount: 5 }] })).toMatch(/not part of this bid package/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'priced', amount: -5 }] })).toMatch(/Framing/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'priced', amount: 'abc' }] })).toMatch(/Framing/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'priced', amount: Infinity }] })).toMatch(/Framing/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'priced' }] })).toMatch(/Framing/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'priced', amount: 1e11 }] })).toMatch(/Framing/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'maybe' }] })).toMatch(/Framing/);
    expect(bad({ lines: [{ itemId: 'L1', status: 'included' }, { itemId: 'L1', status: 'excluded' }] })).toMatch(/twice/);
    expect(bad({ lines: 'L1=5' })).toMatch(/list/);
    expect(bad({ alternates: [{ label: 'Upgrade', amount: 0 }] })).toMatch(/above 0/);
    expect(bad({ alternates: [{ label: '', amount: 50 }] })).toMatch(/Describe/);
    expect(bad({ bond: { status: 'priced', amount: 0 } })).toMatch(/bond price/);
    expect(bad({ bond: { status: 'free' } })).toMatch(/bond/);
    expect(bad({ alternates: Array.from({ length: 11 }, (_, i) => ({ label: `A${i}`, amount: 1 })) })).toMatch(/Up to/);
  });

  test('a $0 priced line is Included; no sheet stores nothing', () => {
    const r = normalizeBidSheet({ lines: [{ itemId: 'L1', status: 'priced', amount: 0 }] }, ids);
    expect(r.ok && r.unitPriceItems!.lines[0]).toEqual({ itemId: 'L1', status: 'included', amount: null });
    const none = normalizeBidSheet({}, ids);
    expect(none.ok && none.unitPriceItems).toBeNull();
    expect(none.ok && none.alternateAmounts).toEqual([]);
    const inc = normalizeBidSheet({ bond: { status: 'included' } }, ids);
    expect(inc.ok && inc.bondIncluded).toBe(true);
    expect(moneyToCents('$1,250.50')).toBe(125_050);
    expect(moneyToCents('-1')).toBeNull();
    expect(moneyToCents('')).toBeNull();
  });
});
