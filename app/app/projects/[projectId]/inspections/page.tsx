'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Inspection {
  id: string;
  type: string;
  date: string;
  inspector: string;
  agency: string;
  result: string;
  notes: string;
  status: string;
  re_inspection_date: string | null;
  project_id: string;
}

const INSPECTION_TYPES = ['Foundation','Framing','Rough Electrical','Rough Plumbing','Rough HVAC','Insulation','Drywall','Final Electrical','Final Plumbing','Final Building'];
const EMPTY_FORM = { type: 'Framing', date: '', inspector: '', agency: '', notes: '' };

function resultBadge(result: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Passed: { bg: 'rgba(61,214,140,.2)', color: GREEN },
    Failed: { bg: 'rgba(239,68,68,.2)', color: RED },
    Pending: { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
    'Conditional Pass': { bg: 'rgba(212,160,23,.2)', color: GOLD },
  };
  const s = map[result] || { bg: 'rgba(143,163,192,.2)', color: DIM };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{result}</span>;
}

export default function InspectionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchInspections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/inspections`);
      const json = await res.json();
      setInspections(json.inspections ?? []);
    } catch {
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchInspections(); }, [fetchInspections]);

  const passed = inspections.filter(i => i.result === 'Passed').length;
  const failed = inspections.filter(i => i.result === 'Failed').length;
  const scheduled = inspections.filter(i => i.status === 'Scheduled').length;

  async function handleSave() {
    if (!form.type || !form.date || !form.inspector) { setErrorMsg('Type, date, and inspector are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const newIns: Inspection = { id: `ins-${Date.now()}`, project_id: projectId, result: 'Pending', status: 'Scheduled', re_inspection_date: null, ...form };
    try {
      const res = await fetch('/api/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...newIns }) });
      const json = await res.json();
      setInspections(prev => [...prev, json.inspection || newIns]);
    } catch {
      setInspections(prev => [...prev, newIns]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Inspection scheduled.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Inspections</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Building inspections and approval records</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Schedule Inspection</button>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Passed', value: passed, color: GREEN },
          { label: 'Failed', value: failed, color: failed > 0 ? RED : DIM },
          { label: 'Scheduled', value: scheduled, color: '#f59e0b' },
          { label: 'Total', value: inspections.length, color: TEXT },
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
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Schedule Inspection</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Inspection Type *</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={label}>Date *</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Inspector *</label><input type="text" value={form.inspector} onChange={e => setForm(p => ({ ...p, inspector: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Agency</label><input type="text" value={form.agency} onChange={e => setForm(p => ({ ...p, agency: e.target.value }))} placeholder="e.g. City of Phoenix" style={inp} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Notes</label><input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Schedule Inspection'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : inspections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: DIM, fontSize: 13 }}>No inspections scheduled yet. Use the button above to schedule one.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Type','Date','Inspector','Agency','Result','Notes','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inspections.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                  <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{i.type}</td>
                  <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{i.date}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.inspector}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.agency}</td>
                  <td style={{ padding: '10px 14px' }}>{resultBadge(i.result)}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{i.notes || '—'}</td>
                  <td style={{ padding: '10px 14px', color: i.status === 'Complete' ? GREEN : '#f59e0b' }}>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
