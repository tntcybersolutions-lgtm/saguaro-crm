'use client';
/**
 * Time Clock (web) — clock in/out goes through the canonical timeclock API
 * (/api/timeclock/status|in|out) so this screen and the field screen agree on one
 * server-side truth: open-shift detection, idempotent clock-in, honest failures,
 * and the clock_punches audit trail all live on the server. This page no longer
 * writes clock events directly (that path had no dupe guard — two tabs or a
 * double-click opened two shifts).
 *
 * Everything else is unchanged: the weekly timesheet still comes from the shared
 * deterministic lib/timeclock engine (same as iOS) reading time_entries through the
 * RLS-scoped browser client, and manual add/edit + PTO/sick logging still write
 * directly (they are not clock events).
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import { computeTimesheet, weekKey, fmtHours, liveElapsed, type TimeEntry } from '@/lib/timeclock';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { Clock, Play, Stop, Plus, Trash, PaperPlaneRight, Sun, Bandaids, MapPin, HardHat, Timer, CurrencyDollar } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatStrip, FlowSteps, InsightRow, PremiumEmpty, IconChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';

const GOLD = '#F59E0B', DARK = '#0a0a0a', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', GREEN = '#3dd68c', RED = '#ef4444';
/* eslint-disable @typescript-eslint/no-explicit-any */
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();
const localDay = (d = new Date()) => { const o = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - o).toISOString().slice(0, 10); };
const fmtTime = (iso: string | null) => { if (!iso) return '--'; const d = new Date(iso); return isNaN(d.getTime()) ? '--' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const fmtDate = (s: string) => { const d = new Date(s + 'T12:00:00'); return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
const splitOT = (h: number) => ({ regular: Math.min(h, 8), overtime: Math.max(0, h - 8) });
const round2 = (n: number) => Math.round(n * 100) / 100;

async function geo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 6000 }); });
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
         without ever touching the picker — and labour cost lands in that job's
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

  const saveManual = async () => {
    if (!emp || !manual) return;
    const inISO = new Date(`${manual.date}T${manual.in}:00`).toISOString();
    const outISO = new Date(`${manual.date}T${manual.out}:00`).toISOString();
    const meal = Math.max(0, parseInt(manual.meal) || 0);
    const gross = Math.max(0, (Date.parse(outISO) - Date.parse(inISO)) / 3600000);
    const hrs = round2(Math.max(0, gross - meal / 60)); const { regular, overtime } = splitOT(hrs);
    /* Every write on this page is payroll. supabase-js resolves with { error }
       rather than throwing, so the try/catch wrapped around these never fired:
       a rejected insert closed the dialog, reloaded the list, and the hours
       were simply gone — with "Week submitted for approval" on screen. Each
       result is now read and thrown so the catch below does its job. */
    try {
      const { error } = manual.id
        ? await sb.from('time_entries').update({ work_date: manual.date, clock_in: inISO, clock_out: outISO, hours_worked: hrs, regular_hours: round2(regular), overtime_hours: round2(overtime), meal_break_mins: meal, csi_division: manual.csi || null, cost_code_description: manual.csi ? (CSI_DIVISIONS[manual.csi]?.name || null) : null, ...rates() }).eq('id', manual.id)
        : await sb.from('time_entries').insert({ tenant_id: tenantId, employee_id: emp.id, project_id: projectId, work_date: manual.date, clock_in: inISO, clock_out: outISO, hours_worked: hrs, regular_hours: round2(regular), overtime_hours: round2(overtime), meal_break_mins: meal, status: 'pending', timezone: TZ, entry_type: 'regular', ...(manual.csi ? { csi_division: manual.csi, cost_code_description: CSI_DIVISIONS[manual.csi]?.name || null } : {}), ...rates() });
      if (error) throw error;
      setManual(null); await loadEntries(emp.id);
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't save that time entry."), 'err'); }
  };
  const saveLeave = async () => {
    if (!emp || !leave) return;
    try {
      const { error } = await sb.from('time_entries').insert({ tenant_id: tenantId, employee_id: emp.id, work_date: leave.date, entry_type: leave.type, hours_worked: parseFloat(leave.hours) || 8, total_hours: parseFloat(leave.hours) || 8, status: 'pending', timezone: TZ });
      if (error) throw error;
      setLeave(null); await loadEntries(emp.id); say('Logged');
    } catch (e: any) { console.error(e); say(humanError(e, "Couldn't log that leave."), 'err'); }
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

  const inp: React.CSSProperties = { background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, padding: '9px 11px', fontSize: 14, width: '100%' };
  const btn: React.CSSProperties = { background: GOLD, color: DARK, fontWeight: 700, border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14 };
  const clockedIn = !!openShift;

  return (
    <PremiumSurface maxWidth={1140}>
      <ModuleHero
        eyebrow="Field Workforce"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('time').vivid ?? moduleAccent('time').hex}><Clock size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('time').hex}
        title="Time"
        accent="Clock"
        subtitle="GPS-stamped, CSI-coded labour. Same engine as the phone."
        note="GPS stamped — no more paper"
        actions={
          <>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 170 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select value={csiDiv} onChange={(e) => setCsiDiv(e.target.value)} style={{ ...inp, width: 'auto', maxWidth: 240 }} title="CSI cost code applied to the next clock-in">
              <option value="">No cost code</option>
              {Object.entries(CSI_DIVISIONS).map(([code, d]) => <option key={code} value={code}>Div {code} — {d.name}</option>)}
            </select>
          </>
        }
      />

      {/* Week intelligence strip — what the engine already knows */}
      <StatStrip items={[
        {href: '/app/time',  label: 'Today', value: `${todayHours.toFixed(2)} h`, sub: clockedIn ? 'shift running now' : 'completed shifts', accent: clockedIn ? GREEN : undefined },
        {href: '/app/time',  label: 'This Week', value: `${(week?.workedHours ?? 0).toFixed(2)} h`, sub: `week of ${fmtDate(thisWeekKey)}` },
        {href: '/app/time',  label: 'Regular', value: `${(week?.regularHours ?? 0).toFixed(2)} h`, sub: 'inside the 40 h threshold' },
        {href: '/app/time',  label: 'Overtime', value: `${(week?.overtimeHours ?? 0).toFixed(2)} h`, accent: (week?.overtimeHours ?? 0) > 0 ? GOLD : undefined, sub: 'past 40 h/week or 8 h/day' },
        {href: '/app/time',  label: 'Leave', value: `${leaveHours.toFixed(2)} h`, sub: 'PTO / sick / holiday' },
        ...(regRate > 0
          ? [{href: '/app/time',  label: 'Est. Gross', value: fmtMoney(estGross), accent: GREEN, sub: `$${regRate}/h reg · $${otRate}/h OT` }]
          : [{href: '/app/time',  label: 'Pending Approval', value: String(pendingCount), sub: 'entries awaiting review' }]),
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
        <div>

          {/* Shift console — walks in knowing the project, cost code, timezone, and GPS */}
          <SectionCard style={{ marginBottom: 16 }} bodyStyle={{ textAlign: 'center', padding: 26 }}>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1, color: clockedIn ? GREEN : DIM, fontVariantNumeric: 'tabular-nums' }}>
              {clockedIn ? (() => { const h = liveElapsed(openShift.clock_in, new Date(now).toISOString()); const s = Math.floor(h * 3600); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; })() : 'Clocked out'}
            </div>
            <div style={{ color: DIM, fontSize: 13, marginTop: 4 }}>{clockedIn ? `Since ${fmtTime(openShift.clock_in)} · ${openShift.timezone || TZ}` : (emp ? 'Ready to clock in' : 'Resolving your employee record…')}</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12, fontSize: 12, color: DIM }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><HardHat size={13} color={GOLD} />{clockedIn ? (projects.find((p) => p.id === openShift.project_id)?.name || 'Project') : (projName || 'Pick a project above')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Timer size={13} color={GOLD} />{clockedIn ? (openShift.csi_division ? `Div ${openShift.csi_division} — ${openShift.cost_code_description || CSI_DIVISIONS[openShift.csi_division]?.name || 'cost coded'}` : 'No cost code on this shift') : (csiDiv ? `Div ${csiDiv} — ${CSI_DIVISIONS[csiDiv]?.name}` : 'No cost code — pick one above')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} color={GOLD} />GPS stamps in &amp; out</span>
            </div>
            <button onClick={clockedIn ? clockOut : clockIn} disabled={busy || !emp} className="pmBtn" style={{ ...btn, marginTop: 16, background: clockedIn ? RED : GREEN, color: '#fff', fontSize: 16, padding: '13px 26px', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: busy || !emp ? 0.6 : 1, borderRadius: 12 }}>{clockedIn ? <Stop size={20} weight="fill" /> : <Play size={20} weight="fill" />}{clockedIn ? 'Clock out' : 'Clock in'}</button>
            {msg && <div style={{ color: msgTone === 'err' ? RED : GREEN, fontSize: 13, marginTop: 10 }}>{msg}</div>}
          </SectionCard>

          {week && (
            <SectionCard flat
              title={`Week of ${fmtDate(week.weekStart)}`}
              subtitle={`${week.regularHours.toFixed(2)} h regular · ${week.overtimeHours.toFixed(2)} h overtime${regRate > 0 ? ` · est. ${fmtMoney(estGross)} gross` : ''}`}
              icon={<Clock size={17} weight="duotone" color={GOLD} />}
              style={{ marginBottom: 16 }}
              action={<button onClick={submitWeek} className="pmBtn" style={{ ...ghostButtonStyle, padding: '7px 13px', fontSize: 12.5 }}><PaperPlaneRight size={14} />Submit week</button>}
            >
              {week.days.map((d) => {
                const hrs = Number(d.hours) || 0;
                return (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 13 }}>
                    <span style={{ width: 110, flexShrink: 0 }}>{fmtDate(d.date)}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (hrs / 10) * 100)}%`, borderRadius: 999, background: hrs > 8 ? `linear-gradient(90deg,${GOLD},#FBBF24)` : 'rgba(61,214,140,0.75)' }} />
                    </div>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', width: 56, textAlign: 'right' }}>{fmtHours(d.hours)}</span>
                  </div>
                );
              })}
              {Object.keys(week.byType).filter((k) => k !== 'regular').length > 0 && <div style={{ color: DIM, fontSize: 12.5, marginTop: 8 }}>Leave: {Object.entries(week.byType).filter(([k]) => k !== 'regular').map(([k, v]) => `${v}h ${k}`).join(' · ')}</div>}
            </SectionCard>
          )}

          {/* actions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setManual({ date: localDay(), in: '07:00', out: '15:30', meal: '30', csi: csiDiv })} className="pmBtn" style={ghostButtonStyle}><Plus size={15} />Add time</button>
            <button onClick={() => setLeave({ date: localDay(), type: 'pto', hours: '8' })} className="pmBtn" style={ghostButtonStyle}><Sun size={15} weight="fill" color={GOLD} />PTO / Sick</button>
          </div>

          <SectionCard title="Recent Entries" subtitle={entries.length > 0 ? `${entries.length} shown · ${pendingCount} pending approval` : undefined} icon={<Timer size={17} weight="duotone" color={GOLD} />} bodyStyle={{ padding: 14 }}>
            {entries.length === 0 ? (
              <PremiumEmpty
                compact
                icon={<Clock size={28} weight="duotone" color={GOLD} />}
                title="No time on the books yet"
                description="Clock in above to start a GPS-stamped shift, or backfill a day with Add time. Entries land as pending, roll into the weekly timesheet, and hit job cost under their CSI division."
                action={<button onClick={() => setManual({ date: localDay(), in: '07:00', out: '15:30', meal: '30', csi: csiDiv })} className="pmBtn" style={goldButtonStyle}><Plus size={15} weight="bold" />Add time</button>}
              />
            ) : entries.map((e) => {
              const leaveType = e.entry_type && e.entry_type !== 'regular';
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  {leaveType ? <Bandaids size={18} color={GOLD} /> : null}
                  <div style={{ flex: 1, minWidth: 0, cursor: leaveType ? 'default' : 'pointer' }} onClick={() => !leaveType && e.status !== 'clocked_in' && setManual({ id: e.id, date: e.work_date, in: e.clock_in ? new Date(e.clock_in).toTimeString().slice(0, 5) : '07:00', out: e.clock_out ? new Date(e.clock_out).toTimeString().slice(0, 5) : '15:30', meal: String(e.meal_break_mins ?? 30), csi: e.csi_division || '' })}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(e.work_date)}{leaveType ? ` · ${e.entry_type.toUpperCase()}` : ''}</div>
                    <div style={{ color: DIM, fontSize: 12.5 }}>
                      {leaveType ? `${e.hours_worked ?? e.total_hours ?? 8}h` : `${fmtTime(e.clock_in)} – ${e.status === 'clocked_in' ? 'now' : fmtTime(e.clock_out)}`}
                      {!leaveType && e.project_id ? ` · ${projects.find((p) => p.id === e.project_id)?.name || 'Project'}` : ''}
                    </div>
                    {e.csi_division ? <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: 4, padding: '1px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#FBBF24', fontSize: 10.5, fontWeight: 700 }}>Div {e.csi_division} · {e.cost_code_description || CSI_DIVISIONS[e.csi_division]?.name || 'Cost coded'}</span> : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{e.status === 'clocked_in' ? '—' : `${(Number(e.total_hours ?? e.hours_worked ?? 0) || 0).toFixed(2)}h`}</div>
                    <div style={{ fontSize: 10.5, color: e.status === 'clocked_in' ? GREEN : e.status === 'approved' ? '#FBBF24' : GOLD, fontWeight: 700, textTransform: 'uppercase' }}>{e.status}</div>
                  </div>
                  {e.status !== 'clocked_in' && e.status !== 'approved' ? <button onClick={() => del(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash size={15} color={RED} /></button> : null}
                </div>
              );
            })}
          </SectionCard>
        </div>

        {/* Context rail — what the system does with these hours */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard flat title="This Week at a Glance" icon={<CurrencyDollar size={17} weight="duotone" color={GOLD} />}>
            <InsightRow label="Worked hours" value={`${(week?.workedHours ?? 0).toFixed(2)} h`} />
            <InsightRow label="Regular / OT" value={`${(week?.regularHours ?? 0).toFixed(2)} / ${(week?.overtimeHours ?? 0).toFixed(2)}`} accent={(week?.overtimeHours ?? 0) > 0 ? GOLD : undefined} />
            <InsightRow label="Leave logged" value={`${leaveHours.toFixed(2)} h`} />
            <InsightRow label="Pending approval" value={String(pendingCount)} />
            {regRate > 0 && <InsightRow label="Est. gross" value={fmtMoney(estGross)} accent={GREEN} strong />}
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: 8 }}>Overtime splits automatically past 40 h/week and 8 h/shift. Rates come from your employee record.</div>
          </SectionCard>
          <SectionCard flat title="After You Clock Out" icon={<PaperPlaneRight size={17} weight="duotone" color={GOLD} />}>
            <FlowSteps title="" steps={[
              { title: 'Entry lands as pending', desc: 'GPS-stamped, timezone-aware, meal break deducted.' },
              { title: 'CSI division prices the labor', desc: csiDiv ? `Coding to Div ${csiDiv} — ${CSI_DIVISIONS[csiDiv]?.name}.` : 'Pick a cost code above so hours hit the right budget line.' },
              { title: 'Submit the week', desc: 'One click sends the whole timesheet for approval.' },
              { title: 'Approved hours hit job cost', desc: 'Labor cost rolls into the project budget and reports.' },
            ]} />
          </SectionCard>
        </div>
      </div>

      {manual && (
        <Modal title={manual.id ? 'Edit time' : 'Add time'} onClose={() => setManual(null)}>
          <SaguaroDatePicker value={manual.date} onChange={(v) => setManual({ ...manual, date: v })} style={inp} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input type="time" value={manual.in} onChange={(e) => setManual({ ...manual, in: e.target.value })} style={inp} /><input type="time" value={manual.out} onChange={(e) => setManual({ ...manual, out: e.target.value })} style={inp} /></div>
          <input value={manual.meal} onChange={(e) => setManual({ ...manual, meal: e.target.value })} placeholder="Meal break (min)" style={{ ...inp, marginTop: 8 }} />
          <select value={manual.csi ?? ''} onChange={(e) => setManual({ ...manual, csi: e.target.value })} style={{ ...inp, marginTop: 8 }}>
            <option value="">No cost code</option>
            {Object.entries(CSI_DIVISIONS).map(([code, d]) => <option key={code} value={code}>Div {code} — {d.name}</option>)}
          </select>
          <div style={{ color: DIM, fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>The CSI division routes these hours to the right budget line in job cost.</div>
          <button onClick={saveManual} style={{ ...btn, marginTop: 14, width: '100%' }}>{manual.id ? 'Save' : 'Log time'}</button>
        </Modal>
      )}
      {leave && (
        <Modal title="Log PTO / Sick" onClose={() => setLeave(null)}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{['pto', 'sick', 'holiday', 'vacation'].map((t) => <button key={t} onClick={() => setLeave({ ...leave, type: t })} style={{ ...btn, background: leave.type === t ? GOLD : 'transparent', color: leave.type === t ? DARK : TEXT, border: `1px solid ${BORDER}`, padding: '7px 12px', fontSize: 13, textTransform: 'capitalize' }}>{t}</button>)}</div>
          <SaguaroDatePicker value={leave.date} onChange={(v) => setLeave({ ...leave, date: v })} style={inp} />
          <input value={leave.hours} onChange={(e) => setLeave({ ...leave, hours: e.target.value })} placeholder="Hours" style={{ ...inp, marginTop: 8 }} />
          <button onClick={saveLeave} style={{ ...btn, marginTop: 14, width: '100%' }}>Log {leave.type}</button>
        </Modal>
      )}
    </PremiumSurface>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, width: 'min(400px, 100%)' }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14 }}>{title}</div>{children}
      </div>
    </div>
  );
}
