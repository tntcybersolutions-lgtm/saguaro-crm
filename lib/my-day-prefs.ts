/**
 * lib/my-day-prefs.ts — how one person likes their My Day laid out.
 *
 * The page runs in the order a workday runs: start (clock, the numbers),
 * the day's agenda, what carried over late, today's work, what you are
 * waiting on, the wrap-up before you leave, then the next two weeks and the
 * jobs. Each person can hide, reorder and tune it; the choice is stored in
 * user_preferences.custom_settings.myDay so it follows them to every device.
 * A person who never touched it gets the default for their role.
 *
 * Pure. Tested in my-day.sanity.test.ts.
 */

export const SECTION_IDS = ['start', 'agenda', 'late', 'today', 'waiting', 'wrapup', 'week', 'jobs'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_META: Record<SectionId, { label: string; hint: string; time: string }> = {
  start:   { label: 'Start of day',      hint: 'Clock, on-time score and the numbers',      time: 'Morning' },
  agenda:  { label: "Today's agenda",    hint: 'Meetings and inspections on a timeline',      time: 'Morning' },
  late:    { label: 'Carried over',      hint: 'Late items — clear these first',             time: 'Morning' },
  today:   { label: "Today's work",      hint: 'Due today and must-do-now',                  time: 'Midday' },
  waiting: { label: 'Waiting on others', hint: 'Bidders, subs and owners to chase',          time: 'Midday' },
  wrapup:  { label: 'Before you leave',  hint: 'Daily log, clock out, tomorrow first thing',  time: 'End of day' },
  week:    { label: 'Next two weeks',    hint: 'The runway and everything coming up',        time: 'Look ahead' },
  jobs:    { label: 'Jobs',              hint: 'Where the open work sits, job by job',       time: 'Look ahead' },
};

export type Density = 'comfortable' | 'compact';
export type UpcomingGroup = 'day' | 'job' | 'type';

export interface MyDayPrefs {
  v: 1;
  order: SectionId[];
  hidden: SectionId[];
  density: Density;
  upcomingGroup: UpcomingGroup;
  runwayDays: 7 | 14 | 30;
  showMoney: boolean;
  /** Agenda timeline window, whole hours 0–23. */
  dayStart: number;
  dayEnd: number;
  /** Owners and admins: the company's work or only their own jobs. */
  scope: 'company' | 'mine';
}

const FIELD = ['superintendent', 'foreman', 'field_engineer', 'field_supervisor', 'site_supervisor', 'crew_lead'];
const OFFICE_TOP = ['owner', 'project_executive', 'executive', 'admin', 'accountant'];

/** The layout a person gets before they customize: what their role's day looks like. */
export function roleDefaults(roles: string[], companyWide: boolean): MyDayPrefs {
  const r = (roles[0] || '').toLowerCase();
  const field = FIELD.includes(r);
  const top = companyWide || OFFICE_TOP.includes(r);
  const base: MyDayPrefs = {
    v: 1,
    order: [...SECTION_IDS],
    hidden: [],
    density: 'comfortable',
    upcomingGroup: 'day',
    runwayDays: 14,
    showMoney: true,
    dayStart: 7,
    dayEnd: 17,
    scope: 'company',
  };
  if (field) {
    // The field day: clock in, the agenda, today's work, then the log before leaving.
    return { ...base, order: ['start', 'agenda', 'today', 'late', 'wrapup', 'week', 'waiting', 'jobs'], hidden: ['jobs'], showMoney: false, dayStart: 6, dayEnd: 16 };
  }
  if (top && !field) {
    // The owner's day: what is late and what money is at stake, by job.
    return { ...base, order: ['start', 'late', 'jobs', 'today', 'waiting', 'agenda', 'week', 'wrapup'], upcomingGroup: 'job' };
  }
  return base;
}

const isSection = (v: unknown): v is SectionId => typeof v === 'string' && (SECTION_IDS as readonly string[]).includes(v);
const hour = (v: unknown, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : d;
};

/**
 * A stored or sent value made safe: unknown sections dropped, every section
 * present exactly once (new ones appended in default order), enums checked,
 * the agenda window at least 4 hours. Anything unreadable falls back to `base`.
 */
export function cleanPrefs(raw: unknown, base: MyDayPrefs): MyDayPrefs {
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const seen = new Set<SectionId>();
  const order: SectionId[] = [];
  for (const s of Array.isArray(r.order) ? r.order : []) if (isSection(s) && !seen.has(s)) { seen.add(s); order.push(s); }
  for (const s of base.order) if (!seen.has(s)) order.push(s);
  const hidden = Array.isArray(r.hidden) ? [...new Set((r.hidden as unknown[]).filter(isSection))] : base.hidden;
  let dayStart = hour(r.dayStart, base.dayStart);
  let dayEnd = hour(r.dayEnd, base.dayEnd);
  if (dayEnd - dayStart < 4) { dayStart = base.dayStart; dayEnd = base.dayEnd; }
  return {
    v: 1,
    order,
    // The start band always shows: it is where Customize lives.
    hidden: hidden.filter((s) => s !== 'start'),
    density: r.density === 'compact' ? 'compact' : r.density === 'comfortable' ? 'comfortable' : base.density,
    upcomingGroup: r.upcomingGroup === 'job' || r.upcomingGroup === 'type' || r.upcomingGroup === 'day' ? r.upcomingGroup : base.upcomingGroup,
    runwayDays: r.runwayDays === 7 || r.runwayDays === 30 || r.runwayDays === 14 ? r.runwayDays : base.runwayDays,
    showMoney: typeof r.showMoney === 'boolean' ? r.showMoney : base.showMoney,
    dayStart,
    dayEnd,
    scope: r.scope === 'mine' ? 'mine' : r.scope === 'company' ? 'company' : base.scope,
  };
}

/** Sections to draw, in order. */
export function visibleSections(p: MyDayPrefs): SectionId[] {
  return p.order.filter((s) => !p.hidden.includes(s));
}

/** '6 AM', '12 PM', '5 PM'. */
export function hourLabel(h: number): string {
  const n = ((h % 24) + 24) % 24;
  const ap = n < 12 ? 'AM' : 'PM';
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return `${h12} ${ap}`;
}

/** 'HH:MM' → minutes after midnight, or null. */
export function minutesOf(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

/** '9:30 AM'. */
export function timeLabel(hhmm: string | null | undefined): string {
  const t = minutesOf(hhmm);
  if (t == null) return '';
  const h = Math.floor(t / 60), m = t % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
