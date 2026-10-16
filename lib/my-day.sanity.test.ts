/**
 * @jest-environment node
 *
 * My Day (lib/my-day, lib/my-day-prefs): the numbers, the runway, the job
 * heat, where each row lands, and the layout rules.
 */
import { describe, test, expect } from '@jest/globals';
import type { MyWorkItem } from './my-work';
import {
  applyFilter, countdown, groupItems, holderOf, jobHeat, kindOf, placeItems, pressure, runway, whenOf,
} from './my-day';
import { cleanPrefs, hourLabel, minutesOf, roleDefaults, timeLabel, visibleSections, SECTION_IDS } from './my-day-prefs';

const T = '2026-10-16';
let n = 0;
const item = (p: Partial<MyWorkItem>): MyWorkItem => ({
  key: `k:${++n}`, source: 'todos', title: 'Thing', meta: '', day: null, now: false, tone: 'grey', amount: null,
  href: '/x', action: null, done: null, projectId: null, ...p,
});

const late = item({ title: 'Answer RFI-4', source: 'rfis', day: '2026-10-13', tone: 'red', projectId: 'p1', amount: 1000 });
const nowRed = item({ title: 'Turn on the bid link', source: 'bids', now: true, tone: 'red', projectId: 'p1', amount: 50_000 });
const dueToday = item({ title: 'Host the framing inspection', source: 'inspections', day: T, tone: 'amber', projectId: 'p2' });
const mustNow = item({ title: 'Approve pay app 5', source: 'pay_apps', now: true, tone: 'amber', projectId: 'p2', amount: 478_150 });
const waiting = item({ title: '2 bidders haven\'t answered', source: 'bids', day: '2026-10-20', tone: 'grey', projectId: 'p1', action: { kind: 'remind', packageId: 'b', label: 'Remind', invites: [] } });
const rfiOut = item({ title: 'Get an answer on RFI-9', source: 'rfis', day: '2026-10-18', projectId: 'p2' });
const log = item({ title: "File today's daily log", source: 'daily_logs', now: true, tone: 'amber', projectId: 'p2' });
const tomorrow = item({ title: 'Prep for the roof inspection', source: 'inspections', day: '2026-10-17', tone: 'gold', projectId: 'p1' });
const later = item({ title: 'Submit shop drawings', source: 'submittals', day: '2026-11-20', projectId: 'p1' });
const ALL = [late, nowRed, dueToday, mustNow, waiting, rfiOut, log, tomorrow, later];
const JOBS = { p1: { name: 'Pima', color: '#FB923C' }, p2: { name: 'Copper Ridge', color: null } };

describe('when and countdown', () => {
  test('late is a missed day or a red must-do', () => {
    expect(whenOf(late, T)).toBe('late');
    expect(whenOf(nowRed, T)).toBe('late');
    expect(whenOf(dueToday, T)).toBe('today');
    expect(whenOf(mustNow, T)).toBe('today');
    expect(whenOf(tomorrow, T)).toBe('week');
    expect(whenOf(later, T)).toBe('later');
  });
  test('countdown chips read like a person', () => {
    expect(countdown(late, T)).toEqual({ text: '3d late', tone: 'red' });
    expect(countdown(dueToday, T).text).toBe('Today');
    expect(countdown(tomorrow, T).text).toBe('Tomorrow');
    expect(countdown(waiting, T).text).toBe('in 4d');
    expect(countdown(later, T).text).toBe('Nov 20');
    expect(countdown(mustNow, T)).toEqual({ text: 'Now', tone: 'amber' });
  });
});

describe('ball in court', () => {
  test('chasing bidders, an RFI answer, or owner money is waiting on others', () => {
    expect(holderOf(waiting)).toBe('others');
    expect(holderOf(rfiOut)).toBe('others');
    expect(holderOf(item({ title: 'Collect payment on pay app 4' }))).toBe('others');
    expect(holderOf(late)).toBe('me');
  });
});

describe('pressure', () => {
  test('counts, money at stake and the on-time ring', () => {
    const p = pressure(ALL, T);
    expect(p.total).toBe(9);
    expect(p.late).toBe(2);
    expect(p.today).toBe(3);
    expect(p.week).toBe(3);
    expect(p.later).toBe(1);
    expect(p.atStake).toBe(1000 + 50_000 + 478_150);
    expect(p.waiting).toBe(2);
    expect(p.onTimePct).toBe(78);
  });
  test('nothing open is 100 % on time', () => {
    expect(pressure([], T).onTimePct).toBe(100);
  });
});

describe('runway', () => {
  test('late column first, today next, one column per day', () => {
    const r = runway(ALL, T, 14);
    expect(r).toHaveLength(15);
    expect(r[0].day).toBe('late');
    expect(r[0].total).toBe(2);
    expect(r[0].red).toBe(2);
    expect(r[1].isToday).toBe(true);
    expect(r[1].total).toBe(3); // due today + two undated must-dos
    expect(r[2].day).toBe('2026-10-17');
    expect(r[2].gold).toBe(1);
    expect(r.some((c) => c.day === '2026-11-20')).toBe(false);
  });
  test('weekends are marked', () => {
    const r = runway([], T, 7);
    expect(r.find((c) => c.day === '2026-10-17')?.weekend).toBe(true);
    expect(r.find((c) => c.day === '2026-10-19')?.weekend).toBe(false);
  });
});

