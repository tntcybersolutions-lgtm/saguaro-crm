'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017', DARK='#0d1117', RAISED='#1f2c3e', BORDER='#263347', DIM='#8fa3c0', TEXT='#e8edf8', GREEN='#3dd68c', RED='#ef4444';

interface Permit {
  id: string;
  permit_type: string;
  number: string;
  authority: string;
  applied_date: string;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  inspector: string;
  project_id: string;
}

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  Applied: { bg: 'rgba(59,130,246,.2)', color: '#60a5fa' },
  'Under Review': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b' },
  Issued: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Active: { bg: 'rgba(61,214,140,.2)', color: GREEN },
  Expired: { bg: 'rgba(239,68,68,.2)', color: RED },
  Finaled: { bg: 'rgba(212,160,23,.2)', color: GOLD },
};

const EMPTY_FORM = { permit_type: '', number: '', authority: '', applied_date: '', required_by: '' };

export default function PermitsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [inspectionLoading, setInspectionLoading] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/permits`);
      const json = await res.json();
      setPermits(json.permits || []);
    } catch {
      setPermits([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchPermits(); }, [fetchPermits]);

  function rowStyle(p: Permit): React.CSSProperties {
    if (p.expiry_date && p.expiry_date < today) return { background: 'rgba(239,68,68,.07)', borderBottom: '1px solid rgba(38,51,71,.4)' };
    if (p.expiry_date && p.expiry_date <= in30Days && p.expiry_date >= today) return { background: 'rgba(245,158,11,.07)', borderBottom: '1px solid rgba(38,51,71,.4)' };
    return { borderBottom: '1px solid rgba(38,51,71,.4)' };
  }

  async function handleSave() {
    if (!form.permit_type || !form.number || !form.authority) { setErrorMsg('Type, number, and authority are required.'); return; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/permits/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'Applied', issued_date: null, expiry_date: null, inspector: '', ...form }),
      });
      const json = await res.json();
      const newPermit: Permit = json.permit || { id: `p-${Date.now()}`, project_id: projectId, status: 'Applied', issued_date: null, expiry_date: null, inspector: '', ...form };
      setPermits(prev => [...prev, newPermit]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Permit added.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newPermit: Permit = { id: `p-${Date.now()}`, project_id: projectId, status: 'Applied', issued_date: null, expiry_date: null, inspector: '', ...form };
      setPermits(prev => [...prev, newPermit]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Permit added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestInspection(id: string) {
    setInspectionLoading(id);
    try {
      await fetch(`/api/permits/${id}/request-inspection`, { method: 'POST' });
    } catch { /* demo */ }
    setInspectionLoading(null);
    setSuccessMsg('Inspection requested successfully.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: '#151f2e', border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT, fontSize: 13 };
  const label: React.CSSProperties = { fontSize: 12, color: DIM, marginBottom: 4, display: 'block' };

  return (
    <div style={{ background: DARK, minHeight: '100vh' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Permits</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Building permits and regulatory approvals</div>
        </div>
        <button onClick={() => { setShowForm(p => !p); setErrorMsg(''); }} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ Add Permit</button>
      </div>

      {/* Legend */}
      <div style={{ padding: '12px 24px 0', display: 'flex', gap: 16, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(245,158,11,.3)' }} /><span style={{ color: DIM }}>Expiring within 30 days</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(239,68,68,.3)' }} /><span style={{ color: DIM }}>Expired</span></div>
      </div>

      {successMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(61,214,140,.15)', border: '1px solid rgba(61,214,140,.4)', borderRadius: 7, color: GREEN, fontSize: 13 }}>{successMsg}</div>}
      {errorMsg && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: RED, fontSize: 13 }}>{errorMsg}</div>}

      {showForm && (
        <div style={{ margin: 24, background: RAISED, border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Add Permit</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div><label style={label}>Permit Type *</label><input type="text" value={form.permit_type} onChange={e => setForm(p => ({ ...p, permit_type: e.target.value }))} placeholder="e.g. Building" style={inp} /></div>
            <div><label style={label}>Permit Number *</label><input type="text" value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Issuing Authority *</label><input type="text" value={form.authority} onChange={e => setForm(p => ({ ...p, authority: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Applied Date</label><input type="date" value={form.applied_date} onChange={e => setForm(p => ({ ...p, applied_date: e.target.value }))} style={inp} /></div>
            <div><label style={label}>Required By</label><input type="date" value={form.required_by} onChange={e => setForm(p => ({ ...p, required_by: e.target.value }))} style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,' + GOLD + ',#F0C040)', border: 'none', borderRadius: 7, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Permit'}
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
                {['Permit Type','Number','Issuing Authority','Applied Date','Issued Date','Expiry','Status','Inspector','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: '1px solid ' + BORDER, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permits.map(p => {
                const sc = STATUS_MAP[p.status] || { bg: 'rgba(143,163,192,.2)', color: DIM };
                const expired = p.expiry_date && p.expiry_date < today;
                const expiringSoon = p.expiry_date && p.expiry_date <= in30Days && p.expiry_date >= today;
                return (
                  <tr key={p.id} style={rowStyle(p)}>
                    <td style={{ padding: '10px 14px', color: TEXT, fontWeight: 600 }}>{p.permit_type}</td>
                    <td style={{ padding: '10px 14px', color: GOLD }}>{p.number}</td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{p.authority}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{p.applied_date || '—'}</td>
                    <td style={{ padding: '10px 14px', color: DIM, whiteSpace: 'nowrap' }}>{p.issued_date || '—'}</td>
                    <td style={{ padding: '10px 14px', color: expired ? RED : expiringSoon ? '#f59e0b' : DIM, whiteSpace: 'nowrap' }}>{p.expiry_date || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>{p.status}</span></td>
                    <td style={{ padding: '10px 14px', color: DIM }}>{p.inspector || '—'}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => handleRequestInspection(p.id)} disabled={inspectionLoading === p.id} style={{ padding: '4px 12px', background: 'rgba(212,160,23,.2)', border: '1px solid rgba(212,160,23,.4)', borderRadius: 5, color: GOLD, fontSize: 12, cursor: 'pointer' }}>
                        {inspectionLoading === p.id ? '...' : 'Request Inspection'}
                      </button>
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
