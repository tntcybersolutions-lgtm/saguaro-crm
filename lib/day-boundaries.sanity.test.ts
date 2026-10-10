/**
 * The helpers the time-zone sweep changed: no built-in home zone anywhere.
 *   lib/radio-promote   localLogDate / displayTime / buildProvenance take the caller's zone
 *   lib/drawing-register revisionDateValue dates "today" in the uploader's zone
 *   lib/timeclock/server resolveTimezone: body → device → company → history → UTC
 * Bundle with esbuild and run with node under TZ=UTC, America/Phoenix, America/Chicago,
 * Pacific/Kiritimati — no answer may depend on the machine's zone.
 */
import { localLogDate, displayTime, buildProvenance, type RadioMessageRow } from './radio-promote';
import { revisionDateValue } from './drawing-register';
import { resolveTimezone } from './timeclock/server';
import { dayIn } from './time-zone';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// 7:30 PM Central on Oct 10 = 5:30 PM Phoenix = 00:30 UTC Oct 11.
const EVENING = '2026-10-11T00:30:00.000Z';

// ── radio ──
check('radio: an Iowa call at 7:30 PM files under Oct 10', localLogDate(EVENING, 'America/Chicago') === '2026-10-10');
check('radio: …a Phoenix call at 5:30 PM under Oct 10', localLogDate(EVENING, 'America/Phoenix') === '2026-10-10');
check('radio: on a UTC clock it is Oct 11', localLogDate(EVENING, 'UTC') === '2026-10-11');
check('radio: 12:30 AM Central is Oct 11 in Iowa while Phoenix is still Oct 10',
  localLogDate('2026-10-11T05:30:00Z', 'America/Chicago') === '2026-10-11' && localLogDate('2026-10-11T05:30:00Z', 'America/Phoenix') === '2026-10-10');
check('radio: a junk zone reads as UTC, not Phoenix', localLogDate(EVENING, 'Phoenix') === '2026-10-11');
check('radio: an unreadable timestamp files to today on that clock', localLogDate('not a time', 'America/Chicago') === dayIn('America/Chicago'));
check('radio: display time on the Iowa clock', displayTime(EVENING, 'America/Chicago') === 'Oct 10, 2026, 7:30 PM', displayTime(EVENING, 'America/Chicago'));
check('radio: display time on the Phoenix clock', displayTime(EVENING, 'America/Phoenix') === 'Oct 10, 2026, 5:30 PM', displayTime(EVENING, 'America/Phoenix'));
const msg: RadioMessageRow = {
  id: 'm1', tenant_id: 't', channel_id: null, project_id: 'p', sender_user_id: null, sender_name: 'ZZ AUDIT Foreman',
  kind: 'text', body: 'ZZ AUDIT rebar delivered', audio_path: null, audio_duration_secs: null, transcript: null, location: null, created_at: EVENING,
};
check('radio: the provenance reads on the caller’s clock', buildProvenance(msg, { tz: 'America/Chicago' }).transmitted_at_display === 'Oct 10, 2026, 7:30 PM');

// ── drawings ──
const asDay = (v: string | null) => (v || '').slice(0, 10);
check('drawing: a title-block day is kept as that day at noon UTC', revisionDateValue('2026-10-02') === '2026-10-02T12:00:00.000Z');
check('drawing: an unreadable value is null', revisionDateValue('garbage') === null && revisionDateValue(null) === null);
check('drawing: "today" is the uploader’s day in their zone',
  asDay(revisionDateValue(null, { defaultToday: true, timeZone: 'America/Chicago' })) === dayIn('America/Chicago') &&
  asDay(revisionDateValue(null, { defaultToday: true, timeZone: 'Pacific/Kiritimati' })) === dayIn('Pacific/Kiritimati'));

// ── time clock zone ──
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const from = (t: string) => {
    reads.push(t);
    const f: Array<(r: Row) => boolean> = [];
    let lim: number | null = null;
    const run = () => { let rows = (tables[t] || []).filter((r) => f.every((p) => p(r))); if (lim != null) rows = rows.slice(0, lim); return rows; };
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      not: (k: string) => { f.push((r) => r[k] != null); return b; },
      order: () => b,
      limit: (n: number) => { lim = n; return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return b;
  };
  return { db: { from } as any, reads };
}
(async () => {
  const tenants = [{ id: 'iowa', time_zone: 'America/Chicago' }, { id: 'none', time_zone: null }];
  const history = [{ tenant_id: 'none', employee_id: 'e2', timezone: 'America/Denver', work_date: '2026-10-01' }];
  const f1 = fakeDb({ tenants, time_entries: history });
  check('clock zone: the body’s zone wins', await resolveTimezone(f1.db, 'iowa', 'e1', 'America/New_York', 'America/Los_Angeles') === 'America/New_York');
  check('clock zone: then the device (x-time-zone)', await resolveTimezone(f1.db, 'iowa', 'e1', undefined, 'America/Los_Angeles') === 'America/Los_Angeles');
  const f2 = fakeDb({ tenants, time_entries: history });
  check('clock zone: then the company (Iowa → Central)', await resolveTimezone(f2.db, 'iowa', 'e1', undefined, null) === 'America/Chicago');
  check('clock zone: a junk device zone is ignored', await resolveTimezone(fakeDb({ tenants }).db, 'iowa', 'e1', undefined, 'Phoenix') === 'America/Chicago');
  check('clock zone: no company zone → the employee’s last shift', await resolveTimezone(fakeDb({ tenants, time_entries: history }).db, 'none', 'e2') === 'America/Denver');
  check('clock zone: nothing known → UTC, never Phoenix', await resolveTimezone(fakeDb({ tenants, time_entries: [] }).db, 'none', 'e9') === 'UTC');

  console.log(`(machine zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
