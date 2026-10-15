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
import { buildLevelingGrid, parseLineAmounts, parseAlternates, toLevelingCsv, median } from './bid-leveling';
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
