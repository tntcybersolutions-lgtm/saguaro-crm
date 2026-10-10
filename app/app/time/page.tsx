'use client';
/**
 * Time Clock (web) — Pass 4, on the RFIs reference layout (console + register + rail).
 *
 * Clock in/out goes through the canonical timeclock API
 * (/api/timeclock/status|in|out) so this screen and the field screen agree on one
 * server-side truth: open-shift detection, idempotent clock-in, honest failures,
 * and the clock_punches audit trail all live on the server. This page never
 * writes clock events directly (that path had no dupe guard — two tabs or a
 * double-click opened two shifts).
 *
 * Everything else is unchanged: the weekly timesheet still comes from the shared
 * deterministic lib/timeclock engine (same as iOS) reading time_entries through the
 * RLS-scoped browser client, and manual add/edit + PTO/sick logging still write
 * directly (they are not clock events).
 *
 * Anatomy: title → StatRow (today / week / overtime / gross or pending) →
 * workspace: shift console + this week + the entries register (DataTable) on the
 * left, a 320–384px "this week at a glance" + "after you clock out" rail on the
 * right. Phone: stacked. Add / edit time and PTO open in a FormModal. "Live"
 * only ever appears next to a timestamp (the running shift's clock-in time).
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import { computeTimesheet, weekKey, fmtHours, liveElapsed, type TimeEntry } from '@/lib/timeclock';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { Clock, Play, Stop, Plus, Trash, PaperPlaneRight, Sun, MapPin, HardHat, Timer, PencilSimple } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState, DetailList,
  FormModal, Field, Input, Select, FormGrid,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps } from '@/components/ui/premium';
import { layout } from '@/lib/design-tokens';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();
const localDay = (d = new Date()) => { const o = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - o).toISOString().slice(0, 10); };
const fmtTime = (iso: string | null) => { if (!iso) return '--'; const d = new Date(iso); return isNaN(d.getTime()) ? '--' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (s: string) => { const d = new Date(s + 'T12:00:00'); return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
const splitOT = (h: number) => ({ regular: Math.min(h, 8), overtime: Math.max(0, h - 8) });
const round2 = (n: number) => Math.round(n * 100) / 100;

/* The browser's `timeout` only starts once permission is granted — while the
   location prompt sits unanswered neither callback fires and Clock In hung on
   "Clocking in…" for good (seen in Chrome device mode). A hard 8 s race wins
   either way: the shift is stamped without GPS rather than never. */
async function geo(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  const ask = new Promise<{ lat: number; lng: number } | null>((res) => {
    try {
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 6000, maximumAge: 60000 });
    } catch { res(null); }
  });
  const giveUp = new Promise<null>((res) => setTimeout(() => res(null), 8000));
  return Promise.race([ask, giveUp]);
}

/** The canonical shift shape returned by /api/timeclock/* — the server's truth. */
type Shift = {
  id: string;
  projectId: string | null;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  status: string;
  timezone: string | null;
  costCodeId: string | null;
  csiDivision: string | null;
  hoursWorked: number | null;
  mealBreakMins: number | null;
};

/** POST to the timeclock API. Never throws on a non-2xx — the caller decides what each status means. */
async function postClock(path: string, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON body — handled as an unknown failure below */ }
  return { status: res.status, json };
}

/** One status → one badge. Pending stays amber, approved green, the running
 *  shift green with a dot, rejected red; everything else neutral. */