describe('placement — every row once', () => {
  test('waiting and the daily log get their own sections', () => {
    const p = placeItems(ALL, { waiting: true, wrapup: true, late: true }, T);
    const keys = [...p.late, ...p.today, ...p.waiting, ...p.wrapup, ...p.upcoming].map((i) => i.key);
    expect(new Set(keys).size).toBe(ALL.length);
    expect(p.waiting.map((i) => i.title)).toEqual(expect.arrayContaining([waiting.title, rfiOut.title]));
    expect(p.wrapup.map((i) => i.title)).toEqual([log.title]);
    expect(p.late.map((i) => i.title)).toEqual(expect.arrayContaining([late.title, nowRed.title]));
    expect(p.tomorrow.map((i) => i.title)).toEqual([tomorrow.title]);
  });
  test('hiding a section never hides work', () => {
    const p = placeItems(ALL, { waiting: false, wrapup: false, late: false }, T);
    const keys = [...p.late, ...p.today, ...p.waiting, ...p.wrapup, ...p.upcoming].map((i) => i.key);
    expect(new Set(keys).size).toBe(ALL.length);
    expect(p.waiting).toHaveLength(0);
    expect(p.late).toHaveLength(0);
    expect(p.today.map((i) => i.title)).toEqual(expect.arrayContaining([late.title, log.title]));
  });
});

describe('job heat and grouping', () => {
  test('the job with the most late work leads', () => {
    const h = jobHeat(ALL, JOBS, T);
    expect(h[0].name).toBe('Pima');
    expect(h[0].late).toBe(2);
    expect(h[0].open).toBe(5);
  });
  test('groups by type and by job', () => {
    expect(groupItems(ALL, 'type', T, JOBS).map((g) => g.key)).toContain('rfi');
    const byJob = groupItems(ALL, 'job', T, JOBS);
    expect(byJob[0].label).toBe('Pima');
    expect(byJob[0].tone).toBe('red');
    expect(kindOf(dueToday)).toBe('inspection');
  });
  test('filters combine', () => {
    expect(applyFilter(ALL, { when: 'late' }, T)).toHaveLength(2);
    expect(applyFilter(ALL, { when: 'waiting' }, T)).toHaveLength(2);
    expect(applyFilter(ALL, { projectId: 'p2', kind: 'payapp' }, T)).toHaveLength(1);
    expect(applyFilter(ALL, { q: 'rfi' }, T)).toHaveLength(2);
    expect(applyFilter(ALL, { day: 'late' }, T)).toHaveLength(2);
    expect(applyFilter(ALL, { day: '2026-10-17' }, T)).toHaveLength(1);
  });
});

describe('layout preferences', () => {
  test('role defaults: field crews start with the agenda, owners with money by job', () => {
    expect(roleDefaults(['superintendent'], false).order.slice(0, 3)).toEqual(['start', 'agenda', 'today']);
    expect(roleDefaults(['superintendent'], false).showMoney).toBe(false);
    const owner = roleDefaults([], true);
    expect(owner.order.slice(0, 3)).toEqual(['start', 'late', 'jobs']);
    expect(owner.upcomingGroup).toBe('job');
    expect(roleDefaults(['project_manager'], false).order).toEqual([...SECTION_IDS]);
  });
  test('clean: every section once, unknowns dropped, start never hidden, bad values fall back', () => {
    const base = roleDefaults([], false);
    const p = cleanPrefs({ order: ['week', 'bogus', 'week', 'late'], hidden: ['start', 'jobs', 'nope'], density: 'tiny', runwayDays: 99, dayStart: 9, dayEnd: 11, showMoney: false, scope: 'mine' }, base);
    expect(p.order[0]).toBe('week');
    expect(p.order[1]).toBe('late');
    expect(new Set(p.order).size).toBe(SECTION_IDS.length);
    expect(p.hidden).toEqual(['jobs']);
    expect(p.density).toBe('comfortable');
    expect(p.runwayDays).toBe(14);
    expect([p.dayStart, p.dayEnd]).toEqual([base.dayStart, base.dayEnd]); // a 2-hour window is too short
    expect(p.showMoney).toBe(false);
    expect(p.scope).toBe('mine');
    expect(visibleSections(p)).not.toContain('jobs');
    expect(cleanPrefs('junk', base)).toBe(base);
  });
  test('time labels', () => {
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(13)).toBe('1 PM');
    expect(minutesOf('09:30:00')).toBe(570);
    expect(minutesOf('25:00')).toBeNull();
    expect(timeLabel('14:05')).toBe('2:05 PM');
  });
});
