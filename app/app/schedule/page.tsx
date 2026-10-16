'use client';
import { projectColor, jobRowVar } from '@/lib/project-colors';
/**
 * Schedule — full construction schedule module, Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (New Task) → StatRow (total / in
 * progress / complete / overdue — each tile filters the list) → Toolbar
 * (search, project, status, List | Timeline) → the task list (kit DataTable
 * with inline % / status / predecessor editors, row actions Mark Complete and
 * Delete) or the dependency-aware SVG Gantt. The composer opens in a FormModal.
 *
 * Wired to (unchanged):
 *   GET    /api/schedule/list            → { tasks: [...] } (tenant-scoped)
 *   POST   /api/schedule/create          → create a task
 *   PUT    /api/schedule/[id]            → inline edit (% / status / predecessor / dates)
 *   DELETE /api/schedule/[id]            → delete a task
 *
 * Columns are the REAL live schedule_tasks columns: name, phase, trade, start_date,
 * end_date, pct_complete, status, predecessor_id, duration. (The table has no
 * assigned_to / notes columns — those are intentionally absent here.)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { useRouter } from 'next/navigation';
import {
  Plus, Warning, CheckCircle, Trash, GitBranch, ListBullets, ChartBar, CalendarBlank, ArrowSquareOut,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState,
  FormModal, Field, Input, Select, FormGrid,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { AutoChip, InsightRow } from '@/components/ui/premium';
import { tradeOptions } from '@/lib/taxonomy';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { SCHEDULE_STATUSES, normalizeScheduleStatus } from '@/lib/schedule-status';

interface ScheduleTask {
  id: string;
  project_id: string | null;
  name: string;
  phase: string | null;
  trade: string | null;
  start_date: string | null;
  end_date: string | null;
  pct_complete: number;
  status: string;
  predecessor_id: string | null;
  duration: number | null;
  created_at: string;
}

interface Project { id: string; name: string; }

// Canonical statuses (task spec). Legacy values kept tolerant so old rows still render.
// Colors come from the six status kinds: Not Started grey, In Progress blue,
// Complete green, Blocked red, Delayed / On Hold amber.
const STATUS_MAP: Record<string, { label: string; tone: BadgeTone; css: string }> = {
  not_started: { label: 'Not Started', tone: 'closed', css: 'var(--status-closed)' },
  in_progress: { label: 'In Progress', tone: 'lead', css: 'var(--status-lead)' },
  completed: { label: 'Completed', tone: 'completed', css: 'var(--status-completed)' },
  blocked: { label: 'Blocked', tone: 'overdue', css: 'var(--status-overdue)' },
  delayed: { label: 'Delayed', tone: 'under_contract', css: 'var(--status-under-contract)' },
  on_hold: { label: 'On Hold', tone: 'under_contract', css: 'var(--status-under-contract)' },
};
/* One vocabulary with the job schedule and every route (lib/schedule-status).
   This page wrote and counted `complete`; the job schedule only knew
   `completed`, so finished tasks read as Not Started (and overdue) here. */
const STATUS_OPTIONS = SCHEDULE_STATUSES;
const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label }));
const STATUS_RANK: Record<string, number> = { blocked: 0, in_progress: 1, not_started: 2, delayed: 3, on_hold: 3, completed: 4 };

function statusCfg(s?: string | null) {
  return STATUS_MAP[normalizeScheduleStatus(s) ?? 'not_started'] ?? STATUS_MAP.not_started;
}
type StatusFilter = 'all' | 'overdue' | (typeof STATUS_OPTIONS)[number];

// Canonical trade taxonomy — CSI division groups plus the specialty markets
// outside them, flattened for the kit Select.
const TRADE_OPTIONS = tradeOptions().flatMap((g) => g.options.map((o) => ({ value: o.value, label: `${o.label} — ${g.group}` })));

// ── Date-only helpers (no TZ drift: dates are 'YYYY-MM-DD') ─────────────────
const DAY = 86400000;
function ymdToUTC(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
function ymdAddDays(s: string, days: number): string {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days)).toISOString().slice(0, 10);
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function todayUTC(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}
function coerce(raw: any): ScheduleTask {
  return { ...raw, pct_complete: raw.pct_complete == null ? 0 : Number(raw.pct_complete), status: normalizeScheduleStatus(raw.status) ?? 'not_started' };
}
const isLate = (t: ScheduleTask) => !!t.end_date && ymdToUTC(t.end_date) < todayUTC() && t.status !== 'completed';

