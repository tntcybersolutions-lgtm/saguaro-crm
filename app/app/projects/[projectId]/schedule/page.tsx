'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface DelayPrediction {
  predicted_delay_days: number;
  confidence: number;
  risk_factors: string[];
  critical_path_activities: string[];
  recommendations: string[];
  summary: string;
}

function DelayPredictionPanel({ result, onClose }: { result: DelayPrediction; onClose: () => void }) {
  const delayColor = result.predicted_delay_days === 0 ? GREEN : result.predicted_delay_days <= 7 ? '#d97706' : RED;
  const confColor = result.confidence >= 70 ? GREEN : result.confidence >= 40 ? '#d97706' : RED;
  return (
    <div style={{ margin: '0 24px 20px', background: 'rgba(15,22,35,0.97)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 12, padding: 20, animation: 'slideDown .25s ease' }}>
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>AI Schedule Prediction</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Key metrics row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 20px', flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 4 }}>Predicted Delay</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: delayColor }}>
            {result.predicted_delay_days === 0 ? 'On Track' : `+${result.predicted_delay_days}d`}
          </div>
        </div>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 20px', flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 4 }}>Confidence</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: confColor }}>{result.confidence}%</div>
          <div style={{ marginTop: 6, height: 6, width: 100, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${result.confidence}%`, height: '100%', background: confColor, borderRadius: 3, transition: 'width .6s ease' }} />
          </div>
        </div>
        {/* Summary */}
        <div style={{ flex: 1, background: 'rgba(212,160,23,.06)', border: '1px solid rgba(212,160,23,.12)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: TEXT, lineHeight: 1.6, minWidth: 200 }}>
          {result.summary}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {/* Risk Factors */}
        {result.risk_factors.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 8 }}>Risk Factors</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
              {result.risk_factors.map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, color: '#f87171' }}>
                  <span style={{ marginTop: 1, flexShrink: 0 }}>⚠</span><span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Critical Path */}
        {result.critical_path_activities.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 8 }}>Critical Path Activities</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
              {result.critical_path_activities.map((a, i) => (
                <li key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, color: GOLD }}>
                  <span style={{ marginTop: 1, flexShrink: 0 }}>→</span><span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Recommendations */}
        {result.recommendations.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 8 }}>Recommendations</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
              {result.recommendations.map((r, i) => (
                <li key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, color: '#86efac' }}>
                  <span style={{ marginTop: 1, flexShrink: 0 }}>✓</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

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

const STATUS_COLORS: Record<string, string> = {
  Complete: GREEN,
  'In Progress': GOLD,
  Delayed: RED,
  'Not Started': DIM,
};

const EMPTY_FORM = { name: '', start_date: '', end_date: '', pct_complete: 0, status: 'Not Started', predecessor: '' };

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

export default function SchedulePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editingPct, setEditingPct] = useState<string | null>(null);
  const [pctVal, setPctVal] = useState(0);

  // AI Delay Prediction state
  const [delayPrediction, setDelayPrediction] = useState<DelayPrediction | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState('');

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

  const allStart = tasks.reduce((m, t) => t.start_date < m ? t.start_date : m, tasks[0]?.start_date || '');
  const allEnd = tasks.reduce((m, t) => t.end_date > m ? t.end_date : m, tasks[0]?.end_date || '');
  const totalDays = allStart && allEnd ? daysBetween(allStart, allEnd) : 0;
  const today = new Date().toISOString().split('T')[0];
  const daysRemaining = allEnd ? Math.max(0, daysBetween(today, allEnd)) : 0;
  const pctScheduleComplete = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.pct_complete, 0) / tasks.length) : 0;

  async function predictDelays() {
    setPredictLoading(true);
    setPredictError('');
    setDelayPrediction(null);
    try {
      const res = await fetch('/api/ai/schedule-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, activities: tasks }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDelayPrediction(json);
    } catch (e: unknown) {
      setPredictError((e as Error).message || 'AI prediction failed');
    } finally {
      setPredictLoading(false);
    }
  }

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
      const newTask: Task = json.task || { id: `t-${Date.now()}`, project_id: projectId, ...form };
      setTasks(prev => [...prev, newTask]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Task added.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newTask: Task = { id: `t-${Date.now()}`, project_id: projectId, ...form };
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
    try {
      await fetch(`/api/schedule/${id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct_complete: pct, status: pct === 100 ? 'Complete' : pct > 0 ? 'In Progress' : 'Not Started' }),
      });
    } catch { /* demo */ }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, pct_complete: pct, status: pct === 100 ? 'Complete' : pct > 0 ? 'In Progress' : 'Not Started' } : t));
    setEditingPct(null);
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/reports/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'schedule', projectId }) });
      const json = await res.json();
      if (json.url) window.open(json.url, '_blank');
      else { setSuccessMsg('PDF export queued.'); setTimeout(() => setSuccessMsg(''), 4000); }
    } catch {
      setSuccessMsg('Export requested (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Schedule</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Project schedule and milestones</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <button onClick={handleExport} style={{ padding: '8px 14px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Export PDF</button>
          <button
            onClick={() => {
              if (delayPrediction) { setDelayPrediction(null); setPredictError(''); }
              else predictDelays();
            }}
            disabled={predictLoading || tasks.length === 0}
            style={{ padding: '8px 16px', background: delayPrediction ? 'rgba(212,160,23,.15)' : 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.35)', borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: tasks.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {predictLoading ? '🤖 Predicting…' : delayPrediction ? '🤖 Hide Prediction' : '🤖 Predict Delays'}
          </button>
          <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Task</button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 16 }}>
        {[
          { label: 'Project Duration', value: `${totalDays} days` },
          { label: '% Schedule Complete', value: `${pctScheduleComplete}%` },
          { label: 'Days Remaining', value: `${daysRemaining}` },
          { label: 'Completion Date', value: allEnd },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: '1px solid ' + BORDER }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {predictError && (
        <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>
          {predictError}
        </div>
      )}
      {delayPrediction && (
        <div style={{ marginTop: 16 }}>
          <DelayPredictionPanel result={delayPrediction} onClose={() => { setDelayPrediction(null); setPredictError(''); }} />
        </div>
      )}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Task</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Task Name *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inp}>
                {['Not Started','In Progress','Complete','Delayed'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={label}>Start Date *</label><SaguaroDatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} style={inp} /></div>
            <div><label style={label}>End Date *</label><SaguaroDatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} style={inp} /></div>
            <div><label style={label}>% Complete</label><input type="number" min={0} max={100} value={form.pct_complete} onChange={e => setForm(p => ({ ...p, pct_complete: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Predecessor</label><input type="text" value={form.predecessor} onChange={e => setForm(p => ({ ...p, predecessor: e.target.value }))} placeholder="Previous task name" style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Task'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Task Name','Start','End','Duration','% Complete','Status','Predecessor','Timeline'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const dur = daysBetween(task.start_date, task.end_date);
                const color = STATUS_COLORS[task.status] || DIM;
                const barWidth = totalDays > 0 ? Math.max(2, Math.round((dur / totalDays) * 100)) : 10;
                const offsetPct = totalDays > 0 && allStart ? Math.round((daysBetween(allStart, task.start_date) / totalDays) * 100) : 0;
                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{task.name}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{task.start_date}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{task.end_date}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{dur}d</td>
                    <td style={{ padding: '10px 14px', minWidth: 80 }}>
                      {editingPct === task.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input type="number" min={0} max={100} value={pctVal} onChange={e => setPctVal(Number(e.target.value))} style={{ width: 60, padding: '2px 6px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 4, color: TEXT, fontSize: 12 }} />
                          <button onClick={() => savePct(task.id, pctVal)} style={{ padding: '2px 8px', background: 'rgba(212,160,23,.2)', border: '1px solid rgba(212,160,23,.4)', borderRadius: 4, color: GOLD, fontSize: 11, cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditingPct(null)} style={{ padding: '2px 6px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 4, color: DIM, fontSize: 11, cursor: 'pointer' }}>X</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingPct(task.id); setPctVal(task.pct_complete); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: BORDER, borderRadius: 3 }}>
                            <div style={{ width: `${task.pct_complete}%`, height: '100%', background: color, borderRadius: 3 }} />
                          </div>
                          <span style={{ color, fontSize: 12, fontWeight: 700 }}>{task.pct_complete}%</span>
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: color + '33', color, fontSize: 11, fontWeight: 700 }}>{task.status}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM, fontSize: 12 }}>{task.predecessor || '—'}</td>
                    <td style={{ padding: '10px 14px', minWidth: 140 }}>
                      <div style={{ position: 'relative', height: 8, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: `${offsetPct}%`, width: `${barWidth}%`, height: '100%', background: color, borderRadius: 4, minWidth: 4 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
