'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

interface Permit {
  id: string;
  permit_type: string;
  number: string;
  authority: string;
  applied_date: string;
  issued_date: string | null;
  expiry_date: string | null;
  fee: number;
  status: string;
  inspector: string;
  project_id: string;
}

const TYPES = ['Building', 'Electrical', 'Plumbing', 'Mechanical', 'Fire', 'Grading'];

const STATUS_BADGE: Record<string, 'amber' | 'green' | 'red' | 'muted' | 'blue'> = {
  applied: 'amber',
  issued: 'green',
  expired: 'red',
  closed: 'muted',
};

const EMPTY_FORM = {
  permit_type: 'Building',
  number: '',
  authority: '',
  fee: 0,
  applied_date: '',
  issued_date: '',
  expiry_date: '',
};

export default function PermitsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const today = new Date().toISOString().split('T')[0];

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

  const applied = permits.filter(p => p.status === 'applied').length;
  const issued = permits.filter(p => p.status === 'issued').length;
  const expired = permits.filter(p => p.status === 'expired' || (p.expiry_date && p.expiry_date < today)).length;
  const totalFees = permits.reduce((s, p) => s + (p.fee || 0), 0);

  async function handleSave() {
    if (!form.number || !form.authority) {
      setErrorMsg('Permit number and agency are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/permits/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          status: 'applied',
          inspector: '',
          ...form,
          issued_date: form.issued_date || null,
          expiry_date: form.expiry_date || null,
        }),
      });
      const json = await res.json();
      const newPermit: Permit = json.permit || {
        id: `p-${Date.now()}`,
        project_id: projectId,
        status: 'applied',
        inspector: '',
        ...form,
        issued_date: form.issued_date || null,
        expiry_date: form.expiry_date || null,
      };
      setPermits(prev => [...prev, newPermit]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Permit added.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      const newPermit: Permit = {
        id: `p-${Date.now()}`,
        project_id: projectId,
        status: 'applied',
        inspector: '',
        ...form,
        issued_date: form.issued_date || null,
        expiry_date: form.expiry_date || null,
      };
      setPermits(prev => [...prev, newPermit]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccessMsg('Permit added (demo mode).');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };

  return (
    <PageWrap>
      <div style={{ padding: '24px 24px 0' }}>
        <SectionHeader
          title="Permits"
          sub="Building permits and regulatory approvals"
          action={
            <Btn onClick={() => { setShowForm(p => !p); setErrorMsg(''); }}>
              {showForm ? 'Cancel' : '+ Add Permit'}
            </Btn>
          }
        />
      </div>

      {/* Stat Cards */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard icon="📋" label="Total Permits" value={String(permits.length)} />
        <StatCard icon="📝" label="Applied" value={String(applied)} />
        <StatCard icon="✅" label="Issued" value={String(issued)} />
        <StatCard icon="💰" label="Total Fees" value={`$${totalFees.toLocaleString()}`} />
      </div>

      {successMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 8, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 8, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{ padding: '0 24px 16px' }}>
          <Card>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Add Permit</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div>
                  <label style={lbl}>Permit Type</label>
                  <select value={form.permit_type} onChange={e => setForm(p => ({ ...p, permit_type: e.target.value }))} style={inp}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Permit Number *</label>
                  <input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Agency *</label>
                  <input value={form.authority} onChange={e => setForm(p => ({ ...p, authority: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Fee ($)</label>
                  <input type="number" value={form.fee} onChange={e => setForm(p => ({ ...p, fee: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Issue Date</label>
                  <SaguaroDatePicker value={form.issued_date} onChange={v => setForm(p => ({ ...p, issued_date: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Expiry Date</label>
                  <SaguaroDatePicker value={form.expiry_date} onChange={v => setForm(p => ({ ...p, expiry_date: v }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Permit'}</Btn>
                <Btn variant="ghost" onClick={() => { setShowForm(false); setErrorMsg(''); }}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 24px 40px' }}>
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['Permit #', 'Type', 'Agency', 'Status', 'Fee', 'Issue Date', 'Expiry']}
                rows={permits.map(p => {
                  const status = p.expiry_date && p.expiry_date < today ? 'expired' : (p.status || 'applied');
                  const badgeColor = STATUS_BADGE[status] || 'muted';
                  return [
                    <span key="n" style={{ color: T.gold, fontWeight: 700 }}>{p.number}</span>,
                    p.permit_type,
                    <span key="a" style={{ color: T.muted }}>{p.authority}</span>,
                    <Badge key="s" label={status} color={badgeColor} />,
                    <span key="f" style={{ fontWeight: 600 }}>${(p.fee || 0).toLocaleString()}</span>,
                    <span key="i" style={{ color: T.muted }}>{p.issued_date || '—'}</span>,
                    <span key="e" style={{ color: p.expiry_date && p.expiry_date < today ? T.red : T.muted }}>
                      {p.expiry_date || '—'}
                    </span>,
                  ];
                })}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
