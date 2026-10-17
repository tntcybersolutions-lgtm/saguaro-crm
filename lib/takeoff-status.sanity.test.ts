/**
 * @jest-environment node
 *
 * A takeoff is complete only with something measured in it.
 */
import { describe, test, expect } from '@jest/globals';
import { takeoffState, isTakeoffComplete, canSaveComplete, TAKEOFF_STATE_LABEL, takeoffItemCounts } from './takeoff-status';

describe('takeoff status from content', () => {
  test('complete with no items reads empty (the Pima takeoff)', () => {
    expect(takeoffState('complete', 0)).toBe('empty');
    expect(takeoffState('complete', null)).toBe('empty');
    expect(isTakeoffComplete('complete', 0)).toBe(false);
    expect(TAKEOFF_STATE_LABEL[takeoffState('complete', 0)]).toBe('Nothing measured');
  });
  test('complete with items stays complete', () => {
    expect(takeoffState('complete', 54)).toBe('complete');
    expect(isTakeoffComplete('Complete', 1)).toBe(true);
  });
  test('other statuses read as stored; unknown reads not analyzed', () => {
    expect(takeoffState('analyzing', 0)).toBe('analyzing');
    expect(takeoffState('failed', 3)).toBe('failed');
    expect(takeoffState('uploaded', 0)).toBe('uploaded');
    expect(takeoffState('weird', 0)).toBe('pending');
    expect(takeoffState(null, 10)).toBe('pending');
  });
  test('saving as complete needs at least one line', () => {
    expect(canSaveComplete(0).ok).toBe(false);
    const r = canSaveComplete(0);
    if (!r.ok) expect(r.message).toMatch(/Measure at least one item/);
    expect(canSaveComplete(1).ok).toBe(true);
  });
  test('counts default to 0 for takeoffs with nothing measured, tenant-scoped', async () => {
    const filters: Array<[string, unknown]> = [];
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
      in: (c: string, v: unknown) => { filters.push([c, v]); return q; },
      then: (res: (r: unknown) => unknown) => Promise.resolve({ data: [{ takeoff_id: 'a', items: '54' }], error: null }).then(res),
    };
    const counts = await takeoffItemCounts({ from: () => q }, 't1', ['a', 'b', 'b']);
    expect(counts).toEqual({ a: 54, b: 0 });
    expect(filters).toContainEqual(['tenant_id', 't1']);
    expect(await takeoffItemCounts({ from: () => { throw new Error('no read'); } }, 't1', [])).toEqual({});
  });
});
