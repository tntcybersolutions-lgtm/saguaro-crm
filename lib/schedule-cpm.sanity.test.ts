/**
 * @jest-environment node
 *
 * CPM over schedule tasks: a chain is all critical; of two parallel branches
 * only the longer is critical and the shorter carries the difference as
 * float; a loop is broken and reported; an undated task sits outside the
 * network; a link to a deleted task is reported. Plus the 3-week lookahead.
 */
import { describe, test, expect } from '@jest/globals';
import { computeCpm, lookahead, predecessorIds } from './schedule-cpm';

describe('computeCpm', () => {
  test('simple chain: every task critical, zero float, project finish = last end', () => {
    const r = computeCpm([
      { id: 'a', start_date: '2026-11-02', end_date: '2026-11-06' },
      { id: 'b', start_date: '2026-11-07', end_date: '2026-11-10', predecessor_id: 'a' },
      { id: 'c', start_date: '2026-11-11', end_date: '2026-11-11', predecessor_id: 'b' },
    ]);
    expect(r.criticalIds.sort()).toEqual(['a', 'b', 'c']);
    expect(r.byId.a.duration).toBe(5);
    expect(r.byId.b.float).toBe(0);
    expect(r.projectStart).toBe('2026-11-02');
    expect(r.projectFinish).toBe('2026-11-11');
    expect(r.links.every((l) => l.critical)).toBe(true);
    expect(r.cycles).toEqual([]);
  });

  test('parallel branches: only the longer is critical, the shorter has the gap as float', () => {
    const r = computeCpm([
      { id: 'start', start_date: '2026-11-02', end_date: '2026-11-02' },
      { id: 'long', start_date: '2026-11-03', end_date: '2026-11-12', predecessor_id: 'start' }, // 10d
      { id: 'short', start_date: '2026-11-03', end_date: '2026-11-05', predecessor_id: 'start' }, // 3d
      { id: 'end', start_date: '2026-11-13', end_date: '2026-11-13', predecessors: ['long', { id: 'short' }] },
    ]);
    expect(r.byId.long.critical).toBe(true);
    expect(r.byId.short.critical).toBe(false);
    expect(r.byId.short.float).toBe(7);
    expect(r.byId.short.lf).toBe('2026-11-12');
    expect(r.criticalIds.sort()).toEqual(['end', 'long', 'start']);
    expect(r.links.find((l) => l.from === 'short')!.critical).toBe(false);
    expect(r.links.find((l) => l.from === 'long')!.critical).toBe(true);
  });

  test('a successor scheduled before its predecessor ends is pushed by the forward pass', () => {
    const r = computeCpm([
      { id: 'a', start_date: '2026-11-02', end_date: '2026-11-06' },
      { id: 'b', start_date: '2026-11-04', end_date: '2026-11-05', predecessor_id: 'a' },
    ]);
    expect(r.byId.b.es).toBe('2026-11-07');
    expect(r.byId.b.ef).toBe('2026-11-08');
    expect(r.projectFinish).toBe('2026-11-08');
  });

  test('cycle: the loop-closing link is dropped and reported, nothing throws', () => {
    const r = computeCpm([
      { id: 'a', start_date: '2026-11-02', end_date: '2026-11-03', predecessor_id: 'c' },
      { id: 'b', start_date: '2026-11-04', end_date: '2026-11-05', predecessor_id: 'a' },
      { id: 'c', start_date: '2026-11-06', end_date: '2026-11-07', predecessor_id: 'b' },
      { id: 'self', start_date: '2026-11-02', end_date: '2026-11-02', predecessor_id: 'self' },
    ]);
    expect(r.cycles.length).toBe(2);
    expect(r.cycles).toContainEqual({ from: 'self', to: 'self' });
    expect(r.links.length).toBe(2);
    expect(Object.keys(r.byId).sort()).toEqual(['a', 'b', 'c', 'self']);
    for (const v of Object.values(r.byId)) expect(Number.isFinite(v.float)).toBe(true);
  });

  test('task with no dates sits outside the network; a link to a deleted task is reported', () => {
    const r = computeCpm([
      { id: 'a', start_date: '2026-11-02', end_date: '2026-11-03' },
      { id: 'nodates', start_date: null, end_date: '', predecessor_id: 'a' },
      { id: 'b', start_date: '2026-11-04', end_date: '2026-11-05', predecessor_id: 'nodates' },
      { id: 'c', start_date: '2026-11-04', end_date: '2026-11-04', predecessor_id: 'gone' },
    ]);
    expect(r.undated).toEqual(['nodates']);
    expect(r.byId.nodates).toBeUndefined();
    expect(r.links).toEqual([]);
    expect(r.missing).toEqual([{ task: 'c', predecessor: 'gone' }]);
    expect(r.byId.c.float).toBe(1);
  });

  test('empty schedule', () => {
    const r = computeCpm([]);
    expect(r.criticalIds).toEqual([]);
    expect(r.projectFinish).toBeNull();
  });

  test('predecessorIds reads the column and every JSON shape, de-duplicated', () => {
    expect(predecessorIds({ id: 'x', predecessor_id: 'a', predecessors: '["a","b"]' })).toEqual(['a', 'b']);
    expect(predecessorIds({ id: 'x', predecessors: [{ task_id: 'c' }, null, 5] })).toEqual(['c']);
  });
});

describe('lookahead', () => {
  const today = '2026-10-15';
  const tasks = [
    { id: 'underway', start_date: '2026-10-01', end_date: '2026-10-20', status: 'in_progress' },
    { id: 'wk2', start_date: '2026-10-23', end_date: '2026-11-30', status: 'not_started' },
    { id: 'wk3', start_date: '2026-11-04', end_date: '2026-11-05', status: 'not_started' },
    { id: 'tooFar', start_date: '2026-11-05', end_date: '2026-11-06', status: 'not_started' },
    { id: 'done', start_date: '2026-10-16', end_date: '2026-10-17', status: 'complete' },
    { id: 'past', start_date: '2026-10-01', end_date: '2026-10-14', status: 'delayed' },
    { id: 'undated', start_date: null, end_date: null, status: 'not_started' },
  ];
  test('three weeks from today, underway in week 1, finished/past/undated out', () => {
    const w = lookahead(tasks, today);
    expect(w.map((x) => [x.start, x.end])).toEqual([['2026-10-15', '2026-10-21'], ['2026-10-22', '2026-10-28'], ['2026-10-29', '2026-11-04']]);
    expect(w.map((x) => x.tasks.map((t) => t.id))).toEqual([['underway'], ['wk2'], ['wk3']]);
  });
});
