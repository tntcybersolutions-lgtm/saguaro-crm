'use client';
/**
 * Time Clock (web) — the clock, this week as bars, the entries register.
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
 * Anatomy — it SHOWS, it doesn't explain: the clock at the top (a big live
 * time, the state, the job + cost code pickers and one Clock In / Clock Out
 * button) → this week (the numbers, then a bar per day: regular, overtime past
 * the 40th hour, PTO / sick, and the shift running now) → the entries register
 * (DataTable). Phone: stacked, one column. Add / edit time and PTO open in a
 * FormModal. Status lines are a few words ("Saved on phone · sends when
 * signal returns"), never a paragraph.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { sendOrSave, listSaved, isOffline, drainOutbox } from '@/lib/offline/outbox';
import { loadJobs, rememberMe, lastKnownMe } from '@/lib/offline/last-known';
import { getSupabaseBrowser, ensureBrowserSession, getAuthHeaders } from '@/lib/supabase-browser';
import { computeTimesheet, weekKey, fmtHours, liveElapsed, type TimeEntry } from '@/lib/timeclock';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { LEAVE_LABEL, LEAVE_TYPES, checkLeave, leaveHoursOf, leaveInsertRow, type LeaveField } from '@/lib/leave-entry';
import { Clock, Play, Stop, Plus, Trash, PaperPlaneRight, Sun, HardHat, Timer, PencilSimple } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState,
  FormModal, Field, Input, Select, FormGrid,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';

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

/** POST a punch to the timeclock API — or, with no signal, keep it on the phone
 *  (lib/offline/outbox). A kept punch is sent by itself when the signal is back,
 *  stamped with the moment it was tapped, and the server flags it as sent late.
 *  Never throws on a non-2xx — the caller decides what each status means. */
async function postClock(path: string, body: Record<string, unknown>, label: string): Promise<{ saved: true } | { saved: false; status: number; json: any }> {
  // Punches go in order: anything still on the phone (an offline clock-in) is sent first.
  if (!isOffline() && (await listSaved(null, 'time')).length) await drainOutbox();
  const r = await sendOrSave({ url: path, method: 'POST', body, kind: 'time', label, projectId: (body.projectId as string | undefined) ?? null });
  if (r.saved) return { saved: true };
  let json: any = null;
  try { json = await r.response.json(); } catch { /* non-JSON body — handled as an unknown failure below */ }
  return { saved: false, status: r.response.status, json };
}

const SAVED_SHIFT = 'saved:';
/** The last active-job list this device loaded — the picker still works with no signal. */
const JOBS_KEY = 'saguaro.time.jobs';
/** The clock state the phone is holding: the last punch kept on it, if any. */
async function savedClockState(): Promise<{ in: boolean; at: string; projectId: string | null; csi: string | null } | null> {
  const punches = await listSaved(null, 'time');
  const last = punches[punches.length - 1];
  if (!last) return null;
  let body: any = {};
  try { body = JSON.parse(last.body || '{}'); } catch { /* keep {} */ }
  return { in: last.url.endsWith('/in'), at: new Date(last.createdAt).toISOString(), projectId: body.projectId ?? null, csi: body.csiDivision ?? null };
}

/** One status → one badge. Pending amber (the warning tone — never brand
 *  yellow), approved green, the running shift green with a dot, rejected red;
 *  everything else neutral. */
