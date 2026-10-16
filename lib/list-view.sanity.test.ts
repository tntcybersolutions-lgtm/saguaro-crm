/**
 * @jest-environment node
 *
 * List tools: column order, filters, saved-view round trip, and the bulk
 * runner (one request per row, refusals reported in the server's words).
 */
import { describe, test, expect } from '@jest/globals';
import {
  mergeOrder, moveColumn, dropColumn, rowMatches, cleanFilters, distinctValues, humanValue,
  viewPayload, stateFromView, runBulk, bulkSummary, type ListViewState, type SavedListView,
} from './list-view';

const KEYS = ['name', 'status', 'due', 'amount'];

describe('column order', () => {
  test('keeps a stored order, drops unknown keys, adds new columns, name stays first', () => {
    // amount is new: it joins right after its default neighbor (due).
    expect(mergeOrder(['due', 'name', 'gone', 'status'], KEYS)).toEqual(['name', 'due', 'amount', 'status']);
    expect(mergeOrder(null, KEYS)).toEqual(KEYS);
  });
  test('up/down never moves the first column', () => {
    expect(moveColumn(KEYS, 'due', -1)).toEqual(['name', 'due', 'status', 'amount']);
    expect(moveColumn(KEYS, 'status', -1)).toEqual(KEYS);
    expect(moveColumn(KEYS, 'name', 1)).toEqual(KEYS);
    expect(moveColumn(KEYS, 'amount', 1)).toEqual(KEYS);
  });
  test('drag drops at the target and cannot displace the name', () => {
    expect(dropColumn(KEYS, 'amount', 'status')).toEqual(['name', 'amount', 'status', 'due']);
    expect(dropColumn(KEYS, 'amount', 'name')).toEqual(['name', 'amount', 'status', 'due']);
  });
});

describe('filters', () => {
  const row = { status: 'open', due: '2026-10-20' };
  test('OR within a column, AND across columns', () => {
    expect(rowMatches({ status: ['open', 'closed'] }, (k) => (row as Record<string, unknown>)[k])).toBe(true);
    expect(rowMatches({ status: ['open'], due: ['2026-10-21'] }, (k) => (row as Record<string, unknown>)[k])).toBe(false);
    expect(rowMatches({}, () => null)).toBe(true);
  });
  test('cleanFilters drops unknown columns and empty lists', () => {
    expect(cleanFilters({ status: ['open', 'open'], gone: ['x'], due: [] }, KEYS)).toEqual({ status: ['open'] });
  });
  test('distinct values, most common first, and readable labels', () => {
    expect(distinctValues(['open', 'closed', 'open', null])).toEqual([
      { value: 'open', count: 2 }, { value: '', count: 1 }, { value: 'closed', count: 1 },
    ]);
    expect(humanValue('under_review')).toBe('Under review');
    expect(humanValue('Copper State')).toBe('Copper State');
    expect(humanValue('')).toBe('(blank)');
  });
});

describe('saved view round trip', () => {
  test('what is saved is what loads', () => {
    const s: ListViewState = {
      order: ['name', 'amount', 'status', 'due'], hidden: ['due'], widths: { amount: 180 },
      filters: { status: ['open'] }, sort: { key: 'amount', dir: 'desc' }, groupBy: 'status',
    };
    const p = viewPayload(s);
    expect(p.columns).toEqual(['name', 'amount', 'status']);
    const view: SavedListView = { id: 'v', name: 'Open by amount', columns: p.columns, column_widths: p.column_widths, filters: p.filters, sort_by: p.sort_by, sort_direction: p.sort_direction };
    expect(stateFromView(view, KEYS)).toEqual(s);
  });
  test('a view from an older column set still loads', () => {
    const v: SavedListView = { id: 'v', name: 'x', columns: ['name', 'gone'], sort_by: 'gone', sort_direction: 'asc', filters: { values: { gone: ['1'] } } };
    const s = stateFromView(v, KEYS);
    expect(s.order).toEqual(KEYS);
    expect(s.sort).toBeNull();
    expect(s.filters).toEqual({});
    expect(s.hidden).toEqual(['status', 'due', 'amount']);
  });
});

describe('bulk runner', () => {
  const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
  test('one request per row; every row reported', async () => {
    const seen: number[] = [];
    const o = await runBulk([1, 2, 3, 4, 5], async (n) => { seen.push(n); return res(200); }, 2);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(o).toEqual({ done: 5, failed: 0, firstError: null, refused: false });
    expect(bulkSummary(o, 'RFI', 'updated')).toBe('5 RFIs updated.');
  });
  test('a role without edit rights: the server refuses every row, and the reason is shown', async () => {
    const o = await runBulk(['a', 'b'], async () => res(403, { error: 'You need Edit access to RFIs. Ask an admin.' }));
    expect(o.done).toBe(0);
    expect(o.refused).toBe(true);
    expect(bulkSummary(o, 'RFI', 'updated')).toBe('No RFIs updated. You need Edit access to RFIs. Ask an admin.');
  });
  test('partial failure keeps the good rows and names the first problem', async () => {
    const o = await runBulk([1, 2, 3], async (n) => (n === 2 ? res(409, { error: 'PO 2 is draft; its next step is sent.' }) : res(200)));
    expect(o).toMatchObject({ done: 2, failed: 1, refused: false });
    expect(bulkSummary(o, 'purchase order', 'updated')).toBe("2 of 3 updated. 1 didn't: PO 2 is draft; its next step is sent.");
  });
  test('a network error counts as a failure, not a crash', async () => {
    const o = await runBulk([1], async () => { throw new TypeError('Failed to fetch'); });
    expect(o).toMatchObject({ done: 0, failed: 1, firstError: 'No connection.' });
  });
});