const NEED_NAME = 'Give the task a name.';
const NEED_PROJECT = 'Pick the project this task belongs to.';
const focusSoon = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 0);

const EMPTY_FORM = {
  name: '', projectId: '', phase: '', trade: '',
  startDate: '', endDate: '', pctComplete: '0',
  status: 'not_started', predecessorId: '',
};

const CSS = `
.scWs > .k-page { max-width: none; }
.scList .k-table th:first-child, .scList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.scList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.scList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.scTask { display: flex; flex-direction: column; gap: 2px; max-width: 250px; min-width: 0; }
/* Predecessor picker: capped so the seven-column register fits 1440 without a sideways scroll. */
.scInline { max-width: 160px; min-width: 0; }
.scInline select, .scInline .k-select { max-width: 160px; }
.scTask > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.scTask > span:first-child { color: var(--text-primary); font-weight: 700; }
.scTask > span + span { font-size: var(--fs-xs); color: var(--text-tertiary); }
.scMuted { color: var(--text-tertiary); }
.scLate { color: var(--status-overdue); font-weight: 700; }
.scPct { display: flex; align-items: center; gap: 8px; min-width: 130px; }
.scBar { flex: 1; height: 6px; background: rgba(255,255,255,.08); border-radius: 3px; overflow: hidden; }
.scBar > div { height: 100%; border-radius: 3px; transition: width .3s ease; }
.scPct input.k-input { width: 56px; min-height: 30px; padding: 3px 6px; text-align: right; font-size: var(--fs-xs); }
.scInline select.k-select { min-height: 30px; padding: 3px 26px 3px 9px; font-size: var(--fs-xs); border-radius: 999px; font-weight: 700; width: auto; max-width: 170px; }
.scInline[data-tone] select.k-select { color: var(--tone); border-color: color-mix(in srgb, var(--tone) 35%, transparent); background-color: color-mix(in srgb, var(--tone) 12%, transparent); }
.scSeg { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); background: var(--bg-surface-2); border: 1px solid var(--glass-border); }
.scSeg button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); cursor: pointer; }
.scSeg button[aria-pressed="true"] { background: var(--bg-solid-2); color: var(--text-primary); }
.scSeg button:focus-visible { outline: 2px solid var(--focus-ring); }
.scErr { display: flex; gap: 10px; align-items: center; font-size: var(--fs-sm); color: var(--text-primary); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(248,113,113,.35); background: rgba(248,113,113,.08); }
.scErr > svg { color: var(--status-overdue); flex-shrink: 0; }
.scLadder { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); margin-bottom: 16px; }
.scHint { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 4px; }
.scGantt { display: flex; }
.scGanttLabels { width: 230px; flex-shrink: 0; border-right: 1px solid var(--border-default); }
.scGanttHead { height: 48px; display: flex; align-items: flex-end; padding: 0 14px 8px; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); border-bottom: 1px solid var(--border-default); }
.scGanttRow { height: 38px; display: flex; flex-direction: column; justify-content: center; padding: 0 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; overflow: hidden; }
.scGanttRow:hover { background: rgba(255,255,255,0.03); }
.scGanttRow > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scGanttRow > span:first-child { font-size: var(--fs-sm); font-weight: 600; color: var(--text-primary); }
.scGanttRow > span + span { font-size: 12px; color: var(--text-tertiary); }
.scGanttScroll { overflow-x: auto; flex: 1; }
.scLegend { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 16px; border-top: 1px solid var(--border-default); font-size: var(--fs-xs); color: var(--text-tertiary); }
.scLegend > span { display: inline-flex; align-items: center; gap: 6px; }
.scLegend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.scDateInput { width: 100%; }
@media (max-width: 640px) {
  .scWs .k-btn, .scWs .k-stat, .scWs select.k-select, .scWs .k-input, .scSeg button { min-height: 44px; }
  .scWs .k-table td { height: 48px; }
  .scGanttLabels { width: 150px; }
  .scTask { max-width: 200px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function SchedulePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showCreate, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'schedule-create',
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowCreate(true); },
    onSave: () => handleCreate(),
  });
  // SmartCreate: once a project is chosen, the modal walks in knowing it.
  const { ctx } = useProjectContext(form.projectId || null);
  const [duration, setDuration] = useState('');
  const [auto, setAuto] = useState<{ start?: boolean; end?: boolean }>({});

  const fetchTasks = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch('/api/schedule/list');
      if (!res.ok) throw new Error('Failed to load schedule');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.tasks ?? data.schedule_tasks ?? [];
      setTasks(arr.map(coerce));
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.')); setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch('/api/projects?limit=200&fields=id,name')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setProjects(Array.isArray(d) ? d : d.projects ?? []); })
      .catch(() => { /* the project picker degrades to ids; the task list still loads */ });
  }, [fetchTasks]);

  const projectName = useCallback(
    (id: string | null) => projects.find(p => p.id === id)?.name ?? null,
    [projects],
  );

  // ── Optimistic PUT ─────────────────────────────────────────────────────────
  const patchTask = useCallback(async (id: string, fields: Partial<ScheduleTask>) => {
    const prev = tasks;
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, ...fields } : t)));
    setSavingId(id);
    setError('');
    try {
      const res = await fetch(`/api/schedule/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed to save change');
    } catch (e: any) {
      setTasks(prev); // revert
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
    } finally {
      setSavingId(null);
    }
  }, [tasks]);

  const deleteTask = useCallback(async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete task?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    const prev = tasks;
    setTasks(ts => ts.filter(t => t.id !== id));
    setSavingId(id);
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete task');
    } catch (e: any) {
      setTasks(prev);
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
    } finally {
      setSavingId(null);
    }
  }, [tasks]);

  // SmartCreate wiring: duration drives the end date; a predecessor drives the start.
  function setStartDate(v: string) {
    const d = Number(duration) || 0;
    const end = v && d > 0 ? ymdAddDays(v, d) : form.endDate;
    setForm(f => ({ ...f, startDate: v, endDate: end }));
    setAuto(a => ({ ...a, start: false, end: !!(v && d > 0) }));
  }
  function setDurationDays(v: string) {
    setDuration(v);
    const d = Number(v) || 0;
    if (form.startDate && d > 0) {
      setForm(f => ({ ...f, endDate: ymdAddDays(f.startDate, d) }));
      setAuto(a => ({ ...a, end: true }));
    }
  }
  function setEndDate(v: string) {
    if (form.startDate && v) setDuration(String(Math.max(1, Math.round((ymdToUTC(v) - ymdToUTC(form.startDate)) / DAY))));
    setForm(f => ({ ...f, endDate: v }));
    setAuto(a => ({ ...a, end: false }));
  }
  function setPredecessor(id: string) {
    const pred = tasks.find(t => t.id === id);
    const patch: Record<string, any> = { predecessorId: id };
    if (pred?.end_date && !form.startDate) {
      // A task follows its predecessor — default to starting the day after it ends.
      patch.startDate = ymdAddDays(pred.end_date, 1);
      const d = Number(duration) || 0;
      if (d > 0) patch.endDate = ymdAddDays(patch.startDate, d);
      setAuto({ start: true, end: d > 0 });
    }
    setForm(f => ({ ...f, ...patch }));
  }

  async function handleCreate(e?: React.FormEvent): Promise<boolean> {
    e?.preventDefault();
    /* One message per missing field, under that field, with the cursor put
       there — "Task name and project are required." in the footer read as
       nothing at all on a phone. */
    if (!form.name.trim()) { setError(NEED_NAME); focusSoon('sc-task-name'); return false; }
    if (!form.projectId) { setError(NEED_PROJECT); focusSoon('sc-task-project'); return false; }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/schedule/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          projectId: form.projectId,
          phase: form.phase,
          trade: form.trade || null,
          start_date: form.startDate || null,
          end_date: form.endDate || null,
          pct_complete: parseInt(form.pctComplete) || 0,
          status: form.status,
          predecessor_id: form.predecessorId || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to create task');
      }
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      setDuration(''); setAuto({});
      await fetchTasks();
      guard.clearDraft();
      return true;
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
    } finally {
      setCreating(false);
    }
    return false;
  }
  function openCreate() { setError(''); setShowCreate(true); }
  function closeComposer() { guard.requestClose(() => { setShowCreate(false); setError(''); }); }

  const byProject = useMemo(
    () => (projectFilter ? tasks.filter(t => t.project_id === projectFilter) : tasks),
    [tasks, projectFilter],
  );
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => byProject.filter(t => {
    if (statusFilter === 'overdue') { if (!isLate(t)) return false; }
    else if (statusFilter !== 'all' && (t.status || 'not_started') !== statusFilter) return false;
    if (!q) return true;
    return [t.name, t.phase, t.trade, projectName(t.project_id)].some(v => String(v || '').toLowerCase().includes(q));
  }), [byProject, statusFilter, q, projectName]);
  const filtersActive = !!search || !!projectFilter || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setProjectFilter(''); setStatusFilter('all'); };
  const toggleStatus = (s: StatusFilter) => setStatusFilter(prev => (prev === s ? 'all' : s));

  const taskById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  // Predecessor candidates for a given task = other tasks in the same project.
  const predOptionsFor = useCallback(
    (t: ScheduleTask) => tasks.filter(o => o.id !== t.id && o.project_id === t.project_id),
    [tasks],
  );

  // Stats describe the project in view (the project filter), not the search.
  const stats = useMemo(() => {
    const total = byProject.length;
    const complete = byProject.filter(t => t.status === 'completed').length;
    const inProgress = byProject.filter(t => t.status === 'in_progress').length;
    const overdue = byProject.filter(isLate).length;
    return { total, complete, inProgress, overdue };
  }, [byProject]);

  const statItems: StatItem[] = loading
    ? [
        { label: 'Total Tasks', value: '—', sub: 'Loading…' },
        { label: 'In Progress', value: '—', sub: 'Loading…' },
        { label: 'Complete', value: '—', sub: 'Loading…' },
        { label: 'Overdue', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Total Tasks', value: stats.total, sub: statusFilter !== 'all' || search ? 'Click to show everything' : projectFilter ? 'On this project' : 'Across every project', onClick: statusFilter !== 'all' || search ? () => { setStatusFilter('all'); setSearch(''); } : undefined },
        { label: 'In Progress', value: stats.inProgress, tone: stats.inProgress > 0 ? 'good' : 'default', sub: statusFilter === 'in_progress' ? 'Filtered — click to clear' : 'Crews on it now', onClick: () => toggleStatus('in_progress') },
        { label: 'Complete', value: stats.complete, tone: stats.complete > 0 ? 'good' : 'default', sub: statusFilter === 'completed' ? 'Filtered — click to clear' : stats.total > 0 ? `${Math.round((stats.complete / stats.total) * 100)}% of the plan` : 'Nothing planned yet', onClick: () => toggleStatus('completed') },
        { label: 'Overdue', value: stats.overdue, tone: stats.overdue > 0 ? 'bad' : 'default', sub: statusFilter === 'overdue' ? 'Filtered — click to clear' : stats.overdue > 0 ? 'Past their end date, not complete' : 'Nothing slipped', onClick: () => toggleStatus('overdue') },
      ];

  // ── List columns (inline editable) ──────────────────────────────────────────
  const columns: Column<ScheduleTask>[] = [
    { key: 'name', header: 'Task', accessor: t => String(t.name || '').toLowerCase(), render: t => (
      <div className="scTask">
        <span title={t.name}>{t.name}</span>
        <span>{[t.phase, projectName(t.project_id)].filter(Boolean).join(' · ') || '—'}</span>
      </div>
    ) },
    { key: 'trade', phone: 'hide', header: 'Trade', accessor: t => String(t.trade || ''), render: t => t.trade ? <span className="scMuted">{t.trade}</span> : <span className="scMuted">—</span> },
    { key: 'start_date', header: 'Start', accessor: t => t.start_date || '', render: t => <span className="scMuted">{fmtDate(t.start_date)}</span> },
    { key: 'end_date', header: 'End', accessor: t => t.end_date || '', render: t => <span className={isLate(t) ? 'scLate' : 'scMuted'}>{fmtDate(t.end_date)}{isLate(t) ? ' · late' : ''}</span> },
    { key: 'predecessor', phone: 'hide', header: 'Predecessor', accessor: t => taskById.get(t.predecessor_id || '')?.name || '', render: t => (
      <PredecessorEditor task={t} options={predOptionsFor(t)} saving={savingId === t.id} onSave={(pid) => patchTask(t.id, { predecessor_id: pid })} />
    ) },
    // pct_complete can round-trip as TEXT — numeric sort, not lexicographic.
    { key: 'pct_complete', phone: 'show', header: 'Progress', accessor: t => Number(t.pct_complete) || 0, render: t => (
      <PctEditor task={t} saving={savingId === t.id} onSave={(n) => patchTask(t.id, { pct_complete: n, status: n >= 100 ? 'completed' : n > 0 ? 'in_progress' : 'not_started' })} />
    ) },
    { key: 'status', phone: 'show', header: 'Status', accessor: t => STATUS_RANK[t.status] ?? 9, render: t => (
      <StatusEditor task={t} saving={savingId === t.id} onSave={(s) => patchTask(t.id, s === 'completed' ? { status: s, pct_complete: 100 } : s === 'not_started' ? { status: s, pct_complete: 0 } : { status: s })} />
    ) },
  ];
  const rowActions = (t: ScheduleTask): Action[] => {
    const busy = savingId === t.id;
    return [
      { label: 'Open Task', icon: <ArrowSquareOut size={15} />, href: `/app/schedule/${t.id}` },
      { label: 'Mark Complete', icon: <CheckCircle size={15} />, onClick: () => patchTask(t.id, { status: 'completed', pct_complete: 100 }), hidden: t.status === 'completed', disabled: busy },
      { label: 'Delete Task', icon: <Trash size={15} />, onClick: () => deleteTask(t.id), tone: 'danger', disabled: busy },
    ];
  };

  const formProjectTasks = tasks.filter(t => t.project_id === form.projectId);
  const projectOptions = projects.map(p => ({ value: p.id, label: p.name }));

  // ── Body ──
  let body: React.ReactNode;
  if (!loading && loadFailed) {
    body = <Card flush><EmptyState icon={<Warning size={22} />} title="Couldn't load the schedule" text={`${error} Nothing has been lost — try again.`} action={<Button onClick={() => { setLoading(true); fetchTasks(); }}>Retry</Button>} /></Card>;
  } else if (!loading && tasks.length === 0) {
    body = <Card flush><EmptyState icon={<CalendarBlank size={22} />} title="No tasks scheduled yet" text="Add the first task — give it a project, dates and a predecessor, and the timeline draws itself with dependencies." action={<Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add First Task</Button>} /></Card>;
  } else if (view === 'list') {
    body = (
      <div className="scList">
        <Card flush>
          <DataTable
            rowStyle={(t: ScheduleTask) => (t.project_id ? jobRowVar(projectColor(projects.find(p => p.id === t.project_id) ?? t.project_id)) : undefined)}
            columns={columns}
            rows={filtered}
            rowKey={t => t.id}
            loading={loading}
            defaultSort={{ key: 'start_date', dir: 'asc' }}
            onRowClick={(t) => router.push(`/app/schedule/${t.id}`)}
            rowActions={rowActions}
            empty={<EmptyState icon={<CalendarBlank size={22} />} title="No tasks match these filters" text="Clear the search, project, or status filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
          />
        </Card>
      </div>
    );
  } else {
    body = (
      <Card flush>
        <GanttChart rows={filtered} taskById={taskById} loading={loading} onSelect={(t) => router.push(`/app/schedule/${t.id}`)} onClear={filtersActive ? clearFilters : undefined} />
      </Card>
    );
  }

  return (
    <div className="scWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Schedule' }]}
        title="Schedule"
        subtitle="Tasks, progress, and dependencies across every job — edit progress and status right in the list."
        actions={<Button variant="primary" data-tour="new-task" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>New Task</Button>}
      >
        {!loadFailed && <StatRow items={statItems} />}

        {!loading && !loadFailed && tasks.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by task, phase, trade, or project…"
            filters={
              <>
                <Select aria-label="Project" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} placeholder="All Projects" style={{ width: 'auto', minWidth: 180 }} options={projectOptions} />
                <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={{ width: 'auto', minWidth: 150 }} options={[{ value: 'all', label: 'All Statuses' }, ...STATUS_SELECT_OPTIONS, { value: 'overdue', label: 'Overdue' }]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={
              <>
                <span className="scMuted" style={{ fontSize: 'var(--fs-sm)' }}>{filtered.length} of {tasks.length}</span>
                <div className="scSeg" role="group" aria-label="View">
                  <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><ListBullets size={14} weight="bold" /> List</button>
                  <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}><ChartBar size={14} weight="bold" /> Timeline</button>
                </div>
              </>
            }
          />
        )}

        {error && !loadFailed && !showCreate && (
          <div className="scErr" role="alert"><Warning size={16} weight="fill" /> {error}</div>
        )}

        {body}
      </PageShell>

      {/* ── Composer ── */}
      <FormModal
        open={showCreate}
        onClose={closeComposer}
        title="New Schedule Task"
        subtitle={form.projectId ? `${projectName(form.projectId) || 'Project'} · ${formProjectTasks.length} task${formProjectTasks.length === 1 ? '' : 's'} already planned.` : 'Pick the project first — the predecessor list and dates follow from it.'}
        onSubmit={async () => { await handleCreate(); }}
        submitLabel="Create Task"
        busy={creating}
        error={showCreate && error && error !== NEED_NAME && error !== NEED_PROJECT ? error : null}
      >
        {form.projectId && (
          <div className="scLadder">
            <InsightRow label="Tasks on This Project" value={`${formProjectTasks.length} · ${formProjectTasks.filter(t => t.status === 'completed').length} complete`} />
            <InsightRow label="Critical Path" value={String(ctx?.schedule?.criticalCount ?? 0)} strong={(ctx?.schedule?.criticalCount ?? 0) > 0} />
            <InsightRow label="Next Milestone" value={ctx?.schedule?.nextTasks?.[0]?.name ? `${ctx.schedule.nextTasks[0].name}${ctx.schedule.nextTasks[0].startDate ? ` · starts ${fmtDate(String(ctx.schedule.nextTasks[0].startDate))}` : ''}` : 'Nothing queued yet'} />
          </div>
        )}
        <FormGrid cols={2}>
          <Field label="Task Name" required span error={error === NEED_NAME ? NEED_NAME : null}>
            <Input id="sc-task-name" value={form.name} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, name: v })); if (error) setError(''); }} placeholder="Foundation pour, framing, etc." autoFocus aria-invalid={error === NEED_NAME || undefined} />
          </Field>
          <Field label="Project" required error={error === NEED_PROJECT ? NEED_PROJECT : null} hint={projects.length === 0 ? 'Loading your jobs…' : undefined}>
            <Select id="sc-task-project" aria-label="Project" value={form.projectId} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, projectId: v, predecessorId: '' })); if (error) setError(''); }} placeholder="Select project…" options={projectOptions} aria-invalid={error === NEED_PROJECT || undefined} />
          </Field>
          <Field label="Phase" hint="Phase 1, Rough-in, etc.">
            <Input value={form.phase} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, phase: v })); }} placeholder="Phase 1, Rough-in, etc." />
          </Field>
          <Field label="Trade">
            <Select aria-label="Trade" value={form.trade} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, trade: v })); }} placeholder="Select trade…" options={TRADE_OPTIONS} />
          </Field>
          <Field label="Status">
            <Select aria-label="Status" value={form.status} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, status: v })); }} options={STATUS_SELECT_OPTIONS} />
          </Field>
          <Field label="Start Date" hint={auto.start ? <><AutoChip /> Day after the predecessor ends — edit freely.</> : undefined}>
            <div className="scDateInput"><SaguaroDatePicker value={form.startDate} onChange={(v) => setStartDate(v)} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Duration (days)" hint="Computes the end date from the start.">
            <Input type="number" min="1" value={duration} onChange={(e) => setDurationDays(e.target.value)} placeholder="e.g. 10" />
          </Field>
          <Field label="End Date" hint={auto.end && form.startDate ? <><AutoChip /> Start + {Number(duration) || 0}d — editing it re-syncs duration.</> : undefined}>
            <div className="scDateInput"><SaguaroDatePicker value={form.endDate} onChange={(v) => setEndDate(v)} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="% Complete">
            <Input type="number" min="0" max="100" value={form.pctComplete} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, pctComplete: v })); }} />
          </Field>
          <Field label="Predecessor" hint={form.predecessorId ? (() => {
            const p = taskById.get(form.predecessorId);
            return p ? <>Follows <b style={{ color: 'var(--text-primary)' }}>{p.name}</b>{p.end_date ? ` — ends ${fmtDate(p.end_date)}; this task starts the day after.` : ' — no end date on the predecessor yet.'}</> : undefined;
          })() : form.projectId ? 'Finish-to-start — this task waits for the predecessor.' : 'Pick a project to choose from its tasks.'}>
            <Select aria-label="Predecessor" value={form.predecessorId} onChange={(e) => setPredecessor(e.target.value)} disabled={!form.projectId} placeholder="None" options={formProjectTasks.map(t => ({ value: t.id, label: `${t.name}${t.end_date ? ` (ends ${fmtDate(t.end_date)})` : ''}` }))} />
          </Field>
        </FormGrid>
      </FormModal>

      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
    </div>
  );
}

