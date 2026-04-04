'use client';
/**
 * Daily Logs Page — Fully wired to /api/daily-logs/list and /api/daily-logs/create.
 * Uses DataTable with sorting, filtering, pagination.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Sun, CloudRain, Thermometer, UsersThree, Warning, ClipboardText } from '@phosphor-icons/react';
import DataTable from '../../../components/DataTable';
import { colors, font, radius } from '../../../lib/design-tokens';

interface DailyLog {
  id: string;
  project_id: string;
  log_date: string;
  weather: string | null;
  temperature_high: number | null;
  temperature_low: number | null;
  crew_count: number;
  work_performed: string;
  delays: string;
  safety_notes: string;
  materials_delivered: string;
  visitors: string;
  notes: string;
  created_at: string;
}

interface Project { id: string; name: string; }

const columnHelper = createColumnHelper<DailyLog>();

export default function DailyLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    projectId: '',
    logDate: new Date().toISOString().slice(0, 10),
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
  });

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/daily-logs/list');
      if (!res.ok) throw new Error('Failed to load daily logs');
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : data.logs ?? data.daily_logs ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetch('/api/projects?limit=100&fields=id,name')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProjects(Array.isArray(d) ? d : d.projects ?? []); })
      .catch(() => {});
  }, [fetchLogs]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/daily-logs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) throw new Error('Failed to create daily log');
      setShowCreate(false);
      setForm({ projectId: '', logDate: new Date().toISOString().slice(0, 10), weather: '', temperatureHigh: '', temperatureLow: '', crewCount: '', workPerformed: '', delays: '', safetyNotes: '', materialsDelivered: '', visitors: '', notes: '' });
      await fetchLogs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  const columns = useMemo(() => [
    columnHelper.accessor('log_date', {
      header: 'Date',
      cell: (info) => {
        const v = info.getValue();
        return v ? <span style={{ fontWeight: font.weight.semibold }}>{new Date(v).toLocaleDateString()}</span> : '—';
      },
    }),
    columnHelper.accessor('weather', {
      header: 'Weather',
      cell: (info) => info.getValue() || '—',
    }),
    columnHelper.accessor((row) => `${row.temperature_high ?? '—'}° / ${row.temperature_low ?? '—'}°`, {
      id: 'temp',
      header: 'Temp',
      cell: (info) => <span style={{ color: colors.textMuted }}>{info.getValue()}</span>,
    }),
    columnHelper.accessor('crew_count', {
      header: 'Crew',
      cell: (info) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <UsersThree size={14} style={{ color: colors.textDim }} />
          {info.getValue() || 0}
        </span>
      ),
    }),
    columnHelper.accessor('work_performed', {
      header: 'Work Performed',
      cell: (info) => {
        const v = info.getValue();
        return <span style={{ color: colors.textMuted, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>{v || '—'}</span>;
      },
    }),
    columnHelper.accessor('delays', {
      header: 'Delays',
      cell: (info) => {
        const v = info.getValue();
        return v ? <span style={{ color: colors.orange }}>{v}</span> : <span style={{ color: colors.textDim }}>None</span>;
      },
    }),
    columnHelper.accessor('safety_notes', {
      header: 'Safety',
      cell: (info) => {
        const v = info.getValue();
        return v ? <span style={{ color: colors.red }}>{v.slice(0, 40)}{v.length > 40 ? '...' : ''}</span> : <span style={{ color: colors.green }}>OK</span>;
      },
    }),
  ], []);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.md, color: colors.text, fontSize: font.size.md, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: font.size['3xl'], fontWeight: font.weight.black, color: colors.text }}>Daily Logs</h1>
          <p style={{ margin: '4px 0 0', fontSize: font.size.md, color: colors.textMuted }}>Track daily field activity, weather, crew, and work progress.</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: 'pointer' }}>
          <Plus size={16} weight="bold" /> New Log
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      <DataTable
        data={logs}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search daily logs..."
        emptyMessage="No daily logs yet. Create your first log to start tracking."
        onRowClick={(row) => router.push(`/app/daily-logs/${row.id}`)}
      />

      {/* ── Create Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,.1)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: colors.surface, zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>New Daily Log</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Project *</label>
                  <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required style={inputStyle}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={form.logDate} onChange={(e) => setForm({ ...form, logDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Weather</label>
                  <select value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} style={inputStyle}>
                    <option value="">Select...</option>
                    <option value="Clear">Clear</option>
                    <option value="Partly Cloudy">Partly Cloudy</option>
                    <option value="Cloudy">Cloudy</option>
                    <option value="Rain">Rain</option>
                    <option value="Storm">Storm</option>
                    <option value="Snow">Snow</option>
                    <option value="Wind">Wind</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Crew Count</label>
                  <input type="number" value={form.crewCount} onChange={(e) => setForm({ ...form, crewCount: e.target.value })} style={inputStyle} placeholder="0" />
                </div>
                <div>
                  <label style={labelStyle}>Temp High (°F)</label>
                  <input type="number" value={form.temperatureHigh} onChange={(e) => setForm({ ...form, temperatureHigh: e.target.value })} style={inputStyle} placeholder="95" />
                </div>
                <div>
                  <label style={labelStyle}>Temp Low (°F)</label>
                  <input type="number" value={form.temperatureLow} onChange={(e) => setForm({ ...form, temperatureLow: e.target.value })} style={inputStyle} placeholder="72" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Work Performed *</label>
                <textarea value={form.workPerformed} onChange={(e) => setForm({ ...form, workPerformed: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe work completed today..." />
              </div>
              <div>
                <label style={labelStyle}>Delays</label>
                <textarea value={form.delays} onChange={(e) => setForm({ ...form, delays: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any delays or issues..." />
              </div>
              <div>
                <label style={labelStyle}>Safety Notes</label>
                <textarea value={form.safetyNotes} onChange={(e) => setForm({ ...form, safetyNotes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Safety observations, incidents, near misses..." />
              </div>
              <div>
                <label style={labelStyle}>Materials Delivered</label>
                <input value={form.materialsDelivered} onChange={(e) => setForm({ ...form, materialsDelivered: e.target.value })} style={inputStyle} placeholder="Concrete, rebar, lumber..." />
              </div>
              <div>
                <label style={labelStyle}>Visitors</label>
                <input value={form.visitors} onChange={(e) => setForm({ ...form, visitors: e.target.value })} style={inputStyle} placeholder="Inspector, owner, architect..." />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.lg, color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creating} style={{ padding: '10px 24px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : 'Create Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
