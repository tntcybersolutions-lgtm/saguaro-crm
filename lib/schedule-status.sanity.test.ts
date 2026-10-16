/**
 * @jest-environment node
 *
 * A schedule task's status, one vocabulary (lib/schedule-status): every writer
 * stores `completed`, every reader accepts the legacy `complete`, and the bar
 * and the status never disagree.
 */
import { describe, test, expect } from '@jest/globals';
import {
  SCHEDULE_DONE,
  SCHEDULE_STATUSES,
  isScheduleDone,
  normalizeScheduleStatus,
  reconcileScheduleProgress,
  scheduleStatusLabel,
} from './schedule-status';

describe('normalizeScheduleStatus', () => {
  test('the legacy spelling and its cousins read as completed', () => {
    for (const v of ['complete', 'Complete', 'COMPLETED', 'done', ' finished ']) {
      expect(normalizeScheduleStatus(v)).toBe('completed');
    }
  });
  test('spaces, dashes and case fold onto the canonical keys', () => {
    expect(normalizeScheduleStatus('In Progress')).toBe('in_progress');
    expect(normalizeScheduleStatus('on-hold')).toBe('on_hold');
    expect(normalizeScheduleStatus('NotStarted')).toBe('not_started');
  });
  test('empty is undefined so a partial update never invents a status', () => {
    expect(normalizeScheduleStatus(undefined)).toBeUndefined();
    expect(normalizeScheduleStatus(null)).toBeUndefined();
    expect(normalizeScheduleStatus('  ')).toBeUndefined();
  });
  test('unknown text is kept, not silently rewritten', () => {
    expect(normalizeScheduleStatus('Weather Hold')).toBe('weather_hold');
  });
  test('every offered status is canonical', () => {
    for (const s of SCHEDULE_STATUSES) expect(normalizeScheduleStatus(s)).toBe(s);
    expect(SCHEDULE_DONE).toBe('completed');
  });
});

describe('isScheduleDone', () => {
  test('either spelling, or a full bar', () => {
    expect(isScheduleDone('complete')).toBe(true);
    expect(isScheduleDone('completed')).toBe(true);
    expect(isScheduleDone('in_progress', 100)).toBe(true);
    expect(isScheduleDone('in_progress', '100')).toBe(true);
    expect(isScheduleDone('in_progress', 99)).toBe(false);
    expect(isScheduleDone('not_started')).toBe(false);
    expect(isScheduleDone(null, null)).toBe(false);
  });
});

describe('reconcileScheduleProgress', () => {
  test('a bar dragged to 100 % is stored completed — never complete', () => {
    expect(reconcileScheduleProgress({ pct: 100 })).toEqual({ pct_complete: 100, status: 'completed' });
  });
  test('a started bar is in progress; an empty one is not started', () => {
    expect(reconcileScheduleProgress({ pct: 40 })).toEqual({ pct_complete: 40, status: 'in_progress' });
    expect(reconcileScheduleProgress({ pct: 0 })).toEqual({ pct_complete: 0, status: 'not_started' });
  });
  test('Completed (either spelling) fills the bar; Not Started empties it', () => {
    expect(reconcileScheduleProgress({ status: 'complete' })).toEqual({ status: 'completed', pct_complete: 100 });
    expect(reconcileScheduleProgress({ status: 'completed' })).toEqual({ status: 'completed', pct_complete: 100 });
    expect(reconcileScheduleProgress({ status: 'not_started' })).toEqual({ status: 'not_started', pct_complete: 0 });
  });
  test('other statuses leave the bar alone', () => {
    expect(reconcileScheduleProgress({ status: 'delayed' })).toEqual({ status: 'delayed' });
  });
  test('both sent and disagreeing', () => {
    expect(reconcileScheduleProgress({ status: 'not_started', pct: 100 })).toEqual({ status: 'completed', pct_complete: 100 });
    expect(reconcileScheduleProgress({ status: 'complete', pct: 0 })).toEqual({ status: 'completed', pct_complete: 100 });
    expect(reconcileScheduleProgress({ status: 'not_started', pct: 50 })).toEqual({ status: 'in_progress', pct_complete: 50 });
  });
  test('the bar clamps to 0-100 and junk is ignored', () => {
    expect(reconcileScheduleProgress({ pct: 140 })).toEqual({ pct_complete: 100, status: 'completed' });
    expect(reconcileScheduleProgress({ pct: 'abc' })).toEqual({});
    expect(reconcileScheduleProgress({})).toEqual({});
  });
});

describe('scheduleStatusLabel', () => {
  test('a legacy row reads as a real label, not a raw key', () => {
    expect(scheduleStatusLabel('complete')).toBe('Completed');
    expect(scheduleStatusLabel('blocked')).toBe('Blocked');
    expect(scheduleStatusLabel(null)).toBe('Not Started');
    expect(scheduleStatusLabel('weather_hold')).toBe('Weather Hold');
  });
});
