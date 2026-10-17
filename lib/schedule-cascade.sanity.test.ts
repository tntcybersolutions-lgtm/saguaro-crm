/**
 * @jest-environment node
 *
 * Moving a task moves the tasks that follow it: a follower keeps its spacing,
 * the move ripples down a chain, a follower with two predecessors waits for the
 * later one, finished tasks stay put, and a loop in the links cannot spin.
 */
import { describe, test, expect } from '@jest/globals';
import { cascadeSuccessors, spanDays, finishFor } from './schedule-cascade';

describe('durations are inclusive, like the CPM', () => {
  test('Mon→Fri is 5 days; a 5-day task from Monday finishes Friday', () => {
    expect(spanDays('2026-11-02', '2026-11-06')).toBe(5);
    expect(finishFor('2026-11-02', 5)).toBe('2026-11-06');
    expect(finishFor('2026-11-02', 1)).toBe('2026-11-02');
  });
});

describe('cascadeSuccessors', () => {
  const chain = [
    { id: 'a', start_date: '2026-11-02', end_date: '2026-11-06' },
    { id: 'b', start_date: '2026-11-07', end_date: '2026-11-09', predecessor_id: 'a' },
    { id: 'c', start_date: '2026-11-12', end_date: '2026-11-12', predecessor_id: 'b' },
  ];

  test('A slips a week: B and C slide a week, keeping their length and C its 2-day gap', () => {
    const m = cascadeSuccessors(chain, 'a', { start_date: '2026-11-09', end_date: '2026-11-13' });
    const by = Object.fromEntries(m.map((x) => [x.id, x]));
    expect(by.b).toMatchObject({ start_date: '2026-11-14', end_date: '2026-11-16', from_start: '2026-11-07' });
    expect(by.c).toMatchObject({ start_date: '2026-11-19', end_date: '2026-11-19' });
  });

  test('A pulls in two days: the chain pulls in two days', () => {
    const m = cascadeSuccessors(chain, 'a', { start_date: '2026-10-31', end_date: '2026-11-04' });
    expect(m.find((x) => x.id === 'b')).toMatchObject({ start_date: '2026-11-05', end_date: '2026-11-07' });
    expect(m.find((x) => x.id === 'c')).toMatchObject({ start_date: '2026-11-10' });
  });

  test('no change to A\'s finish moves nothing', () => {
    expect(cascadeSuccessors(chain, 'a', { start_date: '2026-11-03', end_date: '2026-11-06' })).toEqual([]);
  });

  test('two predecessors: the follower waits for whichever finishes last', () => {
    const t = [
      { id: 'p1', start_date: '2026-11-02', end_date: '2026-11-04' },
      { id: 'p2', start_date: '2026-11-02', end_date: '2026-11-10' },
      { id: 's', start_date: '2026-11-11', end_date: '2026-11-12', predecessor_id: 'p1', predecessors: ['p2'] },
    ];
    // p1 slips 3 days but still ends before p2, which is what holds s back — s stays.
    expect(cascadeSuccessors(t, 'p1', { start_date: '2026-11-05', end_date: '2026-11-07' })).toEqual([]);
    // p1 slips past p2's finish — s now waits for p1.
    expect(cascadeSuccessors(t, 'p1', { start_date: '2026-11-10', end_date: '2026-11-12' })[0]).toMatchObject({ id: 's', start_date: '2026-11-13', end_date: '2026-11-14' });
    // p2 slips 2 days — s follows it.
    expect(cascadeSuccessors(t, 'p2', { start_date: '2026-11-04', end_date: '2026-11-12' })[0]).toMatchObject({ id: 's', start_date: '2026-11-13', end_date: '2026-11-14' });
  });

  test('a finished follower is history and does not move', () => {
    const t = [chain[0], { ...chain[1], status: 'completed' }];
    expect(cascadeSuccessors(t, 'a', { start_date: '2026-11-09', end_date: '2026-11-13' })).toEqual([]);
  });

  test('a loop in the links stops instead of spinning, and never moves the task just placed', () => {
    const t = [
      { id: 'x', start_date: '2026-11-02', end_date: '2026-11-03', predecessor_id: 'y' },
      { id: 'y', start_date: '2026-11-04', end_date: '2026-11-05', predecessor_id: 'x' },
    ];
    const m = cascadeSuccessors(t, 'x', { start_date: '2026-11-09', end_date: '2026-11-10' });
    expect(m.map((v) => v.id)).toEqual(['y']);
  });

  test('undated tasks and unknown ids are ignored', () => {
    const t = [chain[0], { id: 'u', predecessor_id: 'a' }];
    expect(cascadeSuccessors(t, 'a', { start_date: '2026-11-09', end_date: '2026-11-13' })).toEqual([]);
    expect(cascadeSuccessors(chain, 'nope', { start_date: '2026-11-09', end_date: '2026-11-13' })).toEqual([]);
  });
});
