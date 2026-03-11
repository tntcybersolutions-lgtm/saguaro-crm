'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c';

interface Spec {
  id: string;
  division: string;
  section: string;
  title: string;
  version: string;
  date: string;
  status: string;
  url: string | null;
  project_id: string;
}

const DEMO_SPECS: Spec[] = [
  { id: 's-1', division: '01', section: '01 10 00', title: 'Summary of Work', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-2', division: '03', section: '03 31 00', title: 'Structural Concrete', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-3', division: '06', section: '06 10 00', title: 'Rough Carpentry', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-4', division: '07', section: '07 52 00', title: 'Modified Bituminous Roofing', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-5', division: '09', section: '09 21 16', title: 'Gypsum Board', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-6', division: '22', section: '22 00 00', title: 'Plumbing', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-7', division: '23', section: '23 00 00', title: 'HVAC', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
  { id: 's-8', division: '26', section: '26 05 00', title: 'Common Work — Electrical', version: '2026-01-15', date: '2026-01-15', status: 'Current', url: null, project_id: '' },
];

const EMPTY_FORM = { division: '', section: '', title: '', version: '' };

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Current: { bg: 'rgba(61,214,140,.2)', color: GREEN },
    Superseded: { bg: 'rgba(143,163,192,.2)', color: DIM },
    'For Review': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  };
  const s = map[status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

export default function SpecsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const fetchSpecs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/specs`);
      const json = await res.json();
      setSpecs(json.specs?.length ? json.specs : DEMO_SPECS.map(s => ({ ...s, project_id: projectId })));
    } catch {
      setSpecs(DEMO_SPECS.map(s => ({ ...s, project_id: projectId })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSpecs(); }, [fetchSpecs]);

  const filtered = specs.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.section.includes(search) || s.division.includes(search)
  );

  async function handleSave() {
    if (!form.section || !form.title) { setErrorMsg('Section number and title are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const today = new Date().toISOString().split('T')[0];
    const newSpec: Spec = { id: `s-${Date.now()}`, project_id: projectId, date: today, status: 'For Review', url: null, ...form };
    try {
      const res = await fetch('/api/specs/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...newSpec }) });
      const json = await res.json();
      setSpecs(prev => [...prev, json.spec || newSpec].sort((a, b) => a.section.localeCompare(b.section)));
    } catch {
      setSpecs(prev => [...prev, newSpec]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Spec section added.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleUploadSpec(specId: string, file: File) {
    setUploading(specId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('specId', specId);
      await fetch(`/api/specs/${specId}/upload`, { method: 'POST', body: fd });
      setSuccessMsg('Spec file uploaded.');
    } catch {
      setSuccessMsg('Spec file received (demo mode).');
    }
    setUploading(null);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Specifications</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Project specifications by CSI division</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Section</button>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: '#ef4444', fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Spec Section</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Division #</label><input type="text" value={form.division} onChange={e => setForm(p => ({ ...p, division: e.target.value }))} placeholder="e.g. 03" style={inp} /></div>
            <div><label style={label}>Section # *</label><input type="text" value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} placeholder="e.g. 03 31 00" style={inp} /></div>
            <div><label style={label}>Version Date</label><input type="text" value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} placeholder="e.g. 2026-01-15" style={inp} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Title *</label><input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Section'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 12 }}>
        <input
          type="text"
          placeholder="Search sections..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13, width: 240 }}
        />
        <span style={{ alignSelf: 'center', fontSize: 12, color: DIM }}>{filtered.length} section{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Div','Section #','Title','Version','Date','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                  <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{s.division}</td>
                  <td style={{ padding: '10px 14px', color: GOLD }}>{s.section}</td>
                  <td style={{ padding: '10px 14px', color: TEXT }}>{s.title}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{s.version}</td>
                  <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(s.status)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {s.url ? (
                      <button onClick={() => window.open(s.url!, '_blank')} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer', marginRight: 6 }}>View</button>
                    ) : null}
                    <label style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                      {uploading === s.id ? 'Uploading...' : 'Upload PDF'}
                      <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUploadSpec(s.id, e.target.files[0]); }} />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
