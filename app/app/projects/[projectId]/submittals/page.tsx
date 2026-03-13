'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface Submittal {
  id: string;
  number: string;
  description: string;
  spec_section: string;
  submitted_by: string;
  submitted_date: string;
  required_by: string;
  status: string;
  days_in_review: number;
  project_id: string;
}

const STATUS_BADGE: Record<string, 'muted' | 'blue' | 'amber' | 'green' | 'red' | 'gold'> = {
  pending: 'muted',
  submitted: 'blue',
  under_review: 'amber',
  approved: 'green',
  rejected: 'red',
  revise_resubmit: 'gold',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  revise_resubmit: 'Revise & Resubmit',
};

const EMPTY_FORM = { description: '', spec_section: '', submitted_by: '', required_by: '' };

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

export default function SubmittalsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [respondId, setRespondId] = useState<string | null>(null);
  const [respondStatus, setRespondStatus] = useState('approved');

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

  const total = submittals.length;
  const pending = submittals.filter(s => ['pending', 'submitted', 'under_review'].includes(s.status)).length;
  const approved = submittals.filter(s => s.status === 'approved').length;
  const overdue = submittals.filter(s => s.required_by < today && !['approved', 'rejected'].includes(s.status)).length;

  async function handleSave() {
    if (!form.description || !form.spec_section) return;
    setSaving(true);
    const num = `S-${String(submittals.length + 1).padStart(3, '0')}`;
    try {
      const res = await fetch('/api/submittals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, number: num, submitted_date: today, status: 'submitted', days_in_review: 0, ...form }),
      });
      const json = await res.json();
      setSubmittals(prev => [json.submittal || { id: `sub-${Date.now()}`, project_id: projectId, number: num, submitted_date: today, status: 'submitted', days_in_review: 0, ...form }, ...prev]);
    } catch {
      setSubmittals(prev => [{ id: `sub-${Date.now()}`, project_id: projectId, number: num, submitted_date: today, status: 'submitted', days_in_review: 0, ...form }, ...prev]);
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    setToast('Submittal created.');
    setTimeout(() => setToast(''), 4000);
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
    setToast(`Submittal ${STATUS_LABEL[respondStatus] || respondStatus}.`);
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="Submittals"
          sub="Shop drawings, product data, and submittals log"
          action={<Btn onClick={() => setShowForm(p => !p)}>+ New Submittal</Btn>}
        />

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="📋" label="Total" value={String(total)} />
          <StatCard icon="⏳" label="Pending" value={String(pending)} />
          <StatCard icon="✅" label="Approved" value={String(approved)} />
          <StatCard icon="🚨" label="Overdue" value={String(overdue)} />
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <Card style={{ marginBottom: 24, borderColor: T.borderGold }}>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>New Submittal</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>Description *</label>
                  <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Spec Section *</label>
                  <input type="text" value={form.spec_section} onChange={e => setForm(p => ({ ...p, spec_section: e.target.value }))} placeholder="e.g. 03 31 00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Subcontractor</label>
                  <input type="text" value={form.submitted_by} onChange={e => setForm(p => ({ ...p, submitted_by: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Due Date</label>
                  <input type="date" value={form.required_by} onChange={e => setForm(p => ({ ...p, required_by: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Submittal'}</Btn>
                <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : (
              <Table
                headers={['#', 'Spec Section', 'Description', 'Sub', 'Status', 'Due Date', 'Returned', 'Actions']}
                rows={submittals.map(s => [
                  <span key="n" style={{ color: T.gold, fontWeight: 700 }}>{s.number}</span>,
                  <span key="ss" style={{ color: T.muted }}>{s.spec_section}</span>,
                  s.description,
                  <span key="sb" style={{ color: T.muted }}>{s.submitted_by}</span>,
                  <Badge key="st" label={STATUS_LABEL[s.status] || s.status} color={STATUS_BADGE[s.status] || 'muted'} />,
                  <span key="dd" style={{ color: s.required_by < today && !['approved', 'rejected'].includes(s.status) ? T.red : T.muted, whiteSpace: 'nowrap' }}>{s.required_by || '---'}</span>,
                  <span key="sd" style={{ color: T.muted }}>{s.submitted_date}</span>,
                  <div key="act" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {['submitted', 'under_review'].includes(s.status) && respondId !== s.id && (
                      <Btn size="sm" variant="ghost" onClick={() => { setRespondId(s.id); setRespondStatus('approved'); }}>Respond</Btn>
                    )}
                    {respondId === s.id && (
                      <>
                        <select value={respondStatus} onChange={e => setRespondStatus(e.target.value)} style={{ padding: '4px 8px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.white, fontSize: 12 }}>
                          <option value="approved">Approved</option>
                          <option value="revise_resubmit">Revise & Resubmit</option>
                          <option value="rejected">Rejected</option>
                        </select>
                        <Btn size="sm" onClick={() => handleRespond(s.id)}>Submit</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setRespondId(null)}>X</Btn>
                      </>
                    )}
                  </div>,
                ])}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </PageWrap>
  );
}
