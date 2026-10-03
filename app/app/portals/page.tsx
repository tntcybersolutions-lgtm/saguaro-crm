'use client';
/**
 * Portal Access — client and subcontractor portal links, Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (Invite Client; Invite Subcontractor is
 * secondary) → StatRow (active client / active sub portals, coverage, never
 * opened, expiring, last visit — tiles switch the tab) → how it works →
 * Tabs (Client | Subcontractor) over a kit DataTable with Copy Link / View /
 * Resend Invite / Revoke row actions. The invite composer opens in a FormModal
 * and shows the generated link on success.
 *
 * Every read / write is the one this screen already used:
 *   list    GET  /api/portal/client/sessions · /api/portal/sub/sessions
 *   create  POST /api/portal/client/create · /api/portal/sub/create
 *   revoke  POST /api/portal/revoke        { sessionId, type }
 *   resend  POST /api/portal/resend-invite { sessionId, type }
 */
import React, { useEffect, useState, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjects } from '@/lib/hooks/useProjects';
import { CheckCircle, Plus, House, HardHat, Copy, ArrowSquareOut, PaperPlaneTilt, Prohibit, Envelope, WarningCircle } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, DataTable, EmptyState,
  FormModal, Field, Input, Select, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowStrip, AutoChip } from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: string; name: string; status: string; }

