'use client';
/**
 * Daily Logs (company) — Pass 4, on the RFIs reference layout (dense table).
 *
 * Anatomy: title + one primary action (New Log) → StatRow (each tile filters
 * the register) → Toolbar → DataTable, date-organized, one row per log across
 * every project. A row opens the full record at /app/daily-logs/[id].
 *
 * Every read / write is the one this screen already used:
 *   list     GET  /api/daily-logs/list
 *   projects GET  /api/projects?limit=100&fields=id,name
 *   prefill  GET  /api/projects/[id]/daily-logs/prefill?date=   ("Same as Yesterday")
 *   create   POST /api/daily-logs/create
 * Last-used memory, learning events, the unsaved-work guard, the NudgeRing
 * anchor and the ?new=1 deep link are unchanged.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import {
  Plus, UsersThree, Warning, ClipboardText, ArrowClockwise, ArrowSquareOut, CloudSun, CopySimple,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  FormModal, Field, Input, Textarea, FormGrid,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { InsightRow } from '@/components/ui/premium';
import { getLastUsed, setLastUsed, postLearningEvent } from '@/lib/last-used';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_DAILY_LOG_GAP } from '@/lib/suggestions';
import Suggest from '@/components/ui/Suggest';
import { sendOrSave, listSaved, savedRowId, savedIdOf, isOffline } from '@/lib/offline/outbox';
import { unloggedWorkdays } from '@/lib/daily-log-gap';

interface DailyLog {
  id: string;
  project_id: string;
  log_date: string;
  weather: string | null;
  /* The list route returns raw rows: temperatures live in high_temp / low_temp.
     The older temperature_* names are read defensively for any row that
     still carries them. */
  high_temp?: number | null;
  low_temp?: number | null;
  temperature_high?: number | null;
  temperature_low?: number | null;
  crew_count: number;
  work_performed: string;
  delays: string;
  safety_notes: string;
  materials_delivered: string;
  visitors: string;
  notes: string;
  superintendent?: string | null;
  /* draft | submitted — the column existed in the database and nowhere on
     screen, so a log somebody started and abandoned looked filed. */
  status?: string | null;
  created_at: string;
}

interface Project { id: string; name: string; }

type DelayFilter = 'all' | 'delays' | 'clear';
type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved';
type PeriodFilter = 'all' | 'month';

/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDay = (d?: string | null) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
const fmtDate = (d?: string | null) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/** Today as YYYY-MM-DD on the user's wall clock — never the UTC day. */
const PICK_PROJECT = 'Pick the project this log is for.';
/* Work Performed is marked required on the form and is the whole point of a
   daily log; nothing enforced it, so an empty log saved and the day read as
   covered. Field-level messages are routed to their field, not the footer. */
const NEED_WORK = 'Say what got done today.';
const FIELD_ERRORS = new Set([PICK_PROJECT, NEED_WORK]);
/* Shortcuts for the Weather field. It offered a single "w" — the id of the
   datalist it replaced, carried over as if it were the list. */
const WEATHER_SUGGESTIONS = ['Clear', 'Sunny', 'Partly Cloudy', 'Overcast', 'Light Rain', 'Rain', 'Thunderstorms', 'Snow', 'Windy', 'Fog', 'Hot', 'Cold'];
const localToday = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tempHigh = (l: DailyLog) => l.high_temp ?? l.temperature_high ?? null;
const tempLow = (l: DailyLog) => l.low_temp ?? l.temperature_low ?? null;
const tempStr = (l: DailyLog) => {
  const h = tempHigh(l), lo = tempLow(l);
  if (h == null && lo == null) return '—';
  return `${h ?? '—'}° / ${lo ?? '—'}°`;
};

/** One status → one badge. Draft stays neutral so the register is not a
 *  rainbow: only Submitted / Approved carry a hue, from lib/status-colors. */
function logStatus(l: DailyLog): { label: string; tone: BadgeTone } {
  const s = (l.status || 'draft').toLowerCase();
  if (s === 'submitted') return { label: 'Submitted', tone: 'ongoing' };
  if (s === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (s === 'draft') return { label: 'Draft', tone: 'neutral' };
  return { label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), tone: 'neutral' };
}

