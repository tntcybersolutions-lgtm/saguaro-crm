'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface PunchItem {
  id: string;
  number: string;
  description: string;
  location: string;
  assigned_sub: string;
  due_date: string;
  priority: string;
  status: string;
  project_id: string;
}

const PRIORITIES = ['Critical','High','Medium','Low'];
const STATUSES = ['Open','In Progress','Ready to Inspect','Complete'];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: RED,
  High: '#f97316',
  Medium: '#f59e0b',
  Low: DIM,
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Open: { bg: 'rgba(239,68,68,.2)', color: RED },
  'In Progress': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  'Ready to Inspect': { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
  Complete: { bg: 'rgba(61,214,140,.2)', color: GREEN },
};

const EMPTY_FORM = { description: '', location: '', assigned_sub: '', due_date: '', priority: 'Medium' };

export default function PunchListPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [items, setItems] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/punch-list`);
      const json = await res.json();
      setItems(json.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = filterStatus === 'All' ? items : items.filter(i => i.status === filterStatus);

  const total = items.length;
  const open = items.filter(i => i.status === 'Open').length;
  const inProgress = items.filter(i => i.status === 'In Progress').length;
  const complete = items.filter(i => i.status === 'Complete').length;
  const pctDone = total ? Math.round((complete / total) * 100) : 0;

  async function handleSave() {
    if (!form.description) { setErrorMsg('Description is required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const num = `P-${String(items.length + 1).padStart(3, '0')}`;
    try {
      const res = await fetch('/api/punch-list/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, number: num, ...form }),
      });
      const json = await res.json();
      const newItem: PunchItem = json.item || { id: `p-${Date.now()}`, project_id: projectId, number: num, status: 'Open', ...form };
      setItems(prev => [...prev, newItem]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Punch list item added.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newItem: PunchItem = { id: `p-${Date.now()}`, project_id: projectId, number: num, status: 'Open', ...form };
      setItems(prev => [...prev, newItem]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Item added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(id: string) {
    setActionLoading(id);
    try {
      await fetch(`/api/punch-list/${id}/complete`, { method: 'PATCH' });
    } catch { /* demo */ }
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'Complete' } : i));
    setActionLoading(null);
    setSuccessMsg('Item marked complete.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'punch_list', projectId }),
      });
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Punch List</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Items before substantial completion</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} style={{ padding: '8px 14px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Export PDF</button>
          <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Item</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: 12, width: 'fit-content' }}>
        {[
          { label: 'Total', value: total, color: TEXT },
          { label: 'Open', value: open, color: RED },
          { label: 'In Progress', value: inProgress, color: '#f59e0b' },
          { label: 'Complete', value: complete, color: GREEN },
          { label: '% Done', value: `${pctDone}%`, color: GOLD },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: '1px solid ' + BORDER, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {/* Progress bar */}
      <div style={{ padding: '12px 24px 0' }}>
        <div style={{ height: 6, background: RAISED, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pctDone}%`, background: 'linear-gradient(90deg,' + GREEN + ',#22d3ee)', borderRadius: 3, transition: 'width .4s' }} />
        </div>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Punch List Item</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Description *</label><input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                {PRIORITIES.map(pr => <option key={pr}>{pr}</option>)}
              </select>
            </div>
            <div><label style={label}>Location / Room</label><input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Assigned Sub</label><input type="text" value={form.assigned_sub} onChange={e => setForm(p => ({ ...p, assigned_sub: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Due Date</label><SaguaroDatePicker value={form.due_date} onChange={v => setForm(p => ({ ...p, due_date: v }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Item'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8 }}>
        {['All', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '5px 12px', background: filterStatus === s ? GOLD : RAISED, border: '1px solid ' + (filterStatus === s ? GOLD : BORDER), borderRadius: 5, color: filterStatus === s ? DARK : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>

      <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['#','Description','Location','Assigned Sub','Due Date','Priority','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const sc = STATUS_COLORS[item.status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{item.number}</td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{item.description}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{item.location}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{item.assigned_sub}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{item.due_date || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ color: PRIORITY_COLORS[item.priority] || DIM, fontWeight: 700, fontSize: 12 }}>{item.priority}</span></td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{item.status}</span></td>
                    <td style={{ padding: '10px 14px' }}>
                      {item.status !== 'Complete' && (
                        <button onClick={() => handleComplete(item.id)} disabled={actionLoading === item.id} style={{ padding: '4px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 5, color: GREEN, fontSize: 12, cursor: 'pointer' }}>
                          {actionLoading === item.id ? '...' : 'Complete'}
                        </button>
                      )}
                      {item.status === 'Complete' && <span style={{ color: GREEN, fontSize: 12 }}>Done</span>}
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
