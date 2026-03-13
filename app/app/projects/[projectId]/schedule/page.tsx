'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T, ProgressBar } from '@/components/ui/shell';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

interface Task {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  pct_complete: number;
  status: string;
  predecessor: string;
  project_id: string;
}

const STATUS_BADGE: Record<string, 'muted' | 'amber' | 'green' | 'red'> = {
  'Not Started': 'muted',
  'In Progress': 'amber',
  'Complete': 'green',
  'Delayed': 'red',
};

const EMPTY_FORM = { name: '', start_date: '', end_date: '', pct_complete: 0, status: 'Not Started' };

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

export default function SchedulePage() {
  const { projectId } = useParams() as { projectId: string };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editingPct, setEditingPct] = useState<string | null>(null);
  const [pctVal, setPctVal] = useState(0);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule`);
      const json = await res.json();
      setTasks(json.tasks || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const today = new Date().toISOString().split('T')[0];
  const allEnd = tasks.reduce((m, t) => t.end_date > m ? t.end_date : m, tasks[0]?.end_date || '');
  const daysRemaining = allEnd ? Math.max(0, daysBetween(today, allEnd)) : 0;
  const pctScheduleComplete = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.pct_complete, 0) / tasks.length) : 0;
  const delayedCount = tasks.filter(t => t.status === 'Delayed').length;
  const completedCount = tasks.filter(t => t.status === 'Complete').length;

  async function handleSave() {
    if (!form.name || !form.start_date || !form.end_date) { setErrorMsg('Name, start and end dates are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/schedule/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form }),
      });
      const json = await res.json();
      const newTask: Task = json.task || { id: `t-${Date.now()}`, project_id: projectId, predecessor: '', ...form };
      setTasks(prev => [...prev, newTask]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Task added.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newTask: Task = { id: `t-${Date.now()}`, project_id: projectId, predecessor: '', ...form };
      setTasks(prev => [...prev, newTask]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Task added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function savePct(id: string, pct: number) {
    const newStatus = pct === 100 ? 'Complete' : pct > 0 ? 'In Progress' : 'Not Started';
    try {
      await fetch(`/api/schedule/${id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct_complete: pct, status: newStatus }),
      });
    } catch { /* demo */ }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, pct_complete: pct, status: newStatus } : t));
    setEditingPct(null);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Schedule"
          sub="Project schedule and milestones"
          action={
            <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
              {showForm ? 'Cancel' : '+ Add Task'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📊" label="% Complete" value={`${pctScheduleComplete}%`} />
        <StatCard icon="📅" label="Days Remaining" value={String(daysRemaining)} />
        <StatCard icon="✅" label="Tasks Complete" value={`${completedCount}/${tasks.length}`} />
        <StatCard icon="⚠️" label="Delayed" value={String(delayedCount)} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Task</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>Task Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inp}>
                    {['Not Started', 'In Progress', 'Complete', 'Delayed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Start Date *</label>
                  <SaguaroDatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>End Date *</label>
                  <SaguaroDatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>% Complete</label>
                  <input type="number" min={0} max={100} value={form.pct_complete} onChange={e => setForm(p => ({ ...p, pct_complete: Number(e.target.value) }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Task'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Task Name', 'Start Date', 'End Date', 'Duration', 'Status', '% Complete', 'Dependencies']}
                rows={tasks.map(task => {
                  const dur = daysBetween(task.start_date, task.end_date);
                  const statusColor = task.status === 'Complete' ? T.green : task.status === 'Delayed' ? T.red : T.gold;
                  return [
                    <span key="n" style={{ fontWeight: 600 }}>{task.name}</span>,
                    <span key="s" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{task.start_date}</span>,
                    <span key="e" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{task.end_date}</span>,
                    <span key="d" style={{ color: T.muted }}>{dur}d</span>,
                    <Badge key="st" label={task.status} color={STATUS_BADGE[task.status] || 'muted'} />,
                    <div key="pct" style={{ minWidth: 100 }}>
                      {editingPct === task.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input type="number" min={0} max={100} value={pctVal} onChange={e => setPctVal(Number(e.target.value))}
                            style={{ width: 60, padding: '2px 6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, color: T.white, fontSize: 12 }}
                          />
                          <Btn size="sm" onClick={() => savePct(task.id, pctVal)}>OK</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setEditingPct(null)}>X</Btn>
                        </div>
                      ) : (
                        <div
                          onClick={() => { setEditingPct(task.id); setPctVal(task.pct_complete); }}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <div style={{ width: 60 }}>
                            <ProgressBar pct={task.pct_complete} color={statusColor} />
                          </div>
                          <span style={{ color: statusColor, fontSize: 12, fontWeight: 700 }}>{task.pct_complete}%</span>
                        </div>
                      )}
                    </div>,
                    <span key="dep" style={{ color: T.muted, fontSize: 12 }}>{task.predecessor || '—'}</span>,
                  ];
                })}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