// ── Inline editors ────────────────────────────────────────────────────────────
function PctEditor({ task, onSave, saving }: { task: ScheduleTask; onSave: (n: number) => void; saving: boolean }) {
  const [val, setVal] = useState(String(task.pct_complete ?? 0));
  useEffect(() => { setVal(String(task.pct_complete ?? 0)); }, [task.pct_complete]);
  const n = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
  const commit = () => {
    if (n !== (task.pct_complete ?? 0)) onSave(n);
    setVal(String(n));
  };
  return (
    <div onClick={(e) => e.stopPropagation()} className="scPct">
      <div className="scBar"><div style={{ width: `${n}%`, background: n >= 100 ? 'var(--status-ongoing)' : n > 50 ? 'var(--status-lead)' : 'var(--brand-primary)' }} /></div>
      <Input
        type="number" min={0} max={100} value={val}
        aria-label="Percent complete"
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        disabled={saving}
      />
    </div>
  );
}

function StatusEditor({ task, onSave, saving }: { task: ScheduleTask; onSave: (s: string) => void; saving: boolean }) {
  const cfg = statusCfg(task.status);
  return (
    <div onClick={(e) => e.stopPropagation()} className="scInline" data-tone="" style={{ ['--tone' as any]: cfg.css }}>
      <Select
        aria-label="Status"
        value={STATUS_OPTIONS.includes(task.status as any) ? task.status : 'not_started'}
        onChange={(e) => onSave(e.target.value)}
        disabled={saving}
        options={STATUS_SELECT_OPTIONS}
      />
    </div>
  );
}

