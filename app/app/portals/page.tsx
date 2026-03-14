'use client';
import React, { useEffect, useState, useCallback } from 'react';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const GREEN = '#22c55e';
const RED = '#ef4444';
const BLUE = '#3B82F6';
const AMBER = '#F59E0B';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: string; name: string; status: string; }

interface ClientSession {
  id: string; client_name: string; client_email: string; project_id: string;
  token: string; status: string; expires_at: string | null;
  last_accessed_at: string | null; created_at: string; project_name?: string;
}

interface SubSession {
  id: string; sub_id: string; project_id: string; token: string; status: string;
  last_login_at: string | null; created_at: string;
  company_name?: string; contact_name?: string; project_name?: string;
}

type Tab = 'client' | 'sub';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    active:   { bg: 'rgba(34,197,94,0.12)',  color: GREEN },
    inactive: { bg: 'rgba(239,68,68,0.12)',  color: RED },
    expired:  { bg: 'rgba(245,158,11,0.12)', color: AMBER },
  };
  const c = map[status] || map.inactive;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortalsPage() {
  const [tab, setTab] = useState<Tab>('client');
  const [clientSessions, setClientSessions] = useState<ClientSession[]>([]);
  const [subSessions, setSubSessions] = useState<SubSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const emailConfigured = true; // always show resend — API handles missing key gracefully

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteTab, setInviteTab] = useState<Tab>('client');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState<{ url: string; name: string; emailSent?: boolean } | null>(null);

  // Client invite form
  const [clientForm, setClientForm] = useState({ projectId: '', clientName: '', clientEmail: '', expiresInDays: '365' });

  // Sub invite form
  const [subForm, setSubForm] = useState({ projectId: '', companyName: '', contactName: '', email: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, clientRes, subRes] = await Promise.all([
        fetch('/api/projects/list'),
        fetch('/api/portal/client/sessions'),
        fetch('/api/portal/sub/sessions'),
      ]);
      if (projRes.ok) { const d = await projRes.json(); setProjects(d.projects || []); }
      if (clientRes.ok) { const d = await clientRes.json(); setClientSessions(d.sessions || []); }
      if (subRes.ok) { const d = await subRes.json(); setSubSessions(d.sessions || []); }
    } catch { /* non-fatal */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function copyLink(token: string, type: Tab) {
    const path = type === 'client' ? `/portals/client/${token}` : `/portals/subcontractor/${token}`;
    navigator.clipboard.writeText(`${window.location.origin}${path}`).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2200);
    });
  }

  async function revoke(sessionId: string, type: Tab) {
    if (!confirm('Revoke this portal access? The link will stop working immediately.')) return;
    setRevoking(sessionId);
    try {
      await fetch('/api/portal/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, type }) });
      await loadData();
    } catch { /* non-fatal */ }
    setRevoking(null);
  }

  async function resendInvite(sessionId: string, type: Tab) {
    setResending(sessionId);
    setResendMsg(null);
    try {
      const res = await fetch('/api/portal/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, type }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendMsg({ id: sessionId, msg: `Invite resent to ${data.sentTo}`, ok: true });
      } else {
        setResendMsg({ id: sessionId, msg: data.error || 'Failed to resend', ok: false });
      }
      setTimeout(() => setResendMsg(null), 4000);
    } catch {
      setResendMsg({ id: sessionId, msg: 'Connection error', ok: false });
      setTimeout(() => setResendMsg(null), 3000);
    }
    setResending(null);
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    setInviteSuccess(null);

    try {
      const isClient = inviteTab === 'client';
      const url = isClient ? '/api/portal/client/create' : '/api/portal/sub/create';
      const body = isClient ? clientForm : subForm;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error || 'Failed to create portal access');
      } else {
        setInviteSuccess({ url: data.portalUrl, name: isClient ? clientForm.clientName : subForm.companyName, emailSent: data.emailSent });
        if (isClient) setClientForm({ projectId: '', clientName: '', clientEmail: '', expiresInDays: '365' });
        else setSubForm({ projectId: '', companyName: '', contactName: '', email: '' });
        await loadData();
      }
    } catch {
      setInviteError('Connection error. Please try again.');
    }
    setInviteLoading(false);
  }

  const openInvite = (t: Tab) => {
    setInviteTab(t);
    setInviteSuccess(null);
    setInviteError('');
    setShowInvite(true);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui,-apple-system,sans-serif', color: TEXT }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>Portal Access Manager</h1>
          <p style={{ fontSize: 13, color: DIM, margin: '4px 0 0', lineHeight: 1.5 }}>
            Grant and manage portal access for clients and subcontractors. Each person gets a unique secure link.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => openInvite('client')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: `rgba(212,160,23,0.12)`, border: `1px solid rgba(212,160,23,0.3)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
            Invite Client
          </button>
          <button onClick={() => openInvite('sub')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: `rgba(59,130,246,0.12)`, border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 8, color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1={12} y1={5} x2={12} y2={19}/><line x1={5} y1={12} x2={19} y2={12}/></svg>
            Invite Subcontractor
          </button>
        </div>
      </div>

      {/* Workflow explainer */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { n: '1', title: 'Create Access', desc: 'Click Invite Client or Invite Subcontractor above', color: GOLD },
          { n: '2', title: 'Copy the Link', desc: 'Copy the generated portal URL after creating access', color: GOLD },
          { n: '3', title: 'Send to Them', desc: 'Email or text the link — no password needed', color: GOLD },
          { n: '4', title: 'They Log In', desc: 'They go to the link or enter email at the portal login', color: GREEN },
        ].map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: `rgba(212,160,23,0.15)`, border: `1.5px solid rgba(212,160,23,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: GOLD, flexShrink: 0 }}>{s.n}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Sessions table */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
          {(['client', 'sub'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '13px 20px', background: tab === t ? 'rgba(212,160,23,0.05)' : 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? GOLD : 'transparent'}`, color: tab === t ? GOLD : DIM, fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
              {t === 'client'
                ? `Client Access (${clientSessions.filter(s => s.status === 'active').length} active)`
                : `Subcontractor Access (${subSessions.filter(s => s.status === 'active').length} active)`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: DIM, fontSize: 14 }}>Loading sessions…</div>
        ) : tab === 'client' ? (
          <>
            {resendMsg && (
              <div style={{ margin: '0 16px', padding: '10px 14px', background: resendMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${resendMsg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: 8, fontSize: 13, color: resendMsg.ok ? GREEN : RED, marginTop: 12 }}>
                {resendMsg.ok ? '✓ ' : '✗ '}{resendMsg.msg}
              </div>
            )}
            <ClientTable sessions={clientSessions} copied={copied} revoking={revoking} resending={resending} resendMsg={resendMsg} onCopy={copyLink} onRevoke={revoke} onResend={resendInvite} onInvite={() => openInvite('client')} emailConfigured={emailConfigured} />
          </>
        ) : (
          <>
            {resendMsg && (
              <div style={{ margin: '0 16px', padding: '10px 14px', background: resendMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${resendMsg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: 8, fontSize: 13, color: resendMsg.ok ? GREEN : RED, marginTop: 12 }}>
                {resendMsg.ok ? '✓ ' : '✗ '}{resendMsg.msg}
              </div>
            )}
            <SubTable sessions={subSessions} copied={copied} revoking={revoking} resending={resending} resendMsg={resendMsg} onCopy={copyLink} onRevoke={revoke} onResend={resendInvite} onInvite={() => openInvite('sub')} emailConfigured={emailConfigured} />
          </>
        )}
      </div>

      {/* ── Invite Modal ──────────────────────────────────────────────────────── */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowInvite(false); setInviteSuccess(null); } }}>
          <div style={{ width: '100%', maxWidth: 480, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>
                  {inviteTab === 'client' ? 'Invite Client to Portal' : 'Invite Subcontractor to Portal'}
                </div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                  Creates a secure access link for this person
                </div>
              </div>
              <button onClick={() => { setShowInvite(false); setInviteSuccess(null); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
            </div>

            {/* Tab switcher in modal */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
              {(['client', 'sub'] as Tab[]).map(t => (
                <button key={t} onClick={() => { setInviteTab(t); setInviteSuccess(null); setInviteError(''); }}
                  style={{ flex: 1, padding: '10px', background: inviteTab === t ? 'rgba(212,160,23,0.06)' : 'transparent', border: 'none', borderBottom: `2px solid ${inviteTab === t ? GOLD : 'transparent'}`, color: inviteTab === t ? GOLD : DIM, fontSize: 13, fontWeight: inviteTab === t ? 700 : 400, cursor: 'pointer' }}>
                  {t === 'client' ? 'Client Portal' : 'Sub Portal'}
                </button>
              ))}
            </div>

            <div style={{ padding: 20 }}>
              {inviteSuccess ? (
                <SuccessCard url={inviteSuccess.url} name={inviteSuccess.name} type={inviteTab} emailSent={inviteSuccess.emailSent}
                  onAnother={() => setInviteSuccess(null)}
                  onClose={() => { setShowInvite(false); setInviteSuccess(null); }} />
              ) : (
                <form onSubmit={submitInvite}>
                  {/* Project select */}
                  <FormField label="Project">
                    <select
                      value={inviteTab === 'client' ? clientForm.projectId : subForm.projectId}
                      onChange={e => inviteTab === 'client'
                        ? setClientForm(f => ({ ...f, projectId: e.target.value }))
                        : setSubForm(f => ({ ...f, projectId: e.target.value }))}
                      required
                      style={selectStyle}>
                      <option value="">Select a project…</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </FormField>

                  {inviteTab === 'client' ? (
                    <>
                      <FormField label="Client Full Name">
                        <input type="text" value={clientForm.clientName} onChange={e => setClientForm(f => ({ ...f, clientName: e.target.value }))} required placeholder="John Smith" style={inputStyle} />
                      </FormField>
                      <FormField label="Client Email Address">
                        <input type="email" value={clientForm.clientEmail} onChange={e => setClientForm(f => ({ ...f, clientEmail: e.target.value }))} required placeholder="client@company.com" style={inputStyle} />
                      </FormField>
                      <FormField label="Access Expires In">
                        <select value={clientForm.expiresInDays} onChange={e => setClientForm(f => ({ ...f, expiresInDays: e.target.value }))} style={selectStyle}>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="180">6 months</option>
                          <option value="365">1 year</option>
                          <option value="">Never expires</option>
                        </select>
                      </FormField>
                    </>
                  ) : (
                    <>
                      <FormField label="Company Name">
                        <input type="text" value={subForm.companyName} onChange={e => setSubForm(f => ({ ...f, companyName: e.target.value }))} required placeholder="ABC Electrical LLC" style={inputStyle} />
                      </FormField>
                      <FormField label="Contact Name">
                        <input type="text" value={subForm.contactName} onChange={e => setSubForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Jane Doe" style={inputStyle} />
                      </FormField>
                      <FormField label="Email Address">
                        <input type="email" value={subForm.email} onChange={e => setSubForm(f => ({ ...f, email: e.target.value }))} required placeholder="contact@abcelectrical.com" style={inputStyle} />
                      </FormField>
                    </>
                  )}

                  {inviteError && (
                    <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
                      {inviteError}
                    </div>
                  )}

                  <button type="submit" disabled={inviteLoading}
                    style={{ width: '100%', padding: '12px', background: inviteLoading ? 'rgba(212,160,23,0.4)' : `linear-gradient(135deg,${GOLD},#C8960F)`, border: 'none', borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 800, cursor: inviteLoading ? 'not-allowed' : 'pointer' }}>
                    {inviteLoading ? 'Creating Access…' : 'Generate Portal Link →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#0d1117',
  border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 14,
  outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
};

function SuccessCard({ url, name, type, emailSent, onAnother, onClose }: { url: string; name: string; type: Tab; emailSent?: boolean; onAnother: () => void; onClose: () => void; }) {
  const [linkCopied, setLinkCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Portal Access Created!</div>
      <div style={{ fontSize: 13, color: DIM, marginBottom: 12 }}>
        {name} can now access their {type === 'client' ? 'client' : 'subcontractor'} portal.
      </div>

      {/* Email status banner */}
      {emailSent ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, marginBottom: 16, textAlign: 'left' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ flexShrink: 0 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>Invitation email sent automatically</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 16, textAlign: 'left' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ flexShrink: 0 }}><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/></svg>
          <span style={{ fontSize: 12, color: AMBER, fontWeight: 600 }}>Email not sent — add RESEND_API_KEY to Vercel env vars to enable auto-emails</span>
        </div>
      )}

      {/* Link box */}
      <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, textAlign: 'left' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: DIM, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Portal Link</div>
        <div style={{ fontSize: 12, color: DIM, wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 10 }}>{url}</div>
        <button onClick={copyUrl}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: linkCopied ? 'rgba(34,197,94,0.12)' : `rgba(212,160,23,0.12)`, border: `1px solid ${linkCopied ? 'rgba(34,197,94,0.3)' : 'rgba(212,160,23,0.3)'}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: linkCopied ? GREEN : GOLD, cursor: 'pointer' }}>
          {linkCopied
            ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
            : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x={9} y={9} width={13} height={13} rx={2}/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Portal Link</>}
        </button>
      </div>

      <div style={{ fontSize: 12, color: DIM, marginBottom: 16, lineHeight: 1.5 }}>
        Send this link via email or text. They can also log in at<br />
        <a href={type === 'client' ? '/portals/client/login' : '/portals/sub/login'} target="_blank" rel="noreferrer" style={{ color: GOLD }}>
          {type === 'client' ? '/portals/client/login' : '/portals/sub/login'}
        </a> using their email address.
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAnother} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Invite Another
        </button>
        <button onClick={onClose} style={{ flex: 1, padding: '10px', background: `rgba(212,160,23,0.1)`, border: `1px solid rgba(212,160,23,0.25)`, borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Done
        </button>
      </div>
    </div>
  );
}

function ClientTable({ sessions, copied, revoking, resending, resendMsg, onCopy, onRevoke, onResend, onInvite, emailConfigured }:
  { sessions: ClientSession[]; copied: string | null; revoking: string | null; resending: string | null; resendMsg: { id: string; ok: boolean } | null; onCopy: (t: string, type: Tab) => void; onRevoke: (id: string, type: Tab) => void; onResend: (id: string, type: Tab) => void; onInvite: () => void; emailConfigured: boolean; }) {
  if (sessions.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏠</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 6 }}>No client portal access yet</div>
        <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>Create access for a client to get started.</div>
        <button onClick={onInvite} style={{ padding: '10px 20px', background: `rgba(212,160,23,0.12)`, border: `1px solid rgba(212,160,23,0.3)`, borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Invite First Client
        </button>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
            {['Client', 'Project', 'Status', 'Last Access', 'Expires', 'Invite', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={s.id} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 600, color: TEXT }}>{s.client_name}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.client_email}</div>
              </td>
              <td style={{ padding: '12px 16px', color: DIM, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.project_name || '—'}</td>
              <td style={{ padding: '12px 16px' }}><StatusBadge status={s.status} /></td>
              <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>{fmt(s.last_accessed_at)}</td>
              <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>{fmt(s.expires_at)}</td>
              {/* Resend invite column */}
              <td style={{ padding: '12px 16px' }}>
                {s.status === 'active' && (
                  <button onClick={() => onResend(s.id, 'client')} disabled={resending === s.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: resendMsg?.id === s.id && resendMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${resendMsg?.id === s.id && resendMsg.ok ? 'rgba(34,197,94,0.25)' : BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: resendMsg?.id === s.id && resendMsg.ok ? GREEN : DIM, cursor: 'pointer', opacity: resending === s.id ? 0.5 : 1 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {resending === s.id ? 'Sending…' : resendMsg?.id === s.id && resendMsg.ok ? '✓ Sent' : 'Resend Invite'}
                  </button>
                )}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onCopy(s.token, 'client')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: copied === s.token ? 'rgba(34,197,94,0.1)' : 'rgba(212,160,23,0.1)', border: `1px solid ${copied === s.token ? 'rgba(34,197,94,0.25)' : 'rgba(212,160,23,0.25)'}`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: copied === s.token ? GREEN : GOLD, cursor: 'pointer' }}>
                    {copied === s.token ? '✓ Copied' : '⎘ Copy Link'}
                  </button>
                  <a href={`/portals/client/${s.token}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: DIM, textDecoration: 'none' }}>
                    View →
                  </a>
                  {s.status === 'active' && (
                    <button onClick={() => onRevoke(s.id, 'client')} disabled={revoking === s.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5, fontSize: 11, fontWeight: 600, color: RED, cursor: 'pointer', opacity: revoking === s.id ? 0.5 : 1 }}>
                      Revoke
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubTable({ sessions, copied, revoking, resending, resendMsg, onCopy, onRevoke, onResend, onInvite, emailConfigured }:
  { sessions: SubSession[]; copied: string | null; revoking: string | null; resending: string | null; resendMsg: { id: string; ok: boolean } | null; onCopy: (t: string, type: Tab) => void; onRevoke: (id: string, type: Tab) => void; onResend: (id: string, type: Tab) => void; onInvite: () => void; emailConfigured: boolean; }) {
  if (sessions.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👷</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 6 }}>No subcontractor portal access yet</div>
        <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>Create access for a subcontractor to get started.</div>
        <button onClick={onInvite} style={{ padding: '10px 20px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Invite First Subcontractor
        </button>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
            {['Company', 'Project', 'Status', 'Last Login', 'Invite', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={s.id} style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 600, color: TEXT }}>{s.company_name || '—'}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.contact_name}</div>
              </td>
              <td style={{ padding: '12px 16px', color: DIM, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.project_name || '—'}</td>
              <td style={{ padding: '12px 16px' }}><StatusBadge status={s.status} /></td>
              <td style={{ padding: '12px 16px', color: DIM, whiteSpace: 'nowrap' }}>{fmt(s.last_login_at)}</td>
              {/* Resend invite column */}
              <td style={{ padding: '12px 16px' }}>
                {s.status === 'active' && (
                  <button onClick={() => onResend(s.id, 'sub')} disabled={resending === s.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: resendMsg?.id === s.id && resendMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${resendMsg?.id === s.id && resendMsg.ok ? 'rgba(34,197,94,0.25)' : BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: resendMsg?.id === s.id && resendMsg.ok ? GREEN : DIM, cursor: 'pointer', opacity: resending === s.id ? 0.5 : 1 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {resending === s.id ? 'Sending…' : resendMsg?.id === s.id && resendMsg.ok ? '✓ Sent' : 'Resend Invite'}
                  </button>
                )}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onCopy(s.token, 'sub')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: copied === s.token ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${copied === s.token ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.25)'}`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: copied === s.token ? GREEN : BLUE, cursor: 'pointer' }}>
                    {copied === s.token ? '✓ Copied' : '⎘ Copy Link'}
                  </button>
                  <a href={`/portals/subcontractor/${s.token}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: DIM, textDecoration: 'none' }}>
                    View →
                  </a>
                  {s.status === 'active' && (
                    <button onClick={() => onRevoke(s.id, 'sub')} disabled={revoking === s.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5, fontSize: 11, fontWeight: 600, color: RED, cursor: 'pointer', opacity: revoking === s.id ? 0.5 : 1 }}>
                      Revoke
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