interface ClientSession {
  id: string; client_name: string; client_email: string; project_id: string;
  token: string; status: string; expires_at: string | null;
  /* The column, and what /api/portal/client/sessions returns, is
     last_login_at; last_accessed_at is kept as a tolerant fallback. */
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

/** Session status → badge: active green, expired amber, revoked / inactive grey. */
function statusBadge(status: string): { label: string; tone: BadgeTone } {
  if (status === 'active') return { label: 'Active', tone: 'ongoing' };
  if (status === 'expired') return { label: 'Expired', tone: 'under_contract' };
  if (status === 'revoked') return { label: 'Revoked', tone: 'closed' };
  return { label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Inactive', tone: 'closed' };
}
const STATUS_RANK: Record<string, number> = { active: 0, expired: 1, inactive: 2, revoked: 3 };
const lastSeen = (s: { last_login_at: string | null; last_accessed_at?: string | null }) => s.last_login_at ?? s.last_accessed_at ?? null;

const CSS = `
.poWs > .k-page { max-width: none; }
.poWho { display: flex; flex-direction: column; gap: 2px; max-width: 300px; min-width: 0; }
.poWho > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.poWho > span:first-child { color: var(--text-primary); font-weight: 700; }
.poWho > span + span { font-size: var(--fs-xs); color: var(--text-tertiary); }
.poMuted { color: var(--text-tertiary); }
.poSoon { color: var(--status-under-contract); font-weight: 700; }
.poLate { color: var(--status-overdue); font-weight: 700; }
.poNever { color: var(--status-under-contract); font-weight: 600; }
.poTabs { padding: 0 16px; }
.poFlow { padding: 0; }
.poSuccess { text-align: center; }
.poSuccessIcon { width: 52px; height: 52px; border-radius: 50%; margin: 0 auto 12px; display: grid; place-items: center; background: rgba(44,255,122,.12); border: 1.5px solid rgba(44,255,122,.3); color: var(--status-ongoing); }
.poSuccessTitle { font-size: var(--fs-lg); font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.poSuccessSub { font-size: var(--fs-sm); color: var(--text-tertiary); margin-bottom: 12px; }
.poMail { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: var(--radius-sm); margin-bottom: 16px; text-align: left; font-size: var(--fs-xs); font-weight: 600; }
.poMail[data-ok="true"] { background: rgba(44,255,122,.08); border: 1px solid rgba(44,255,122,.2); color: var(--status-ongoing); }
.poMail[data-ok="false"] { background: rgba(255,197,61,.08); border: 1px solid rgba(255,197,61,.3); color: var(--status-under-contract); }
.poLink { background: var(--bg-surface-2); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 12px; text-align: left; }
.poLinkLabel { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin-bottom: 6px; }
.poLinkUrl { font-size: var(--fs-xs); color: var(--text-secondary); word-break: break-all; line-height: 1.5; margin-bottom: 10px; font-family: ui-monospace, monospace; }
.poSuccessNote { font-size: var(--fs-xs); color: var(--text-tertiary); margin-bottom: 16px; line-height: 1.5; }
.poSuccessNote a { color: var(--brand-primary); }
.poSuccessActions { display: flex; gap: 10px; }
.poSuccessActions > .k-btn { flex: 1; justify-content: center; }
.poModalTabs { margin: -4px 0 14px; }
@media (max-width: 640px) {
  .poWs .k-btn, .poWs .k-stat, .poWs .k-tab, .poWs .k-input, .poWs select.k-select { min-height: 44px; }
  .poWs .k-table td { height: 48px; }
  .poWho { max-width: 200px; }
}
`;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortalsPage() {
  const [tab, setTab] = useState<Tab>('client');
  const [clientSessions, setClientSessions] = useState<ClientSession[]>([]);
  const [subSessions, setSubSessions] = useState<SubSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const { toast, show } = useToast(4000);

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
  const composerDirty = useComposerDirty(showInvite && !inviteSuccess, { clientForm, subForm, inviteTab });
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
    setLoadError('');
    try {
      const [clientRes, subRes] = await Promise.all([
        fetch('/api/portal/client/sessions'),
        fetch('/api/portal/sub/sessions'),
      ]);
      if (clientRes.ok) { const d = await clientRes.json(); setClientSessions(d.sessions || []); }
      if (subRes.ok) { const d = await subRes.json(); setSubSessions(d.sessions || []); }
      if (!clientRes.ok && !subRes.ok) setLoadError('Failed to load portal sessions.');
    } catch { setLoadError('Failed to load portal sessions.'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function copyLink(token: string, type: Tab) {
    const path = type === 'client' ? `/portals/client/${token}` : `/portals/subcontractor/${token}`;
    navigator.clipboard.writeText(`${window.location.origin}${path}`).then(
      () => show('Portal link copied.'),
      () => show('Could not copy — copy the link from the View page.', 'bad'),
    );
  }

  async function revoke(sessionId: string, type: Tab) {
    if (!(await confirmDialog({ title: 'Revoke portal access?', message: 'The link will stop working immediately. You can reinvite at any time.', confirmLabel: 'Revoke', danger: true }))) return;
    setRevoking(sessionId);
    try {
      const res = await fetch('/api/portal/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, type }) });
      if (!res.ok) throw new Error('revoke failed');
      show('Portal access revoked.');
      await loadData();
    } catch { show('Could not revoke access. Please try again.', 'bad'); }
    setRevoking(null);
  }

  async function resendInvite(sessionId: string, type: Tab) {
    setResending(sessionId);
    try {
      const res = await fetch('/api/portal/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, type }),
      });
      const data = await res.json();
      if (res.ok) show(`Invite resent to ${data.sentTo}`);
      else show(data.error || 'Failed to resend', 'bad');
    } catch {
      show('Connection error', 'bad');
    }
    setResending(null);
  }

  async function submitInvite() {
    // Validate the address before anything leaves the browser — the invite
    // email AND the passwordless portal login both key off it.
    const email = (inviteTab === 'client' ? clientForm.clientEmail : subForm.email).trim();
    if (!EMAIL_RE.test(email)) {
      setInviteError('Enter a valid email address — the invite and the portal login both use it.');
      return;
    }
    const pid = inviteTab === 'client' ? clientForm.projectId : subForm.projectId;
    if (!pid) { setInviteError('Pick the project this portal shows.'); return; }
    if (inviteTab === 'client' && !clientForm.clientName.trim()) { setInviteError('Client name is required.'); return; }
    if (inviteTab === 'sub' && !subForm.companyName.trim()) { setInviteError('Company name is required.'); return; }

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
        guard.clearDraft();
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
  const closeInvite = () => {
    if (inviteSuccess) { setShowInvite(false); setInviteSuccess(null); return; }
    guard.requestClose(() => { setShowInvite(false); setInviteError(''); });
  };

  // ── Portal intelligence (derived from already-fetched sessions/projects) ──
  const activeClientSessions = clientSessions.filter(s => s.status === 'active');
  const activeSubSessions = subSessions.filter(s => s.status === 'active');
  const clientActive = activeClientSessions.length;
  const subActive = activeSubSessions.length;
  const coveredProjects = new Set([
    ...activeClientSessions.map(s => s.project_id),
    ...activeSubSessions.map(s => s.project_id),
  ]).size;
  const neverOpened = activeClientSessions.filter(s => !lastSeen(s)).length
    + activeSubSessions.filter(s => !s.last_login_at).length;
  const expiring30 = activeClientSessions.filter(s => {
    if (!s.expires_at) return false;
    const t = new Date(s.expires_at).getTime();
    return t > Date.now() && t - Date.now() <= 30 * 86400000;
  }).length;
  const lastVisitTs = Math.max(0,
    ...clientSessions.map(s => { const v = lastSeen(s); return v ? new Date(v).getTime() : 0; }),
    ...subSessions.map(s => (s.last_login_at ? new Date(s.last_login_at).getTime() : 0)));
  const totalLinks = clientSessions.length + subSessions.length;

  const stats: StatItem[] = loading
    ? ['Active Client Portals', 'Active Sub Portals', 'Projects Covered', 'Never Opened', 'Expiring in 30 Days', 'Last Portal Visit'].map(label => ({ label, value: '—', sub: 'Loading…' }))
    : [
        { label: 'Active Client Portals', value: clientActive, tone: clientActive > 0 ? 'good' : 'default', sub: tab === 'client' ? 'Showing — owners with access' : 'Owners with access', onClick: () => setTab('client') },
        { label: 'Active Sub Portals', value: subActive, tone: subActive > 0 ? 'good' : 'default', sub: tab === 'sub' ? 'Showing — subs with access' : 'Subcontractors with access', onClick: () => setTab('sub') },
        { label: 'Projects Covered', value: `${coveredProjects} of ${projects.length}`, tone: projects.length > 0 && coveredProjects < projects.length ? 'warn' : coveredProjects > 0 ? 'good' : 'default', sub: coveredProjects < projects.length ? `${projects.length - coveredProjects} project${projects.length - coveredProjects === 1 ? '' : 's'} without portal access` : 'Every project has a live portal' },
        { label: 'Never Opened', value: neverOpened, tone: neverOpened > 0 ? 'warn' : 'default', sub: neverOpened > 0 ? 'Links sent but never visited — resend the invite' : 'Every active link has been visited' },
        { label: 'Expiring in 30 Days', value: expiring30, tone: expiring30 > 0 ? 'bad' : 'default', sub: expiring30 > 0 ? 'Client links auto-expire — reinvite to extend' : 'No client links expiring soon' },
        { label: 'Last Portal Visit', value: lastVisitTs > 0 ? fmt(new Date(lastVisitTs).toISOString()) : '—', sub: `${totalLinks} link${totalLinks === 1 ? '' : 's'} issued · ${clientSessions.length} client · ${subSessions.length} sub` },
      ];

  // ── Columns ──
  const clientColumns: Column<ClientSession>[] = [
    { key: 'client_name', header: 'Client', accessor: s => (s.client_name || '').toLowerCase(), render: s => <div className="poWho"><span>{s.client_name}</span><span>{s.client_email}</span></div> },
    { key: 'project_name', header: 'Project', accessor: s => (s.project_name || '').toLowerCase(), render: s => s.project_name ? <span className="poMuted">{s.project_name}</span> : <span className="poMuted">—</span> },
    { key: 'status', header: 'Status', accessor: s => STATUS_RANK[s.status] ?? 9, render: s => { const b = statusBadge(s.status); return <Badge tone={b.tone} dot>{b.label}</Badge>; } },
    { key: 'last', header: 'Last Access', accessor: s => lastSeen(s) || '', render: s => { const v = lastSeen(s); return v ? <span className="poMuted">{fmt(v)}</span> : s.status === 'active' ? <span className="poNever">Never opened</span> : <span className="poMuted">—</span>; } },
    { key: 'expires_at', header: 'Expires', accessor: s => s.expires_at || '9999', render: s => {
      if (!s.expires_at) return <span className="poMuted">Never</span>;
      const dl = Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 86400000);
      return <span className={dl <= 0 ? 'poLate' : dl <= 30 ? 'poSoon' : 'poMuted'}>{fmt(s.expires_at)}{dl <= 0 ? ' · expired' : dl <= 30 ? ` · ${dl}d left` : ''}</span>;
    } },
  ];
  const subColumns: Column<SubSession>[] = [
    { key: 'company_name', header: 'Company', accessor: s => (s.company_name || '').toLowerCase(), render: s => <div className="poWho"><span>{s.company_name || '—'}</span>{s.contact_name && <span>{s.contact_name}</span>}</div> },
    { key: 'project_name', header: 'Project', accessor: s => (s.project_name || '').toLowerCase(), render: s => s.project_name ? <span className="poMuted">{s.project_name}</span> : <span className="poMuted">—</span> },
    { key: 'status', header: 'Status', accessor: s => STATUS_RANK[s.status] ?? 9, render: s => { const b = statusBadge(s.status); return <Badge tone={b.tone} dot>{b.label}</Badge>; } },
    { key: 'last_login_at', header: 'Last Login', accessor: s => s.last_login_at || '', render: s => s.last_login_at ? <span className="poMuted">{fmt(s.last_login_at)}</span> : s.status === 'active' ? <span className="poNever">Never opened</span> : <span className="poMuted">—</span> },
    { key: 'created_at', header: 'Invited', accessor: s => s.created_at || '', render: s => <span className="poMuted">{fmt(s.created_at)}</span> },
  ];
  const rowActionsFor = (type: Tab) => (s: { id: string; token: string; status: string }): Action[] => [
    { label: 'Copy Link', icon: <Copy size={15} />, onClick: () => copyLink(s.token, type) },
    { label: 'View Portal', icon: <ArrowSquareOut size={15} />, onClick: () => window.open(type === 'client' ? `/portals/client/${s.token}` : `/portals/subcontractor/${s.token}`, '_blank', 'noopener') },
    { label: resending === s.id ? 'Sending…' : 'Resend Invite', icon: <PaperPlaneTilt size={15} />, onClick: () => resendInvite(s.id, type), hidden: s.status !== 'active', disabled: resending === s.id },
    { label: 'Revoke Access', icon: <Prohibit size={15} />, onClick: () => revoke(s.id, type), tone: 'danger', hidden: s.status !== 'active', disabled: revoking === s.id },
  ];

  // ── Table body ──
  let body: React.ReactNode;
  if (!loading && loadError) {
    body = <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load portal sessions" text={`${loadError} Nothing has been lost — try again.`} action={<Button onClick={loadData}>Retry</Button>} />;
  } else if (tab === 'client') {
    body = !loading && clientSessions.length === 0
      ? <EmptyState icon={<House size={22} />} title="No client portal access yet" text="Give an owner a secure, no-password window into their project — progress, schedule, photos, and invoices — through one link you can revoke at any time. The invitation email sends itself." action={<Button icon={<Plus size={15} weight="bold" />} onClick={() => openInvite('client')}>Invite First Client</Button>} />
      : <DataTable columns={clientColumns} rows={clientSessions} rowKey={s => s.id} loading={loading} defaultSort={{ key: 'status', dir: 'asc' }} rowActions={rowActionsFor('client')} />;
  } else {
    body = !loading && subSessions.length === 0
      ? <EmptyState icon={<HardHat size={22} />} title="No subcontractor portal access yet" text="Invite a sub to a portal scoped to their work — their contract, schedule, RFIs, submittals, and shared documents. Subs never see internal controls or competitor bids." action={<Button icon={<Plus size={15} weight="bold" />} onClick={() => openInvite('sub')}>Invite First Subcontractor</Button>} />
      : <DataTable columns={subColumns} rows={subSessions} rowKey={s => s.id} loading={loading} defaultSort={{ key: 'status', dir: 'asc' }} rowActions={rowActionsFor('sub')} />;
  }

  const inviteProjectId = inviteTab === 'client' ? clientForm.projectId : subForm.projectId;

  return (
    <div className="poWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Portals' }]}
        title="Portal Access"
        subtitle="Secure, no-password links for owners and subs — each portal shows one project, and you can revoke any link at any time."
        actions={
          <>
            <Button icon={<Plus size={15} weight="bold" />} onClick={() => openInvite('sub')}>Invite Subcontractor</Button>
            <Button variant="primary" data-tour="invite-client" icon={<Plus size={15} weight="bold" />} onClick={() => openInvite('client')}>Invite Client</Button>
          </>
        }
      >
        {!loadError && <StatRow items={stats} />}

        <Card title="How Portal Access Works" subtitle="Four steps — no accounts to create on their side.">
          <FlowStrip steps={[
            { title: 'Create Access', desc: 'Invite a client or subcontractor above' },
            { title: 'Copy the Link', desc: 'The portal URL appears the moment access is created' },
            { title: 'Send to Them', desc: 'Email or text the link — no password needed' },
            { title: 'They Log In', desc: 'Open the link, or enter their email at the portal login' },
          ]} />
        </Card>

        <Card flush>
          <div className="poTabs">
            <Tabs
              value={tab}
              onChange={(k) => setTab(k as Tab)}
              tabs={[
                { key: 'client', label: 'Client Access', count: clientActive },
                { key: 'sub', label: 'Subcontractor Access', count: subActive },
              ]}
            />
          </div>
          {body}
        </Card>
      </PageShell>

      {/* ── Invite composer ── */}
      <FormModal
        open={showInvite}
        onClose={closeInvite}
        title={inviteSuccess ? 'Portal Access Created' : inviteTab === 'client' ? 'Invite Client to Portal' : 'Invite Subcontractor to Portal'}
        subtitle={inviteSuccess ? undefined : 'Creates a secure access link for this person — the invite is emailed automatically.'}
        onSubmit={inviteSuccess ? undefined : submitInvite}
        submitLabel="Generate Portal Link"
        busy={inviteLoading}
        error={inviteError || null}
        footer={inviteSuccess ? <></> : undefined}
      >
        {inviteSuccess ? (
          <SuccessCard
            url={inviteSuccess.url}
            name={inviteSuccess.name}
            type={inviteTab}
            emailSent={inviteSuccess.emailSent}
            onCopied={() => show('Portal link copied.')}
            onAnother={() => setInviteSuccess(null)}
            onClose={() => { setShowInvite(false); setInviteSuccess(null); }}
          />
        ) : (
          <>
            <div className="poModalTabs">
              <Tabs value={inviteTab} onChange={(k) => { setInviteTab(k as Tab); setInviteSuccess(null); setInviteError(''); }} tabs={[{ key: 'client', label: 'Client Portal' }, { key: 'sub', label: 'Sub Portal' }]} />
            </div>
            <FormGrid cols={2}>
              <Field label="Project" required span hint={autoProj ? <><AutoChip /> Your only project — preselected. The portal shows this project only.</> : 'The portal shows this project only.'}>
                <Select
                  value={inviteProjectId}
                  onChange={e => {
                    setAutoProj(false);
                    const v = e.target.value;
                    if (inviteTab === 'client') setClientForm(f => ({ ...f, projectId: v }));
                    else setSubForm(f => ({ ...f, projectId: v }));
                    if (inviteError) setInviteError('');
                  }}
                  placeholder="Select a project…"
                  options={projects.map(p => ({ value: p.id, label: p.name }))}
                />
              </Field>

              {inviteTab === 'client' ? (
                <>
                  <Field label="Client Full Name" required>
                    <Input type="text" value={clientForm.clientName} onChange={e => { setClientForm(f => ({ ...f, clientName: e.target.value })); if (inviteError) setInviteError(''); }} placeholder="John Smith" autoFocus />
                  </Field>
                  <Field label="Client Email Address" required hint="The invite is emailed here — and they can log in with this address, no password.">
                    <Input type="email" value={clientForm.clientEmail} onChange={e => { setClientForm(f => ({ ...f, clientEmail: e.target.value })); if (inviteError) setInviteError(''); }} placeholder="client@company.com" />
                  </Field>
                  <Field label="Access Expires In" span hint="The link stops working after this date. You can revoke or reinvite at any time.">
                    <Select value={clientForm.expiresInDays} onChange={e => setClientForm(f => ({ ...f, expiresInDays: e.target.value }))} options={[
                      { value: '30', label: '30 Days' }, { value: '90', label: '90 Days' }, { value: '180', label: '6 Months' }, { value: '365', label: '1 Year' }, { value: '', label: 'Never Expires' },
                    ]} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Company Name" required>
                    <Input type="text" value={subForm.companyName} onChange={e => { setSubForm(f => ({ ...f, companyName: e.target.value })); if (inviteError) setInviteError(''); }} placeholder="ABC Electrical LLC" autoFocus />
                  </Field>
                  <Field label="Contact Name">
                    <Input type="text" value={subForm.contactName} onChange={e => setSubForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Jane Doe" />
                  </Field>
                  <Field label="Email Address" required span hint="The invite is emailed here — and they can log in with this address, no password.">
                    <Input type="email" value={subForm.email} onChange={e => { setSubForm(f => ({ ...f, email: e.target.value })); if (inviteError) setInviteError(''); }} placeholder="contact@abcelectrical.com" />
                  </Field>
                </>
              )}
            </FormGrid>
          </>
        )}
      </FormModal>

      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SuccessCard({ url, name, type, emailSent, onCopied, onAnother, onClose }: { url: string; name: string; type: Tab; emailSent?: boolean; onCopied: () => void; onAnother: () => void; onClose: () => void; }) {
  const [linkCopied, setLinkCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      onCopied();
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  return (
    <div className="poSuccess">
      <div className="poSuccessIcon"><CheckCircle size={26} weight="fill" /></div>
      <div className="poSuccessTitle">Portal Access Created</div>
      <div className="poSuccessSub">{name} can now access their {type === 'client' ? 'client' : 'subcontractor'} portal.</div>

      {/* Email status banner */}
      <div className="poMail" data-ok={emailSent ? 'true' : 'false'} role="status">
        {emailSent ? <Envelope size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />}
        {emailSent ? 'Invitation email sent automatically.' : 'Email not sent automatically — copy the portal link below and share it directly.'}
      </div>

      {/* Link box */}
      <div className="poLink">
        <div className="poLinkLabel">Portal Link</div>
        <div className="poLinkUrl">{url}</div>
        <Button size="sm" icon={linkCopied ? <CheckCircle size={14} weight="fill" /> : <Copy size={14} />} onClick={copyUrl}>{linkCopied ? 'Copied' : 'Copy Portal Link'}</Button>
      </div>

      <div className="poSuccessNote">
        Send this link via email or text. They can also log in at{' '}
        <a href={type === 'client' ? '/portals/client/login' : '/portals/sub/login'} target="_blank" rel="noreferrer">{type === 'client' ? '/portals/client/login' : '/portals/sub/login'}</a>
        {' '}using their email address.
      </div>

      <div className="poSuccessActions">
        <Button icon={<Plus size={14} weight="bold" />} onClick={onAnother}>Invite Another</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
