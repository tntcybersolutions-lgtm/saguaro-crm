'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c';

interface Drawing {
  id: string;
  sheet: string;
  title: string;
  discipline: string;
  revision: string;
  date: string;
  status: string;
  url: string | null;
  project_id: string;
}

const DISCIPLINES = ['Architectural','Structural','Civil','MEP','Electrical','Plumbing'];
const STATUSES = ['Current','Superseded','For Review'];
const EMPTY_FORM = { sheet: '', title: '', discipline: 'Architectural', revision: 'Rev 1', date: '', status: 'Current' };

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Current: { bg: 'rgba(61,214,140,.2)', color: GREEN },
    Superseded: { bg: 'rgba(143,163,192,.2)', color: DIM },
    'For Review': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  };
  const s = map[status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

export default function DrawingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const fetchDrawings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/drawings`);
      const json = await res.json();
      setDrawings(json.drawings || []);
    } catch {
      setDrawings([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchDrawings(); }, [fetchDrawings]);

  const filtered = drawings.filter(d => {
    if (filterDiscipline !== 'All' && d.discipline !== filterDiscipline) return false;
    if (filterStatus !== 'All' && d.status !== filterStatus) return false;
    return true;
  });

  async function handleSave() {
    if (!form.sheet || !form.title) {
      setErrorMsg('Sheet number and title are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/drawings/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form }),
      });
      const json = await res.json();
      const newDrawing: Drawing = json.drawing || { id: `d-${Date.now()}`, project_id: projectId, url: null, ...form };
      setDrawings(prev => [...prev, newDrawing].sort((a, b) => a.sheet.localeCompare(b.sheet)));
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Drawing added successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newDrawing: Drawing = { id: `d-${Date.now()}`, project_id: projectId, url: null, ...form };
      setDrawings(prev => [...prev, newDrawing]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Drawing added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkUpload(files: FileList) {
    setUploading(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
      fd.append('projectId', projectId);
      await fetch('/api/drawings/upload', { method: 'POST', body: fd });
      setSuccessMsg(`${files.length} drawing(s) uploaded.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setSuccessMsg(`${files.length} drawing(s) received (demo mode).`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setUploading(false);
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Drawings</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Architectural and engineering drawing sets</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ padding: '8px 14px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {uploading ? 'Uploading...' : 'Upload Drawing Set'}
            <input ref={uploadRef} type="file" accept=".pdf,.dwg,.dxf" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleBulkUpload(e.target.files); }} />
          </label>
          <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            + Add Drawing
          </button>
        </div>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: '#ef4444', fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Drawing</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Sheet # *</label><input type="text" value={form.sheet} onChange={e => setForm(p => ({ ...p, sheet: e.target.value }))} placeholder="e.g. A1.0" style={inp} /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Title *</label><input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Discipline</label>
              <select value={form.discipline} onChange={e => setForm(p => ({ ...p, discipline: e.target.value }))} style={inp}>
                {DISCIPLINES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div><label style={label}>Revision</label><input type="text" value={form.revision} onChange={e => setForm(p => ({ ...p, revision: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Date</label><input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Drawing'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ padding: '16px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 12, color: DIM, alignSelf: 'center' }}>Discipline:</span>
          {['All', ...DISCIPLINES].map(d => (
            <button key={d} onClick={() => setFilterDiscipline(d)} style={{ padding: '5px 12px', background: filterDiscipline === d ? GOLD : RAISED, border: '1px solid ' + (filterDiscipline === d ? GOLD : BORDER), borderRadius: 5, color: filterDiscipline === d ? DARK : DIM, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{d}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 12, color: DIM, alignSelf: 'center' }}>Status:</span>
          {['All', ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '5px 12px', background: filterStatus === s ? GOLD : RAISED, border: '1px solid ' + (filterStatus === s ? GOLD : BORDER), borderRadius: 5, color: filterStatus === s ? DARK : DIM, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: DIM, alignSelf: 'center' }}>{filtered.length} drawing{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>No drawings found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Sheet #','Title','Discipline','Rev','Date','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                  <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{d.sheet}</td>
                  <td style={{ padding: '10px 14px', color: TEXT }}>{d.title}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{d.discipline}</td>
                  <td style={{ padding: '10px 14px', color: DIM }}>{d.revision}</td>
                  <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{d.date}</td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(d.status)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {d.url ? (
                      <>
                        <button onClick={() => window.open(d.url!, '_blank')} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer', marginRight: 6 }}>View</button>
                        <a href={d.url} download style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer', textDecoration: 'none' }}>Download</a>
                      </>
                    ) : (
                      <span style={{ color: DIM, fontSize: 12 }}>No file</span>
                    )}
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