function entryStatus(s: string | null | undefined): { label: string; tone: BadgeTone } {
  const k = String(s || '').toLowerCase();
  if (k === 'clocked_in') return { label: 'On the Clock', tone: 'ongoing' };
  if (k === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (k === 'pending') return { label: 'Pending', tone: 'under_contract' };
  if (k === 'rejected') return { label: 'Rejected', tone: 'overdue' };
  return { label: k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—', tone: 'neutral' };
}
const LEAVE_LABEL: Record<string, string> = { pto: 'PTO', sick: 'Sick', holiday: 'Holiday', vacation: 'Vacation' };

const CSS = `
.tcWs > .k-page { max-width: none; }
.tcCq { container: tcws / inline-size; min-width: 0; }
.tcSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.tcSplit > * { min-width: 0; }
.tcMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.tcRail { order: -1; display: flex; flex-direction: column; gap: 16px; }
@container tcws (min-width: 900px) {
  .tcSplit { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 30%, ${layout.detailRailMax}px); }
  .tcRail { order: 0; position: sticky; top: 16px; }
}
.tcConsole { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 10px 0 6px; }
.tcClock { font-size: 46px; font-weight: 800; letter-spacing: -1px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; line-height: 1.1; }
.tcClock[data-live="true"] { color: var(--status-ongoing); }
.tcSince { color: var(--text-tertiary); font-size: var(--fs-sm); }
.tcFacts { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; font-size: var(--fs-xs); color: var(--text-tertiary); }
.tcFacts span { display: inline-flex; align-items: center; gap: 5px; }
.tcPickers { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; width: 100%; max-width: 560px; margin-top: 6px; text-align: left; }
@media (max-width: 560px) { .tcPickers { grid-template-columns: minmax(0, 1fr); } }
.tcBigBtn { min-height: 52px; padding: 0 28px; font-size: var(--fs-md); border-radius: var(--radius-md); margin-top: 8px; }
.tcBigBtn[data-live="true"] { background: rgba(255,77,94,.14); border-color: rgba(255,77,94,.45); color: var(--status-overdue); }
.tcBigBtn[data-live="false"] { background: rgba(46,229,157,.14); border-color: rgba(46,229,157,.45); color: var(--status-ongoing); }
.tcMsg { font-size: var(--fs-sm); color: var(--status-ongoing); }
.tcMsg[data-tone="err"] { color: var(--status-overdue); }
.tcDays { display: flex; flex-direction: column; gap: 4px; }
.tcDay { display: flex; align-items: center; gap: 12px; padding: 5px 0; font-size: var(--fs-sm); }
.tcDay > span:first-child { width: 110px; flex-shrink: 0; color: var(--text-secondary); }
.tcBar { flex: 1; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }
.tcBarFill { height: 100%; border-radius: 999px; background: rgba(46,229,157,.75); }
.tcBarFill[data-ot="true"] { background: var(--status-under-contract); }
.tcDay > b { font-weight: 700; font-variant-numeric: tabular-nums; width: 56px; text-align: right; color: var(--text-primary); }
.tcMuted { color: var(--text-tertiary); }
.tcNum { font-variant-numeric: tabular-nums; }
.tcList .k-table th:first-child, .tcList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.tcList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.tcDate { color: var(--text-primary); font-weight: 800; white-space: nowrap; }
.tcSeg[aria-pressed="true"] { border-color: var(--border-strong); background: rgba(255,255,255,0.12); color: var(--text-primary); }
.tcSegRow { display: flex; gap: 8px; flex-wrap: wrap; }
.tcDateInput { width: 100%; }
.tcNote { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.5; margin-top: 8px; }
@media (max-width: 640px) {
  .tcWs .k-btn, .tcWs .k-stat, .tcWs select.k-select, .tcWs .k-input { min-height: 44px; }
  .tcWs .k-table td { height: 48px; }
  .tcClock { font-size: 38px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function TimeClockPage() {
  const sb = getSupabaseBrowser();
  const [emp, setEmp] = useState<any>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok');
  const [manual, setManual] = useState<any | null>(null);
  const [leave, setLeave] = useState<any | null>(null);
  const [csiDiv, setCsiDiv] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);
  const [manualErr, setManualErr] = useState('');
  // Server truth for the clock. `statusLoaded` stays false until /status answers once,
  // so an unreachable API falls back to the read path instead of faking "clocked out".
  const [shift, setShift] = useState<Shift | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const inflight = useRef(false); // double-tap guard that beats a React re-render

  const say = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => { setMsg(text); setMsgTone(tone); }, []);

  const loadEntries = useCallback(async (empId: string) => {
    const { data } = await sb.from('time_entries').select('id, project_id, work_date, clock_in, clock_out, hours_worked, regular_hours, overtime_hours, total_hours, status, timezone, entry_type, meal_break_mins, csi_division, cost_code_description').eq('employee_id', empId).order('work_date', { ascending: false }).order('clock_in', { ascending: false }).limit(80);
    setEntries(data ?? []);
  }, [sb]);

  /** Ask the server whether we are on the clock. Returns the payload, or null if it could not be reached. */
  const syncStatus = useCallback(async (): Promise<any | null> => {
    try {
      const res = await fetch('/api/timeclock/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return null;
      const j = await res.json();
      setShift((j?.shift ?? null) as Shift | null);
      setStatusLoaded(true);
      return j;
    } catch (e) {
      console.error(e);
      return null; // leave statusLoaded alone — never invent a clock state we could not verify
    }
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBrowserSession(); // the app auths via server cookies — hydrate the browser client or every query below is signed out
      const { data: { user } } = await sb.auth.getUser();
      /* Default to a job only when there is exactly one it could be.
         It used to pre-select whichever project sorted first alphabetically,
         so a GC with several jobs could clock a full shift onto the wrong one
         without ever touching the picker — and labor cost lands in that job's
         budget. With more than one job, the choice has to be deliberate. */
      sb.from('projects').select('id, name').order('name').then(({ data }) => {
        setProjects(data ?? []);
        if (data?.length === 1) setProjectId(data[0].id);
      });
      if (!user?.email) return;
      // Resolve the signed-in user's tenant so every write is tenant-scoped (RLS/NOT NULL) — without
      // this, the employees insert below is silently rejected and the page hangs on "Resolving…".
      const { data: prof } = await sb.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
      const tid = (prof as any)?.tenant_id ?? user.id;
      setTenantId(tid);
      // The API resolves the caller to an employees row server-side; prefer its answer so this page
      // reads the SAME employee the clock writes against (and so we never create a rival row).
      const st = await syncStatus();
      const empCols = 'id, regular_rate, overtime_rate, full_name, first_name';
      let e: any = null;
      if (st?.employee?.id) {
        const { data } = await sb.from('employees').select(empCols).eq('id', st.employee.id).maybeSingle();
        e = data ?? { id: st.employee.id, full_name: st.employee.name ?? null, first_name: null, regular_rate: null, overtime_rate: null };
      }
      if (!e) {
        const byEmail = await sb.from('employees').select(empCols).eq('email', user.email).maybeSingle();
        e = byEmail.data;
        if (!e) { const ins = await sb.from('employees').insert({ tenant_id: tid, email: user.email, first_name: user.email.split('@')[0], last_name: '—', is_active: true }).select(empCols).maybeSingle(); e = ins.data; }
      }
      if (e) { setEmp(e); loadEntries(e.id); }
    })();
  }, [sb, loadEntries, syncStatus]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Re-check the server when the tab comes back or once a minute, so a clock-out on the phone
  // (or in another tab) is reflected here instead of two surfaces disagreeing.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') void syncStatus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const t = setInterval(onFocus, 60000);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); clearInterval(t); };
  }, [syncStatus]);

  // The open shift is whatever the SERVER says is open. Before /status has answered once we fall
  // back to the entries read path so the screen is never blank-but-wrong.
  const openShift = useMemo(() => {
    if (!statusLoaded) return entries.find((e) => e.status === 'clocked_in') ?? null;
    if (!shift || shift.clockOut) return null;
    const local = entries.find((e) => e.id === shift.id);
    return {
      id: shift.id,
      project_id: shift.projectId,
      work_date: shift.workDate,
      clock_in: shift.clockIn,
      clock_out: null,
      status: 'clocked_in',
      timezone: shift.timezone,
      csi_division: shift.csiDivision,
      cost_code_description: local?.cost_code_description ?? null,
      meal_break_mins: shift.mealBreakMins,
    } as any;
  }, [statusLoaded, shift, entries]);
  const rates = () => { const reg = Number(emp?.regular_rate ?? 0) || 0; return { regular_rate_used: reg, overtime_rate_used: Number(emp?.overtime_rate ?? 0) || round2(reg * 1.5), doubletime_rate_used: round2(reg * 2) }; };

  // Map rows → engine entries → this week's timesheet.
  const sheet = useMemo(() => {
    const te: TimeEntry[] = entries.map((e) => {
      const worked = !e.entry_type || e.entry_type === 'regular';
      return worked
        ? { id: e.id, employeeId: emp?.id ?? '', projectId: e.project_id, type: 'regular', clockIn: e.clock_in, clockOut: e.clock_out, breakMinutes: e.meal_break_mins || 0, timezone: e.timezone || TZ }
        : { id: e.id, employeeId: emp?.id ?? '', type: e.entry_type, hours: Number(e.total_hours ?? e.hours_worked ?? 8), timezone: e.timezone || TZ, clockIn: (e.work_date || localDay()) + 'T12:00:00' };
    });
    return computeTimesheet(te, { weeklyOtThreshold: 40 });
  }, [entries, emp]);
  const thisWeekKey = weekKey(new Date().toISOString(), TZ, 0);
  const week = sheet.weeks.find((w) => w.weekStart === thisWeekKey) ?? null;
  const todayStr = localDay();
  const todayHours = round2(entries.filter((e) => e.work_date === todayStr && e.clock_out).reduce((s, e) => s + (Number(e.total_hours ?? e.hours_worked ?? 0) || 0), 0));
  // Week intelligence — the screen walks in knowing rates, OT exposure, and what's pending.
  const projName = projects.find((p) => p.id === projectId)?.name || '';
  const regRate = Number(emp?.regular_rate ?? 0) || 0;
  const otRate = Number(emp?.overtime_rate ?? 0) || round2(regRate * 1.5);
  const estGross = week ? round2((Number(week.regularHours) || 0) * regRate + (Number(week.overtimeHours) || 0) * otRate) : 0;
  const leaveHours = week ? round2(Object.entries(week.byType).filter(([k]) => k !== 'regular').reduce((s, [, v]) => s + (Number(v) || 0), 0)) : 0;
  const pendingCount = entries.filter((e) => e.status === 'pending').length;
  const fmtMoney = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Clock in / out go through the canonical API. The server owns open-shift detection, the
  // dupe guard, the hours math, and the clock_punches audit row — this screen only reports it.
  const clockIn = async () => {
    if (busy || inflight.current) return;
    if (!projectId && projects.length > 0) { say('Pick a project before clocking in.', 'err'); return; }
    inflight.current = true; setBusy(true); setMsg('');
    try {
      const g = await geo();
      const { status, json } = await postClock('/api/timeclock/in', {
        ...(projectId ? { projectId } : {}),
        ...(csiDiv ? { csiDivision: csiDiv } : {}),
        ...(g ? { lat: g.lat, lng: g.lng } : {}),
        clientTime: new Date().toISOString(),
      });
      if (status >= 200 && status < 300 && json?.ok && json?.shift) {
        setShift(json.shift as Shift); setStatusLoaded(true);
        // alreadyOpen means the server refused to open a second shift — adopt the one it returned.
        say(json.alreadyOpen ? 'You were already on the clock — showing your open shift.' : 'Clocked in');
        if (emp) await loadEntries(emp.id);
      } else {
        say(humanError(json, "Couldn't clock you in. Please try again."), 'err');
        await syncStatus(); // never leave the UI showing a state the server did not confirm
      }
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't reach the clock. Check your connection and try again."), 'err'); }
    inflight.current = false; setBusy(false);
  };

  const clockOut = async () => {
    if (busy || inflight.current) return;
    if (!openShift) { say('You are not on the clock.', 'err'); return; }
    inflight.current = true; setBusy(true); setMsg('');
    try {
      const g = await geo();
      const meal = Number(openShift.meal_break_mins ?? 30) || 0;
      const { status, json } = await postClock('/api/timeclock/out', {
        shiftId: openShift.id,
        breakMinutes: meal,
        ...(g ? { lat: g.lat, lng: g.lng } : {}),
        clientTime: new Date().toISOString(),
      });
      if (status >= 200 && status < 300 && json?.ok) {
        setShift(null); setStatusLoaded(true);
        const worked = Number(json?.hours?.worked ?? json?.shift?.hoursWorked ?? 0) || 0;
        say(`Clocked out — ${worked.toFixed(2)} h`);
        if (emp) await loadEntries(emp.id);
      } else if (status === 409) {
        await syncStatus();
        say(humanError(json, 'You are not on the clock.'), 'err');
        if (emp) await loadEntries(emp.id);
      } else {
        say(humanError(json, "Couldn't clock you out. Please try again."), 'err');
        await syncStatus();
      }
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't reach the clock. Check your connection and try again."), 'err'); }
    inflight.current = false; setBusy(false);
  };

  /** Say what is missing inside the dialog, and put the cursor on it. */
  const manualStop = (text: string, fieldId: string) => {
    setManualErr(text);
    window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
  };

  const saveManual = async () => {
    if (!manual) return;
    if (!emp) { setManualErr('Your employee record is still loading. Try again in a moment.'); return; }
    /* A cleared time field used to reach `new Date('…T:00').toISOString()`,
       which throws — outside the try, so the tap did nothing and said nothing.
       Each required value is now checked here and named in the dialog. */
    const entryProject = manual.id ? null : (manual.project || '');
    if (!manual.id && !entryProject) { manualStop('Pick the project these hours go to.', 'tc-manual-project'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manual.date || ''))) { manualStop('Pick the date you worked.', 'tc-manual-date'); return; }
    if (!/^\d{2}:\d{2}/.test(String(manual.in || ''))) { manualStop('Enter the Clock In time.', 'tc-manual-in'); return; }
    if (!/^\d{2}:\d{2}/.test(String(manual.out || ''))) { manualStop('Enter the Clock Out time.', 'tc-manual-out'); return; }
    const inAt = new Date(`${manual.date}T${manual.in}:00`);
    let outAt = new Date(`${manual.date}T${manual.out}:00`);
    if (Number.isNaN(inAt.getTime()) || Number.isNaN(outAt.getTime())) { manualStop('Enter the Clock In and Clock Out times.', 'tc-manual-in'); return; }
    if (outAt.getTime() === inAt.getTime()) { manualStop('Clock Out must be later than Clock In.', 'tc-manual-out'); return; }
    // Out earlier than in is a night shift that ended the next morning.
    if (outAt.getTime() < inAt.getTime()) outAt = new Date(outAt.getTime() + 24 * 3600000);
    setManualErr('');
    const inISO = inAt.toISOString();
    const outISO = outAt.toISOString();
    const meal = Math.max(0, parseInt(manual.meal) || 0);
    const gross = Math.max(0, (Date.parse(outISO) - Date.parse(inISO)) / 3600000);
    const hrs = round2(Math.max(0, gross - meal / 60)); const { regular, overtime } = splitOT(hrs);
    /* Every write on this page is payroll. supabase-js resolves with { error }
       rather than throwing, so the try/catch wrapped around these never fired:
       a rejected insert closed the dialog, reloaded the list, and the hours
       were simply gone — with "Week submitted for approval" on screen. Each
       result is now read and thrown so the catch below does its job. */
    setSavingEntry(true);
    try {
      const { error } = manual.id
        ? await sb.from('time_entries').update({ work_date: manual.date, clock_in: inISO, clock_out: outISO, hours_worked: hrs, regular_hours: round2(regular), overtime_hours: round2(overtime), meal_break_mins: meal, csi_division: manual.csi || null, cost_code_description: manual.csi ? (CSI_DIVISIONS[manual.csi]?.name || null) : null, ...rates() }).eq('id', manual.id)
        : await sb.from('time_entries').insert({ tenant_id: tenantId, employee_id: emp.id, project_id: entryProject, work_date: manual.date, clock_in: inISO, clock_out: outISO, hours_worked: hrs, regular_hours: round2(regular), overtime_hours: round2(overtime), meal_break_mins: meal, status: 'pending', timezone: TZ, entry_type: 'regular', ...(manual.csi ? { csi_division: manual.csi, cost_code_description: CSI_DIVISIONS[manual.csi]?.name || null } : {}), ...rates() });
      if (error) throw error;
      setManual(null); await loadEntries(emp.id);
    } catch (e: any) { console.error(e); setManualErr(humanError(e, "Couldn't save that time entry.")); }
    finally { setSavingEntry(false); }
  };
  const saveLeave = async () => {
    if (!emp || !leave) return;
    setSavingEntry(true);
    try {
      const { error } = await sb.from('time_entries').insert({ tenant_id: tenantId, employee_id: emp.id, work_date: leave.date, entry_type: leave.type, hours_worked: parseFloat(leave.hours) || 8, total_hours: parseFloat(leave.hours) || 8, status: 'pending', timezone: TZ });
      if (error) throw error;
      setLeave(null); await loadEntries(emp.id); say('Logged');
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't log that leave."), 'err'); }
    finally { setSavingEntry(false); }
  };
  const del = async (id: string) => {
    const { error } = await sb.from('time_entries').delete().eq('id', id);
    if (error) { console.error(error); say(humanError(error, "Couldn't delete that entry."), 'err'); return; }
    if (emp) loadEntries(emp.id);
  };
  const submitWeek = async () => {
    if (!week || !emp) return;
    try {
      const { error } = await sb.from('timesheets').insert({ tenant_id: tenantId, employee_id: emp.id, employee_name: emp.full_name || emp.first_name, week_ending: localDay(new Date(new Date(thisWeekKey + 'T12:00').getTime() + 6 * 86400000)), hours_regular: week.regularHours, hours_overtime: week.overtimeHours, status: 'submitted', submitted_at: new Date().toISOString() });
      if (error) throw error;
      say('Week submitted for approval');
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't submit the week for approval."), 'err'); }
  };

  const clockedIn = !!openShift;
  const openManualFor = (e: any) => { setManualErr(''); setManual({ id: e.id, date: e.work_date, in: e.clock_in ? new Date(e.clock_in).toTimeString().slice(0, 5) : '07:00', out: e.clock_out ? new Date(e.clock_out).toTimeString().slice(0, 5) : '15:30', meal: String(e.meal_break_mins ?? 30), csi: e.csi_division || '' }); };
  // The job is picked in the dialog (time_entries.project_id is required) —
  // pre-filled from the console picker when one is already chosen.
  const openAddTime = () => { setManualErr(''); setManual({ date: localDay(), in: '07:00', out: '15:30', meal: '30', csi: csiDiv, project: projectId || (projects.length === 1 ? projects[0].id : '') }); };
  const openLeave = () => setLeave({ date: localDay(), type: 'pto', hours: '8' });

  const elapsed = (() => {
    if (!clockedIn) return null;
    const h = liveElapsed(openShift.clock_in, new Date(now).toISOString());
    const s = Math.floor(h * 3600);
    return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  })();

  // ── Stat tiles ──
  const stats: StatItem[] = [
    { label: 'Today', value: `${todayHours.toFixed(2)} h`, tone: clockedIn ? 'good' : 'default', sub: clockedIn ? `Shift running since ${fmtTime(openShift.clock_in)}` : 'Completed shifts' },
    { label: 'This Week', value: `${(week?.workedHours ?? 0).toFixed(2)} h`, sub: `Week of ${fmtDate(thisWeekKey)}` },
    { label: 'Overtime', value: `${(week?.overtimeHours ?? 0).toFixed(2)} h`, tone: (week?.overtimeHours ?? 0) > 0 ? 'warn' : 'default', sub: 'Past 40 h/week or 8 h/day' },
    ...(regRate > 0
      ? [{ label: 'Est. Gross', value: fmtMoney(estGross), tone: 'good' as const, sub: `$${regRate}/h reg · $${otRate}/h OT` }]
      : [{ label: 'Pending Approval', value: String(pendingCount), tone: pendingCount > 0 ? 'warn' as const : 'default' as const, sub: 'Entries awaiting review' }]),
  ];

  // ── Entries register ──
  const columns: Column<any>[] = [
    { key: 'work_date', header: 'Date', accessor: (e) => `${e.work_date || ''}|${e.clock_in || ''}`, width: 130, render: (e) => <span className="tcDate">{fmtDate(e.work_date)}</span> },
    { key: 'kind', header: 'Project / Type', accessor: (e) => (e.entry_type && e.entry_type !== 'regular') ? e.entry_type : (projects.find((p) => p.id === e.project_id)?.name || ''), render: (e) => {
      const leaveType = e.entry_type && e.entry_type !== 'regular';
      if (leaveType) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}><Sun size={14} /> {LEAVE_LABEL[e.entry_type] || String(e.entry_type).toUpperCase()}</span>;
      const name = e.project_id ? (projects.find((p) => p.id === e.project_id)?.name || 'Project') : '';
      return name ? <span style={{ color: 'var(--text-primary)' }}>{name}</span> : <span className="tcMuted">No project</span>;
    } },
    { key: 'span', header: 'In – Out', accessor: (e) => e.clock_in || '', render: (e) => {
      const leaveType = e.entry_type && e.entry_type !== 'regular';
      if (leaveType) return <span className="tcMuted">{`${e.hours_worked ?? e.total_hours ?? 8}h logged`}</span>;
      return <span className="tcNum">{fmtTime(e.clock_in)} – {e.status === 'clocked_in' ? 'now' : fmtTime(e.clock_out)}</span>;
    } },
    { key: 'csi', phone: 'hide', header: 'Cost Code', accessor: (e) => e.csi_division || '', render: (e) => e.csi_division ? <Badge tone="neutral">Div {e.csi_division} · {e.cost_code_description || CSI_DIVISIONS[e.csi_division]?.name || 'Cost coded'}</Badge> : <span className="tcMuted">—</span> },
    { key: 'hours', phone: 'show', header: 'Hours', accessor: (e) => Number(e.total_hours ?? e.hours_worked ?? 0) || 0, align: 'right', render: (e) => <span className="tcNum" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{e.status === 'clocked_in' ? '—' : `${(Number(e.total_hours ?? e.hours_worked ?? 0) || 0).toFixed(2)}h`}</span> },
    { key: 'status', phone: 'show', header: 'Status', accessor: (e) => entryStatus(e.status).label, render: (e) => { const s = entryStatus(e.status); return <Badge tone={s.tone} dot={e.status === 'clocked_in'}>{s.label}</Badge>; } },
  ];
  const rowActions = (e: any): Action[] => {
    const leaveType = e.entry_type && e.entry_type !== 'regular';
    return [
      { label: 'Edit Time', icon: <PencilSimple size={15} />, onClick: () => openManualFor(e), hidden: leaveType || e.status === 'clocked_in' },
      { label: 'Delete', icon: <Trash size={15} />, onClick: () => del(e.id), tone: 'danger', hidden: e.status === 'clocked_in' || e.status === 'approved' },
    ];
  };

  const leaveSummary = week ? Object.entries(week.byType).filter(([k]) => k !== 'regular') : [];

  return (
    <div className="tcWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Time Clock' }]}
        title="Time Clock"
        subtitle="GPS-stamped, CSI-coded labor. Same engine as the phone."
        actions={
          <>
            <Button icon={<Plus size={15} weight="bold" />} onClick={openAddTime} disabled={!emp}>Add Time</Button>
            <Button icon={<Sun size={15} weight="fill" />} onClick={openLeave} disabled={!emp}>PTO / Sick</Button>
          </>
        }
      >
        <StatRow items={stats} />

        <div className="tcCq">
          <div className="tcSplit">
            <div className="tcMain">
              {/* Shift console — walks in knowing the project, cost code, timezone, and GPS */}
              <Card>
                <div className="tcConsole">
                  <div className="tcClock" data-live={clockedIn ? 'true' : 'false'} aria-live="polite">{clockedIn ? elapsed : 'Clocked Out'}</div>
                  <div className="tcSince">{clockedIn ? `Since ${fmtTime(openShift.clock_in)} · ${openShift.timezone || TZ}` : (emp ? 'Ready to clock in' : 'Resolving your employee record…')}</div>
                  <div className="tcFacts">
                    <span><HardHat size={13} />{clockedIn ? (projects.find((p) => p.id === openShift.project_id)?.name || 'Project') : (projName || 'Pick a project below')}</span>
                    <span><Timer size={13} />{clockedIn ? (openShift.csi_division ? `Div ${openShift.csi_division} — ${openShift.cost_code_description || CSI_DIVISIONS[openShift.csi_division]?.name || 'cost coded'}` : 'No cost code on this shift') : (csiDiv ? `Div ${csiDiv} — ${CSI_DIVISIONS[csiDiv]?.name}` : 'No cost code — pick one below')}</span>
                    <span><MapPin size={13} />GPS stamps in &amp; out</span>
                  </div>
                  {!clockedIn && (
                    <div className="tcPickers">
                      <Field label="Project" hint={projects.length > 1 ? 'Labor cost lands in this job’s budget.' : undefined}>
                        <Select
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          placeholder={projects.length === 1 ? undefined : 'Select project…'}
                          options={projects.map((p) => ({ value: p.id, label: p.name }))}
                        />
                      </Field>
                      <Field label="Cost Code" hint="CSI division applied to the next clock-in.">
                        <Select
                          value={csiDiv}
                          onChange={(e) => setCsiDiv(e.target.value)}
                          options={[{ value: '', label: 'No Cost Code' }, ...Object.entries(CSI_DIVISIONS).map(([code, d]) => ({ value: code, label: `Div ${code} — ${d.name}` }))]}
                        />
                      </Field>
                    </div>
                  )}
                  <Button
                    className="tcBigBtn"
                    data-live={clockedIn ? 'true' : 'false'}
                    icon={clockedIn ? <Stop size={20} weight="fill" /> : <Play size={20} weight="fill" />}
                    onClick={clockedIn ? clockOut : clockIn}
                    disabled={busy || !emp}
                  >
                    {busy ? (clockedIn ? 'Clocking out…' : 'Clocking in…') : clockedIn ? 'Clock Out' : 'Clock In'}
                  </Button>
                  {msg && <div className="tcMsg" data-tone={msgTone} role="status">{msg}</div>}
                </div>
              </Card>

              {week && (
                <Card
                  title={`Week of ${fmtDate(week.weekStart)}`}
                  subtitle={`${week.regularHours.toFixed(2)} h regular · ${week.overtimeHours.toFixed(2)} h overtime${regRate > 0 ? ` · est. ${fmtMoney(estGross)} gross` : ''}`}
                  actions={<Button size="sm" icon={<PaperPlaneRight size={14} />} onClick={submitWeek}>Submit Week</Button>}
                >
                  <div className="tcDays">
                    {week.days.map((d) => {
                      const hrs = Number(d.hours) || 0;
                      return (
                        <div key={d.date} className="tcDay">
                          <span>{fmtDate(d.date)}</span>
                          <div className="tcBar"><div className="tcBarFill" data-ot={hrs > 8 ? 'true' : undefined} style={{ width: `${Math.min(100, (hrs / 10) * 100)}%` }} /></div>
                          <b>{fmtHours(d.hours)}</b>
                        </div>
                      );
                    })}
                  </div>
                  {leaveSummary.length > 0 && <div className="tcNote">Leave: {leaveSummary.map(([k, v]) => `${v}h ${LEAVE_LABEL[k] || k}`).join(' · ')}</div>}
                </Card>
              )}

              <div className="tcList">
                <Card title="Recent Entries" subtitle={entries.length > 0 ? `${entries.length} shown · ${pendingCount} pending approval` : undefined} flush>
                  {entries.length === 0 ? (
                    <EmptyState
                      icon={<Clock size={22} />}
                      title="No time on the books yet"
                      text="Clock in above to start a GPS-stamped shift, or backfill a day with Add Time. Entries land as pending, roll into the weekly timesheet, and hit job cost under their CSI division."
                      action={<Button icon={<Plus size={15} weight="bold" />} onClick={openAddTime} disabled={!emp}>Add Time</Button>}
                    />
                  ) : (
                    <DataTable
                      columns={columns}
                      rows={entries}
                      rowKey={(e) => e.id}
                      rowActions={rowActions}
                      onRowClick={(e) => { if (!(e.entry_type && e.entry_type !== 'regular') && e.status !== 'clocked_in') openManualFor(e); }}
                    />
                  )}
                </Card>
              </div>
            </div>

            {/* Context rail — what the system does with these hours */}
            <aside className="tcRail" aria-label="This week at a glance">
              <Card title="This Week at a Glance">
                <DetailList items={[
                  ['Worked Hours', `${(week?.workedHours ?? 0).toFixed(2)} h`],
                  ['Regular / OT', `${(week?.regularHours ?? 0).toFixed(2)} / ${(week?.overtimeHours ?? 0).toFixed(2)}`],
                  ['Leave Logged', `${leaveHours.toFixed(2)} h`],
                  ['Pending Approval', String(pendingCount)],
                  ...(regRate > 0 ? [['Est. Gross', fmtMoney(estGross)] as [string, React.ReactNode]] : []),
                ]} />
                <div className="tcNote">Overtime splits automatically past 40 h/week and 8 h/shift. Rates come from your employee record.</div>
              </Card>
              <Card title="After You Clock Out">
                <FlowSteps title="" steps={[
                  { title: 'Entry lands as pending', desc: 'GPS-stamped, timezone-aware, meal break deducted.' },
                  { title: 'CSI division prices the labor', desc: csiDiv ? `Coding to Div ${csiDiv} — ${CSI_DIVISIONS[csiDiv]?.name}.` : 'Pick a cost code so hours hit the right budget line.' },
                  { title: 'Submit the week', desc: 'One click sends the whole timesheet for approval.' },
                  { title: 'Approved hours hit job cost', desc: 'Labor cost rolls into the project budget and reports.' },
                ]} />
              </Card>
            </aside>
          </div>
        </div>
      </PageShell>

      {/* Add / edit time */}
      <FormModal
        open={!!manual}
        onClose={() => setManual(null)}
        title={manual?.id ? 'Edit Time' : 'Add Time'}
        subtitle={manual?.id ? 'Correct a shift.' : 'Backfill a day.'}
        onSubmit={saveManual}
        submitLabel={manual?.id ? 'Save' : 'Log Time'}
        busy={savingEntry}
        error={manualErr || null}
      >
        {manual && (
          <FormGrid cols={2}>
            {!manual.id && (
              <Field label="Project" required span hint="Labor cost lands in this job’s budget.">
                <Select
                  id="tc-manual-project"
                  value={manual.project ?? ''}
                  onChange={(e) => { setManual({ ...manual, project: e.target.value }); setManualErr(''); }}
                  placeholder="Select project…"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  aria-invalid={manualErr && !manual.project ? true : undefined}
                />
              </Field>
            )}
            <Field label="Date" required span>
              <div className="tcDateInput"><SaguaroDatePicker id="tc-manual-date" value={manual.date} onChange={(v) => { setManual({ ...manual, date: v }); setManualErr(''); }} style={DATE_INPUT_STYLE} /></div>
            </Field>
            <Field label="Clock In" required>
              <Input id="tc-manual-in" type="time" value={manual.in} onChange={(e) => { setManual({ ...manual, in: e.target.value }); setManualErr(''); }} />
            </Field>
            <Field label="Clock Out" required>
              <Input id="tc-manual-out" type="time" value={manual.out} onChange={(e) => { setManual({ ...manual, out: e.target.value }); setManualErr(''); }} />
            </Field>
            <Field label="Meal Break (min)">
              <Input inputMode="numeric" value={manual.meal} onChange={(e) => setManual({ ...manual, meal: e.target.value })} placeholder="30" />
            </Field>
            <Field label="Cost Code" hint="The CSI division routes these hours to the right budget line in job cost.">
              <Select
                value={manual.csi ?? ''}
                onChange={(e) => setManual({ ...manual, csi: e.target.value })}
                options={[{ value: '', label: 'No Cost Code' }, ...Object.entries(CSI_DIVISIONS).map(([code, d]) => ({ value: code, label: `Div ${code} — ${d.name}` }))]}
              />
            </Field>
          </FormGrid>
        )}
      </FormModal>

      {/* PTO / sick */}
      <FormModal
        open={!!leave}
        onClose={() => setLeave(null)}
        title="Log PTO / Sick"
        subtitle="Leave lands as pending and shows on the weekly timesheet."
        onSubmit={saveLeave}
        submitLabel={leave ? `Log ${LEAVE_LABEL[leave.type] || leave.type}` : 'Log'}
        busy={savingEntry}
      >
        {leave && (
          <FormGrid cols={2}>
            <Field label="Type" span>
              <div className="tcSegRow" role="group" aria-label="Leave type">
                {['pto', 'sick', 'holiday', 'vacation'].map((t) => (
                  <Button key={t} className="tcSeg" aria-pressed={leave.type === t} onClick={() => setLeave({ ...leave, type: t })}>{LEAVE_LABEL[t]}</Button>
                ))}
              </div>
            </Field>
            <Field label="Date">
              <div className="tcDateInput"><SaguaroDatePicker value={leave.date} onChange={(v) => setLeave({ ...leave, date: v })} style={DATE_INPUT_STYLE} /></div>
            </Field>
            <Field label="Hours">
              <Input inputMode="decimal" value={leave.hours} onChange={(e) => setLeave({ ...leave, hours: e.target.value })} placeholder="8" />
            </Field>
          </FormGrid>
        )}
      </FormModal>
    </div>
  );
}