function PredecessorEditor({ task, options, onSave, saving }: { task: ScheduleTask; options: ScheduleTask[]; onSave: (id: string) => void; saving: boolean }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="scInline">
      <Select
        aria-label="Predecessor"
        value={task.predecessor_id ?? ''}
        onChange={(e) => onSave(e.target.value)}
        disabled={saving || options.length === 0}
        placeholder="None"
        options={options.map(o => ({ value: o.id, label: o.name }))}
      />
    </div>
  );
}

// ── Gantt / Timeline ──────────────────────────────────────────────────────────
function GanttChart({ rows, taskById, loading, onSelect, onClear }: {
  rows: ScheduleTask[];
  taskById: Map<string, ScheduleTask>;
  loading: boolean;
  onSelect: (t: ScheduleTask) => void;
  onClear?: () => void;
}) {
  const ROW_H = 38, HEADER_H = 48, BAR_H = 22, PX_DAY = 26;

  const geom = useMemo(() => {
    const dated = rows.filter(t => t.start_date && t.end_date);
    if (dated.length === 0) return null;
    const starts = dated.map(t => ymdToUTC(t.start_date!));
    const ends = dated.map(t => ymdToUTC(t.end_date!));
    const domainStart = Math.min(...starts) - 2 * DAY;
    const domainEnd = Math.max(...ends) + 2 * DAY;
    const totalDays = Math.round((domainEnd - domainStart) / DAY) + 1;
    const width = totalDays * PX_DAY;
    const xOf = (utc: number) => ((utc - domainStart) / DAY) * PX_DAY;
    return { domainStart, domainEnd, totalDays, width, xOf };
  }, [rows]);

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading timeline…</div>;
  }
  if (!geom) {
    return <EmptyState icon={<CalendarBlank size={22} />} title="Nothing to plot yet" text={rows.length > 0 ? 'These tasks have no start and end dates — add them to draw the timeline.' : 'No tasks match these filters.'} action={onClear ? <Button onClick={onClear}>Clear Filters</Button> : undefined} />;
  }

  const { domainStart, totalDays, width, xOf } = geom;
  const svgH = HEADER_H + rows.length * ROW_H;
  const today = todayUTC();
  const rowIndex = new Map(rows.map((t, i) => [t.id, i]));

  // Weekly gridlines + month labels.
  const weekLines: { x: number; label: string }[] = [];
  const monthLabels: { x: number; label: string }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const utc = domainStart + i * DAY;
    const d = new Date(utc);
    if (d.getUTCDay() === 1) weekLines.push({ x: i * PX_DAY, label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` });
    if (d.getUTCDate() === 1) monthLabels.push({ x: i * PX_DAY, label: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
  }
  const todayX = today >= domainStart && today <= geom.domainEnd ? xOf(today) : null;

  // Dependency links (finish-to-start) between dated, visible tasks.
  const links: { d: string }[] = [];
  for (const t of rows) {
    if (!t.predecessor_id || !t.start_date) continue;
    const pred = taskById.get(t.predecessor_id);
    if (!pred || !pred.end_date || !rowIndex.has(pred.id) || !rowIndex.has(t.id)) continue;
    const fromX = xOf(ymdToUTC(pred.end_date)) + PX_DAY;
    const fromY = HEADER_H + (rowIndex.get(pred.id)! + 0.5) * ROW_H;
    const toX = xOf(ymdToUTC(t.start_date));
    const toY = HEADER_H + (rowIndex.get(t.id)! + 0.5) * ROW_H;
    const midX = Math.max(fromX + 10, toX - 10);
    links.push({ d: `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}` });
  }
  const LINK = 'var(--status-completed)';

  return (
    <div>
      <div className="scGantt">
        {/* Fixed label column */}
        <div className="scGanttLabels">
          <div className="scGanttHead">Task</div>
          {rows.map((t) => {
            const unscheduled = !t.start_date || !t.end_date;
            return (
              <div key={t.id} onClick={() => onSelect(t)} title={t.name} className="scGanttRow" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(t); }}>
                <span>{t.name}</span>
                <span>{unscheduled ? 'Unscheduled' : (t.trade || t.phase || '—')}</span>
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div className="scGanttScroll">
          <svg width={width} height={svgH} style={{ display: 'block' }}>
            <defs>
              <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L6,3 L0,6 Z" fill={LINK} />
              </marker>
            </defs>

            {/* Month band + week gridlines */}
            <rect x={0} y={0} width={width} height={HEADER_H} fill="rgba(255,255,255,0.02)" />
            {monthLabels.map((m, i) => (
              <text key={`mo${i}`} x={m.x + 4} y={16} fontSize={11} fontWeight={700} fill="var(--text-secondary)">{m.label}</text>
            ))}
            {weekLines.map((w, i) => (
              <g key={`wk${i}`}>
                <line x1={w.x} y1={HEADER_H} x2={w.x} y2={svgH} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <text x={w.x + 3} y={HEADER_H - 6} fontSize={9} fill="var(--text-tertiary)">{w.label}</text>
              </g>
            ))}

            {/* Row separators */}
            {rows.map((_, i) => (
              <line key={`rs${i}`} x1={0} y1={HEADER_H + (i + 1) * ROW_H} x2={width} y2={HEADER_H + (i + 1) * ROW_H} stroke="var(--border-subtle)" strokeWidth={1} />
            ))}

            {/* Today marker */}
            {todayX != null && (
              <g>
                <line x1={todayX} y1={HEADER_H} x2={todayX} y2={svgH} stroke="var(--brand-primary)" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={todayX + 4} y={HEADER_H + 11} fontSize={9} fontWeight={700} fill="var(--brand-primary)">Today</text>
              </g>
            )}

            {/* Dependency links */}
            {links.map((l, i) => (
              <path key={`ln${i}`} d={l.d} fill="none" stroke={LINK} strokeWidth={1.5} markerEnd="url(#gantt-arrow)" opacity={0.85} />
            ))}

            {/* Bars */}
            {rows.map((t, i) => {
              if (!t.start_date || !t.end_date) return null;
              const x = xOf(ymdToUTC(t.start_date));
              const endX = xOf(ymdToUTC(t.end_date)) + PX_DAY;
              const w = Math.max(endX - x, 6);
              const y = HEADER_H + i * ROW_H + (ROW_H - BAR_H) / 2;
              const c = statusCfg(t.status).css;
              const pct = Math.max(0, Math.min(100, t.pct_complete ?? 0));
              return (
                <g key={`bar${t.id}`} onClick={() => onSelect(t)} style={{ cursor: 'pointer' }}>
                  <title>{`${t.name}\n${fmtDate(t.start_date)} → ${fmtDate(t.end_date)}\n${pct}% · ${statusCfg(t.status).label}`}</title>
                  <rect x={x} y={y} width={w} height={BAR_H} rx={5} fill={`color-mix(in srgb, ${c} 20%, transparent)`} stroke={c} strokeWidth={1} />
                  <rect x={x} y={y} width={(w * pct) / 100} height={BAR_H} rx={5} fill={c} opacity={0.9} />
                  {w > 46 && (
                    <text x={x + 7} y={y + BAR_H / 2 + 3.5} fontSize={10} fontWeight={700} fill="var(--text-primary)" style={{ pointerEvents: 'none' }}>{pct}%</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="scLegend">
        {STATUS_OPTIONS.map(s => (
          <span key={s}><i style={{ background: STATUS_MAP[s].css }} /> {STATUS_MAP[s].label}</span>
        ))}
        <span><GitBranch size={13} color={LINK} /> Dependency</span>
        <span><Badge tone="gold">Today</Badge> dashed line</span>
      </div>
    </div>
  );
}
