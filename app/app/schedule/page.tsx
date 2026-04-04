'use client';
/**
 * Schedule Page — Fully wired to /api/schedule/list and /api/schedule/create.
 * Uses DataTable with sorting, filtering, pagination.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, CalendarBlank, Warning, CheckCircle, Clock, Minus } from '@phosphor-icons/react';
import DataTable from '../../../components/DataTable';
import { colors, font, radius } from '../../../lib/design-tokens';

interface ScheduleTask {
  id: string;
  project_id: string;
  name: string;
  phase: string;
  start_date: string | null;
  end_date: string | null;
  pct_complete: number;
  status: string;
  predecessor: string;
  assigned_to: string;
  notes: string;
  created_at: string;
}

interface Project { id: string; name: string; }

const columnHelper = createColumnHelper<ScheduleTask>();

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: colors.textDim },
  in_progress: { label: 'In Progress', color: colors.blue },
  complete: { label: 'Complete', color: colors.green },
  delayed: { label: 'Delayed', color: colors.red },
  on_hold: { label: 'On Hold', color: colors.orange },
};

export default function SchedulePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    projectId: '',
    phase: '',
    startDate: '',
    endDate: '',
    pctComplete: '0',
    status: 'not_started',
    predecessor: '',
    assignedTo: '',
    notes: '',
  });

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule/list');
      if (!res.ok) throw new Error('Failed to load schedule');
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : data.tasks ?? data.schedule_tasks ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch('/api/projects?limit=100&fields=id,name')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProjects(Array.isArray(d) ? d : d.projects ?? []); })
      .catch(() => {});
  }, [fetchTasks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.projectId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/schedule/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          projectId: form.projectId,
          phase: form.phase,
          start_date: form.startDate || null,
          end_date: form.endDate || null,
          pct_complete: parseInt(form.pctComplete) || 0,
          status: form.status,
          predecessor: form.predecessor,
          assigned_to: form.assignedTo,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error('Failed to create task');
      setShowCreate(false);
      setForm({ name: '', projectId: '', phase: '', startDate: '', endDate: '', pctComplete: '0', status: 'not_started', predecessor: '', assignedTo: '', notes: '' });
      await fetchTasks();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Task',
      cell: (info) => <span style={{ fontWeight: font.weight.semibold }}>{info.getValue()}</span>,
    }),
    columnHelper.accessor('phase', {
      header: 'Phase',
      cell: (info) => <span style={{ color: colors.textMuted }}>{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('assigned_to', {
      header: 'Assigned To',
      cell: (info) => info.getValue() || '—',
    }),
    columnHelper.accessor('start_date', {
      header: 'Start',
      cell: (info) => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '—',
    }),
    columnHelper.accessor('end_date', {
      header: 'End',
      cell: (info) => {
        const v = info.getValue();
        if (!v) return '—';
        const d = new Date(v);
        const overdue = d < new Date() && info.row.original.status !== 'complete';
        return <span style={{ color: overdue ? colors.red : colors.text }}>{d.toLocaleDateString()}</span>;
      },
    }),
    columnHelper.accessor('pct_complete', {
      header: 'Progress',
      cell: (info) => {
        const pct = info.getValue() ?? 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? colors.green : pct > 50 ? colors.blue : colors.gold, borderRadius: 3, transition: 'width .3s ease' }} />
            </div>
            <span style={{ fontSize: font.size.xs, color: colors.textMuted, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const s = info.getValue() ?? 'not_started';
        const cfg = STATUS_MAP[s] ?? STATUS_MAP.not_started;
        return (
          <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: font.size.xs, fontWeight: font.weight.bold,
            textTransform: 'uppercase', letterSpacing: 0.5,
            background: `${cfg.color}20`, color: cfg.color,
          }}>
            {cfg.label}
          </span>
        );
      },
    }),
  ], []);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.md, color: colors.text, fontSize: font.size.md, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: font.size['3xl'], fontWeight: font.weight.black, color: colors.text }}>Schedule</h1>
          <p style={{ margin: '4px 0 0', fontSize: font.size.md, color: colors.textMuted }}>Manage project tasks, track progress, and monitor deadlines.</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: 'pointer' }}>
          <Plus size={16} weight="bold" /> New Task
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      <DataTable
        data={tasks}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search tasks..."
        emptyMessage="No tasks scheduled yet. Create your first task to start planning."
        onRowClick={(row) => router.push(`/app/schedule/${row.id}`)}
      />

      {/* ── Create Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,.1)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: colors.surface, zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>New Schedule Task</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Task Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} placeholder="Foundation pour, framing, etc." />
                </div>
                <div>
                  <label style={labelStyle}>Project *</label>
                  <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required style={inputStyle}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Phase</label>
                  <input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} style={inputStyle} placeholder="Phase 1, Rough-in, etc." />
                </div>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Assigned To</label>
                  <input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} style={inputStyle} placeholder="Team member or sub" />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                    <option value="delayed">Delayed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Predecessor</label>
                  <input value={form.predecessor} onChange={(e) => setForm({ ...form, predecessor: e.target.value })} style={inputStyle} placeholder="Task that must finish first" />
                </div>
                <div>
                  <label style={labelStyle}>% Complete</label>
                  <input type="number" min="0" max="100" value={form.pctComplete} onChange={(e) => setForm({ ...form, pctComplete: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Additional notes..." />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.lg, color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creating} style={{ padding: '10px 24px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
