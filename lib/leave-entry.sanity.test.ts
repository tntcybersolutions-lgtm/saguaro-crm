/**
 * Leave entries on the web Time Clock: validation, the insert row, reading hours back.
 * Run: npx -y tsx lib/leave-entry.sanity.test.ts   (exit 0 = every assertion held)
 */
import { checkLeave, isLeaveEntry, leaveHoursOf, leaveInsertRow, leaveOf, NON_WORKED_ENTRY_TYPES } from './leave-entry';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const good = { type: 'pto', date: '2026-10-09', hours: '8', project: 'proj-1' };
const withJobs = { hasProjects: true };

// checkLeave — the happy path
const ok = checkLeave(good, withJobs);
check('valid PTO passes', ok.ok === true);
check('valid PTO carries job, date, hours', ok.ok && ok.projectId === 'proj-1' && ok.date === '2026-10-09' && ok.hours === 8);
check('type is normalised', (() => { const r = checkLeave({ ...good, type: ' Sick ' }, withJobs); return r.ok && r.type === 'sick'; })());
check('half day 4.5 h', (() => { const r = checkLeave({ ...good, hours: '4.5' }, withJobs); return r.ok && r.hours === 4.5; })());
check('hours round to 2 dp', (() => { const r = checkLeave({ ...good, hours: '7.333' }, withJobs); return r.ok && r.hours === 7.33; })());

// checkLeave — every failure names its field
const fail = (d: Partial<typeof good>, o = withJobs) => { const r = checkLeave({ ...good, ...d }, o); return r.ok ? null : r; };
check('no job → project', fail({ project: '' })?.field === 'project');
check('no job, jobs exist → pick one', /Pick the job/.test(fail({ project: '' })?.message || ''));
check('no job, no jobs at all → add a job first', /Add a job first/.test(fail({ project: '' }, { hasProjects: false })?.message || ''));
check('unknown type → type', fail({ type: 'regular' })?.field === 'type');
check('blank type → type', fail({ type: '' })?.field === 'type');
check('blank date → date', fail({ date: '' })?.field === 'date');
check('impossible date → date', fail({ date: '2026-02-30' })?.field === 'date');
check('US-format date → date', fail({ date: '10/09/2026' })?.field === 'date');
check('blank hours → hours (no silent 8)', fail({ hours: '' })?.field === 'hours');
check('text hours → hours', fail({ hours: 'eight' })?.field === 'hours');
check('0 hours → hours', fail({ hours: '0' })?.field === 'hours');
check('negative hours → hours', fail({ hours: '-2' })?.field === 'hours');
check('25 hours → hours', fail({ hours: '25' })?.field === 'hours');
check('24 hours is allowed', checkLeave({ ...good, hours: '24' }, withJobs).ok === true);

// leaveInsertRow — the shape the live table accepts
const row = leaveInsertRow({ tenantId: 't', employeeId: 'e', projectId: 'p', type: 'sick', date: '2026-10-09', hours: 8, timezone: 'America/Phoenix' }) as Record<string, unknown>;
check('row names the job (project_id is NOT NULL)', row.project_id === 'p');
check('row never writes generated total_hours', !('total_hours' in row));
check('row never writes generated labor_cost', !('labor_cost' in row));
check('hours live in hours_worked', row.hours_worked === 8);
check('leave adds no worked hours', row.regular_hours === 0 && row.overtime_hours === 0 && row.doubletime_hours === 0);
check('no rate, so approval posts no labor cost', !('hourly_rate' in row) && !('total_cost' in row) && !('regular_rate_used' in row));
check('no clock_in, so it can never be an open shift', !('clock_in' in row));
check('lands pending with its type', row.status === 'pending' && row.entry_type === 'sick');

// leaveHoursOf — reading back
check('reads hours_worked', leaveHoursOf({ hours_worked: 8, total_hours: 0 }) === 8);
check('generated total_hours 0 is not the answer', leaveHoursOf({ hours_worked: 6, total_hours: 0 }) === 6);
check('string numerics', leaveHoursOf({ hours_worked: '4.5' }) === 4.5);
check('falls back to a positive total_hours', leaveHoursOf({ hours_worked: null, total_hours: 8 }) === 8);
check('nothing recorded → null, never a made-up 8', leaveHoursOf({ hours_worked: null, total_hours: 0 }) === null && leaveHoursOf({}) === null);

// isLeaveEntry
check('regular is worked', !isLeaveEntry('regular'));
check('overtime is worked', !isLeaveEntry('overtime'));
check('missing type is worked', !isLeaveEntry(null) && !isLeaveEntry(''));
check('every non-worked type is leave', NON_WORKED_ENTRY_TYPES.every((t) => isLeaveEntry(t)));

// leaveOf — the timesheet approval list and the WH-347 import
const pto = leaveOf({ entry_type: 'pto', hours_worked: 8, total_hours: 0 });
check('PTO row → label + hours_worked', pto?.label === 'PTO' && pto.hours === 8 && pto.type === 'pto');
const sick = leaveOf({ entry_type: ' Sick ', hours_worked: '4.5' });
check('Sick (any case / spacing) → Sick 4.5', sick?.label === 'Sick' && sick.hours === 4.5);
check('leave with no hours recorded → 0, still leave', leaveOf({ entry_type: 'holiday', hours_worked: null, total_hours: 0 })?.hours === 0);
check('regular shift → null', leaveOf({ entry_type: 'regular', hours_worked: 8 }) === null);
check('overtime shift → null', leaveOf({ entry_type: 'overtime' }) === null);
check('missing type → null (worked)', leaveOf({ hours_worked: 8 }) === null);
check('unknown type is not dropped as leave', leaveOf({ entry_type: 'manual', hours_worked: 8 }) === null);
check('every non-worked type has a leaveOf', NON_WORKED_ENTRY_TYPES.every((t) => leaveOf({ entry_type: t }) !== null));
const week = [
  { entry_type: 'regular', regular_hrs: 8 },
  { entry_type: 'pto', hours_worked: 8, regular_hrs: 0 },
  { entry_type: 'regular', regular_hrs: 6 },
];
check('WH-347 import keeps only worked rows', week.filter((t) => !leaveOf(t)).length === 2);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall leave entry assertions held');