const CSS = `
.dlWs > .k-page { max-width: none; }
.dlList .k-table th:first-child, .dlList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.dlList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.dlList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.dlDate { color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dlClamp { display: inline-block; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.dlMuted { color: var(--text-tertiary); }
.dlBadges { display: inline-flex; align-items: center; gap: 6px; }
.dlNum { font-variant-numeric: tabular-nums; }
.dlInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); padding: 10px 14px; border: 1px solid rgba(248,113,113,.35); border-radius: var(--radius-sm); background: rgba(248,113,113,.08); }
.dlInlineErr[data-tone="info"] { color: var(--text-primary); border-color: var(--border-default); background: var(--bg-solid-2); }
.dlBanner { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); }
.dlBanner[data-gap="true"] { border-color: rgba(248,113,113,.35); background: rgba(248,113,113,.07); }
.dlBannerTitle { font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); }
.dlBanner[data-gap="true"] .dlBannerTitle { color: var(--status-overdue); }
.dlNote { display: flex; gap: 10px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.5; padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--brand-primary-25); background: var(--brand-primary-08); }
.dlDateInput { width: 100%; }
@media (max-width: 640px) {
  .dlWs .k-btn, .dlWs .k-stat, .dlWs select.k-select, .dlWs .k-input { min-height: 44px; }
  .dlWs .k-table td { height: 48px; }
  .dlClamp { max-width: 200px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function DailyLogsPage() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  /** The job picker says whether jobs are still coming, failed, or truly none. */
  const [projectsState, setProjectsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** "Saved on this phone…" after a log written with no signal. */
  const [notice, setNotice] = useState('');
  /** Set when the server answers 409: today's log for this job already exists — offer it. */
  const [existingLogId, setExistingLogId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autoCrew, setAutoCrew] = useState(false);
  // "Same as yesterday" — true once the prior log's structure was carried in.
  const [carryUsed, setCarryUsed] = useState(false);
  const [carrying, setCarrying] = useState(false);
  // Last-used memory: what this open prefilled, so AUTO chips track edits.
  const [lastApplied, setLastApplied] = useState<{ projectId?: string; superintendent?: string }>({});
  // Register filters — search, project, delays, status, period.
  const [logSearch, setLogSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [delayFilter, setDelayFilter] = useState<DelayFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const prevLogFor = (pid: string) => logs.filter(l => l.project_id === pid).sort((a, b) => (b.log_date || '').localeCompare(a.log_date || ''))[0];

  const [form, setForm] = useState({
    projectId: '',
    logDate: localToday(),
    weather: '',
    temperatureHigh: '',
    temperatureLow: '',
    crewCount: '',
    workPerformed: '',
    delays: '',
    safetyNotes: '',
    materialsDelivered: '',
    visitors: '',
    notes: '',
    // Mobile-app fields (app/daily.tsx) — kept in sync so a web-created log
    // carries the same union of columns the native app reads/writes.
    superintendent: '',
    precipitation: '',
    windConditions: '',
    phaseOfWork: '',
    equipment: '',
  });

  // Snapshot of the selected project — served from the shared useProjectContext
  // cache the moment one is chosen in the modal; last log + open items, so the
  // form walks in knowing the job.
  const { ctx } = useProjectContext(form.projectId || null);

  // Logs written on this phone with no signal, shown until they've gone up.
  const savedLogs = useCallback(async (): Promise<DailyLog[]> =>
    (await listSaved(null, 'daily-log')).filter((w) => w.method === 'POST')
      .map((w) => ({ ...(w.row || {}), id: savedRowId(w.id), _offline: true, _offlineError: w.lastError } as unknown as DailyLog)), []);

  const projectName = useCallback((pid: string) => projects.find(p => p.id === pid)?.name || '', [projects]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/daily-logs/list');
      if (!res.ok) throw new Error('Failed to load daily logs');
      const data = await res.json();
      const server: DailyLog[] = Array.isArray(data) ? data : data.logs ?? data.daily_logs ?? [];
      setLogs([...(await savedLogs()), ...server]);
    } catch (e: any) {
      const local = await savedLogs();
      if (local.length) setLogs((prev) => [...local, ...prev.filter((l) => !savedIdOf(String(l.id)))]);
      if (!isOffline()) { console.error(e); setError(humanError(e, 'Something went wrong. Please try again.')); }
    } finally {
      setLoading(false);
    }
  }, [savedLogs]);

  // Logs written offline went up: show the server's copies.
  useEffect(() => {
    const onSynced = (e: Event) => { if ((e as CustomEvent).detail?.kind === 'daily-log') void fetchLogs(); };
    window.addEventListener('saguaro:outbox-synced', onSynced);
    return () => window.removeEventListener('saguaro:outbox-synced', onSynced);
  }, [fetchLogs]);

  useEffect(() => {
    fetchLogs();
    fetch('/api/projects?limit=100&fields=id,name')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setProjectsState('error'); return; }
        setProjects(Array.isArray(d) ? d : d.projects ?? []);
        setProjectsState('ready');
      })
      .catch((e) => { console.error(e); setProjectsState('error'); });
    // Deep link from the command palette: /app/daily-logs?new=1 opens the composer.
    try {
      if (new URLSearchParams(window.location.search).get('new') === '1') openCreate();
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLogs]);

  /** Open the composer with last-used memory applied: the project and
   *  superintendent this user logged last time prefill with AUTO chips. */
  function openCreate() {
    const last = getLastUsed<{ projectId?: string; superintendent?: string }>('daily-log') || {};
    const applied: { projectId?: string; superintendent?: string } = {};
    const next = { ...form };
    if (!next.projectId && last.projectId && projects.some(p => p.id === last.projectId)) {
      next.projectId = last.projectId;
      applied.projectId = last.projectId;
      const prev = prevLogFor(last.projectId);
      if (prev?.crew_count) { next.crewCount = String(prev.crew_count); setAutoCrew(true); }
    }
    if (!next.superintendent && last.superintendent) {
      next.superintendent = last.superintendent;
      applied.superintendent = last.superintendent;
    }
    setForm(next);
    setLastApplied(applied);
    setCarryUsed(false);
    setShowCreate(true);
  }

  /** "Same as yesterday" — carries the prior log's structure (crew, super,
   *  phase, equipment) via the server /prefill carry-forward, falling back to
   *  the last log already loaded client-side. Today's narrative stays blank. */
  async function sameAsYesterday() {
    const pid = form.projectId;
    if (!pid || carrying) return;
    setCarrying(true);
    try {
      let carry: Record<string, any> | null = null;
      let clockCrew = 0;
      try {
        const r = await fetch(`/api/projects/${pid}/daily-logs/prefill?date=${form.logDate}`);
        if (r.ok) {
          const d = await r.json();
          carry = d.carryForward || null;
          clockCrew = Number(d.crewCount) || 0;
        }
      } catch { /* prefill unavailable — fall back to the loaded log list */ }
      const prev = prevLogFor(pid);
      setForm(f => ({
        ...f,
        crewCount: clockCrew > 0 ? String(clockCrew) : (prev?.crew_count ? String(prev.crew_count) : f.crewCount),
        superintendent: f.superintendent || (carry?.superintendent as string) || prev?.superintendent || '',
        phaseOfWork: f.phaseOfWork || (carry?.phase_of_work as string) || '',
        equipment: f.equipment || (carry?.equipment as string) || '',
      }));
      setAutoCrew(true);
      setCarryUsed(true);
    } finally {
      setCarrying(false);
    }
  }

  /* ── Unsaved-work protection (R14): dirty once anything beyond the default
   *    date is filled in; draft autosaves to this device and restores on
   *    return. Losing a day's field notes is exactly the failure mode the
   *    guard exists for. ── */
  const logFormDirty = showCreate && (
    !!form.projectId || !!form.weather || !!form.temperatureHigh || !!form.temperatureLow ||
    !!form.crewCount || !!form.workPerformed || !!form.delays || !!form.safetyNotes ||
    !!form.materialsDelivered || !!form.visitors || !!form.notes || !!form.superintendent ||
    !!form.precipitation || !!form.windConditions || !!form.phaseOfWork || !!form.equipment
  );
  const guard = useUnsavedGuard({
    dirty: logFormDirty,
    draftKey: 'daily-log-create',
    draftData: form,
    restoreDraft: (d) => {
      setForm(f => ({ ...f, ...(d as Partial<typeof form>) }));
      setShowCreate(true);
    },
    onSave: () => submitCreate(),
  });

  /** Close paths (backdrop / × / Cancel / Esc) run through the guard. */
  function closeCreate() {
    guard.requestClose(() => { setShowCreate(false); setExistingLogId(null); setError((e) => (FIELD_ERRORS.has(e) ? '' : e)); });
  }

  /** POST the form — shared by the form submit and the guard's "Save & leave". */
  async function submitCreate(): Promise<boolean> {
    if (!form.projectId) {
      /* The select used to carry the native `required` attribute, so the
         browser blocked the submit with its own bubble before this check ran:
         nothing was sent and nothing on the page said why. The page owns the
         rule now — the message sits under the field and the cursor goes to it. */
      setError(PICK_PROJECT);
      window.setTimeout(() => document.getElementById('dl-project')?.focus(), 0);
      return false;
    }
    if (!form.workPerformed.trim()) {
      setError(NEED_WORK);
      window.setTimeout(() => document.getElementById('dl-work')?.focus(), 0);
      return false;
    }
    setExistingLogId(null);
    setCreating(true);
    try {
      const body = {
          projectId: form.projectId,
          logDate: form.logDate,
          weather: form.weather || null,
          temperatureHigh: form.temperatureHigh ? parseFloat(form.temperatureHigh) : null,
          temperatureLow: form.temperatureLow ? parseFloat(form.temperatureLow) : null,
          crewCount: form.crewCount ? parseInt(form.crewCount) : 0,
          workPerformed: form.workPerformed,
          delays: form.delays,
          safetyNotes: form.safetyNotes,
          materialsDelivered: form.materialsDelivered,
          visitors: form.visitors,
          notes: form.notes,
          superintendent: form.superintendent || null,
          precipitation: form.precipitation || null,
          windConditions: form.windConditions || null,
          phaseOfWork: form.phaseOfWork || null,
          equipment: form.equipment || null,
        };
      // No signal on site is normal: the log is kept on this phone and sent when it's back.
      const sent = await sendOrSave({
        url: '/api/daily-logs/create', method: 'POST', body, projectId: form.projectId, kind: 'daily-log',
        label: `Daily log ${form.logDate} · ${projectName(form.projectId) || 'job'}`,
        row: {
          project_id: form.projectId, log_date: form.logDate, status: 'draft', weather: body.weather,
          high_temp: body.temperatureHigh, low_temp: body.temperatureLow, crew_count: body.crewCount,
          work_performed: body.workPerformed, delays: body.delays, safety_notes: body.safetyNotes,
          materials_delivered: body.materialsDelivered, visitors: body.visitors, notes: body.notes,
          superintendent: body.superintendent, precipitation: body.precipitation,
          wind_conditions: body.windConditions, phase_of_work: body.phaseOfWork,
        },
      });
      if (!sent.saved && !sent.response.ok) {
        /* The route words every refusal for a GC (apiError, or the 409 below) and
           this threw it away for a generic "Failed to create daily log". The
           commonest refusal of all — today's log for this job already exists,
           written by someone else or saved twice on bad signal — then read as a
           broken save. Show the server's own words, and for the 409 open the
           existing log instead of leaving them to hunt for it. */
        let j: { error?: string; existingLogId?: string | null } = {};
        try { j = await sent.response.json(); } catch (parseErr) { console.error('[daily-logs] non-JSON error body', parseErr); }
        if (sent.response.status === 409) setExistingLogId(j.existingLogId ?? null);
        setError(j.error || "The daily log didn't save. Try again.");
        return false;
      }
      setNotice(sent.saved ? "Saved on this phone — it sends when you're back online." : '');
      // Remember what was saved for next time, and receipt what was accepted.
      setLastUsed('daily-log', { projectId: form.projectId, superintendent: form.superintendent });
      const acceptedLast = [
        lastApplied.projectId && form.projectId === lastApplied.projectId && 'projectId',
        lastApplied.superintendent && form.superintendent === lastApplied.superintendent && 'superintendent',
      ].filter(Boolean) as string[];
      if (acceptedLast.length > 0) {
        postLearningEvent('last_used_prefill', { projectId: form.projectId, meta: { scope: 'daily-log', fields: acceptedLast } });
      }
      if (carryUsed) {
        postLearningEvent('daily_log_carry_forward', { projectId: form.projectId, meta: { logDate: form.logDate } });
      }
      setLastApplied({});
      setCarryUsed(false);
      setShowCreate(false);
      setForm({ projectId: '', logDate: localToday(), weather: '', temperatureHigh: '', temperatureLow: '', crewCount: '', workPerformed: '', delays: '', safetyNotes: '', materialsDelivered: '', visitors: '', notes: '', superintendent: '', precipitation: '', windConditions: '', phaseOfWork: '', equipment: '' });
      setAutoCrew(false);
      await fetchLogs();
      return true;
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function handleCreate() {
    if (await submitCreate()) guard.clearDraft();
  }


  // ── Register metrics ──
  const monthIso = localToday().slice(0, 7);
  const thisMonth = logs.filter(l => (l.log_date || '').startsWith(monthIso)).length;
  const avgCrew = logs.length ? Math.round(logs.reduce((s, l) => s + (Number(l.crew_count) || 0), 0) / logs.length) : 0;
  const delayDays = logs.filter(l => (l.delays || '').trim()).length;
  const draftCount = logs.filter(l => (l.status || 'draft').toLowerCase() === 'draft').length;
  const projectsCovered = new Set(logs.map(l => l.project_id)).size;
  const latestLog = logs.reduce<DailyLog | null>((m, l) => (!m || (l.log_date || '') > (m.log_date || '')) ? l : m, null);

  const visibleLogs = useMemo(() => {
    let list = logs;
    if (projectFilter !== 'all') list = list.filter(l => l.project_id === projectFilter);
    if (delayFilter === 'delays') list = list.filter(l => (l.delays || '').trim());
    if (delayFilter === 'clear') list = list.filter(l => !(l.delays || '').trim());
    if (statusFilter !== 'all') list = list.filter(l => (l.status || 'draft').toLowerCase() === statusFilter);
    if (periodFilter === 'month') list = list.filter(l => (l.log_date || '').startsWith(monthIso));
    const q = logSearch.trim().toLowerCase();
    if (q) list = list.filter(l => [l.work_performed, l.weather, l.delays, l.superintendent, l.notes, l.visitors, l.materials_delivered, projectName(l.project_id)].some(v => String(v || '').toLowerCase().includes(q)));
    return list;
  }, [logs, logSearch, projectFilter, delayFilter, statusFilter, periodFilter, monthIso, projectName]);

  const filtersActive = !!logSearch || projectFilter !== 'all' || delayFilter !== 'all' || statusFilter !== 'all' || periodFilter !== 'all';
  const clearFilters = () => { setLogSearch(''); setProjectFilter('all'); setDelayFilter('all'); setStatusFilter('all'); setPeriodFilter('all'); };

  // ── Stat tiles: each opens the register filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label: 'Latest Log', value: '—', sub: 'Loading…' },
        { label: 'This Month', value: '—', sub: 'Loading…' },
        { label: 'Days with Delays', value: '—', sub: 'Loading…' },
        { label: 'Drafts', value: '—', sub: 'Loading…' },
        { label: 'Avg Crew / Day', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Latest Log', value: latestLog ? fmtDay(latestLog.log_date) : '—', sub: latestLog ? (projectName(latestLog.project_id) || 'Across all projects') : 'No field reports yet', href: latestLog ? `/app/daily-logs/${latestLog.id}` : undefined },
        { label: 'This Month', value: thisMonth, sub: periodFilter === 'month' ? 'Filtered — click to clear' : `${projectsCovered} project${projectsCovered === 1 ? '' : 's'} reporting`, onClick: () => setPeriodFilter(p => (p === 'month' ? 'all' : 'month')) },
        { label: 'Days with Delays', value: delayDays, tone: delayDays > 0 ? 'bad' : 'default', sub: delayFilter === 'delays' ? 'Filtered — click to clear' : delayDays > 0 ? 'Flagged in the record' : 'None flagged', onClick: () => setDelayFilter(d => (d === 'delays' ? 'all' : 'delays')) },
        { label: 'Drafts', value: draftCount, tone: draftCount > 0 ? 'warn' : 'default', sub: statusFilter === 'draft' ? 'Filtered — click to clear' : draftCount > 0 ? 'Started, not submitted' : 'Every log is filed', onClick: () => setStatusFilter(s => (s === 'draft' ? 'all' : 'draft')) },
        { label: 'Avg Crew / Day', value: avgCrew, sub: `${logs.length} field report${logs.length === 1 ? '' : 's'}` },
      ];

  // ── Register columns ──
  // Weather and temperature live in the detail panel and the phone card header: with
  // them as columns the register needed ~1,230 px and squeezed at 1440 (the date cell
  // painted over the project name). Six columns fit with room for the work line.
  const columns: Column<DailyLog>[] = [
    { key: 'log_date', header: 'Date', accessor: l => l.log_date || '', width: 130, render: l => <span className="dlDate">{fmtDate(l.log_date)}</span> },
    { key: 'project', header: 'Project', accessor: l => projectName(l.project_id).toLowerCase(), render: l => <span className="dlClamp" style={{ maxWidth: 260, color: 'var(--text-primary)', fontWeight: 600 }} title={projectName(l.project_id)}>{projectName(l.project_id) || <span className="dlMuted">Unknown project</span>}</span> },
    { key: 'status', phone: 'show', header: 'Status', accessor: l => ((l as any)._offline ? 'On This Phone' : logStatus(l).label), render: l => {
      const off = l as DailyLog & { _offline?: boolean; _offlineError?: string };
      if (off._offline) return <span title={off._offlineError ? `Couldn't send: ${off._offlineError}` : "Saved on this phone — it sends when you're back online."}><Badge tone={off._offlineError ? 'overdue' : 'gold'}>{off._offlineError ? "Couldn't Send" : 'On This Phone'}</Badge></span>;
      const s = logStatus(l); return <Badge tone={s.tone}>{s.label}</Badge>;
    } },
    { key: 'crew_count', header: 'Crew', accessor: l => Number(l.crew_count) || 0, align: 'right', render: l => <span className="dlNum" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UsersThree size={14} style={{ color: 'var(--text-tertiary)' }} />{Number(l.crew_count) || 0}</span> },
    { key: 'work_performed', header: 'Work Performed', accessor: l => (l.work_performed || '').toLowerCase(), render: l => l.work_performed ? <span className="dlClamp" style={{ maxWidth: 320 }} title={l.work_performed}>{l.work_performed}</span> : <span className="dlMuted">—</span> },
    { key: 'flags', header: 'Flags', accessor: l => ((l.delays || '').trim() ? 2 : 0) + ((l.safety_notes || '').trim() ? 1 : 0), render: l => {
      const hasDelay = !!(l.delays || '').trim();
      const hasSafety = !!(l.safety_notes || '').trim();
      if (!hasDelay && !hasSafety) return <span className="dlMuted">Clear</span>;
      return (
        <span className="dlBadges">
          {hasDelay && <Badge tone="overdue">Delays</Badge>}
          {hasSafety && <Badge tone="neutral">Safety Note</Badge>}
        </span>
      );
    } },
  ];

  const rowActions = (l: DailyLog): Action[] => [
    { label: 'Open Log', icon: <ArrowSquareOut size={15} />, onClick: () => guard.requestLeave(`/app/daily-logs/${l.id}`) },
    { label: 'Project Daily Logs', icon: <ClipboardText size={15} />, href: `/app/projects/${l.project_id}/daily-logs` },
  ];

  // ── Register body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (error && !showCreate && logs.length === 0 && !loading) {
    listBody = (
      <EmptyState
        icon={<Warning size={22} />}
        title="Couldn't load daily logs"
        text={`${error} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15} />} onClick={() => { setError(''); setLoading(true); fetchLogs(); }}>Retry</Button>}
      />
    );
  } else if (!loading && logs.length === 0) {
    listBody = (
      <EmptyState
        icon={<ClipboardText size={22} />}
        title="No daily logs yet"
        text="Create the first log to start the field record — it is what wins the argument in two years."
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Create First Log</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={visibleLogs}
        rowKey={l => l.id}
        loading={loading}
        defaultSort={{ key: 'log_date', dir: 'desc' }}
        onRowClick={(row) => savedIdOf(String(row.id))
          ? setNotice("This log is still on this phone — it opens once it's sent.")
          : guard.requestLeave(`/app/daily-logs/${row.id}`)}
        rowActions={rowActions}
        empty={
          <EmptyState
            icon={<ClipboardText size={22} />}
            title="No logs match these filters"
            text="Clear the search, project, status, or delay filter to see more."
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  const prevForForm = form.projectId ? prevLogFor(form.projectId) : undefined;

  return (
    <div className="dlWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Daily Logs' }]}
        title="Daily Logs"
        subtitle="Daily field activity, weather, crew, and work progress across every job."
        actions={
          <Button variant="primary" data-tour="new-daily-log" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>
            New Log
          </Button>
        }
      >
        <StatRow items={stats} />

        {notice && (
          <div className="dlInlineErr" role="status" data-tone="info">
            <CloudSun size={15} /> {notice}
            <Button size="sm" variant="ghost" onClick={() => setNotice('')}>Dismiss</Button>
          </div>
        )}

        {error && !showCreate && logs.length > 0 && (
          <div className="dlInlineErr" role="alert">
            <Warning size={15} /> {error}
            <Button size="sm" variant="ghost" onClick={() => setError('')}>Dismiss</Button>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <Toolbar
            search={logSearch}
            onSearch={setLogSearch}
            placeholder="Search by project, work, weather, or super…"
            filters={
              <>
                <Select
                  aria-label="Project"
                  value={projectFilter}
                  onChange={e => setProjectFilter(e.target.value)}
                  style={{ width: 'auto', minWidth: 160, maxWidth: 280 }}
                  options={[{ value: 'all', label: 'All Projects' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
                />
                <Select
                  aria-label="Status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  style={{ width: 'auto', minWidth: 140 }}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'submitted', label: 'Submitted' },
                    { value: 'approved', label: 'Approved' },
                  ]}
                />
                <Select
                  aria-label="Delays"
                  value={delayFilter}
                  onChange={e => setDelayFilter(e.target.value as DelayFilter)}
                  style={{ width: 'auto', minWidth: 150 }}
                  options={[
                    { value: 'all', label: 'All Days' },
                    { value: 'delays', label: 'Days with Delays' },
                    { value: 'clear', label: 'No Delays' },
                  ]}
                />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="dlMuted" style={{ fontSize: 'var(--fs-sm)' }}>{visibleLogs.length} of {logs.length}</span>}
          />
        )}

        {/* NudgeRing pulses the register when the suggestion engine flags an
            active project that has gone 3+ workdays without a daily log. */}
        <NudgeRing anchorId={ANCHOR_DAILY_LOG_GAP}>
          <div className="dlList">
            <Card flush>{listBody}</Card>
          </div>
        </NudgeRing>
      </PageShell>

      {/* ── Create Modal ───────────────────────────────────────────── */}
      <FormModal
        open={showCreate}
        onClose={closeCreate}
        title="New Daily Log"
        subtitle={form.projectId ? projectName(form.projectId) || undefined : 'Pick the job, then only type what the system cannot know.'}
        onSubmit={handleCreate}
        submitLabel="Create Log"
        busy={creating}
        error={error && !FIELD_ERRORS.has(error) && !existingLogId ? error : null}
      >
        {existingLogId ? (
          <div className="dlInlineErr" role="alert" style={{ marginBottom: 16 }}>
            <Warning size={15} /> {error || 'A daily log already exists for this day on this project.'}
            <Button size="sm" icon={<ArrowSquareOut size={14} />} onClick={() => guard.requestLeave(`/app/daily-logs/${existingLogId}`)}>
              Open That Log
            </Button>
          </div>
        ) : null}
        {form.projectId && ctx ? (() => {
          const lastLog = ctx.recent?.lastDailyLogDate as string | null;
          const gap = unloggedWorkdays(lastLog, localToday(), ctx.project);
          const prev = prevForForm;
          return (
            <div className="dlBanner" data-gap={gap > 0 ? 'true' : 'false'} style={{ marginBottom: 16 }}>
              <div className="dlBannerTitle">
                {lastLog
                  ? gap > 0
                    ? `Gap in the record — last log ${fmtDay(lastLog)}, ${gap} workday${gap === 1 ? '' : 's'} unlogged.`
                    : `Last log: ${fmtDay(lastLog)} — record is current.`
                  : 'First daily log on this project — it starts the field record.'}
              </div>
              <div style={{ marginTop: 6 }}>
                <InsightRow label="Project" value={`${Number(ctx.project?.percentComplete) || 0}% complete`} />
                <InsightRow label="Open Items" value={`${ctx.counts?.openRfis ?? 0} RFIs · ${ctx.counts?.openSubmittals ?? 0} submittals · ${ctx.counts?.openPunch ?? 0} punch`} />
                {prev ? <InsightRow label="Prev Log" value={`${prev.crew_count || 0} crew${prev.weather ? ` · ${prev.weather}` : ''}${prev.superintendent ? ` · ${prev.superintendent}` : ''}`} /> : null}
              </div>
              {(prev || lastLog) && !carryUsed ? (
                <div style={{ marginTop: 10 }}>
                  <Button
                    size="sm"
                    icon={<CopySimple size={14} />}
                    onClick={sameAsYesterday}
                    disabled={carrying}
                    title="Carry the last log's crew count, superintendent, phase, and equipment into today — work performed stays blank"
                  >
                    {carrying ? 'Carrying forward…' : 'Same as Yesterday — Carry Crew, Super, Phase & Equipment'}
                  </Button>
                </div>
              ) : carryUsed ? (
                <div className="dlMuted" style={{ marginTop: 8, fontSize: 'var(--fs-sm)' }}>
                  Carried from the last log — crew, superintendent, phase, and equipment are prefilled. Today&apos;s work still needs your words.
                </div>
              ) : null}
            </div>
          );
        })() : null}

        <FormGrid cols={2}>
          <Field
            label="Project"
            required
            error={error === PICK_PROJECT ? PICK_PROJECT : null}
            hint={
              projectsState === 'loading' && projects.length === 0 ? 'Loading your jobs…'
              : projectsState === 'error' && projects.length === 0 ? "Couldn't load your jobs. Close this and try again."
              : projects.length === 0 ? <>No jobs yet — <a href="/app/projects/new" style={{ color: 'var(--link)' }}>create a project</a> first.</>
              : lastApplied.projectId && form.projectId === lastApplied.projectId ? 'Remembered from your last log.' : undefined
            }
          >
            <Select
              id="dl-project"
              value={form.projectId}
              onChange={(e) => {
                const pid = e.target.value;
                // The moment a project is chosen the form walks in knowing it:
                // snapshot fetch + crew carried from that job's latest log.
                const prev = prevLogFor(pid);
                setForm(f => ({ ...f, projectId: pid, crewCount: prev?.crew_count ? String(prev.crew_count) : f.crewCount }));
                setAutoCrew(!!(prev?.crew_count));
                if (error) setError('');
                setExistingLogId(null);
              }}
              placeholder="Select project…"
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              aria-required="true"
              aria-invalid={error === PICK_PROJECT || undefined}
            />
          </Field>
          <Field label="Date" hint="Defaulted to today — backfill any missed day.">
            <div className="dlDateInput"><SaguaroDatePicker value={form.logDate} onChange={(v) => { setForm({ ...form, logDate: v }); if (existingLogId) { setExistingLogId(null); setError(''); } }} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Superintendent" hint={prevForForm?.superintendent ? `Last log: ${prevForForm.superintendent}.` : undefined}>
            <Input value={form.superintendent} onChange={(e) => setForm({ ...form, superintendent: e.target.value })} placeholder="Who ran the site" />
          </Field>
          <Field label="Phase of Work">
            <Input value={form.phaseOfWork} onChange={(e) => setForm({ ...form, phaseOfWork: e.target.value })} placeholder="e.g. Rough-in, Framing" />
          </Field>
          <Field label="Crew Count" hint={autoCrew && form.crewCount ? 'Carried from the last log on this project — adjust for today.' : undefined}>
            <Input type="number" min={0} value={form.crewCount} onChange={(e) => setForm({ ...form, crewCount: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Weather">
            <Suggest className="k-input" value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} placeholder="Clear, 10 mph W, dusty…" options={WEATHER_SUGGESTIONS} />
          </Field>
          <Field label="Temp High (°F)">
            <Input type="number" value={form.temperatureHigh} onChange={(e) => setForm({ ...form, temperatureHigh: e.target.value })} placeholder="95" />
          </Field>
          <Field label="Temp Low (°F)">
            <Input type="number" value={form.temperatureLow} onChange={(e) => setForm({ ...form, temperatureLow: e.target.value })} placeholder="72" />
          </Field>
          <Field label="Precipitation">
            <Input value={form.precipitation} onChange={(e) => setForm({ ...form, precipitation: e.target.value })} placeholder="e.g. 0.2 in" />
          </Field>
          <Field label="Wind">
            <Input value={form.windConditions} onChange={(e) => setForm({ ...form, windConditions: e.target.value })} placeholder="e.g. 8 mph SW" />
          </Field>
          <Field label="Equipment On Site" span>
            <Textarea value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} rows={2} placeholder="Equipment on site…" />
          </Field>
          <Field label="Work Performed" required span error={error === NEED_WORK ? NEED_WORK : null}>
            <Textarea
              id="dl-work"
              value={form.workPerformed}
              onChange={(e) => { setForm({ ...form, workPerformed: e.target.value }); if (error === NEED_WORK) setError(''); }}
              rows={3}
              placeholder="Describe work completed today…"
              aria-required="true"
              aria-invalid={error === NEED_WORK || undefined}
            />
          </Field>
          <Field label="Delays" span>
            <Textarea value={form.delays} onChange={(e) => setForm({ ...form, delays: e.target.value })} rows={2} placeholder="Any delays or issues…" />
          </Field>
          <Field label="Safety Notes" span>
            <Textarea value={form.safetyNotes} onChange={(e) => setForm({ ...form, safetyNotes: e.target.value })} rows={2} placeholder="Safety observations, incidents, near misses…" />
          </Field>
          <Field label="Materials Delivered">
            <Input value={form.materialsDelivered} onChange={(e) => setForm({ ...form, materialsDelivered: e.target.value })} placeholder="Concrete, rebar, lumber…" />
          </Field>
          <Field label="Visitors">
            <Input value={form.visitors} onChange={(e) => setForm({ ...form, visitors: e.target.value })} placeholder="Inspector, owner, architect…" />
          </Field>
          <Field label="Notes" span>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Anything else worth logging for the record…" />
          </Field>
        </FormGrid>
        <div className="dlNote" style={{ marginTop: 16 }}>
          <CloudSun size={18} weight="fill" style={{ flexShrink: 0, color: 'var(--text-primary)' }} />
          <div>Leave the weather fields blank and conditions, temps, wind and precipitation stamp themselves from the National Weather Service when you save.</div>
        </div>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
    </div>
  );
}
