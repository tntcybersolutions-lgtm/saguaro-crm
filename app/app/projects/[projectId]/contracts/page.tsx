'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Contract {
  id: string;
  sub_name: string;
  trade: string;
  amount: number;
  status: string;
  execution_date: string | null;
  scope: string;
  start_date: string;
  end_date: string;
  retainage_pct: number;
  pdf_url: string | null;
  project_id: string;
}

const EMPTY_FORM = { sub_name: '', trade: '', amount: 0, scope: '', start_date: '', end_date: '', retainage_pct: 10 };

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Draft: { bg: 'rgba(143,163,192,.2)', color: DIM },
    Sent: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
    Executed: { bg: 'rgba(61,214,140,.2)', color: GREEN },
    Complete: { bg: 'rgba(212,160,23,.2)', color: GOLD },
  };
  const s = map[status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
  return <span style={{ padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>{status}</span>;
}

export default function ContractsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/contracts`);
      const json = await res.json();
      setContracts(json.contracts || []);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  async function handleSave() {
    if (!form.sub_name || !form.trade || !form.amount) {
      setErrorMsg('Subcontractor name, trade, and amount are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/contracts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save contract');
      const newContract: Contract = json.contract || { id: `c-${Date.now()}`, project_id: projectId, status: 'Draft', execution_date: null, pdf_url: null, ...form };
      setContracts(prev => [newContract, ...prev]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Contract created successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save contract. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(id: string, file: File) {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/contracts/${id}/upload`, { method: 'POST', body: fd });
      setSuccessMsg('Signed contract uploaded.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setErrorMsg('Upload failed. Please try again.');
    } finally {
      setUploadingId(null);
    }
  }

  const total = contracts.reduce((s, c) => s + (c.amount || 0), 0);
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Contracts</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Subcontractor and vendor contracts</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          + New Contract
        </button>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>New Contract</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Subcontractor Name *</label><input type="text" value={form.sub_name} onChange={e => setForm(p => ({ ...p, sub_name: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Trade *</label><input type="text" value={form.trade} onChange={e => setForm(p => ({ ...p, trade: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Contract Amount ($) *</label><input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} style={inp} /></div>
            <div><label style={label}>Start Date</label><SaguaroDatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} style={inp} /></div>
            <div><label style={label}>End Date</label><SaguaroDatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} style={inp} /></div>
            <div><label style={label}>Retainage %</label><input type="number" value={form.retainage_pct} onChange={e => setForm(p => ({ ...p, retainage_pct: Number(e.target.value) }))} style={inp} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={label}>Scope of Work</label><textarea value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Contract'}
            </button>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ padding: '9px 16px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Sub / Vendor','Trade','Contract Amount','Status','Execution Date','Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(38,51,71,.4)' }}>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{c.sub_name}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{c.trade}</td>
                    <td style={{ padding: '10px 14px', color: GOLD, fontWeight: 700 }}>${c.amount?.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{c.execution_date || '—'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {c.pdf_url && (
                        <button onClick={() => window.open(c.pdf_url!, '_blank')} style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer', marginRight: 6 }}>View PDF</button>
                      )}
                      <label style={{ padding: '4px 10px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 5, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                        {uploadingId === c.id ? 'Uploading...' : 'Upload Signed'}
                        <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(c.id, e.target.files[0]); }} />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 20, padding: '14px 20px', background: RAISED, borderRadius: 8, display: 'flex', justifyContent: 'flex-end', gap: 40 }}>
              <div style={{ fontSize: 13, color: DIM }}>Total Contracts: <span style={{ color: TEXT, fontWeight: 700 }}>{contracts.length}</span></div>
              <div style={{ fontSize: 13, color: DIM }}>Total Value: <span style={{ color: GOLD, fontWeight: 800, fontSize: 15 }}>${total.toLocaleString()}</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
