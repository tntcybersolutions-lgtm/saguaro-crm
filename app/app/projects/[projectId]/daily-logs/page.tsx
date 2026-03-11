'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface DailyLog {
  id: string;
  date: string;
  superintendent: string;
  weather: string;
  temp_f: number;
  crew_count: number;
  work_performed: string;
  equipment: string;
  materials: string;
  visitors: string;
  incidents: string;
  project_id: string;
}

const today = new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  date: today,
  superintendent: '',
  weather: 'Clear',
  temp_f: 72,
  crew_count: 0,
  work_performed: '',
  equipment: '',
  materials: '',
  visitors: '',
  incidents: '',
};

export default function DailyLogsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/daily-logs`);
      const json = await res.json();
      setLogs(json.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    const d = new Date(log.date);
    const now = new Date();
    if (filter === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7);
      return d >= start;
    }
    if (filter === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  async function handleSave() {
    if (!form.superintendent || !form.work_performed) {
      setErrorMsg('Superintendent and Work Performed are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/daily-logs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form }),
      });
      const json = await res.json();
      const newLog: DailyLog = json.log || { id: `dl-${Date.now()}`, project_id: projectId, ...form };
      setLogs(prev => [newLog, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Daily log saved successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      // demo mode: add locally
      const newLog: DailyLog = { id: `dl-${Date.now()}`, project_id: projectId, ...form };
      setLogs(prev => [newLog, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Daily log saved (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Daily Logs</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Daily construction field reports</div>
        </div>
        <button
          onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}
          style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
        >
          + New Log
        </button>
      </div>

      {/* Feedback */}
      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {/* New Log Form */}
      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Daily Log</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Date</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Superintendent</label><input type="text" value={form.superintendent} onChange={e => setForm(p => ({ ...p, superintendent: e.target.value }))} placeholder="Name" style={inp} /></div>
            <div><label style={label}>Weather</label>
              <select value={form.weather} onChange={e => setForm(p => ({ ...p, weather: e.target.value }))} style={inp}>
                {['Clear','Partly Cloudy','Overcast','Rain','Wind'].map(w => <option key={w}>{w}</option>)}
              </select>
            </div>
            <div><label style={label}>Temperature (°F)</label><input type="number" value={form.temp_f} onChange={e => setForm(p => ({ ...p, temp_f: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Crew Count</label><input type="number" value={form.crew_count} onChange={e => setForm(p => ({ ...p, crew_count: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Equipment Used</label><input type="text" value={form.equipment} onChange={e => setForm(p => ({ ...p, equipment: e.target.value }))} placeholder="e.g. Crane, scissor lift" style={inp} /></div>
            <div><label style={label}>Materials Delivered</label><input type="text" value={form.materials} onChange={e => setForm(p => ({ ...p, materials: e.target.value }))} placeholder="e.g. Lumber delivery" style={inp} /></div>
            <div><label style={label}>Visitors On Site</label><input type="text" value={form.visitors} onChange={e => setForm(p => ({ ...p, visitors: e.target.value }))} placeholder="e.g. Owner rep" style={inp} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Work Performed Today *</label><textarea value={form.work_performed} onChange={e => setForm(p => ({ ...p, work_performed: e.target.value }))} rows={3} placeholder="Describe work performed..." style={{ ...inp, resize: 'vertical' }} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Incidents / Issues</label><textarea value={form.incidents} onChange={e => setForm(p => ({ ...p, incidents: e.target.value }))} rows={2} placeholder="Any incidents, RFIs, or issues..." style={{ ...inp, resize: 'vertical' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Log'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter buttons */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8 }}>
        {(['all', 'week', 'month'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', background: filter === f ? GOLD : RAISED, border: '1px solid ' + (filter === f ? GOLD : BORDER), borderRadius: 6, color: filter === f ? DARK : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {f === 'all' ? 'All' : f === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: DIM, alignSelf: 'center' }}>{filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>No logs found. Click &quot;+ New Log&quot; to add one.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Date','Superintendent','Weather','Temp','Crew','Work Performed','Issues','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <React.Fragment key={log.id}>
                  <tr style={{ borderBottom: '1px solid rgba(38,51,71,.4)', background: expandedId === log.id ? 'rgba(212,160,23,.05)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, whiteSpace: 'nowrap', fontWeight: 600 }}>{log.date}</td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{log.superintendent}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{log.weather}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{log.temp_f}°F</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{log.crew_count}</td>
                    <td style={{ padding: '10px 14px', color: TEXT, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.work_performed}</td>
                    <td style={{ padding: '10px 14px', color: log.incidents && log.incidents !== 'None' ? '#f59e0b' : DIM, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.incidents || 'None'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setExpandedId(expandedId === log.id ? null : log.id)} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                        {expandedId === log.id ? 'Close' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr style={{ borderBottom: '1px solid ' + BORDER }}>
                      <td colSpan={8} style={{ padding: '16px 24px', background: '#151f2e' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 13 }}>
                          <div><div style={{ color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Work Performed</div><div style={{ color: TEXT }}>{log.work_performed}</div></div>
                          <div><div style={{ color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Equipment</div><div style={{ color: TEXT }}>{log.equipment || '—'}</div></div>
                          <div><div style={{ color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Materials Delivered</div><div style={{ color: TEXT }}>{log.materials || '—'}</div></div>
                          <div><div style={{ color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Visitors</div><div style={{ color: TEXT }}>{log.visitors || '—'}</div></div>
                          <div><div style={{ color: DIM, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Incidents / Issues</div><div style={{ color: log.incidents && log.incidents !== 'None' ? '#f59e0b' : TEXT }}>{log.incidents || 'None'}</div></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