function entryStatus(s: string | null | undefined): { label: string; tone: BadgeTone } {
  const k = String(s || '').toLowerCase();
  if (k === 'clocked_in') return { label: 'On the Clock', tone: 'ongoing' };
  if (k === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (k === 'pending') return { label: 'Pending', tone: 'pending' };
  if (k === 'rejected') return { label: 'Rejected', tone: 'overdue' };
  return { label: k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—', tone: 'neutral' };
}
const LEAVE_FIELD_ID: Record<LeaveField, string> = { type: 'tc-leave-type', project: 'tc-leave-project', date: 'tc-leave-date', hours: 'tc-leave-hours' };

const CSS = `
.tcWs > .k-page { max-width: none; }
.tcCq { container: tcws / inline-size; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.tcHero { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: center; padding: 4px 0 20px; border-bottom: 1px solid var(--border-subtle); min-width: 0; }
@container tcws (min-width: 860px) { .tcHero { grid-template-columns: minmax(0, 1fr) minmax(360px, 480px); gap: 32px; } }
.tcNow { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tcClock { font-size: 64px; font-weight: 800; letter-spacing: -1.5px; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1; }
.tcClock[data-live="true"] { color: var(--status-ongoing); }
.tcState { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-md); font-weight: 700; color: var(--text-secondary); }
.tcState[data-live="true"] { color: var(--text-primary); }
.tcState i { width: 8px; height: 8px; border-radius: 50%; background: var(--text-tertiary); flex: none; }
.tcState[data-live="true"] i { background: var(--status-ongoing); }
.tcFacts { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--text-secondary); min-width: 0; }
.tcFacts span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
.tcCtl { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.tcPickers { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
@media (max-width: 560px) { .tcPickers { grid-template-columns: minmax(0, 1fr); } }
.tcBigBtn { width: 100%; height: 56px; font-size: 17px; border-radius: var(--radius-md); }
.tcBigBtn[data-live="true"] { background: color-mix(in srgb, var(--danger) 14%, transparent); border-color: color-mix(in srgb, var(--danger) 50%, transparent); color: var(--danger); }
.tcBigBtn[data-live="true"]:hover { background: color-mix(in srgb, var(--danger) 22%, transparent); }
.tcBigBtn[data-live="false"] { background: color-mix(in srgb, var(--success) 14%, transparent); border-color: color-mix(in srgb, var(--success) 50%, transparent); color: var(--success); }
.tcBigBtn[data-live="false"]:hover { background: color-mix(in srgb, var(--success) 22%, transparent); }
.tcMsg { font-size: var(--fs-sm); font-weight: 600; color: var(--status-ongoing); }
.tcMsg[data-tone="err"] { color: var(--status-overdue); }
.tcMsg[data-tone="wait"] { color: var(--warning); }
.tcBars { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; padding-top: 12px; }
.tcCol { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; }
.tcColVal { text-align: center; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text-primary); white-space: nowrap; }
.tcColVal[data-zero="true"] { color: var(--text-tertiary); font-weight: 600; }
.tcPlot { height: 160px; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid var(--border-default); }
.tcBar { width: min(48px, 100%); display: flex; flex-direction: column-reverse; border-radius: 4px 4px 0 0; overflow: hidden; min-height: 0; }
.tcBar > span { display: block; width: 100%; }
.tcBar > [data-k="reg"] { background: color-mix(in srgb, var(--success) 80%, transparent); }
.tcBar > [data-k="ot"] { background: var(--warning); }
.tcBar > [data-k="leave"] { background: color-mix(in srgb, var(--text-tertiary) 55%, transparent); }
.tcBar > [data-k="run"] { background: color-mix(in srgb, var(--success) 35%, transparent); }
.tcDayLbl { display: flex; flex-direction: column; align-items: center; line-height: 1.25; font-size: 12px; color: var(--text-secondary); }
.tcDayLbl b { font-size: 13px; font-weight: 700; color: var(--text-secondary); }
.tcDayLbl[data-today="true"], .tcDayLbl[data-today="true"] b { color: var(--text-primary); font-weight: 800; }
.tcKey { display: flex; gap: 6px 16px; flex-wrap: wrap; padding-top: 10px; font-size: 12px; color: var(--text-secondary); }
.tcKey span { display: inline-flex; align-items: center; gap: 6px; }
.tcKey i { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.tcMuted { color: var(--text-tertiary); }
.tcNum { font-variant-numeric: tabular-nums; }
.tcList .k-table th:first-child, .tcList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.tcList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.tcDate { color: var(--text-primary); font-weight: 800; white-space: nowrap; }
.tcSeg[aria-pressed="true"] { border-color: var(--border-strong); background: rgba(255,255,255,0.12); color: var(--text-primary); }
.tcSegRow { display: flex; gap: 8px; flex-wrap: wrap; }
.tcDateInput { width: 100%; }
@media (max-width: 640px) {
  .tcWs .k-btn, .tcWs .k-stat, .tcWs select.k-select, .tcWs .k-input { min-height: 44px; }
  .tcWs .tcDateInput input { min-height: 44px !important; } /* beats the picker's inline 40px — a thumb target */
  .tcWs .k-table td { height: 48px; }
  .tcWs .tcBigBtn { min-height: 56px; }
  .tcClock { font-size: 52px; }
  .tcBars { gap: 4px; }
  .tcPlot { height: 128px; }
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
  /** Whether the job list is still coming, failed, or loaded (possibly empty). */
  const [projectsState, setProjectsState] = useState<'loading' | 'ready' | 'error'>('loading');
  /** id → name for EVERY job, archived included — labels past shifts in the register. */
  const [jobNames, setJobNames] = useState<Record<string, string>>({});
  const jobName = useCallback((id: string | null | undefined) => (id ? jobNames[id] || projects.find((p) => p.id === id)?.name || '' : ''), [jobNames, projects]);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'ok' | 'err' | 'wait'>('ok');
  const [manual, setManual] = useState<any | null>(null);
  const [leave, setLeave] = useState<any | null>(null);
  const [csiDiv, setCsiDiv] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);
  const [manualErr, setManualErr] = useState('');
  const [leaveErr, setLeaveErr] = useState('');
  // Server truth for the clock. `statusLoaded` stays false until /status answers once,
  // so an unreachable API falls back to the read path instead of faking "clocked out".
  const [shift, setShift] = useState<Shift | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const inflight = useRef(false); // double-tap guard that beats a React re-render

  const say = useCallback((text: string, tone: 'ok' | 'err' | 'wait' = 'ok') => { setMsg(text); setMsgTone(tone); }, []);

  const loadEntries = useCallback(async (empId: string) => {
    const { data } = await sb.from('time_entries').select('id, project_id, work_date, clock_in, clock_out, hours_worked, regular_hours, overtime_hours, total_hours, status, timezone, entry_type, meal_break_mins, csi_division, cost_code_description').eq('employee_id', empId).order('work_date', { ascending: false }).order('clock_in', { ascending: false }).limit(80);
    setEntries(data ?? []);
  }, [sb]);

  /** Ask the server whether we are on the clock. Returns the payload, or null if it could not be reached. */
  const syncStatus = useCallback(async (): Promise<any | null> => {
    // With no signal, or a punch still waiting on the phone, the server's answer is
    // out of date (or a cached copy) — the phone's own punch is the truth until it sends.
    const held = await savedClockState();
    if (held) {
      setShift(held.in ? { id: `${SAVED_SHIFT}${held.at}`, projectId: held.projectId, workDate: held.at.slice(0, 10), clockIn: held.at, clockOut: null, status: 'clocked_in', timezone: TZ, costCodeId: null, csiDivision: held.csi, hoursWorked: null, mealBreakMins: null } : null);
      setStatusLoaded(true);
      return null;
    }
    if (isOffline()) return null;
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
      /* The job list comes from /api/projects — the same tenant-scoped list the
         daily log picker uses, with archived and deleted jobs left out. It read
         the projects table straight through the browser client, which returns
         every job RLS allows, archived ones included: 25 jobs in the picker
         where 3 were live, and a crew could clock a shift onto a closed job. */
      const applyJobs = (data: { id: string; name: string }[]) => {
        setProjects(data);
        setProjectsState('ready');
        // ?project= (the Photo sheet's Clock shortcut) names the job deliberately.
        const asked = new URLSearchParams(window.location.search).get('project');
        if (asked && data.some((p) => p.id === asked)) setProjectId(asked);
        else if (data.length === 1) setProjectId(data[0].id);
      };
      // No signal on site is normal: loadJobs falls back to the last job list this phone saw (IndexedDB).
      loadJobs('/api/projects?limit=500&fields=id,name')
        .then(({ jobs }) => applyJobs(jobs))
        .catch((err) => {
          console.error(err);
          // A phone that only ever kept the list the old way (before IndexedDB).
          let kept: { id: string; name: string }[] | null = null;
          try { kept = JSON.parse(window.localStorage.getItem(JOBS_KEY) || 'null'); } catch (readErr) { console.debug('[time] no kept job list', readErr); }
          if (Array.isArray(kept) && kept.length) applyJobs(kept);
          else setProjectsState('error');
        });
      // Names for the register only: a past shift on a job that has since been
      // archived still reads its job's name, even though the picker hides it.
      sb.from('projects').select('id, name').then(({ data, error }) => {
        if (error) { console.error(error); return; }
        const names: Record<string, string> = {};
        for (const p of (data ?? []) as { id: string; name: string | null }[]) names[p.id] = p.name || '';
        setJobNames(names);
      });
      /* No signal: the employee record can't be fetched, so use the one this
         phone kept the last time it could. Without this Clock In stayed
         disabled ("Resolving your employee record…") after an offline reload. */
      const fromPhone = async (): Promise<boolean> => {
        const kept = await lastKnownMe();
        if (!kept) return false;
        setTenantId(kept.tenantId);
        setEmp(kept.emp);
        loadEntries(kept.emp.id);
        return true;
      };
      if (isOffline() && (await fromPhone())) return;
      if (!user?.email) { if (await fromPhone()) return; return; }
      // Resolve the signed-in user's tenant so every write is tenant-scoped (RLS/NOT NULL) — without
      // this, the employees insert below is silently rejected and the page hangs on "Resolving…".
      const { data: prof } = await sb.from('profiles').select('tenant_id, full_name').eq('id', user.id).maybeSingle();
      const tid = (prof as any)?.tenant_id ?? user.id;
      setTenantId(tid);
      // The API resolves the caller to an employees row server-side; prefer its answer so this page
      // reads the SAME employee the clock writes against (and so we never create a rival row).
      const st = await syncStatus();
      /* Pay columns are not readable from the browser
         (20261016f_employees_private_columns.sql): the record comes from
         Supabase without them, and this person's OWN rate comes from
         /api/team/employees/[id] below, which hands a rate only to its owner
         or to HR. */
      const empCols = 'id, full_name, first_name';
      let e: any = null;
      if (st?.employee?.id) {
        const { data } = await sb.from('employees').select(empCols).eq('id', st.employee.id).maybeSingle();
        e = data ?? { id: st.employee.id, full_name: st.employee.name ?? null, first_name: null };
      }
      if (!e) {
        const byEmail = await sb.from('employees').select(empCols).eq('email', user.email).maybeSingle();
        e = byEmail.data;
        if (!e) {
          // Real name from the login profile; empty surname when unknown (never a "—" placeholder,
          // which printed "Avery —" everywhere because full_name is first || ' ' || last).
          const pn = String((prof as any)?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
          const local = user.email.split('@')[0].split(/[._+-]+/).filter(Boolean);
          const words = pn.length ? pn : local;
          const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);
          const ins = await sb.from('employees').insert({ tenant_id: tid, email: user.email, first_name: cap(words[0] || 'Team'), last_name: words.slice(1).map(cap).join(' '), is_active: true }).select(empCols).maybeSingle();
          e = ins.data;
        }
      }
      if (!e && (await fromPhone())) return; // the lookups failed for lack of signal
      if (e) {
        setEmp(e); loadEntries(e.id);
        void rememberMe({ emp: { id: e.id, full_name: e.full_name ?? null, first_name: e.first_name ?? null }, tenantId: tid });
        // My own rate, for costing my hours. If it cannot be read the entries
        // are stamped with no rate, exactly as for a person with none on file.
        try {
          const res = await fetch(`/api/team/employees/${encodeURIComponent(e.id)}`, { headers: await getAuthHeaders(), credentials: 'same-origin', cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            const rec = j?.employee;
            if (rec && j?.canSeePay) setEmp((cur: any) => (cur && cur.id === rec.id ? { ...cur, regular_rate: rec.regular_rate ?? null, overtime_rate: rec.overtime_rate ?? null } : cur));
          } else {
            console.error('[time] own rate not loaded', res.status);
          }
        } catch (err) {
          console.error('[time] own rate not loaded', err);
        }
      }
    })();
  }, [sb, loadEntries, syncStatus]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  /* The server renders in UTC; the phone renders in its own zone. Anything that
     prints today's date waits for the client, or React throws #425/#422
     (text mismatch) and throws the server HTML away on every load. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // A punch kept on the phone just reached the server — read the server's truth again.
  useEffect(() => {
    const onSynced = (ev: Event) => {
      if ((ev as CustomEvent).detail?.kind !== 'time') return;
      void syncStatus();
      if (emp) void loadEntries(emp.id);
    };
    window.addEventListener('saguaro:outbox-synced', onSynced);
    return () => window.removeEventListener('saguaro:outbox-synced', onSynced);
  }, [syncStatus, loadEntries, emp]);

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
        // Leave hours live in hours_worked — total_hours is generated from regular+OT and is 0 on a leave row.
        : { id: e.id, employeeId: emp?.id ?? '', type: e.entry_type, hours: leaveHoursOf(e) ?? undefined, timezone: e.timezone || TZ, clockIn: (e.work_date || localDay()) + 'T12:00:00' };
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
    /* A shift always names its job. With no project sent, the server falls back
       to whichever job was touched last — so a job list that failed to load (or
       was still loading) put a full shift's labor on a job nobody picked. */
    // Offline with no job list ever seen on this phone: keep the punch (as before)
    // rather than lose the shift; the server files it when the signal is back.
    if (!projectId && !(isOffline() && projects.length === 0)) {
      say(
        projectsState === 'loading' ? 'Jobs still loading · pick one, then clock in'
        : projectsState === 'error' ? "Couldn't load jobs · reload the page"
        : projects.length === 0 ? 'No active jobs yet'
        : 'Pick a job first',
        'err',
      );
      return;
    }
    inflight.current = true; setBusy(true); setMsg('');
    try {
      const g = await geo();
      const r = await postClock('/api/timeclock/in', {
        ...(projectId ? { projectId } : {}),
        ...(csiDiv ? { csiDivision: csiDiv } : {}),
        ...(g ? { lat: g.lat, lng: g.lng } : {}),
        clientTime: new Date().toISOString(),
        // The shift's day is this device's day (a 7:30 PM Iowa clock-in is Oct 10, not the UTC Oct 11).
        timezone: TZ,
      }, 'Clock in');
      if (r.saved) {
        await syncStatus(); // shows the shift the phone is holding
        say('Clocked in · saved on phone · sends when signal returns', 'wait');
        inflight.current = false; setBusy(false);
        return;
      }
      const { status, json } = r;
      if (status >= 200 && status < 300 && json?.ok && json?.shift) {
        setShift(json.shift as Shift); setStatusLoaded(true);
        // alreadyOpen means the server refused to open a second shift — adopt the one it returned.
        say(json.alreadyOpen ? 'Already on the clock' : 'Clocked in');
        if (emp) await loadEntries(emp.id);
      } else {
        say(humanError(json, "Couldn't clock you in. Please try again."), 'err');
        await syncStatus(); // never leave the UI showing a state the server did not confirm
      }
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't reach the clock · try again"), 'err'); }
    inflight.current = false; setBusy(false);
  };

  const clockOut = async () => {
    if (busy || inflight.current) return;
    if (!openShift) { say('You are not on the clock.', 'err'); return; }
    inflight.current = true; setBusy(true); setMsg('');
    try {
      const g = await geo();
      /* The break is the shift's own recorded break, never a guess. Before the
         server status loaded this read `?? 30` and docked half an hour off
         every such clock-out. With no recorded value nothing is sent and the
         server uses the shift row's break (0 when none was taken). */
      const recorded = openShift.meal_break_mins;
      const meal = recorded === null || recorded === undefined || String(recorded).trim() === '' ? null : Math.max(0, Number(recorded) || 0);
      const heldShift = String(openShift.id).startsWith(SAVED_SHIFT);
      const r = await postClock('/api/timeclock/out', {
        // A shift opened offline has no server id yet — the server closes whichever shift is open.
        ...(heldShift ? {} : { shiftId: openShift.id }),
        ...(meal === null ? {} : { breakMinutes: meal }),
        ...(g ? { lat: g.lat, lng: g.lng } : {}),
        clientTime: new Date().toISOString(),
      }, 'Clock out');
      if (r.saved) {
        await syncStatus();
        say('Clocked out · saved on phone · sends when signal returns', 'wait');
        inflight.current = false; setBusy(false);
        return;
      }
      const { status, json } = r;
      if (status >= 200 && status < 300 && json?.ok) {
        setShift(null); setStatusLoaded(true);
        const worked = Number(json?.hours?.worked ?? json?.shift?.hoursWorked ?? 0) || 0;
        say(`Clocked out · ${worked.toFixed(2)} h`);
        if (emp) await loadEntries(emp.id);
      } else if (status === 409) {
        await syncStatus();
        say(humanError(json, 'You are not on the clock.'), 'err');
        if (emp) await loadEntries(emp.id);
      } else {
        say(humanError(json, "Couldn't clock you out. Please try again."), 'err');
        await syncStatus();
      }
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't reach the clock · try again"), 'err'); }
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
    if (!manual.id && !entryProject) { manualStop('Pick the job.', 'tc-manual-project'); return; }
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
  /* Log PTO / Sick never saved once: the insert left out project_id (NOT NULL
     on time_entries) and wrote total_hours, which is a GENERATED column. Both
     rejections landed in the console card behind the dialog, so the dialog sat
     there looking dead. The form now asks for the job, the row is built by
     lib/leave-entry (hours in hours_worked only), and every failure is said
     inside the dialog beside its Save button. */
  const saveLeave = async () => {
    if (!leave) return;
    if (!emp || !tenantId) { setLeaveErr('Your employee record is still loading. Try again in a moment.'); return; }
    const c = checkLeave(leave, { hasProjects: projects.length > 0 });
    if (!c.ok) {
      setLeaveErr(c.message);
      window.setTimeout(() => document.getElementById(LEAVE_FIELD_ID[c.field])?.focus(), 0);
      return;
    }
    setLeaveErr('');
    setSavingEntry(true);
    try {
      const { error } = await sb.from('time_entries').insert(leaveInsertRow({ tenantId, employeeId: emp.id, projectId: c.projectId, type: c.type, date: c.date, hours: c.hours, timezone: TZ }));
      if (error) throw error;
      setLeave(null); await loadEntries(emp.id); say(`${LEAVE_LABEL[c.type]} logged · ${c.hours} h · ${fmtDate(c.date)}`);
    } catch (e: any) { console.error(e); setLeaveErr(humanError(e, "Couldn't log that leave.")); }
    finally { setSavingEntry(false); }
  };
  const del = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete this time entry?', message: 'The hours come off this week and off job cost. This cannot be undone.', danger: true }))) return;
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
  const openManualFor = (e: any) => { setManualErr(''); setManual({ id: e.id, date: e.work_date, in: e.clock_in ? new Date(e.clock_in).toTimeString().slice(0, 5) : '07:00', out: e.clock_out ? new Date(e.clock_out).toTimeString().slice(0, 5) : '15:30', meal: String(e.meal_break_mins ?? 0), csi: e.csi_division || '' }); };
  // The job is picked in the dialog (time_entries.project_id is required) —
  // pre-filled from the console picker when one is already chosen.
  const openAddTime = () => { setManualErr(''); setManual({ date: localDay(), in: '07:00', out: '15:30', meal: '30', csi: csiDiv, project: projectId || (projects.length === 1 ? projects[0].id : '') }); };
  // Leave is filed on a job's timesheet (time_entries.project_id is required) — same pre-fill as Add Time.
  const openLeave = () => { setLeaveErr(''); setLeave({ date: localDay(), type: 'pto', hours: '8', project: projectId || (projects.length === 1 ? projects[0].id : '') }); };

  const elapsed = (() => {
    if (!clockedIn) return null;
    const h = liveElapsed(openShift.clock_in, new Date(now).toISOString());
    const s = Math.floor(h * 3600);
    return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  })();

  // ── This week, a bar per day ──
  // Sun → Sat of this week. Worked hours past the week's 40th are overtime (the
  // engine's rule, weeklyOtThreshold 40), so each bar shows exactly where OT began.
  // PTO / sick sits on top in slate; the shift running now is the pale cap on today.
  const liveHours = clockedIn ? Math.max(0, liveElapsed(openShift.clock_in, new Date(now).toISOString())) : 0;
  const weekDays = (() => {
    const start = new Date(thisWeekKey + 'T12:00:00');
    let cum = 0;
    return Array.from({ length: 7 }, (_, i) => {
      const date = localDay(new Date(start.getTime() + i * 86400000));
      const row = week?.days.find((d) => d.date === date);
      const worked = Number(row?.worked) || 0;
      const leave = Math.max(0, (Number(row?.hours) || 0) - worked);
      const before = cum;
      cum += worked;
      const ot = Math.max(0, Math.min(worked, cum - Math.max(40, before)));
      const run = date === todayStr ? liveHours : 0;
      return { date, reg: worked - ot, ot, leave, run, total: worked + leave + run };
    });
  })();
  const barMax = Math.max(10, ...weekDays.map((d) => d.total));
  const fmtH = (h: number) => `${(Math.round(h * 10) / 10).toFixed(1)}h`;

  const stats: StatItem[] = [
    { label: 'This Week', value: `${(week?.workedHours ?? 0).toFixed(2)} h` },
    { label: 'Overtime', value: `${(week?.overtimeHours ?? 0).toFixed(2)} h`, tone: (week?.overtimeHours ?? 0) > 0 ? 'warn' : 'default' },
    { label: 'Today', value: `${todayHours.toFixed(2)} h`, tone: clockedIn ? 'good' : 'default' },
    ...(regRate > 0 ? [{ label: 'Est. Gross', value: fmtMoney(estGross), tone: 'good' as const }] : []),
    { label: 'Pending', value: String(pendingCount), tone: pendingCount > 0 ? 'warn' as const : 'default' as const },
    ...(leaveHours > 0 ? [{ label: 'Leave', value: `${leaveHours.toFixed(2)} h` }] : []),
  ];

  // ── Entries register ──
  const entryHours = (e: any) => (e.entry_type && e.entry_type !== 'regular') ? (leaveHoursOf(e) ?? 0) : (Number(e.total_hours ?? e.hours_worked ?? 0) || 0);
  const columns: Column<any>[] = [
    { key: 'work_date', header: 'Date', accessor: (e) => `${e.work_date || ''}|${e.clock_in || ''}`, width: 130, render: (e) => <span className="tcDate">{fmtDate(e.work_date)}</span> },
    { key: 'kind', header: 'Project / Type', accessor: (e) => (e.entry_type && e.entry_type !== 'regular') ? e.entry_type : jobName(e.project_id), render: (e) => {
      const leaveType = e.entry_type && e.entry_type !== 'regular';
      if (leaveType) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}><Sun size={14} /> {LEAVE_LABEL[e.entry_type] || String(e.entry_type).toUpperCase()}</span>;
      const name = e.project_id ? (jobName(e.project_id) || 'Project') : '';
      return name ? <span style={{ color: 'var(--text-primary)' }}>{name}</span> : <span className="tcMuted">No project</span>;
    } },
    { key: 'span', header: 'In – Out', accessor: (e) => e.clock_in || '', render: (e) => {
      const leaveType = e.entry_type && e.entry_type !== 'regular';
      if (leaveType) { const h = leaveHoursOf(e); return <span className="tcMuted">{h == null ? 'Hours not recorded' : `${h}h logged`}</span>; }
      return <span className="tcNum">{fmtTime(e.clock_in)} – {e.status === 'clocked_in' ? 'now' : fmtTime(e.clock_out)}</span>;
    } },
    { key: 'csi', phone: 'hide', header: 'Cost Code', accessor: (e) => e.csi_division || '', render: (e) => e.csi_division ? <Badge tone="neutral">Div {e.csi_division} · {e.cost_code_description || CSI_DIVISIONS[e.csi_division]?.name || 'Cost coded'}</Badge> : <span className="tcMuted">—</span> },
    { key: 'hours', phone: 'show', header: 'Hours', accessor: (e) => entryHours(e), align: 'right', render: (e) => <span className="tcNum" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{e.status === 'clocked_in' ? '—' : `${entryHours(e).toFixed(2)}h`}</span> },
    { key: 'status', phone: 'show', header: 'Status', accessor: (e) => entryStatus(e.status).label, render: (e) => { const s = entryStatus(e.status); return <Badge tone={s.tone} dot={e.status === 'clocked_in'}>{s.label}</Badge>; } },
  ];
  const rowActions = (e: any): Action[] => {
    const leaveType = e.entry_type && e.entry_type !== 'regular';
    return [
      { label: 'Edit Time', icon: <PencilSimple size={15} />, onClick: () => openManualFor(e), hidden: leaveType || e.status === 'clocked_in' },
      { label: 'Delete', icon: <Trash size={15} />, onClick: () => del(e.id), tone: 'danger', hidden: e.status === 'clocked_in' || e.status === 'approved' },
    ];
  };

  const jobsHint =
    projectsState === 'loading' ? 'Loading jobs…'
    : projectsState === 'error' ? "Couldn't load jobs · reload the page"
    : projects.length === 0 ? 'No active jobs yet'
    : undefined;
  const shiftJob = clockedIn ? (jobName(openShift.project_id) || 'Job') : '';
  const shiftCode = clockedIn && openShift.csi_division ? `Div ${openShift.csi_division} · ${openShift.cost_code_description || CSI_DIVISIONS[openShift.csi_division]?.name || 'Cost coded'}` : '';

  return (
    <div className="tcWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Time Clock' }]}
        title="Time Clock"
        actions={
          <>
            <Button icon={<Plus size={15} weight="bold" />} onClick={openAddTime} disabled={!emp}>Add Time</Button>
            <Button icon={<Sun size={15} weight="fill" />} onClick={openLeave} disabled={!emp}>PTO / Sick</Button>
          </>
        }
      >
        <div className="tcCq">
          {/* The clock: the time, the state, the job, one button. */}
          <section className="tcHero" aria-label="Clock in and out">
            <div className="tcNow">
              <div className="tcClock" data-live={clockedIn ? 'true' : 'false'} aria-live="off">
                {clockedIn ? elapsed : mounted ? new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ' '}
              </div>
              <div className="tcState" data-live={clockedIn ? 'true' : 'false'}>
                <i aria-hidden />
                {clockedIn ? `On the clock since ${fmtTime(openShift.clock_in)}` : emp ? 'Clocked out' : 'Loading your record…'}
              </div>
              {clockedIn && (
                <div className="tcFacts">
                  <span><HardHat size={15} aria-hidden />{shiftJob}</span>
                  {shiftCode && <span><Timer size={15} aria-hidden />{shiftCode}</span>}
                </div>
              )}
            </div>
            <div className="tcCtl">
              {!clockedIn && (
                <div className="tcPickers">
                  <Field label="Job" hint={jobsHint}>
                    <Select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      placeholder={projects.length === 1 ? undefined : 'Pick a job…'}
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Field>
                  <Field label="Cost Code">
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
          </section>

          {/* This week: the numbers, then a bar per day. */}
          <Card
            title="This Week"
            subtitle={mounted ? `Week of ${fmtDate(thisWeekKey)}` : undefined}
            actions={<Button size="sm" icon={<PaperPlaneRight size={14} />} onClick={submitWeek} disabled={!week || !emp}>Submit Week</Button>}
          >
            <StatRow items={stats} />
            {mounted && (
              <>
                <div className="tcBars" role="img" aria-label={`Hours by day: ${weekDays.map((d) => `${fmtDate(d.date)} ${fmtH(d.total)}`).join(', ')}`}>
                  {weekDays.map((d) => {
                    const pct = (h: number) => `${(h / barMax) * 100}%`;
                    const dt = new Date(d.date + 'T12:00:00');
                    return (
                      <div key={d.date} className="tcCol">
                        <div className="tcColVal" data-zero={d.total > 0 ? undefined : 'true'}>{d.total > 0 ? fmtH(d.total) : '—'}</div>
                        <div className="tcPlot">
                          <div className="tcBar" style={{ height: pct(d.total) }}>
                            {d.reg > 0 && <span data-k="reg" style={{ height: `${(d.reg / d.total) * 100}%` }} />}
                            {d.ot > 0 && <span data-k="ot" style={{ height: `${(d.ot / d.total) * 100}%` }} />}
                            {d.leave > 0 && <span data-k="leave" style={{ height: `${(d.leave / d.total) * 100}%` }} />}
                            {d.run > 0 && <span data-k="run" style={{ height: `${(d.run / d.total) * 100}%` }} />}
                          </div>
                        </div>
                        <div className="tcDayLbl" data-today={d.date === todayStr ? 'true' : undefined}>
                          <b>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</b>
                          <span>{dt.getDate()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="tcKey" aria-hidden>
                  <span><i style={{ background: 'color-mix(in srgb, var(--success) 80%, transparent)' }} />Regular</span>
                  {weekDays.some((d) => d.ot > 0) && <span><i style={{ background: 'var(--warning)' }} />Overtime</span>}
                  {weekDays.some((d) => d.leave > 0) && <span><i style={{ background: 'color-mix(in srgb, var(--text-tertiary) 55%, transparent)' }} />PTO / Sick</span>}
                  {liveHours > 0 && <span><i style={{ background: 'color-mix(in srgb, var(--success) 35%, transparent)' }} />Running now</span>}
                </div>
              </>
            )}
          </Card>

          <div className="tcList">
            <Card title="Recent Entries" subtitle={entries.length > 0 ? `${entries.length} · ${pendingCount} pending` : undefined} flush>
              {entries.length === 0 ? (
                <EmptyState
                  icon={<Clock size={22} />}
                  title="No time yet"
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
              <Field label="Job" required span>
                <Select
                  id="tc-manual-project"
                  value={manual.project ?? ''}
                  onChange={(e) => { setManual({ ...manual, project: e.target.value }); setManualErr(''); }}
                  placeholder="Pick a job…"
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
            <Field label="Cost Code">
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
        onSubmit={saveLeave}
        submitLabel={leave ? `Log ${LEAVE_LABEL[leave.type] || leave.type}` : 'Log'}
        busy={savingEntry}
        error={leaveErr || null}
      >
        {leave && (
          <FormGrid cols={2}>
            <Field label="Type" span>
              <div className="tcSegRow" role="group" aria-label="Leave type">
                {LEAVE_TYPES.map((t, i) => (
                  <Button key={t} id={i === 0 ? LEAVE_FIELD_ID.type : undefined} className="tcSeg" aria-pressed={leave.type === t} onClick={() => { setLeave({ ...leave, type: t }); setLeaveErr(''); }}>{LEAVE_LABEL[t]}</Button>
                ))}
              </div>
            </Field>
            <Field label="Job" required span>
              <Select
                id={LEAVE_FIELD_ID.project}
                value={leave.project ?? ''}
                onChange={(e) => { setLeave({ ...leave, project: e.target.value }); setLeaveErr(''); }}
                placeholder="Pick a job…"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                aria-invalid={leaveErr && !leave.project ? true : undefined}
              />
            </Field>
            <Field label="Date" required>
              <div className="tcDateInput"><SaguaroDatePicker id={LEAVE_FIELD_ID.date} value={leave.date} onChange={(v) => { setLeave({ ...leave, date: v }); setLeaveErr(''); }} style={DATE_INPUT_STYLE} /></div>
            </Field>
            <Field label="Hours" required>
              <Input id={LEAVE_FIELD_ID.hours} inputMode="decimal" value={leave.hours} onChange={(e) => { setLeave({ ...leave, hours: e.target.value }); setLeaveErr(''); }} placeholder="8" />
            </Field>
          </FormGrid>
        )}
      </FormModal>
    </div>
  );
}
