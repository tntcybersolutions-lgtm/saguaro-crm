/**
 * @jest-environment node
 *
 * Meetings: item numbers, carry-forward keeping numbers, overdue, the live
 * open count (a carried item counts once), and the missing-table detector.
 */
import { describe, test, expect } from '@jest/globals';
import {
  compareItemNumbers, sortItems, nextItemNumber, nextMeetingNumber, isItemOverdue,
  liveOpenItems, carryForwardRows, meetingStats, nextMeetingDate, isMissingTableError,
  normalizeStatus, normalizeType, itemCountsByMeeting,
} from './meetings';

const T = '2026-10-15';

describe('meeting item numbering', () => {
  test('3.10 sorts after 3.2, unnumbered last', () => {
    expect(compareItemNumbers('3.10', '3.2')).toBeGreaterThan(0);
    expect(compareItemNumbers('2.9', '3.1')).toBeLessThan(0);
    expect(compareItemNumbers(null, '1.1')).toBeGreaterThan(0);
    const s = sortItems([
      { id: 'a', number: '3.10', status: 'open', due_date: null },
      { id: 'b', number: null, status: 'open', due_date: null },
      { id: 'c', number: '1.2', status: 'open', due_date: null },
      { id: 'd', number: '3.2', status: 'open', due_date: null },
    ]);
    expect(s.map((x) => x.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  test('new item number continues the meeting\'s own sequence, ignores carried numbers', () => {
    expect(nextItemNumber(4, [])).toBe('4.1');
    expect(nextItemNumber(4, ['3.2', '3.5', '4.1', '4.3'])).toBe('4.4');
    expect(nextItemNumber(null, ['1.1'])).toBe('1.2');
  });

  test('next meeting number is per type', () => {
    const ms = [
      { meeting_type: 'oac', meeting_number: 3 },
      { meeting_type: 'oac', meeting_number: 1 },
      { meeting_type: 'safety', meeting_number: 7 },
    ];
    expect(nextMeetingNumber(ms, 'oac')).toBe(4);
    expect(nextMeetingNumber(ms, 'safety')).toBe(8);
    expect(nextMeetingNumber(ms, 'preconstruction')).toBe(1);
  });
});

describe('carry forward', () => {
  const items = [
    { id: 'i1', number: '3.2', status: 'open', due_date: '2026-10-10', topic: 'Roof drain RFI', discussion: 'Waiting on architect', assignee_name: 'Architect', meeting_id: 'm3' },
    { id: 'i2', number: '3.1', status: 'closed', due_date: null, topic: 'Rebar shop drawings', discussion: null, assignee_name: null, meeting_id: 'm3' },
    { id: 'i3', number: '2.4', status: 'open', due_date: null, topic: 'Site fence', discussion: null, assignee_name: null, meeting_id: 'm3' },
  ];

  test('copies only open items, keeps numbers, links back, orders by number', () => {
    const rows = carryForwardRows(items, { tenantId: 'tA', projectId: 'p1', meetingId: 'm4' });
    expect(rows.map((r) => r.number)).toEqual(['2.4', '3.2']);
    expect(rows[1]).toMatchObject({ tenant_id: 'tA', project_id: 'p1', meeting_id: 'm4', carried_from_item_id: 'i1', status: 'open', topic: 'Roof drain RFI', due_date: '2026-10-10', position: 1 });
  });

  test('a carried item counts once as open on the job', () => {
    const copies = carryForwardRows(items, { tenantId: 'tA', projectId: 'p1', meetingId: 'm4' }).map((r, i) => ({ ...r, id: `c${i}` }));
    const all = [...items, ...copies];
    const live = liveOpenItems(all);
    expect(live.map((x) => x.id).sort()).toEqual(['c0', 'c1']);
    const s = meetingStats(
      [{ id: 'm3', meeting_date: '2026-10-08', status: 'distributed' }, { id: 'm4', meeting_date: '2026-10-22', status: 'scheduled' }],
      all, T,
    );
    expect(s).toEqual({ upcoming: 1, openItems: 2, overdueItems: 1, distributed: 1 });
  });

  test('per-meeting counts keep each meeting\'s minutes as written', () => {
    const c = itemCountsByMeeting(items, T);
    expect(c.m3).toEqual({ open: 2, overdue: 1, total: 3 });
  });
});

describe('overdue, dates, status, errors', () => {
  test('overdue only when open and past due', () => {
    expect(isItemOverdue({ status: 'open', due_date: '2026-10-14' }, T)).toBe(true);
    expect(isItemOverdue({ status: 'open', due_date: '2026-10-15' }, T)).toBe(false);
    expect(isItemOverdue({ status: 'closed', due_date: '2026-01-01' }, T)).toBe(false);
    expect(isItemOverdue({ status: 'open', due_date: null }, T)).toBe(false);
  });

  test('next meeting is a week on, never in the past', () => {
    expect(nextMeetingDate('2026-10-14', T)).toBe('2026-10-21');
    expect(nextMeetingDate('2026-01-01', T)).toBe(T);
    expect(nextMeetingDate(null, T)).toBe('2026-10-22');
  });

  test('legacy statuses and types normalize', () => {
    expect(normalizeStatus('completed')).toBe('minutes_draft');
    expect(normalizeStatus('cancelled')).toBe('scheduled');
    expect(normalizeStatus('distributed')).toBe('distributed');
    expect(normalizeType('OAC')).toBe('oac');
    expect(normalizeType('custom')).toBe('internal');
  });

  test('missing table is detected from either error shape', () => {
    expect(isMissingTableError({ code: '42P01', message: 'relation "meeting_items" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.meeting_items' in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
