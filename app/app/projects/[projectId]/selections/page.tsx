'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Selection {
  id: string;
  category: string;
  item: string;
  spec: string;
  made_by: string;
  date: string;
  status: string;
  due_date: string | null;
  notes: string;
  project_id: string;
}

const DEMO_SELECTIONS: Selection[] = [
  { id: 'sel-1', category: 'Flooring', item: 'Hardwood — Main', spec: '3/4" Oak pre-finished natural', made_by: 'Owner', date: '2026-01-25', status: 'Approved', due_date: '2026-02-01', notes: '', project_id: '' },
  { id: 'sel-2', category: 'Kitchen', item: 'Countertops', spec: 'Quartz — Silestone Lyra', made_by: 'Owner', date: '2026-01-28', status: 'Approved', due_date: '2026-02-05', notes: '', project_id: '' },
  { id: 'sel-3', category: 'Exterior', item: 'Paint Color', spec: 'Sherwin Williams — Accessible Beige SW 7036', made_by: 'Owner', date: '2026-02-10', status: 'Approved', due_date: '2026-02-15', notes: '', project_id: '' },
  { id: 'sel-4', category: 'Plumbing', item: 'Fixtures', spec: 'Moen Align — brushed nickel', made_by: 'Owner', date: '2026-02-15', status: 'Pending', due_date: '2026-03-01', notes: 'Awaiting final confirmation', project_id: '' },
  { id: 'sel-5', category: 'Electrical', item: 'Light Fixtures', spec: 'Kichler — matte black throughout', made_by: 'Designer', date: '2026-03-01', status: 'Pending', due_date: '2026-03-15', notes: '', project_id: '' },
];

const CATEGORIES = ['Flooring','Kitchen','Bathrooms','Exterior','Plumbing','Electrical','HVAC','Roofing','Windows','Doors','Cabinetry','Hardware','Other'];
const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Pending: { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  Approved: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Overdue: { bg: 'rgba(239,68,68,.2)', color: RED },
  Revised: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
};

const EMPTY_FORM = { category: 'Flooring', item: '', spec: '', made_by: 'Owner', due_date: '', notes: '' };

export default function SelectionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const today = new Date().toISOString().split('T')[0];

  const fetchSelections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/selections`);
      const json = await res.json();
      setSelections(json.selections?.length ? json.selections : DEMO_SELECTIONS.map(s => ({ ...s, project_id: projectId })));
    } catch {
      setSelections(DEMO_SELECTIONS.map(s => ({ ...s, project_id: projectId })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSelections(); }, [fetchSelections]);

  const filtered = filterStatus === 'All' ? selections : selections.filter(s => s.status === filterStatus);
  const approved = selections.filter(s => s.status === 'Approved').length;
  const pending = selections.filter(s => s.status === 'Pending').length;
  const overdue = selections.filter(s => s.due_date && s.due_date < today && s.status !== 'Approved').length;

  async function handleSave() {
    if (!form.item || !form.category) { setErrorMsg('Category and item are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const newSel: Selection = { id: `sel-${Date.now()}`, project_id: projectId, date: today, status: 'Pending', ...form, due_date: form.due_date || null };
    try {
      const res = await fetch('/api/selections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...newSel }) });
      const json = await res.json();
      setSelections(prev => [...prev, json.selection || newSel]);
    } catch {
      setSelections(prev => [...prev, newSel]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Selection added.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleApprove(id: string) {
    try { await fetch(`/api/selections/${id}/approve`, { method: 'PATCH' }); } catch { /* demo */ }
    setSelections(prev => prev.map(s => s.id === id ? { ...s, status: 'Approved' } : s));
    setSuccessMsg('Selection approved.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Selections</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Owner and design selections log</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Selection</button>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Total', value: selections.length, color: TEXT },
          { label: 'Approved', value: approved, color: GREEN },
          { label: 'Pending', value: pending, color: '#f59e0b' },
          { label: 'Overdue', value: overdue, color: overdue > 0 ? RED : DIM },
        ].map(k => (
          <div key={k.label} style={{ background: RAISED, borderRadius: 8, padding: '12px 20px', border: '1px solid ' + BORDER, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Selection</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Category *</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={label}>Item *</label><input type="text" value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} placeholder="e.g. Countertops" style={inp} /></div>
            <div><label style={label}>Made By</label><input type="text" value={form.made_by} onChange={e => setForm(p => ({ ...p, made_by: e.target.value }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Specification / Model</label><input type="text" value={form.spec} onChange={e => setForm(p => ({ ...p, spec: e.target.value }))} placeholder="e.g. Quartz — Silestone Lyra" style={inp} /></div>
            <div><label style={label}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Notes</label><input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Selection'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8 }}>
        {['All','Pending','Approved'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '5px 12px', background: filterStatus === s ? GOLD : RAISED, border: '1px solid ' + (filterStatus === s ? GOLD : BORDER), borderRadius: 5, color: filterStatus === s ? DARK : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Category','Item','Specification','Made By','Date','Due Date','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const od = s.due_date && s.due_date < today && s.status !== 'Approved';
                const effectiveStatus = od ? 'Overdue' : s.status;
                const sc = STATUS_MAP[effectiveStatus] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)', background: od ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 600 }}>{s.category}</td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{s.item}</td>
                    <td style={{ padding: '10px 14px', color: DIM, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.spec}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{s.made_by}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{s.date}</td>
                    <td style={{ padding: '10px 14px', color: od ? RED : DIM, whiteSpace: 'nowrap' }}>{s.due_date || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{effectiveStatus}</span></td>
                    <td style={{ padding: '10px 14px' }}>
                      {s.status === 'Pending' && (
                        <button onClick={() => handleApprove(s.id)} style={{ padding: '4px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 5, color: GREEN, fontSize: 12, cursor: 'pointer' }}>Approve</button>
                      )}
                      {s.status === 'Approved' && <span style={{ color: GREEN, fontSize: 12 }}>Approved</span>}
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
