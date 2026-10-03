'use client';
/**
 * Schedule — full construction schedule module.
 *
 * Wired to:
 *   GET    /api/schedule/list            → { tasks: [...] } (tenant-scoped)
 *   POST   /api/schedule/create          → create a task
 *   PUT    /api/schedule/[id]            → inline edit (% / status / predecessor / dates)
 *   DELETE /api/schedule/[id]            → delete a task
 *
 * Two views (List / Timeline). List has inline % + status + predecessor editing,
 * mark-complete and delete that PUT/DELETE immediately. Timeline is a dependency-aware
 * SVG Gantt (bars start→end, predecessor_id links drawn finish-to-start).
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
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
  Plus, Warning, CheckCircle, Trash, GitBranch, ListBullets, ChartBar,
  CircleNotch, CalendarBlank,
} from '@phosphor-icons/react';
import DataTable from '../../../components/DataTable';
import { colors, font, radius } from '../../../lib/design-tokens';
import { PremiumFX, ModuleHero, StatStrip, AutoChip, IconChip, goldButtonStyle } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { StandardSelect } from '@/components/ui/Select';
import { tradeOptions } from '@/lib/taxonomy';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

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

const columnHelper = createColumnHelper<ScheduleTask>();

// Canonical statuses (task spec). Legacy values kept tolerant so old rows still render.
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: colors.textDim },
  in_progress: { label: 'In Progress', color: colors.blue },
  complete: { label: 'Complete', color: colors.green },
  blocked: { label: 'Blocked', color: colors.red },
  delayed: { label: 'Delayed', color: colors.orange },
  on_hold: { label: 'On Hold', color: colors.orange },
};
const STATUS_OPTIONS = ['not_started', 'in_progress', 'complete', 'blocked'] as const;
const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label }));

function statusCfg(s?: string | null) {
  return STATUS_MAP[(s ?? 'not_started').toLowerCase()] ?? STATUS_MAP.not_started;
}
function barColor(t: ScheduleTask) {
  return statusCfg(t.status).color;
}

// ── Date-only helpers (no TZ drift: dates are 'YYYY-MM-DD') ─────────────────
// Canonical trade taxonomy — CSI division groups plus the specialty markets outside them.
const TRADE_OPTIONS = tradeOptions();

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
  const [y, m, d] = s.split('-').map(Number);
  if (!y) return '—';
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString();
}
function todayUTC(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}
function coerce(raw: any): ScheduleTask {
  return { ...raw, pct_complete: raw.pct_complete == null ? 0 : Number(raw.pct_complete) };
}

export default function SchedulePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [projectFilter, setProjectFilter] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '', projectId: '', phase: '', trade: '',
    startDate: '', endDate: '', pctComplete: '0',
    status: 'not_started', predecessorId: '',
  });

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
    try {
      const res = await fetch('/api/schedule/list');
      if (!res.ok) throw new Error('Failed to load schedule');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.tasks ?? data.schedule_tasks ?? [];
      setTasks(arr.map(coerce));
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch('/api/projects?limit=200&fields=id,name')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setProjects(Array.isArray(d) ? d : d.projects ?? []); })
      .catch(() => {});
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
    if (!form.name || !form.projectId) return false;
    setCreating(true);
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
      if (!res.ok) throw new Error('Failed to create task');
      setShowCreate(false);
      setForm({ name: '', projectId: '', phase: '', trade: '', startDate: '', endDate: '', pctComplete: '0', status: 'not_started', predecessorId: '' });
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

  const filtered = useMemo(
    () => (projectFilter ? tasks.filter(t => t.project_id === projectFilter) : tasks),
    [tasks, projectFilter],
  );
  const taskById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  // Predecessor candidates for a given task = other tasks in the same project.
  const predOptionsFor = useCallback(
    (t: ScheduleTask) => tasks.filter(o => o.id !== t.id && o.project_id === t.project_id),
    [tasks],
  );

  const stats = useMemo(() => {
    const total = filtered.length;
    const complete = filtered.filter(t => t.status === 'complete').length;
    const inProgress = filtered.filter(t => t.status === 'in_progress').length;
    const today = todayUTC();
    const overdue = filtered.filter(t => t.end_date && ymdToUTC(t.end_date) < today && t.status !== 'complete').length;
    return { total, complete, inProgress, overdue };
  }, [filtered]);

  // ── List columns (inline editable) ──────────────────────────────────────────
  const columns = useMemo<ColumnDef<ScheduleTask, any>[]>(() => [
    columnHelper.accessor('name', {
      header: 'Task',
      cell: (info) => (
        <div>
          <div style={{ fontWeight: font.weight.semibold, color: colors.text }}>{info.getValue()}</div>
          <div style={{ fontSize: font.size.xs, color: colors.textDim }}>
            {[info.row.original.phase, projectName(info.row.original.project_id)].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('trade', {
      header: 'Trade',
      cell: (info) => <span style={{ color: colors.textMuted }}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('start_date', {
      header: 'Start',
      cell: (info) => fmtDate(info.getValue()),
    }),
    columnHelper.accessor('end_date', {
      header: 'End',
      cell: (info) => {
        const v = info.getValue();
        if (!v) return '—';
        const overdue = ymdToUTC(v) < todayUTC() && info.row.original.status !== 'complete';
        return <span style={{ color: overdue ? colors.red : colors.text }}>{fmtDate(v)}</span>;
      },
    }),
    columnHelper.display({
      id: 'predecessor',
      header: 'Predecessor',
      cell: (info) => (
        <PredecessorEditor
          task={info.row.original}
          options={predOptionsFor(info.row.original)}
          saving={savingId === info.row.original.id}
          onSave={(pid) => patchTask(info.row.original.id, { predecessor_id: pid })}
        />
      ),
    }),
    columnHelper.accessor('pct_complete', {
      header: 'Progress',
      // pct_complete can round-trip as TEXT — numeric sort, not lexicographic.
      sortingFn: (a, b) => (Number(a.original.pct_complete) || 0) - (Number(b.original.pct_complete) || 0),
      cell: (info) => (
        <PctEditor
          task={info.row.original}
          saving={savingId === info.row.original.id}
          onSave={(n) => patchTask(info.row.original.id, { pct_complete: n })}
        />
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => (
        <StatusEditor
          task={info.row.original}
          saving={savingId === info.row.original.id}
          onSave={(s) => patchTask(info.row.original.id, s === 'complete' ? { status: s, pct_complete: 100 } : { status: s })}
        />
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const t = info.row.original;
        const busy = savingId === t.id;
        return (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <button
              title="Mark Complete"
              disabled={busy || t.status === 'complete'}
              onClick={() => patchTask(t.id, { status: 'complete', pct_complete: 100 })}
              style={iconBtn(t.status === 'complete' ? colors.green : colors.textMuted, t.status === 'complete')}
            >
              <CheckCircle size={18} weight={t.status === 'complete' ? 'fill' : 'regular'} />
            </button>
            <button title="Delete Task" disabled={busy} onClick={() => deleteTask(t.id)} style={iconBtn(colors.red, false)}>
              {busy ? <CircleNotch size={16} className="spin" /> : <Trash size={16} />}
            </button>
          </div>
        );
      },
    }),
  ], [projectName, predOptionsFor, savingId, patchTask, deleteTask]);

  const labelStyle: React.CSSProperties = { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: colors.raisedAlt, border: `1px solid ${colors.border}`, borderRadius: radius.md, color: colors.text, fontSize: font.size.md, outline: 'none' };
  const formProjectTasks = tasks.filter(t => t.project_id === form.projectId);

  return (
    <div className="pmRoot" style={{ padding: '24px 28px', maxWidth: 2200, margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin .8s linear infinite}`}</style>

      {/* Header — standard module hero anatomy */}
      <PremiumFX />
      <ModuleHero
        eyebrow="Execution"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('schedule').vivid ?? moduleAccent('schedule').hex}><CalendarBlank size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('schedule').hex}
        title="Construction"
        accent="Schedule"
        subtitle="Manage tasks, track progress, and map dependencies across the build."
        actions={
          <button data-tour="new-task" onClick={() => setShowCreate(true)} className="pmBtn" style={goldButtonStyle}>
            <Plus size={16} weight="bold" /> New Task
          </button>
        }
      />

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: 'Total Tasks', v: stats.total, c: colors.text },
          { l: 'In Progress', v: stats.inProgress, c: colors.blue },
          { l: 'Complete', v: stats.complete, c: colors.green },
          { l: 'Overdue', v: stats.overdue, c: stats.overdue > 0 ? colors.red : colors.textMuted },
        ].map(k => (
          <div key={k.l} style={{ background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '12px 16px' }}>
            <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textMuted, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.black, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar: project filter + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StandardSelect value={projectFilter} onChange={setProjectFilter} ariaLabel="Project" placeholder="All Projects" style={{ minWidth: 220 }}
          options={projects.map(p => ({ value: p.id, label: p.name }))} />
        <div style={{ display: 'inline-flex', background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 3, gap: 3 }}>
          {([['list', 'List', ListBullets], ['timeline', 'Timeline', ChartBar]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setView(key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: radius.md, cursor: 'pointer',
              fontSize: font.size.sm, fontWeight: font.weight.bold,
              background: view === key ? colors.gold : 'transparent',
              color: view === key ? colors.dark : colors.textMuted,
            }}>
              <Icon size={15} weight={view === key ? 'bold' : 'regular'} /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      {view === 'list' ? (
        <DataTable
          data={filtered}
          columns={columns}
          loading={loading}
          tableId="schedule"
          defaultSort={{ key: 'start_date', dir: 'asc' }}
          searchPlaceholder="Search tasks…"
          emptyMessage="No tasks scheduled yet. Create your first task to start planning."
          onRowClick={(row) => router.push(`/app/schedule/${row.id}`)}
        />
      ) : (
        <GanttChart
          rows={filtered}
          taskById={taskById}
          loading={loading}
          onSelect={(t) => router.push(`/app/schedule/${t.id}`)}
        />
      )}

      {/* ── Create Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: colors.surface, zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>New Schedule Task</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {form.projectId && (
                <StatStrip items={[
                  {href: '/app/schedule',  label: 'Tasks', value: String(formProjectTasks.length), sub: `${formProjectTasks.filter(t => t.status === 'complete').length} complete on this project` },
                  {href: '/app/schedule', label: 'Critical Path', value: String(ctx?.schedule?.criticalCount ?? 0), accent: (ctx?.schedule?.criticalCount ?? 0) > 0 ? colors.gold : undefined, sub: 'Tasks drive the end date' },
                  {href: '/app/schedule', label: 'Next Milestone', value: ctx?.schedule?.nextTasks?.[0]?.name || '—', sub: ctx?.schedule?.nextTasks?.[0]?.startDate ? `Starts ${fmtDate(String(ctx.schedule.nextTasks[0].startDate).slice(0, 10))}` : 'Nothing queued yet' },
                ]} />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Task Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} placeholder="Foundation pour, framing, etc." />
                </div>
                <div>
                  <label style={labelStyle}>Project *</label>
                  <StandardSelect value={form.projectId} onChange={(v) => setForm({ ...form, projectId: v, predecessorId: '' })} required ariaLabel="Project" placeholder="Select project…" width="100%"
                    options={projects.map(p => ({ value: p.id, label: p.name }))} />
                </div>
                <div>
                  <label style={labelStyle}>Phase</label>
                  <input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} style={inputStyle} placeholder="Phase 1, Rough-in, etc." />
                </div>
                <div>
                  <label style={labelStyle}>Trade</label>
                  <StandardSelect value={form.trade} onChange={(v) => setForm({ ...form, trade: v })} ariaLabel="Trade" placeholder="Select trade…" width="100%"
                    options={TRADE_OPTIONS} />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <StandardSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })} ariaLabel="Status" width="100%"
                    options={STATUS_SELECT_OPTIONS} />
                </div>
                <div>
                  <label style={labelStyle}>Start Date{auto.start && <AutoChip />}</label>
                  <SaguaroDatePicker value={form.startDate} onChange={(v) => setStartDate(v)} style={inputStyle} />
                  {auto.start && <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>Day after the predecessor ends — edit freely.</div>}
                </div>
                <div>
                  <label style={labelStyle}>Duration (days)</label>
                  <input type="number" min="1" value={duration} onChange={(e) => setDurationDays(e.target.value)} style={inputStyle} placeholder="e.g. 10" />
                  <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>Computes the end date from the start.</div>
                </div>
                <div>
                  <label style={labelStyle}>End Date{auto.end && <AutoChip />}</label>
                  <SaguaroDatePicker value={form.endDate} onChange={(v) => setEndDate(v)} style={inputStyle} />
                  {auto.end && form.startDate && <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>Start + {Number(duration) || 0}d — editing it re-syncs duration.</div>}
                </div>
                <div>
                  <label style={labelStyle}>% Complete</label>
                  <input type="number" min="0" max="100" value={form.pctComplete} onChange={(e) => setForm({ ...form, pctComplete: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Predecessor</label>
                  <StandardSelect value={form.predecessorId} onChange={setPredecessor} disabled={!form.projectId} ariaLabel="Predecessor" placeholder="None" width="100%"
                    options={formProjectTasks.map(t => ({ value: t.id, label: `${t.name}${t.end_date ? ` (ends ${fmtDate(t.end_date)})` : ''}` }))} />
                  {form.predecessorId && (() => {
                    const p = taskById.get(form.predecessorId);
                    return p ? (
                      <div style={{ fontSize: font.size.xs, color: colors.textDim, marginTop: 4 }}>
                        Follows <span style={{ color: colors.text, fontWeight: font.weight.semibold }}>{p.name}</span>{p.end_date ? ` — ends ${fmtDate(p.end_date)}; this task starts the day after.` : ' — no end date on the predecessor yet.'}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.lg, color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creating} style={{ padding: '10px 24px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </div>
  );
}

// ── Inline editors ────────────────────────────────────────────────────────────
function iconBtn(color: string, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: radius.md, border: `1px solid ${colors.border}`,
    background: 'transparent', color, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}

function PctEditor({ task, onSave, saving }: { task: ScheduleTask; onSave: (n: number) => void; saving: boolean }) {
  const [val, setVal] = useState(String(task.pct_complete ?? 0));
  useEffect(() => { setVal(String(task.pct_complete ?? 0)); }, [task.pct_complete]);
  const n = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
  const commit = () => {
    if (n !== (task.pct_complete ?? 0)) onSave(n);
    setVal(String(n));
  };
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${n}%`, background: n >= 100 ? colors.green : n > 50 ? colors.blue : colors.gold, borderRadius: 3, transition: 'width .3s ease' }} />
      </div>
      <input
        type="number" min={0} max={100} value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        disabled={saving}
        style={{ width: 48, padding: '4px 6px', textAlign: 'right', background: colors.raisedAlt, border: `1px solid ${colors.border}`, borderRadius: radius.sm, color: colors.text, fontSize: font.size.xs, outline: 'none' }}
      />
    </div>
  );
}

function StatusEditor({ task, onSave, saving }: { task: ScheduleTask; onSave: (s: string) => void; saving: boolean }) {
  const cfg = statusCfg(task.status);
  return (
    <StandardSelect
      onClick={(e) => e.stopPropagation()}
      value={STATUS_OPTIONS.includes(task.status as any) ? task.status : 'not_started'}
      onChange={onSave}
      disabled={saving}
      size="sm"
      accent={cfg.color}
      ariaLabel="Status"
      options={STATUS_SELECT_OPTIONS}
      style={{
        padding: '5px 10px', borderRadius: 999, fontSize: font.size.xs, fontWeight: font.weight.bold,
        background: `color-mix(in srgb, ${cfg.color} 13%, transparent)`, color: cfg.color, border: `1px solid color-mix(in srgb, ${cfg.color} 33%, transparent)`,
      }}
    />
  );
}

function PredecessorEditor({ task, options, onSave, saving }: { task: ScheduleTask; options: ScheduleTask[]; onSave: (id: string) => void; saving: boolean }) {
  return (
    <StandardSelect
      onClick={(e) => e.stopPropagation()}
      value={task.predecessor_id ?? ''}
      onChange={onSave}
      disabled={saving || options.length === 0}
      size="sm"
      ariaLabel="Predecessor"
      placeholder="None"
      options={options.map(o => ({ value: o.id, label: o.name }))}
      style={{ maxWidth: 160, fontSize: font.size.xs }}
    />
  );
}

// ── Gantt / Timeline ──────────────────────────────────────────────────────────
function GanttChart({ rows, taskById, loading, onSelect }: {
  rows: ScheduleTask[];
  taskById: Map<string, ScheduleTask>;
  loading: boolean;
  onSelect: (t: ScheduleTask) => void;
}) {
  const LABEL_W = 230, ROW_H = 38, HEADER_H = 48, BAR_H = 22, PX_DAY = 26;

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
    return <div style={{ padding: 48, textAlign: 'center', color: colors.textMuted }}>Loading timeline…</div>;
  }
  if (!geom) {
    return (
      <div style={{ padding: 56, textAlign: 'center', color: colors.textMuted, background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.xl }}>
        <CalendarBlank size={40} color={colors.textDim} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginBottom: 4 }}>Nothing to plot yet</div>
        <div style={{ fontSize: font.size.md }}>Add start and end dates to tasks to see them on the timeline.</div>
      </div>
    );
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

  return (
    <div style={{ background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.xl, overflow: 'hidden' }}>
      <div style={{ display: 'flex' }}>
        {/* Fixed label column */}
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${colors.border}` }}>
          <div style={{ height: HEADER_H, display: 'flex', alignItems: 'flex-end', padding: '0 14px 8px', fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>Task</div>
          {rows.map((t) => {
            const unscheduled = !t.start_date || !t.end_date;
            return (
              <div key={t.id} onClick={() => onSelect(t)} title={t.name}
                style={{ height: ROW_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 14px', borderBottom: `1px solid ${colors.borderDim}`, cursor: 'pointer', overflow: 'hidden' }}>
                <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                <div style={{ fontSize: 10, color: colors.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {unscheduled ? 'Unscheduled' : (t.trade || t.phase || '—')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <svg width={width} height={svgH} style={{ display: 'block' }}>
            <defs>
              <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L6,3 L0,6 Z" fill={colors.orange} />
              </marker>
            </defs>

            {/* Month band + week gridlines */}
            <rect x={0} y={0} width={width} height={HEADER_H} fill="rgba(255,255,255,0.02)" />
            {monthLabels.map((m, i) => (
              <text key={`mo${i}`} x={m.x + 4} y={16} fontSize={11} fontWeight={700} fill={colors.textMuted}>{m.label}</text>
            ))}
            {weekLines.map((w, i) => (
              <g key={`wk${i}`}>
                <line x1={w.x} y1={HEADER_H} x2={w.x} y2={svgH} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <text x={w.x + 3} y={HEADER_H - 6} fontSize={9} fill={colors.textDim}>{w.label}</text>
              </g>
            ))}

            {/* Row separators */}
            {rows.map((_, i) => (
              <line key={`rs${i}`} x1={0} y1={HEADER_H + (i + 1) * ROW_H} x2={width} y2={HEADER_H + (i + 1) * ROW_H} stroke={colors.borderDim} strokeWidth={1} />
            ))}

            {/* Today marker */}
            {todayX != null && (
              <g>
                <line x1={todayX} y1={HEADER_H} x2={todayX} y2={svgH} stroke={colors.gold} strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={todayX + 4} y={HEADER_H + 11} fontSize={9} fontWeight={700} fill={colors.gold}>Today</text>
              </g>
            )}

            {/* Dependency links */}
            {links.map((l, i) => (
              <path key={`ln${i}`} d={l.d} fill="none" stroke={colors.orange} strokeWidth={1.5} markerEnd="url(#gantt-arrow)" opacity={0.85} />
            ))}

            {/* Bars */}
            {rows.map((t, i) => {
              if (!t.start_date || !t.end_date) return null;
              const x = xOf(ymdToUTC(t.start_date));
              const endX = xOf(ymdToUTC(t.end_date)) + PX_DAY;
              const w = Math.max(endX - x, 6);
              const y = HEADER_H + i * ROW_H + (ROW_H - BAR_H) / 2;
              const c = barColor(t);
              const pct = Math.max(0, Math.min(100, t.pct_complete ?? 0));
              return (
                <g key={`bar${t.id}`} onClick={() => onSelect(t)} style={{ cursor: 'pointer' }}>
                  <title>{`${t.name}\n${fmtDate(t.start_date)} → ${fmtDate(t.end_date)}\n${pct}% · ${statusCfg(t.status).label}`}</title>
                  <rect x={x} y={y} width={w} height={BAR_H} rx={5} fill={`color-mix(in srgb, ${c} 20%, transparent)`} stroke={c} strokeWidth={1} />
                  <rect x={x} y={y} width={(w * pct) / 100} height={BAR_H} rx={5} fill={c} opacity={0.9} />
                  {w > 46 && (
                    <text x={x + 7} y={y + BAR_H / 2 + 3.5} fontSize={10} fontWeight={700} fill={colors.text} style={{ pointerEvents: 'none' }}>{pct}%</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '10px 16px', borderTop: `1px solid ${colors.border}`, fontSize: font.size.xs, color: colors.textMuted }}>
        {STATUS_OPTIONS.map(s => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_MAP[s].color, display: 'inline-block' }} /> {STATUS_MAP[s].label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <GitBranch size={13} color={colors.orange} /> Dependency
        </span>
      </div>
    </div>
  );
}
