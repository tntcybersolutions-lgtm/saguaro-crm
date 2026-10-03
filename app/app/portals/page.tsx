'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjects } from '@/lib/hooks/useProjects';
import { CheckCircle, XCircle, X, ArrowRight, Plus, House, HardHat, Copy, ShareNetwork, ListNumbers } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, AutoChip, goldButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1';
const TEXT = '#FFFFFF';
const GREEN = '#2CFF7A';
const RED = '#FF3B30';
const BLUE = 'var(--brand-primary)';
const AMBER = 'var(--warning)';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: string; name: string; status: string; }

interface ClientSession {
  id: string; client_name: string; client_email: string; project_id: string;
  token: string; status: string; expires_at: string | null;
  /* The column, and what /api/portal/client/sessions returns, is
     last_login_at — the sub table two hundred lines below reads that name
     correctly. The client side asked for last_accessed_at, which is on no
     payload, so every client portal reported "Never opened" however recently
     the client had been in, the Never Opened tile counted all of them, and
     Last Portal Visit ignored client activity entirely. */
  last_login_at: string | null; last_accessed_at?: string | null; created_at: string; project_name?: string;
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

/* Real address check — both the invite email and the portal login key off it. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    active:   { bg: 'rgba(44,255,122,0.12)',  color: GREEN },
    inactive: { bg: 'rgba(255,59,48,0.12)',  color: RED },
    expired:  { bg: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: AMBER },
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

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showInvite, { clientForm, subForm, inviteTab });
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: 'portal-invite',
    draftData: { clientForm, subForm, inviteTab },
    restoreDraft: (d) => { const v = d as { clientForm: typeof clientForm; subForm: typeof subForm; inviteTab: Tab }; setClientForm(v.clientForm); setSubForm(v.subForm); setInviteTab(v.inviteTab); setShowInvite(true); },
  });

  // True when the project select was prefilled (single-project tenant) — drives the AUTO chip.
  const [autoProj, setAutoProj] = useState(false);

  const { projects: liveProjects } = useProjects();
  useEffect(() => { setProjects(liveProjects as any); }, [liveProjects]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientRes, subRes] = await Promise.all([
        fetch('/api/portal/client/sessions'),
        fetch('/api/portal/sub/sessions'),
      ]);
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
    if (!(await confirmDialog({ title: 'Please confirm', message: 'Revoke this portal access? The link will stop working immediately.', danger: true }))) return;
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

    // Validate the address before anything leaves the browser — the invite
    // email AND the passwordless portal login both key off it.
    const email = (inviteTab === 'client' ? clientForm.clientEmail : subForm.email).trim();
    if (!EMAIL_RE.test(email)) {
      setInviteError('Enter a valid email address — the invite and the portal login both use it.');
      return;
    }

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
    // Single-project tenant: the project choice is a foregone conclusion — prefill it.
    if (projects.length === 1) {
      const pid = projects[0].id;
      setClientForm(f => (f.projectId ? f : { ...f, projectId: pid }));
      setSubForm(f => (f.projectId ? f : { ...f, projectId: pid }));
      setAutoProj(true);
    } else {
      setAutoProj(false);
    }
    setShowInvite(true);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  // Derived counts for the KPI row (presentation only — uses already-fetched data)
  const clientActive = clientSessions.filter(s => s.status === 'active').length;
  const subActive = subSessions.filter(s => s.status === 'active').length;

  // ── Portal intelligence (derived from already-fetched sessions/projects) ──
  const activeClientSessions = clientSessions.filter(s => s.status === 'active');
  const activeSubSessions = subSessions.filter(s => s.status === 'active');
  const coveredProjects = new Set([
    ...activeClientSessions.map(s => s.project_id),
    ...activeSubSessions.map(s => s.project_id),
  ]).size;
  const neverOpened = activeClientSessions.filter(s => !(s.last_login_at ?? s.last_accessed_at)).length
    + activeSubSessions.filter(s => !s.last_login_at).length;
  const expiring30 = activeClientSessions.filter(s => {
    if (!s.expires_at) return false;
    const t = new Date(s.expires_at).getTime();
    return t > Date.now() && t - Date.now() <= 30 * 86400000;
  }).length;
  const lastVisitTs = Math.max(0,
    ...clientSessions.map(s => { const v = s.last_login_at ?? s.last_accessed_at; return v ? new Date(v).getTime() : 0; }),
    ...subSessions.map(s => (s.last_login_at ? new Date(s.last_login_at).getTime() : 0)));
  const totalLinks = clientSessions.length + subSessions.length;

  return (
    <>
    <PremiumSurface maxWidth={2200}>

      {/* Header */}
      <ModuleHero
        eyebrow="Portal Access"
        eyebrowIcon={<ShareNetwork size={13} weight="fill" color={GOLD} />}
        title="Portal Access"
        accent="Manager"
        subtitle="Portal access for clients and subs. Each gets a unique link."
        actions={<>
          <button data-tour="invite-client" onClick={() => openInvite('client')} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> Invite Client
          </button>
          <button onClick={() => openInvite('sub')} style={goldOutlineButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> Invite Subcontractor
          </button>
        </>}
      />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Active Client Portals" value={loading ? '—' : String(clientActive)} sub="Clients with access" accent={GOLD} icon={<House size={19} weight="duotone" color={GOLD} />}  href="/app/portals"/>
        <StatCard label="Active Sub Portals" value={loading ? '—' : String(subActive)} sub="Subcontractors with access" accent={GOLD} icon={<HardHat size={19} weight="duotone" color={GOLD} />}  href="/app/portals"/>
        <StatCard label="Total Active Links" value={loading ? '—' : String(clientActive + subActive)} sub="Secure portal links live" accent={GREEN} icon={<ShareNetwork size={19} weight="duotone" color={GREEN} />}  href="/app/portals"/>
      </div>

      {/* Portal intelligence strip — coverage, engagement, and expiry pressure */}
      {!loading && totalLinks > 0 && (
        <StatStrip items={[
          {href: '/app/portals', 
            label: 'Projects Covered', value: `${coveredProjects} of ${projects.length}`,
            sub: coveredProjects < projects.length ? `${projects.length - coveredProjects} project${projects.length - coveredProjects === 1 ? '' : 's'} without portal access` : 'Every project has a live portal',
            accent: projects.length > 0 && coveredProjects < projects.length ? GOLD : GREEN,
          },
          {href: '/app/portals', 
            label: 'Never Opened', value: String(neverOpened),
            accent: neverOpened > 0 ? AMBER : GREEN,
            sub: neverOpened > 0 ? 'Links sent but never visited — resend the invite' : 'Every active link has been visited',
          },
          {href: '/app/portals', 
            label: 'Expiring in 30 Days', value: String(expiring30),
            accent: expiring30 > 0 ? RED : GREEN,
            sub: expiring30 > 0 ? 'Client links auto-expire — reinvite to extend' : 'No client links expiring soon',
          },
          {href: '/app/portals', 
            label: 'Last Portal Visit', value: lastVisitTs > 0 ? fmt(new Date(lastVisitTs).toISOString()) : '—',
            sub: 'Most recent client or sub activity',
          },
          {href: '/app/portals', 
            label: 'Links Issued', value: String(totalLinks),
            sub: `${clientSessions.length} client · ${subSessions.length} sub`,
          },
        ]} />
      )}

      {/* Workflow explainer */}
      <SectionCard flat title="How Portal Access Works" icon={<ListNumbers size={17} weight="duotone" color={GOLD} />} style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { n: '1', title: 'Create Access', desc: 'Click Invite Client or Invite Subcontractor above', color: GOLD },
            { n: '2', title: 'Copy the Link', desc: 'Copy the generated portal URL after creating access', color: GOLD },
            { n: '3', title: 'Send to Them', desc: 'Email or text the link — no password needed', color: GOLD },
            { n: '4', title: 'They Log In', desc: 'They go to the link or enter email at the portal login', color: GREEN },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `var(--brand-primary-18)`, border: `1.5px solid var(--brand-primary-25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: GOLD, flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: DIM, lineHeight: 1.4 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Sessions table */}
      <SectionCard flush>
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
          {(['client', 'sub'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '13px 20px', background: tab === t ? 'color-mix(in srgb, var(--brand-primary) 5%, transparent)' : 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? GOLD : 'transparent'}`, color: tab === t ? GOLD : DIM, fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
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
              <div style={{ margin: '0 16px', padding: '10px 14px', background: resendMsg.ok ? 'rgba(44,255,122,0.1)' : 'rgba(255,59,48,0.1)', border: `1px solid ${resendMsg.ok ? 'rgba(44,255,122,0.25)' : 'rgba(255,59,48,0.25)'}`, borderRadius: 8, fontSize: 13, color: resendMsg.ok ? GREEN : RED, marginTop: 12 }}>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }}>{resendMsg.ok ? <CheckCircle size={14} weight="fill" color={GREEN} /> : <XCircle size={14} weight="fill" color={RED} />}</span>{resendMsg.msg}
              </div>
            )}
            <ClientTable sessions={clientSessions} copied={copied} revoking={revoking} resending={resending} resendMsg={resendMsg} onCopy={copyLink} onRevoke={revoke} onResend={resendInvite} onInvite={() => openInvite('client')} emailConfigured={emailConfigured} />
          </>
        ) : (
          <>
            {resendMsg && (
              <div style={{ margin: '0 16px', padding: '10px 14px', background: resendMsg.ok ? 'rgba(44,255,122,0.1)' : 'rgba(255,59,48,0.1)', border: `1px solid ${resendMsg.ok ? 'rgba(44,255,122,0.25)' : 'rgba(255,59,48,0.25)'}`, borderRadius: 8, fontSize: 13, color: resendMsg.ok ? GREEN : RED, marginTop: 12 }}>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }}>{resendMsg.ok ? <CheckCircle size={14} weight="fill" color={GREEN} /> : <XCircle size={14} weight="fill" color={RED} />}</span>{resendMsg.msg}
              </div>
            )}
            <SubTable sessions={subSessions} copied={copied} revoking={revoking} resending={resending} resendMsg={resendMsg} onCopy={copyLink} onRevoke={revoke} onResend={resendInvite} onInvite={() => openInvite('sub')} emailConfigured={emailConfigured} />
          </>
        )}
      </SectionCard>

    </PremiumSurface>

      {/* ── Invite Modal ──────────────────────────────────────────────────────── */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowInvite(false); setInviteSuccess(null); } }}>
          <div style={{ width: '100%', maxWidth: 480, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>

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
              <button onClick={() => { setShowInvite(false); setInviteSuccess(null); }} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4, display: 'inline-flex', alignItems: 'center' }}><X size={20} weight="regular" color={DIM} /></button>
            </div>

            {/* Tab switcher in modal */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
              {(['client', 'sub'] as Tab[]).map(t => (
                <button key={t} onClick={() => { setInviteTab(t); setInviteSuccess(null); setInviteError(''); }}
                  style={{ flex: 1, padding: '10px', background: inviteTab === t ? 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' : 'transparent', border: 'none', borderBottom: `2px solid ${inviteTab === t ? GOLD : 'transparent'}`, color: inviteTab === t ? GOLD : DIM, fontSize: 13, fontWeight: inviteTab === t ? 700 : 400, cursor: 'pointer' }}>
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
                  <FormField label={<>Project{autoProj && <AutoChip />}</>}>
                    <select
                      value={inviteTab === 'client' ? clientForm.projectId : subForm.projectId}
                      onChange={e => {
                        setAutoProj(false);
                        const v = e.target.value;
                        if (inviteTab === 'client') setClientForm(f => ({ ...f, projectId: v }));
                        else setSubForm(f => ({ ...f, projectId: v }));
                      }}
                      required
                      style={selectStyle}>
                      <option value="">Select a project…</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {autoProj && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Your only project — preselected. The portal shows this project only.</div>}
                  </FormField>

                  {inviteTab === 'client' ? (
                    <>
                      <FormField label="Client Full Name">
                        <input type="text" value={clientForm.clientName} onChange={e => setClientForm(f => ({ ...f, clientName: e.target.value }))} required placeholder="John Smith" style={inputStyle} />
                      </FormField>
                      <FormField label="Client Email Address">
                        <input type="email" value={clientForm.clientEmail} onChange={e => setClientForm(f => ({ ...f, clientEmail: e.target.value }))} required placeholder="client@company.com" style={inputStyle} />
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>The invite is emailed here — and they can log in with this address, no password.</div>
                      </FormField>
                      <FormField label="Access Expires In">
                        <select value={clientForm.expiresInDays} onChange={e => setClientForm(f => ({ ...f, expiresInDays: e.target.value }))} style={selectStyle}>
                          <option value="30">30 Days</option>
                          <option value="90">90 Days</option>
                          <option value="180">6 Months</option>
                          <option value="365">1 Year</option>
                          <option value="">Never Expires</option>
                        </select>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>The link stops working after this date. You can revoke or reinvite at any time.</div>
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
                    <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
                      {inviteError}
                    </div>
                  )}

                  <button type="submit" disabled={inviteLoading} className="btn-gold"
                    style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, cursor: inviteLoading ? 'not-allowed' : 'pointer' }}>
                    {inviteLoading ? 'Creating Access…' : <>Generate Portal Link <ArrowRight size={16} weight="regular" color="#000" style={{ display: 'inline-flex', verticalAlign: 'middle' }} /></>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      <UnsavedGuardModal guard={guard} />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.05)',
  border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--bg-surface-2)',
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
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(44,255,122,0.12)', border: '1.5px solid rgba(44,255,122,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Portal Access Created</div>
      <div style={{ fontSize: 13, color: DIM, marginBottom: 12 }}>
        {name} can now access their {type === 'client' ? 'client' : 'subcontractor'} portal.
      </div>

      {/* Email status banner */}
      {emailSent ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(44,255,122,0.08)', border: '1px solid rgba(44,255,122,0.2)', borderRadius: 8, marginBottom: 16, textAlign: 'left' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ flexShrink: 0 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>Invitation email sent automatically.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'color-mix(in srgb, var(--warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 18%, transparent)', borderRadius: 8, marginBottom: 16, textAlign: 'left' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} style={{ flexShrink: 0 }}><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><line x1={12} y1={16} x2={12.01} y2={16}/></svg>
          <span style={{ fontSize: 12, color: AMBER, fontWeight: 600 }}>Email not sent automatically — copy the portal link below and share it directly.</span>
        </div>
      )}

      {/* Link box */}
      <div style={{ background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, textAlign: 'left' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 6 }}>Portal Link</div>
        <div style={{ fontSize: 12, color: DIM, wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 10 }}>{url}</div>
        <button onClick={copyUrl}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: linkCopied ? 'rgba(44,255,122,0.12)' : `var(--brand-primary-12)`, border: `1px solid ${linkCopied ? 'rgba(44,255,122,0.3)' : 'var(--brand-primary-25)'}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: linkCopied ? GREEN : GOLD, cursor: 'pointer' }}>
          {linkCopied
            ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="20 6 9 17 4 12"/></svg> Copied</>
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
        <button onClick={onAnother} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} weight="regular" color={DIM} /> Invite Another
        </button>
        <button onClick={onClose} style={{ flex: 1, padding: '10px', background: `var(--brand-primary-12)`, border: `1px solid var(--brand-primary-25)`, borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
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
      <PremiumEmpty
        icon={<House size={30} weight="duotone" color={GOLD} />}
        title="No client portal access yet"
        description="Give an owner a secure, no-password window into their project — progress, schedule, photos, and invoices — through one link you can revoke at any time. The invitation email sends itself."
        action={<button onClick={onInvite} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Invite First Client</button>}
      />
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-surface-2)' }}>
            {['Client', 'Project', 'Status', 'Last Access', 'Expires', 'Invite', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{h}</th>
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
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{(s.last_login_at ?? s.last_accessed_at) ? <span style={{ color: DIM }}>{fmt((s.last_login_at ?? s.last_accessed_at) as string)}</span> : s.status === 'active' ? <span style={{ color: AMBER, fontWeight: 600 }}>Never Opened</span> : <span style={{ color: DIM }}>—</span>}</td>
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{(() => { if (!s.expires_at) return <span style={{ color: DIM }}>Never</span>; const dl = Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 86400000); return <span style={{ color: dl <= 0 ? RED : dl <= 30 ? AMBER : DIM, fontWeight: dl <= 30 ? 600 : 400 }}>{fmt(s.expires_at)}{dl <= 0 ? ' · expired' : dl <= 30 ? ` · ${dl}d left` : ''}</span>; })()}</td>
              {/* Resend invite column */}
              <td style={{ padding: '12px 16px' }}>
                {s.status === 'active' && (
                  <button onClick={() => onResend(s.id, 'client')} disabled={resending === s.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: resendMsg?.id === s.id && resendMsg.ok ? 'rgba(44,255,122,0.1)' : 'rgba(0,0,0,0.04)', border: `1px solid ${resendMsg?.id === s.id && resendMsg.ok ? 'rgba(44,255,122,0.25)' : BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: resendMsg?.id === s.id && resendMsg.ok ? GREEN : DIM, cursor: 'pointer', opacity: resending === s.id ? 0.5 : 1 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {resending === s.id ? 'Sending…' : resendMsg?.id === s.id && resendMsg.ok ? <><CheckCircle size={11} weight="fill" color={GREEN} /> Sent</> : 'Resend Invite'}
                  </button>
                )}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onCopy(s.token, 'client')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: copied === s.token ? 'rgba(44,255,122,0.1)' : 'var(--brand-primary-12)', border: `1px solid ${copied === s.token ? 'rgba(44,255,122,0.25)' : 'var(--brand-primary-25)'}`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: copied === s.token ? GREEN : GOLD, cursor: 'pointer' }}>
                    {copied === s.token ? <><CheckCircle size={11} weight="fill" color={GREEN} /> Copied</> : <><Copy size={11} weight="regular" color={GOLD} /> Copy Link</>}
                  </button>
                  <a href={`/portals/client/${s.token}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: DIM, textDecoration: 'none' }}>
                    View <ArrowRight size={11} weight="regular" color={DIM} style={{ display: 'inline-flex', verticalAlign: 'middle' }} />
                  </a>
                  {s.status === 'active' && (
                    <button onClick={() => onRevoke(s.id, 'client')} disabled={revoking === s.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 5, fontSize: 11, fontWeight: 600, color: RED, cursor: 'pointer', opacity: revoking === s.id ? 0.5 : 1 }}>
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
      <PremiumEmpty
        icon={<HardHat size={30} weight="duotone" color={GOLD} />}
        title="No subcontractor portal access yet"
        description="Invite a sub to a portal scoped to their work — their contract, schedule, RFIs, submittals, and shared documents. You control exactly what each subcontractor sees."
        action={<button onClick={onInvite} style={goldOutlineButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Invite First Subcontractor</button>}
      />
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-surface-2)' }}>
            {['Company', 'Project', 'Status', 'Last Login', 'Invite', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{h}</th>
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
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{s.last_login_at ? <span style={{ color: DIM }}>{fmt(s.last_login_at)}</span> : s.status === 'active' ? <span style={{ color: AMBER, fontWeight: 600 }}>Never Opened</span> : <span style={{ color: DIM }}>—</span>}</td>
              {/* Resend invite column */}
              <td style={{ padding: '12px 16px' }}>
                {s.status === 'active' && (
                  <button onClick={() => onResend(s.id, 'sub')} disabled={resending === s.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: resendMsg?.id === s.id && resendMsg.ok ? 'rgba(44,255,122,0.1)' : 'rgba(0,0,0,0.04)', border: `1px solid ${resendMsg?.id === s.id && resendMsg.ok ? 'rgba(44,255,122,0.25)' : BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: resendMsg?.id === s.id && resendMsg.ok ? GREEN : DIM, cursor: 'pointer', opacity: resending === s.id ? 0.5 : 1 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {resending === s.id ? 'Sending…' : resendMsg?.id === s.id && resendMsg.ok ? <><CheckCircle size={11} weight="fill" color={GREEN} /> Sent</> : 'Resend Invite'}
                  </button>
                )}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onCopy(s.token, 'sub')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: copied === s.token ? 'rgba(44,255,122,0.1)' : 'var(--brand-primary-12)', border: `1px solid ${copied === s.token ? 'rgba(44,255,122,0.25)' : 'var(--brand-primary-25)'}`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: copied === s.token ? GREEN : BLUE, cursor: 'pointer' }}>
                    {copied === s.token ? <><CheckCircle size={11} weight="fill" color={GREEN} /> Copied</> : <><Copy size={11} weight="regular" color={BLUE} /> Copy Link</>}
                  </button>
                  <a href={`/portals/subcontractor/${s.token}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: DIM, textDecoration: 'none' }}>
                    View <ArrowRight size={11} weight="regular" color={DIM} style={{ display: 'inline-flex', verticalAlign: 'middle' }} />
                  </a>
                  {s.status === 'active' && (
                    <button onClick={() => onRevoke(s.id, 'sub')} disabled={revoking === s.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 5, fontSize: 11, fontWeight: 600, color: RED, cursor: 'pointer', opacity: revoking === s.id ? 0.5 : 1 }}>
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
