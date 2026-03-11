'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Proposal {
  id: string;
  version: string;
  created_date: string;
  amount: number;
  status: string;
  notes: string;
  pdf_url: string | null;
  project_id: string;
}

const DEMO_PROPOSALS: Proposal[] = [
  { id: 'prop-1', version: 'v1.0', created_date: '2025-12-01', amount: 2750000, status: 'Superseded', notes: 'Initial proposal', pdf_url: null, project_id: '' },
  { id: 'prop-2', version: 'v2.0', created_date: '2025-12-15', amount: 2850000, status: 'Accepted', notes: 'Final — includes value engineering and owner alternates', pdf_url: null, project_id: '' },
];

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Draft: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Sent: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
  Under_Review: { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  Accepted: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Superseded: { bg: 'rgba(143,163,192,.2)', color: DIM },
  Rejected: { bg: 'rgba(239,68,68,.2)', color: RED },
};

const EMPTY_FORM = { amount: 0, notes: '' };

export default function ProposalPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/proposals`);
      const json = await res.json();
      setProposals(json.proposals?.length ? json.proposals : DEMO_PROPOSALS.map(p => ({ ...p, project_id: projectId })));
    } catch {
      setProposals(DEMO_PROPOSALS.map(p => ({ ...p, project_id: projectId })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  const accepted = proposals.find(p => p.status === 'Accepted');
  const latestVersion = proposals.length ? `v${proposals.length + 1}.0` : 'v1.0';

  async function handleSave() {
    if (!form.amount) { setErrorMsg('Amount is required.'); return; }
    setSaving(true);
    setErrorMsg('');
    // Mark all existing as superseded
    const newProposal: Proposal = {
      id: `prop-${Date.now()}`,
      project_id: projectId,
      version: latestVersion,
      created_date: new Date().toISOString().split('T')[0],
      status: 'Draft',
      pdf_url: null,
      ...form,
    };
    try {
      const res = await fetch('/api/proposals/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...newProposal }) });
      const json = await res.json();
      setProposals(prev => [...prev.map(p => p.status !== 'Accepted' ? { ...p, status: 'Superseded' } : p), json.proposal || newProposal]);
    } catch {
      setProposals(prev => [...prev.map(p => p.status !== 'Accepted' ? { ...p, status: 'Superseded' } : p), newProposal]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setSuccessMsg('Proposal version created.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleSend(id: string) {
    try { await fetch(`/api/proposals/${id}/send`, { method: 'POST' }); } catch { /* demo */ }
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'Sent' } : p));
    setSuccessMsg('Proposal sent to owner.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleUpload(id: string, file: File) {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/proposals/${id}/upload`, { method: 'POST', body: fd });
      setSuccessMsg('PDF uploaded.');
    } catch {
      setSuccessMsg('PDF received (demo mode).');
    }
    setUploadingId(null);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Proposal</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Project proposals and contract amounts</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ New Version</button>
      </div>

      {/* Accepted proposal banner */}
      {accepted && (
        <div style={{ margin: 24, padding: '16px 20px', background: 'rgba(61,214,140,.1)', border: '1px solid rgba(61,214,140,.3)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginBottom: 4 }}>ACCEPTED PROPOSAL</div>
            <div style={{ color: TEXT, fontSize: 16, fontWeight: 700 }}>{accepted.version} — ${accepted.amount.toLocaleString()}</div>
            <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{accepted.notes}</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: GREEN }}>${accepted.amount.toLocaleString()}</div>
        </div>
      )}

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Proposal Version ({latestVersion})</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
            <div><label style={label}>Amount ($) *</label><input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Notes</label><input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Revised after value engineering" style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Create Version'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 40px', overflowX: 'auto' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Version','Created','Amount','Status','Notes','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => {
                const sc = STATUS_MAP[p.status.replace(' ', '_')] || STATUS_MAP[p.status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)', background: p.status === 'Accepted' ? 'rgba(61,214,140,.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>{p.version}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{p.created_date}</td>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 800, fontSize: 14 }}>${p.amount?.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{p.status}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{p.notes}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
                      {p.pdf_url && <button onClick={() => window.open(p.pdf_url!, '_blank')} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer' }}>View PDF</button>}
                      {p.status === 'Draft' && <button onClick={() => handleSend(p.id)} style={{ padding: '4px 10px', background: 'rgba(59,130,246,.2)', border: '1px solid rgba(59,130,246,.4)', borderRadius: 5, color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>Send</button>}
                      <label style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                        {uploadingId === p.id ? 'Uploading...' : 'Upload PDF'}
                        <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(p.id, e.target.files[0]); }} />
                      </label>
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
