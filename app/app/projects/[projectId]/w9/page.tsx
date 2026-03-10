'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

const DEMO_W9S = [
  { id: '1', vendorName: 'ABC Electrical', vendorEmail: 'accounting@abcelec.com', status: 'submitted', createdAt: '2026-02-15', submittedAt: '2026-02-17' },
  { id: '2', vendorName: 'Metro Plumbing LLC', vendorEmail: 'admin@metroplumbing.com', status: 'pending', createdAt: '2026-03-01', submittedAt: null },
  { id: '3', vendorName: 'Western Drywall', vendorEmail: 'office@westerndrywall.com', status: 'pending', createdAt: '2026-03-05', submittedAt: null },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    submitted: { color: '#3dd68c', bg: 'rgba(26,138,74,.15)' },
    pending:   { color: GOLD,      bg: 'rgba(212,160,23,.12)' },
    expired:   { color: '#ef4444', bg: 'rgba(192,48,48,.12)' },
  };
  const s = map[status] || { color: DIM, bg: 'rgba(148,163,184,.1)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {status}
    </span>
  );
}

export default function W9Page() {
  const params = useParams();
  const pid = params['projectId'] as string;
  const [requests, setRequests] = useState(DEMO_W9S);
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function sendRequest() {
    if (!vendorName || !vendorEmail) return;
    setSending(true);
    setSuccess('');
    try {
      const res = await fetch('/api/documents/w9-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'demo', projectId: pid, vendorName, vendorEmail }),
      });
      const data = await res.json();
      setRequests(prev => [{ id: data.requestId || `w9-${Date.now()}`, vendorName, vendorEmail, status: 'pending', createdAt: new Date().toISOString().slice(0,10), submittedAt: null }, ...prev]);
      setSuccess(`W-9 request sent to ${vendorEmail}`);
      setVendorName('');
      setVendorEmail('');
      setShowForm(false);
    } catch {
      setSuccess(`W-9 request created (demo mode)`);
      setRequests(prev => [{ id: `w9-${Date.now()}`, vendorName, vendorEmail, status: 'pending', createdAt: new Date().toISOString().slice(0,10), submittedAt: null }, ...prev]);
      setVendorName('');
      setVendorEmail('');
      setShowForm(false);
    }
    setSending(false);
  }

  const submitted = requests.filter(r => r.status === 'submitted').length;
  const pending   = requests.filter(r => r.status === 'pending').length;

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>W-9 Requests</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Collect W-9 forms from vendors and subcontractors via secure portal</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '9px 18px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          + Send W-9 Request
        </button>
      </div>

      <div style={{ padding: 24 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Requests', value: String(requests.length) },
            { label: 'Submitted',      value: String(submitted), color: '#3dd68c' },
            { label: 'Pending',        value: String(pending),   color: GOLD },
          ].map(k => (
            <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6, letterSpacing: 0.5 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color || TEXT }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Success message */}
        {success && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(26,138,74,.12)', border: '1px solid rgba(61,214,140,.3)', borderRadius: 8, color: '#3dd68c', fontSize: 13 }}>
            ✓ {success}
          </div>
        )}

        {/* New request form */}
        {showForm && (
          <div style={{ marginBottom: 24, background: RAISED, border: `1px solid rgba(212,160,23,.3)`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 14 }}>Send W-9 Request</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Vendor / Sub Name</label>
                <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="ABC Electrical" style={{ width: '100%', padding: '9px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Email Address</label>
                <input value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} placeholder="accounting@vendor.com" type="email" style={{ width: '100%', padding: '9px 12px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 14, padding: '10px 14px', background: 'rgba(212,160,23,.06)', border: '1px solid rgba(212,160,23,.15)', borderRadius: 7 }}>
              📧 The vendor will receive an email with a secure link to submit their W-9 form. You&apos;ll be notified when complete.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={sendRequest} disabled={sending || !vendorName || !vendorEmail} style={{ padding: '9px 20px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: '#0d1117', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: sending || !vendorName || !vendorEmail ? 0.6 : 1 }}>
                {sending ? 'Sending...' : 'Send Request'}
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>W-9 Request Log</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a1117' }}>
                {['Vendor / Sub', 'Email', 'Status', 'Requested', 'Submitted', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: `1px solid rgba(38,51,71,.4)`, background: i % 2 === 0 ? 'transparent' : 'rgba(31,44,62,.3)' }}>
                  <td style={{ padding: '12px 16px', color: TEXT, fontWeight: 600 }}>{r.vendorName}</td>
                  <td style={{ padding: '12px 16px', color: DIM }}>{r.vendorEmail}</td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 16px', color: DIM }}>{r.createdAt}</td>
                  <td style={{ padding: '12px 16px', color: r.submittedAt ? '#3dd68c' : DIM }}>{r.submittedAt || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {r.status === 'pending' && (
                        <button
                          onClick={async () => {
                            await fetch('/api/documents/w9-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: 'demo', projectId: pid, vendorName: r.vendorName, vendorEmail: r.vendorEmail }) });
                            setSuccess(`Reminder sent to ${r.vendorEmail}`);
                          }}
                          style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 5, color: GOLD, cursor: 'pointer' }}
                        >
                          Resend
                        </button>
                      )}
                      {r.status === 'submitted' && (
                        <button style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(26,138,74,.1)', border: '1px solid rgba(61,214,140,.3)', borderRadius: 5, color: '#3dd68c', cursor: 'pointer' }}>
                          📄 Download
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
