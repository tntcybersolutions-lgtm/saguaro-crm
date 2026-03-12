'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Submittal {
  id: string;
  number: string;
  description: string;
  spec_section: string;
  submitted_by: string;
  submitted_date: string;
  to_architect: string;
  required_by: string;
  status: string;
  days_in_review: number;
  project_id: string;
}

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Draft: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Submitted: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
  'Under Review': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  Approved: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  'Revise & Resubmit': { bg: 'rgba(249,115,22,.2)', color: '#f97316' },
  Rejected: { bg: 'rgba(239,68,68,.2)', color: RED },
};

const EMPTY_FORM = { description: '', spec_section: '', submitted_by: '', required_by: '' };

export default function SubmittalsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [respondId, setRespondId] = useState<string | null>(null);
  const [respondStatus, setRespondStatus] = useState('Approved');

  const today = new Date().toISOString().split('T')[0];

  const fetchSubmittals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/submittals`);
      const json = await res.json();
      setSubmittals(json.submittals || []);
    } catch {
      setSubmittals([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSubmittals(); }, [fetchSubmittals]);

  function isOverdue(s: Submittal) {
    return s.required_by < today && s.status !== 'Approved' && s.status !== 'Rejected';
  }

  const total = submittals.length;
  const pending = submittals.filter(s => ['Submitted','Under Review','Draft'].includes(s.status)).length;
  const approved = submittals.filter(s => s.status === 'Approved').length;
  const overdue = submittals.filter(isOverdue).length;

  async function handleSave() {
    if (!form.description || !form.spec_section) { setErrorMsg('Description and spec section are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    const num = `S-${String(submittals.length + 1).padStart(3, '0')}`;
    const now = today;
    try {
      const res = await fetch('/api/submittals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, number: num, submitted_date: now, to_architect: now, status: 'Submitted', days_in_review: 0, ...form }),
      });
      const json = await res.json();
      const newSub: Submittal = json.submittal || { id: `sub-${Date.now()}`, project_id: projectId, number: num, submitted_date: now, to_architect: now, status: 'Submitted', days_in_review: 0, ...form };
      setSubmittals(prev => [newSub, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Submittal created.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newSub: Submittal = { id: `sub-${Date.now()}`, project_id: projectId, number: num, submitted_date: now, to_architect: now, status: 'Submitted', days_in_review: 0, ...form };
      setSubmittals(prev => [newSub, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Submittal created (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRespond(id: string) {
    try {
      await fetch(`/api/submittals/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: respondStatus }),
      });
    } catch { /* demo */ }
    setSubmittals(prev => prev.map(s => s.id === id ? { ...s, status: respondStatus } : s));
    setRespondId(null);
    setSuccessMsg(`Submittal ${respondStatus}.`);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Submittals</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Shop drawings, product data, and submittals log</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New Submittal</button>
      </div>

      {/* KPIs */}
      <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12 }}>
        {[
          { label: 'Total', value: total, color: TEXT },
          { label: 'Pending', value: pending, color: '#f59e0b' },
          { label: 'Approved', value: approved, color: GREEN },
          { label: 'Overdue', value: overdue, color: RED },
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
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Submittal</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            <div style={{ gridColumn: 'span 2' }}><label style={label}>Description *</label><input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Spec Section *</label><input type="text" value={form.spec_section} onChange={e => setForm(p => ({ ...p, spec_section: e.target.value }))} placeholder="e.g. 03 31 00" style={inp} /></div>
            <div><label style={label}>Submitted By</label><input type="text" value={form.submitted_by} onChange={e => setForm(p => ({ ...p, submitted_by: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Required By Date</label><SaguaroDatePicker value={form.required_by} onChange={v => setForm(p => ({ ...p, required_by: v }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Submittal'}
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
                {['#','Description','Spec Section','Submitted By','Submitted','Required By','Status','Days In Review','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submittals.map(s => {
                const od = isOverdue(s);
                const sc = STATUS_MAP[s.status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)', background: od ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{s.number}</td>
                    <td style={{ padding: '10px 14px', color: TEXT }}>{s.description}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{s.spec_section}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{s.submitted_by}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{s.submitted_date}</td>
                    <td style={{ padding: '10px 14px', color: od ? RED : DIM, whiteSpace: 'nowrap' }}>{s.required_by}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{s.status}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{s.days_in_review}d</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {(s.status === 'Submitted' || s.status === 'Under Review') && respondId !== s.id && (
                        <button onClick={() => { setRespondId(s.id); setRespondStatus('Approved'); }} style={{ padding: '4px 10px', background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 5, color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>Respond</button>
                      )}
                      {respondId === s.id && (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <select value={respondStatus} onChange={e => setRespondStatus(e.target.value)} style={{ padding: '3px 8px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 4, color: TEXT, fontSize: 12 }}>
                            <option>Approved</option>
                            <option>Revise &amp; Resubmit</option>
                            <option>Rejected</option>
                          </select>
                          <button onClick={() => handleRespond(s.id)} style={{ padding: '3px 10px', background: 'rgba(61,214,140,.2)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 4, color: GREEN, fontSize: 12, cursor: 'pointer' }}>Submit</button>
                          <button onClick={() => setRespondId(null)} style={{ padding: '3px 8px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 4, color: DIM, fontSize: 12, cursor: 'pointer' }}>X</button>
                        </div>
                      )}
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
