'use client';
import React, { useEffect, useState } from 'react';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#22c55e';
const BLUE = '#3B82F6';

interface ClientSession {
  id: string;
  client_name: string;
  client_email: string;
  project_id: string;
  token: string;
  status: string;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  project_name?: string;
}

interface SubSession {
  id: string;
  sub_id: string;
  project_id: string;
  token: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  company_name?: string;
  contact_name?: string;
  project_name?: string;
}

export default function PortalsPage() {
  const [clientSessions, setClientSessions] = useState<ClientSession[]>([]);
  const [subSessions, setSubSessions] = useState<SubSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'client' | 'sub'>('client');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const [clientRes, subRes] = await Promise.all([
        fetch('/api/portal/client/sessions'),
        fetch('/api/portal/sub/sessions'),
      ]);
      if (clientRes.ok) {
        const data = await clientRes.json();
        setClientSessions(data.sessions || []);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setSubSessions(data.sessions || []);
      }
    } catch { /* non-fatal */ }
    setLoading(false);
  }

  function copyLink(token: string, type: 'client' | 'sub') {
    const path = type === 'client'
      ? `/portals/client/${token}`
      : `/portals/subcontractor/${token}`;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      active:   { bg: 'rgba(34,197,94,0.12)',  color: GREEN },
      inactive: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
      expired:  { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
    };
    const c = colors[status] || colors.inactive;
    return (
      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui,-apple-system,sans-serif', color: TEXT }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Portal Management</h1>
        <p style={{ fontSize: 14, color: DIM, margin: '6px 0 0' }}>
          Manage client and subcontractor portal access links. Share these links so clients and subs can access their dedicated portals.
        </p>
      </div>

      {/* Quick access cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Client Portal</div>
              <div style={{ fontSize: 12, color: DIM }}>Project owners &amp; clients</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: DIM, margin: '0 0 14px', lineHeight: 1.5 }}>
            Clients see project status, approve change orders &amp; pay apps, view financials, and communicate with your team.
          </p>
          <a href="/portals/client/login" target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: GOLD, textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Preview Login Page
          </a>
        </div>

        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Subcontractor Portal</div>
              <div style={{ fontSize: 12, color: DIM }}>Subs, suppliers &amp; vendors</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: DIM, margin: '0 0 14px', lineHeight: 1.5 }}>
            Subs manage bids, submit daily logs &amp; pay apps, upload compliance docs, and track their performance scorecard.
          </p>
          <a href="/portals/sub/login" target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: BLUE, textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Preview Login Page
          </a>
        </div>
      </div>

      {/* Sessions table */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
          {(['client', 'sub'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '14px 20px', background: tab === t ? 'rgba(212,160,23,0.06)' : 'transparent', border: 'none', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t ? GOLD : DIM, fontSize: 14, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
              {t === 'client' ? `Client Sessions (${clientSessions.length})` : `Subcontractor Sessions (${subSessions.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: DIM }}>Loading portal sessions…</div>
        ) : tab === 'client' ? (
          clientSessions.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏠</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>No client sessions yet</div>
              <div style={{ fontSize: 13, color: DIM }}>Client portal links are generated from individual project pages when you invite a client.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                    {['Client', 'Project', 'Status', 'Last Access', 'Expires', 'Portal Link'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientSessions.map((s, i) => (
                    <tr key={s.id} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: TEXT }}>{s.client_name}</div>
                        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.client_email}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: DIM }}>{s.project_name || s.project_id.slice(0, 8) + '…'}</td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge(s.status)}</td>
                      <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>{formatDate(s.last_accessed_at)}</td>
                      <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>{formatDate(s.expires_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => copyLink(s.token, 'client')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: copied === s.token ? 'rgba(34,197,94,0.1)' : 'rgba(212,160,23,0.1)', border: `1px solid ${copied === s.token ? 'rgba(34,197,94,0.25)' : 'rgba(212,160,23,0.25)'}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: copied === s.token ? GREEN : GOLD, cursor: 'pointer' }}>
                            {copied === s.token ? '✓ Copied' : '⎘ Copy Link'}
                          </button>
                          <a href={`/portals/client/${s.token}`} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: DIM, textDecoration: 'none' }}>
                            Open →
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          subSessions.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👷</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>No subcontractor sessions yet</div>
              <div style={{ fontSize: 13, color: DIM }}>Sub portal links are generated from bid packages when you invite a subcontractor.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                    {['Company', 'Project', 'Status', 'Last Login', 'Portal Link'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subSessions.map((s, i) => (
                    <tr key={s.id} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: TEXT }}>{s.company_name || '—'}</div>
                        <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.contact_name}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: DIM }}>{s.project_name || s.project_id.slice(0, 8) + '…'}</td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge(s.status)}</td>
                      <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>{formatDate(s.last_login_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => copyLink(s.token, 'sub')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: copied === s.token ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${copied === s.token ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.25)'}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: copied === s.token ? GREEN : BLUE, cursor: 'pointer' }}>
                            {copied === s.token ? '✓ Copied' : '⎘ Copy Link'}
                          </button>
                          <a href={`/portals/subcontractor/${s.token}`} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: DIM, textDecoration: 'none' }}>
                            Open →
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div style={{ marginTop: 16, padding: 14, background: 'rgba(212,160,23,0.06)', border: `1px solid rgba(212,160,23,0.15)`, borderRadius: 8, fontSize: 12, color: DIM, lineHeight: 1.6 }}>
        <strong style={{ color: TEXT }}>How portal access works:</strong> Portal links are created automatically when you invite a client or subcontractor to a project. Each link contains a unique secure token. Share the link via email — recipients click it to access their portal with no password required.
      </div>
    </div>
  );
}
