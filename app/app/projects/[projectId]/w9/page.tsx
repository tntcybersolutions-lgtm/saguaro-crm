'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageWrap, SectionHeader, StatCard, Badge, Btn, Card, CardHeader, CardBody, Table, T } from '@/components/ui/shell';

interface W9Sub {
  id: string;
  name: string;
  email: string;
  w9_status: string;
  requested_date: string | null;
  received_date: string | null;
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'muted'> = {
  received: 'green',
  pending: 'amber',
  not_requested: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  submitted: 'Received',
  pending: 'Pending',
  not_requested: 'Not Requested',
};

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 };

export default function W9Page() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [subs, setSubs] = useState<W9Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const project = data.project || data;
      const subList = project.subcontractors || project.subs || [];
      setSubs(subList.map((s: any) => ({
        id: s.id || s.sub_id || `s-${Math.random()}`,
        name: s.name || s.company_name || '',
        email: s.email || s.contact_email || '',
        w9_status: s.w9_status || 'not_requested',
        requested_date: s.w9_requested_date || null,
        received_date: s.w9_received_date || null,
      })));
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const totalSubs = subs.length;
  const receivedCount = subs.filter(s => s.w9_status === 'received' || s.w9_status === 'submitted').length;
  const pendingCount = subs.filter(s => s.w9_status === 'pending').length;
  const missingCount = subs.filter(s => s.w9_status === 'not_requested').length;

  async function requestW9(subId: string, subName: string) {
    setRequestingId(subId);
    try {
      await fetch('/api/documents/w9-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subId }),
      });
      setSubs(prev => prev.map(s => s.id === subId ? { ...s, w9_status: 'pending', requested_date: new Date().toISOString().split('T')[0] } : s));
      setToast(`W-9 request sent to ${subName}.`);
    } catch {
      setToast(`Failed to send W-9 request to ${subName}.`);
    }
    setRequestingId(null);
    setTimeout(() => setToast(''), 4000);
  }

  async function sendNewRequest() {
    if (!formName.trim() || !formEmail.trim()) return;
    setSending(true);
    try {
      await fetch('/api/documents/w9-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, vendorName: formName, vendorEmail: formEmail }),
      });
      setSubs(prev => [
        ...prev,
        { id: `s-${Date.now()}`, name: formName, email: formEmail, w9_status: 'pending', requested_date: new Date().toISOString().split('T')[0], received_date: null },
      ]);
      setToast(`W-9 request sent to ${formEmail}.`);
      setFormName('');
      setFormEmail('');
      setShowForm(false);
    } catch {
      setToast('Failed to send W-9 request.');
    }
    setSending(false);
    setTimeout(() => setToast(''), 4000);
  }

  return (
    <PageWrap>
      <div style={{ padding: 24 }}>
        <SectionHeader
          title="W-9 Requests"
          sub="Collect W-9 forms from vendors and subcontractors"
          action={<Btn onClick={() => setShowForm(p => !p)}>{showForm ? 'Cancel' : '+ Send W-9 Request'}</Btn>}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          <StatCard icon="👥" label="Total Subs" value={String(totalSubs)} />
          <StatCard icon="✅" label="W9 Received" value={String(receivedCount)} />
          <StatCard icon="⏳" label="W9 Pending" value={String(pendingCount)} />
          <StatCard icon="❌" label="W9 Missing" value={String(missingCount)} />
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 8, color: T.green, fontSize: 13 }}>
            {toast}
          </div>
        )}

        {/* Send Form */}
        {showForm && (
          <Card style={{ marginBottom: 24, borderColor: T.borderGold }}>
            <CardHeader><span style={{ fontWeight: 700, color: T.white }}>Send W-9 Request</span></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Vendor / Sub Name *</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="ABC Electrical LLC" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Email Address *</label>
                  <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="accounting@vendor.com" style={inp} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 12, padding: '10px 14px', background: T.goldDim, border: `1px solid ${T.borderGold}`, borderRadius: 8 }}>
                The vendor will receive an email with a secure link to submit their W-9 form.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Btn onClick={sendNewRequest} disabled={sending || !formName.trim() || !formEmail.trim()}>
                  {sending ? 'Sending...' : 'Send Request'}
                </Btn>
                <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardHeader><span style={{ fontWeight: 700, color: T.white }}>W-9 Status</span></CardHeader>
          <CardBody style={{ padding: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>Loading...</div>
            ) : subs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.white, marginBottom: 8 }}>No subcontractors found</div>
                <div style={{ fontSize: 13, marginBottom: 16 }}>Send a W-9 request to get started.</div>
                <Btn onClick={() => setShowForm(true)}>+ Send First W-9 Request</Btn>
              </div>
            ) : (
              <Table
                headers={['Sub Name', 'Email', 'W9 Status', 'Requested Date', 'Received Date', 'Actions']}
                rows={subs.map(s => [
                  <span key="n" style={{ fontWeight: 600 }}>{s.name}</span>,
                  <span key="e" style={{ color: T.muted }}>{s.email}</span>,
                  <Badge key="st" label={STATUS_LABEL[s.w9_status] || s.w9_status} color={STATUS_BADGE[s.w9_status] || 'muted'} />,
                  <span key="rd" style={{ color: T.muted }}>{s.requested_date || '---'}</span>,
                  <span key="rv" style={{ color: s.received_date ? T.green : T.muted }}>{s.received_date || '---'}</span>,
                  <div key="act">
                    {(s.w9_status === 'not_requested' || s.w9_status === 'pending') && (
                      <Btn size="sm" variant="ghost" onClick={() => requestW9(s.id, s.name)} disabled={requestingId === s.id}>
                        {requestingId === s.id ? 'Sending...' : s.w9_status === 'pending' ? 'Resend' : 'Request W-9'}
                      </Btn>
                    )}
                    {(s.w9_status === 'received' || s.w9_status === 'submitted') && (
                      <span style={{ fontSize: 12, color: T.green, fontWeight: 600 }}>Submitted</span>
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
