'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { alertDialog } from '@/lib/ui/async-dialog';
import { SUB_TRADES as ALL_TRADES } from '@/lib/construction-intelligence';
import { humanError } from '@/lib/errors';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import SubInbox from '@/components/sub-portal/SubInbox';
import { UsersThree, CheckCircle, Clock, Prohibit, WarningCircle, XCircle, FileX, Plus, UploadSimple, ListChecks, ClockCounterClockwise, FileText, ShieldCheck, AddressBook, Megaphone, Envelope } from '@phosphor-icons/react';

/* ── palette ── */
const GOLD = 'var(--brand-primary)';
const BG = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-secondary)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';
const AMBER = 'var(--warning)';
const BLUE = 'var(--brand-primary)';
const PURPLE = 'var(--warning)';

/* ── types ── */
type SubStatus = 'active' | 'pending' | 'disabled';
type PortalPermission = 'contract' | 'schedule' | 'daily_logs' | 'rfis' | 'submittals' | 'pay_apps';
type ComplianceDocType = 'insurance' | 'w9' | 'license';
type ComplianceStatus = 'valid' | 'expiring' | 'expired' | 'missing';
type Tab = 'inbox' | 'users' | 'invite' | 'permissions' | 'activity' | 'documents' | 'compliance' | 'directory' | 'messages';

interface SubUser {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  trade: string;
  status: SubStatus;
  projectAccess: string[];
  permissions: PortalPermission[];
  invitedDate: string;
  lastLogin: string | null;
  avatarColor: string;
}

interface ActivityEntry {
  id: string;
  subId: string;
  subName: string;
  company: string;
  action: string;
  detail: string;
  timestamp: string;
}

interface SharedDoc {
  id: string;
  name: string;
  category: string;
  projectName: string;
  visibleToSubs: string[];
  uploadedDate: string;
  size: string;
}

interface ComplianceRecord {
  id: string;
  subId: string;
  subName: string;
  company: string;
  docType: ComplianceDocType;
  status: ComplianceStatus;
  expirationDate: string | null;
  fileName: string | null;
  uploadedDate: string | null;
}

interface Announcement {
  id: string;
  subject: string;
  body: string;
  sentDate: string;
  sentTo: string[];
  sentBy: string;
}

/* ── helpers ── */
function uid(): string { return Math.random().toString(36).slice(2, 11); }

/* Real address check — the invitation email and the portal login both use it. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Generic words that shouldn't drive trade inference from a company name. */
const TRADE_STOPWORDS = new Set(['general', 'services', 'systems', 'specialties', 'building', 'construction', 'work', 'works', 'installation', 'contractors', 'management', 'equipment', 'interior', 'exterior', 'finishes', 'other', 'misc', 'miscellaneous']);

/** Suggest a canonical SUB_TRADES entry from a company name ("Apex Electric" ->
 *  "Electrical"). Word-boundary stem match; suggestion only — the UI marks it
 *  AUTO and the user can override. */
function inferTrade(company: string): string {
  const src = company.trim();
  if (src.length < 3) return '';
  const trades = [...ALL_TRADES].sort((a, b) => b.length - a.length);
  for (const t of trades) {
    for (const w of t.toLowerCase().split(/[^a-z]+/)) {
      if (w.length < 4 || TRADE_STOPWORDS.has(w)) continue;
      const stem = w.slice(0, Math.min(6, w.length));
      if (new RegExp('\\b' + stem, 'i').test(src)) return t;
    }
  }
  return '';
}
function fmtDate(d: string | null): string { return d ? new Date(d).toLocaleDateString() : '--'; }
function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ALL_TRADES = canonical SUB_TRADES taxonomy from @/lib/construction-intelligence
// Project list is loaded from the tenant's real projects at runtime (see the
// `projects` state / GET /api/sub-portal) — no hard-coded sample projects.
const ALL_PERMISSIONS_LIST: { key: PortalPermission; label: string }[] = [
  { key: 'contract', label: 'Their Contract' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'daily_logs', label: 'Daily Logs' },
  { key: 'rfis', label: 'RFIs' },
  { key: 'submittals', label: 'Submittals' },
  { key: 'pay_apps', label: 'Pay Applications' },
];
const AVATAR_COLORS = [GOLD, BLUE, GREEN, PURPLE, AMBER, 'var(--warning)', 'var(--success)', 'var(--warning)'];
const DOC_CATEGORIES = ['Drawings', 'Specifications', 'Schedules', 'Safety Plans', 'Meeting Minutes', 'Reports', 'Contracts', 'Photos'];

/* ── map a real portal_users row → the roster shape the UI renders (was a
   seedUsers()/seedActivity()/etc. block that fabricated 10 fake subs) ── */
function mapPortalUser(r: any, i: number): SubUser {
  const rawStatus = String(r?.status ?? '').toLowerCase();
  const status: SubStatus = ['active', 'pending', 'disabled'].includes(rawStatus) ? (rawStatus as SubStatus) : 'pending';
  const permissions = Array.isArray(r?.permissions) ? (r.permissions as PortalPermission[]) : [];
  return {
    id: String(r?.id ?? uid()),
    company: r?.company ?? '',
    contactName: r?.name ?? r?.contact_name ?? '',
    email: r?.email ?? '',
    phone: r?.phone ?? '',
    trade: r?.trade ?? r?.role ?? '',
    status,
    projectAccess: Array.isArray(r?.project_access) ? r.project_access : [],
    permissions,
    invitedDate: r?.invited_at ?? r?.created_at ?? '',
    lastLogin: r?.last_login_at ?? r?.last_login ?? null,
    avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
  };
}

/* ── modal overlay ── */
function Modal({ open, onClose, title, width, children }: {
  open: boolean; onClose: () => void; title: string; width?: number; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, width: width || 560, maxHeight: '85vh', overflow: 'auto', padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ color: TEXT, margin: 0, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer' }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── shared input style ── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: BG, border: `1px solid ${BORDER}`,
  borderRadius: 6, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as React.CSSProperties['appearance'] };
const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', background: GOLD, color: 'var(--on-brand)', border: 'none', borderRadius: 6,
  fontWeight: 600, cursor: 'pointer', fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  padding: '9px 20px', background: 'transparent', color: DIM, border: `1px solid ${BORDER}`,
  borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const labelStyle: React.CSSProperties = { color: DIM, fontSize: 13, marginBottom: 4, display: 'block' };

/* ── status badge ── */
function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: GREEN, pending: AMBER, disabled: RED, valid: GREEN, expiring: AMBER, expired: RED, missing: DIM,
  };
  const c = colorMap[status] || DIM;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, background: `color-mix(in srgb, ${c} 9%, transparent)`, color: c, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {status}
    </span>
  );
}

/* ════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                     */
/* ════════════════════════════════════════════════════ */
export default function SubPortalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The inbox is what needs the GC today, so the screen opens on it.
  const [tab, setTab] = useState<Tab>('inbox');
  const [inboxCount, setInboxCount] = useState(0);

  /* Deep-link support (?tab=invite|users|permissions|...) — read once on mount,
     client-only so there is no prerender/Suspense requirement from
     useSearchParams. Same pattern as app/app/people/page.tsx.
     Added because the Command Palette's "Invite Subcontractor" action pointed
     at /app/subs/invite, which has never been a route: the palette offered an
     action that 404'd. The invite tab is the real destination. */
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      const valid: Tab[] = ['users', 'invite', 'permissions', 'activity', 'documents', 'compliance', 'directory', 'messages'];
      if (t && valid.includes(t)) setTab(t);
    } catch { /* no-op */ }
  }, []);

  /* data */
  const [users, setUsers] = useState<SubUser[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [docs, setDocs] = useState<SharedDoc[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // Real tenant project names (from /api/sub-portal). Replaces a hard-coded
  // fake project list that used to seed the filters and invite pickers.
  const [projects, setProjects] = useState<string[]>([]);

  /* filters */
  const [filterTrade, setFilterTrade] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  /* modals */
  const [inviteModal, setInviteModal] = useState(false);
  const [bulkInviteModal, setBulkInviteModal] = useState(false);
  const [permModal, setPermModal] = useState<SubUser | null>(null);
  const [docShareModal, setDocShareModal] = useState<SharedDoc | null>(null);
  const [announceModal, setAnnounceModal] = useState(false);
  const [userDetailModal, setUserDetailModal] = useState<SubUser | null>(null);

  /* invite form */
  const [invCompany, setInvCompany] = useState('');
  const [invContact, setInvContact] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invTrade, setInvTrade] = useState('');
  const [invProjects, setInvProjects] = useState<string[]>([]);
  const [invSending, setInvSending] = useState(false);
  /* trade was auto-inferred from the company name (drives the AUTO chip) */
  const [invTradeAuto, setInvTradeAuto] = useState(false);
  /* project access was prefilled (single-project tenant) — drives its AUTO chip */
  const [invProjAuto, setInvProjAuto] = useState(false);

  /* bulk invite */
  const [bulkText, setBulkText] = useState('');
  const [bulkSending, setBulkSending] = useState(false);

  /* announcement form */
  const [annSubject, setAnnSubject] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annRecipients, setAnnRecipients] = useState<string[]>(['all']);
  const [annSending, setAnnSending] = useState(false);

  /* load data */
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/sub-portal');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // The GET returns everything tenant-scoped and already mapped to the
        // shapes these tabs render: `data` = portal_users roster; `activity`,
        // `documents`, `compliance`, `announcements` come from portal_activity,
        // portal_documents, portal_sub_compliance_docs and the announcement rows
        // in portal_messages. When a table is genuinely empty the array is empty
        // and the tab shows an honest empty state (no fabricated seed data).
        const rows: any[] = Array.isArray(data?.data) ? data.data
          : (Array.isArray(data?.users) ? data.users : []);
        setUsers(rows.map(mapPortalUser));
        setActivity(Array.isArray(data?.activity) ? data.activity : []);
        setDocs(Array.isArray(data?.documents) ? data.documents : []);
        setCompliance(Array.isArray(data?.compliance) ? data.compliance : []);
        setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
        setProjects(Array.isArray(data?.projects) ? data.projects : []);
      } catch {
        setUsers([]);
        setActivity([]);
        setDocs([]);
        setCompliance([]);
        setAnnouncements([]);
        setProjects([]);
        setError('Could not load your subcontractor portal. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* Single-project tenant: the access choice is a foregone conclusion — prefill it.
     Runs once when the real project list lands; the user can still uncheck it. */
  useEffect(() => {
    if (projects.length === 1 && invProjects.length === 0) {
      setInvProjects([projects[0]]);
      setInvProjAuto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  /* filtered users */
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (filterTrade && u.trade !== filterTrade) return false;
      if (filterStatus && u.status !== filterStatus) return false;
      if (filterProject && !u.projectAccess.includes(filterProject)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return u.contactName.toLowerCase().includes(q) || u.company.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [users, filterTrade, filterStatus, filterProject, searchQuery]);

  /* stats */
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.status === 'active').length;
    const pending = users.filter(u => u.status === 'pending').length;
    const disabled = users.filter(u => u.status === 'disabled').length;
    const compExpiring = compliance.filter(c => c.status === 'expiring').length;
    const compExpired = compliance.filter(c => c.status === 'expired').length;
    const compMissing = compliance.filter(c => c.status === 'missing').length;
    return { total, active, pending, disabled, compExpiring, compExpired, compMissing };
  }, [users, compliance]);

  /* ── roster intelligence — adoption, engagement, compliance health (derived
     entirely from the data already fetched; no extra requests) ── */
  const intel = useMemo(() => {
    const uniqueTrades = new Set(users.map(u => u.trade).filter(Boolean)).size;
    const neverLogged = users.filter(u => u.status === 'active' && !u.lastLogin).length;
    const adoption = users.length > 0 ? Math.round((users.filter(u => u.status === 'active').length / users.length) * 100) : 0;
    const docsAll = docs.filter(d => d.visibleToSubs.includes('all')).length;
    const now = Date.now();
    const events7 = activity.filter(a => { const t = new Date(a.timestamp).getTime(); return !isNaN(t) && now - t <= 7 * 86400000; }).length;
    const lastEventTs = activity.reduce((m, a) => { const t = new Date(a.timestamp).getTime(); return isNaN(t) ? m : Math.max(m, t); }, 0);
    const logins = activity.filter(a => a.action.includes('Login') || a.action.includes('Logged in')).length;
    const byCompany: Record<string, number> = {};
    activity.forEach(a => { if (a.company) byCompany[a.company] = (byCompany[a.company] || 0) + 1; });
    const mostActive = Object.entries(byCompany).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const compValid = compliance.filter(c => c.status === 'valid').length;
    const compPct = compliance.length > 0 ? Math.round((compValid / compliance.length) * 100) : 0;
    const needAttention = compliance.filter(c => c.status !== 'valid').length;
    return { uniqueTrades, neverLogged, adoption, docsAll, events7, lastEventTs, logins, mostActive, compPct, needAttention };
  }, [users, docs, activity, compliance]);

  /* ── invite-flow intelligence: trade inference + email validation + dupes ── */
  const onInvCompanyChange = (v: string) => {
    setInvCompany(v);
    if (!invTrade || invTradeAuto) {
      const t = inferTrade(v);
      if (t) { setInvTrade(t); setInvTradeAuto(true); }
      else if (invTradeAuto) { setInvTrade(''); setInvTradeAuto(false); }
    }
  };
  const invEmailTrim = invEmail.trim();
  const invEmailValid = EMAIL_RE.test(invEmailTrim);
  const invDup = invEmailTrim ? users.find(u => (u.email || '').toLowerCase() === invEmailTrim.toLowerCase()) : undefined;
  const invDisabled = invSending || !invCompany || !invContact || !invTrade || !invEmailValid;
  const bulkStats = useMemo(() => {
    const lines = bulkText.trim() ? bulkText.trim().split('\n').filter(l => l.trim()) : [];
    const bad = lines.filter(l => !EMAIL_RE.test((l.split(',')[2] || '').trim())).length;
    const badTrade = lines.filter(l => { const t = (l.split(',')[3] || '').trim(); return t !== '' && !ALL_TRADES.some(x => x.toLowerCase() === t.toLowerCase()); }).length;
    return { n: lines.length, bad, badTrade };
  }, [bulkText]);

  /* handlers */
  const handleInvite = useCallback(async () => {
    if (!invCompany || !invContact || !invEmail || !invTrade) return;
    setInvSending(true);
    try {
      await fetch('/api/sub-portal/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: invCompany, contactName: invContact, email: invEmail, trade: invTrade, projectAccess: invProjects }) });
    } catch { /* fallback */ }
    const newUser: SubUser = {
      id: uid(), company: invCompany, contactName: invContact, email: invEmail, phone: '',
      trade: invTrade, status: 'pending', projectAccess: invProjects,
      permissions: ['contract', 'schedule'], invitedDate: new Date().toISOString(),
      lastLogin: null, avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
    };
    setUsers(prev => [...prev, newUser]);
    setInvCompany(''); setInvContact(''); setInvEmail(''); setInvTrade(''); setInvTradeAuto(false);
    if (projects.length === 1) { setInvProjects([projects[0]]); setInvProjAuto(true); } else { setInvProjects([]); setInvProjAuto(false); }
    setInvSending(false);
    setInviteModal(false);
  }, [invCompany, invContact, invEmail, invTrade, invProjects, users.length, projects]);

  const handleBulkInvite = useCallback(async () => {
    if (!bulkText.trim()) return;
    setBulkSending(true);
    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    const newUsers: SubUser[] = lines.map((line, i) => {
      const parts = line.split(',').map(s => s.trim());
      return {
        id: uid(), company: parts[0] || 'Unknown', contactName: parts[1] || 'Contact',
        email: parts[2] || '', phone: '', trade: parts[3] || 'General',
        status: 'pending' as SubStatus, projectAccess: [], permissions: ['contract', 'schedule'],
        invitedDate: new Date().toISOString(), lastLogin: null,
        avatarColor: AVATAR_COLORS[(users.length + i) % AVATAR_COLORS.length],
      };
    });
    try {
      await fetch('/api/sub-portal/bulk-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invites: newUsers }) });
    } catch { /* fallback */ }
    setUsers(prev => [...prev, ...newUsers]);
    setBulkText('');
    setBulkSending(false);
    setBulkInviteModal(false);
  }, [bulkText, users.length]);

  const toggleUserStatus = useCallback((userId: string, newStatus: SubStatus) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    fetch('/api/sub-portal/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status: newStatus }) }).catch(() => {});
  }, []);

  const updatePermissions = useCallback((userId: string, perms: PortalPermission[]) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: perms } : u));
    fetch('/api/sub-portal/permissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permissions: perms }) }).catch(() => {});
  }, []);

  const toggleDocVisibility = useCallback((docId: string, subIds: string[]) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, visibleToSubs: subIds } : d));
    fetch('/api/sub-portal/doc-visibility', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, visibleToSubs: subIds }) }).catch(() => {});
  }, []);

  const sendAnnouncement = useCallback(async () => {
    if (!annSubject || !annBody) return;
    setAnnSending(true);
    try {
      const res = await fetch('/api/sub-portal/announce', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: annSubject, body: annBody, sentTo: annRecipients }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok && data?.announcement) {
        // Persisted server-side — prepend the real row (real id + timestamp).
        setAnnouncements(prev => [data.announcement as Announcement, ...prev]);
        if (data.emailConfigured === false) {
          void alertDialog({ title: 'Notice', message: 'Announcement saved. Email delivery isn’t set up yet, so no emails were sent — ask your administrator to enable email.' });
        } else {
          const n = Number(data.sent) || 0;
          void alertDialog({ title: 'Notice', message: `Announcement sent and emailed to ${n} recipient${n === 1 ? '' : 's'}.` });
        }
        setAnnSubject(''); setAnnBody(''); setAnnRecipients(['all']);
        setAnnounceModal(false);
      } else {
        console.error('announcement send failed', res.status, data?.error);
        void alertDialog({ title: 'Notice', message: humanError(data?.error, 'Could not send the announcement. Please try again.') });
      }
    } catch {
      void alertDialog({ title: 'Notice', message: 'Could not send the announcement — check your connection and try again.' });
    } finally {
      setAnnSending(false);
    }
  }, [annSubject, annBody, annRecipients]);

  const resendInvite = useCallback(async (userId: string) => {
    // Report the real outcome — the resend route actually sends the email, so
    // only claim success when it succeeds (was an unconditional "resent" alert).
    try {
      const res = await fetch('/api/sub-portal/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok && data?.success) {
        void alertDialog({ title: 'Notice', message: `Invitation resent${data?.sentTo ? ` to ${data.sentTo}` : ''}.` });
      } else {
        console.error('resend invite failed', res.status, data?.error);
        void alertDialog({ title: 'Notice', message: humanError(data?.error, 'Could not resend the invitation. Please try again.') });
      }
    } catch {
      void alertDialog({ title: 'Notice', message: 'Could not resend the invitation — check your connection and try again.' });
    }
  }, []);

  /* ── tab list ── */
  const TABS: { key: Tab; label: string }[] = [
    { key: 'inbox', label: inboxCount > 0 ? `Inbox (${inboxCount})` : 'Inbox' },
    { key: 'users', label: 'Sub Users' },
    { key: 'invite', label: 'Invite' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'activity', label: 'Activity Log' },
    { key: 'documents', label: 'Documents' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'directory', label: 'Directory' },
    { key: 'messages', label: 'Announcements' },
  ];

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={6} />
      </PremiumSurface>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: RAISED, border: `1px solid ${RED}`, borderRadius: 12, padding: 32, textAlign: 'center', maxWidth: 420 }}>
          <p style={{ color: RED, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Error Loading Portal</p>
          <p style={{ color: DIM, fontSize: 14, marginBottom: 16 }}>{error}</p>
          <button onClick={() => window.location.reload()} style={btnPrimary}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <>
    <PremiumSurface maxWidth={2200}>
      {/* ── header ── */}
      <ModuleHero
        eyebrow="Sub Portal"
        eyebrowIcon={<UsersThree size={13} weight="fill" color={GOLD} />}
        title="Sub Portal"
        accent="Management"
        subtitle="Manage subcontractor portal access, compliance, and communications"
        actions={<>
          <button onClick={() => setBulkInviteModal(true)} style={ghostButtonStyle} className="pmBtn"><UploadSimple size={15} weight="bold" /> Bulk Invite</button>
          <button onClick={() => setInviteModal(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Invite Sub</button>
        </>}
      />

      {/* ── stat cards ── */}
      {/* Two to a row on a phone, so the inbox below is reached without two screens of cards. */}
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 640px){.sp-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;margin-bottom:16px!important}.sp-intel{display:none}}' }} />
      <div className="sp-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Total Subs', value: stats.total, color: GOLD, icon: <UsersThree size={19} weight="duotone" color={GOLD} /> },
          { label: 'Active', value: stats.active, color: GREEN, icon: <CheckCircle size={19} weight="duotone" color={GREEN} /> },
          { label: 'Pending', value: stats.pending, color: AMBER, icon: <Clock size={19} weight="duotone" color={AMBER} /> },
          { label: 'Disabled', value: stats.disabled, color: RED, icon: <Prohibit size={19} weight="duotone" color={RED} /> },
          { label: 'Expiring Docs', value: stats.compExpiring, color: AMBER, icon: <WarningCircle size={19} weight="duotone" color={AMBER} /> },
          { label: 'Expired Docs', value: stats.compExpired, color: RED, icon: <XCircle size={19} weight="duotone" color={RED} /> },
          { label: 'Missing Docs', value: stats.compMissing, color: DIM, icon: <FileX size={19} weight="duotone" color={DIM} /> },
        ].map((s, i) => (
          <StatCard key={i} icon={s.icon} label={s.label} value={String(s.value)} accent={s.color} delay={i * 0.04}  href="/app/sub-portal"/>
        ))}
      </div>

      {/* ── roster intelligence strip — adoption, engagement, compliance health ── */}
      {users.length > 0 && (
        <div className="sp-intel"><StatStrip items={[
          {href: '/app/sub-portal', 
            label: 'Portal Adoption', value: `${intel.adoption}%`,
            accent: intel.adoption >= 70 ? GREEN : AMBER,
            sub: `${stats.active} active of ${stats.total} invited`,
          },
          {href: '/app/sub-portal', 
            label: 'Never Logged In', value: String(intel.neverLogged),
            accent: intel.neverLogged > 0 ? AMBER : GREEN,
            sub: intel.neverLogged > 0 ? 'Active accounts, zero visits — resend the link' : 'Every active sub has visited',
          },
          {href: '/app/sub-portal', label: 'Trades Onboarded', value: String(intel.uniqueTrades), sub: 'Distinct trades across the roster' },
          {href: '/app/sub-portal', 
            label: 'Compliance Health', value: compliance.length > 0 ? `${intel.compPct}%` : '—',
            accent: compliance.length === 0 ? undefined : intel.compPct >= 80 ? GREEN : intel.needAttention > 0 ? RED : AMBER,
            sub: compliance.length > 0 ? `${intel.needAttention} document${intel.needAttention === 1 ? '' : 's'} need attention` : 'No compliance docs tracked yet',
          },
          {href: '/app/sub-portal', label: 'Docs Shared', value: String(docs.length), sub: docs.length > 0 ? `${intel.docsAll} visible to all subs` : 'Nothing shared to the portal yet' },
          {href: '/app/sub-portal', 
            label: 'Activity (7d)', value: String(intel.events7),
            sub: intel.lastEventTs > 0 ? `Last event ${fmtDateTime(new Date(intel.lastEventTs).toISOString())}` : 'No portal events yet',
          },
        ]} /></div>
      )}

      {/* ── tabs ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
              color: tab === t.key ? GOLD : DIM, fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── filters (shared) ── */}
      {['users', 'permissions', 'directory', 'compliance'].includes(tab) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input placeholder="Search name, company, email…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, maxWidth: 280 }} />
          <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ ...selectStyle, maxWidth: 180 }}>
            <option value="">All Trades</option>
            {Array.from(new Set([...ALL_TRADES, ...users.map(u => u.trade).filter(Boolean)])).sort((a, b) => a.localeCompare(b)).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ ...selectStyle, maxWidth: 220 }}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, maxWidth: 160 }}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      )}

      {/* ── what subs sent in: invoices, RFIs, messages, logs, waivers ── */}
      {tab === 'inbox' && <SubInbox onCounts={setInboxCount} />}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: SUB USERS                             */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'users' && (
        <SectionCard flush icon={<UsersThree size={17} weight="duotone" color={GOLD} />} title="Sub Users">
          <div style={{ overflowX: 'auto' }}>
          <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Contact', 'Company', 'Trade', 'Status', 'Last Login', 'Projects', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 0 }}><PremiumEmpty compact icon={<UsersThree size={30} weight="duotone" color={GOLD} />} title="No subcontractors found" description="No subs match your current filters. Adjust the filters or invite a subcontractor." /></td></tr>
              )}
              {filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)`, cursor: 'pointer' }}
                  onClick={() => setUserDetailModal(u)}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: `color-mix(in srgb, ${u.avatarColor} 19%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.avatarColor, fontWeight: 700, fontSize: 14 }}>
                        {u.contactName.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{u.contactName}</div>
                        <div style={{ color: DIM, fontSize: 12 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 14 }}>{u.company}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 6, background: `color-mix(in srgb, ${PURPLE} 9%, transparent)`, color: PURPLE, fontSize: 12 }}>{u.trade}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={u.status} /></td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 13 }}>{u.lastLogin ? fmtDateTime(u.lastLogin) : 'Never'}</td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 13 }}>{u.projectAccess.length} project{u.projectAccess.length !== 1 ? 's' : ''}</td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {u.status === 'pending' && (
                        <button onClick={() => resendInvite(u.id)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>Resend</button>
                      )}
                      {u.status === 'active' && (
                        <button onClick={() => toggleUserStatus(u.id, 'disabled')} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: RED, borderColor: `color-mix(in srgb, ${RED} 31%, transparent)` }}>Disable</button>
                      )}
                      {u.status === 'disabled' && (
                        <button onClick={() => toggleUserStatus(u.id, 'active')} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: GREEN, borderColor: `color-mix(in srgb, ${GREEN} 31%, transparent)` }}>Enable</button>
                      )}
                      <button onClick={() => setPermModal(u)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>Permissions</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: INVITE                                */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'invite' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
          {/* single invite */}
          <SectionCard icon={<Plus size={17} weight="duotone" color={GOLD} />} title="Invite Subcontractor">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Company Name *</label><input value={invCompany} onChange={e => onInvCompanyChange(e.target.value)} style={inputStyle} placeholder="Enter company name" /></div>
              <div><label style={labelStyle}>Contact Name *</label><input value={invContact} onChange={e => setInvContact(e.target.value)} style={inputStyle} placeholder="Full name" /></div>
              <div>
                <label style={labelStyle}>Email Address *</label>
                <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} style={{ ...inputStyle, borderColor: invEmailTrim && !invEmailValid ? `color-mix(in srgb, ${RED} 50%, transparent)` : BORDER }} placeholder="email@company.com" />
                {invEmailTrim && !invEmailValid && <div style={{ color: RED, fontSize: 11.5, marginTop: 4 }}>Enter a valid email — the invitation and the portal login both use it.</div>}
                {invDup && <div style={{ color: AMBER, fontSize: 11.5, marginTop: 4 }}>{invDup.company || invDup.contactName} is already on the roster ({invDup.status}) — sending again creates a duplicate. Use Resend from the Sub Users tab instead.</div>}
              </div>
              <div>
                <label style={labelStyle}>Trade *{invTradeAuto && invTrade ? <AutoChip /> : null}</label>
                <select value={invTrade} onChange={e => { setInvTrade(e.target.value); setInvTradeAuto(false); }} style={selectStyle}>
                  <option value="">Select trade</option>
                  {ALL_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {invTradeAuto && invTrade && <div style={{ color: DIM, fontSize: 11.5, marginTop: 4 }}>Inferred from the company name — change it if that is wrong.</div>}
              </div>
              <div>
                <label style={labelStyle}>Project Access{invProjAuto && invProjects.length > 0 ? <AutoChip /> : null}</label>
                {invProjAuto && invProjects.length > 0 && <div style={{ color: DIM, fontSize: 11.5, marginBottom: 2 }}>Your only project — preselected. Uncheck to invite without project access.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {projects.length === 0 && <span style={{ color: DIM, fontSize: 12 }}>No projects yet — create a project first to grant access.</span>}
                  {projects.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={invProjects.includes(p)}
                        onChange={() => { setInvProjAuto(false); setInvProjects(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]); }} />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.5, padding: '9px 12px', background: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)', borderRadius: 8 }}>
                New subs start with <b style={{ color: TEXT }}>Their Contract + Schedule</b> visible. Fine-tune everything else in the Permissions tab after inviting.
              </div>
              <button onClick={handleInvite} disabled={invDisabled}
                style={{ ...goldButtonStyle, width: '100%', opacity: invDisabled ? 0.5 : 1, marginTop: 8, cursor: invDisabled ? 'not-allowed' : 'pointer' }} className="pmBtn">
                {invSending ? 'Sending…' : 'Send Invitation'}
              </button>
            </div>
          </SectionCard>

          {/* bulk invite */}
          <SectionCard icon={<UploadSimple size={17} weight="duotone" color={GOLD} />} title="Bulk Invite" subtitle="Enter one sub per line in CSV format: Company, Contact Name, Email, Trade">
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
              style={{ ...inputStyle, height: 200, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
              placeholder={'Apex Electric, John Smith, john@apex.com, Electrical\nBlue Plumbing, Jane Doe, jane@blue.com, Plumbing'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ color: DIM, fontSize: 12 }}>
                {bulkStats.n > 0 ? `${bulkStats.n} entr${bulkStats.n === 1 ? 'y' : 'ies'}` : 'No entries'}
                {bulkStats.bad > 0 && <span style={{ color: RED }}> · {bulkStats.bad} invalid email{bulkStats.bad === 1 ? '' : 's'}</span>}
                {bulkStats.badTrade > 0 && <span style={{ color: AMBER }}> · {bulkStats.badTrade} trade{bulkStats.badTrade === 1 ? '' : 's'} outside the canonical list</span>}
              </span>
              <button onClick={handleBulkInvite} disabled={bulkSending || !bulkText.trim()}
                style={{ ...goldButtonStyle, opacity: (bulkSending || !bulkText.trim()) ? 0.5 : 1 }} className="pmBtn">
                {bulkSending ? 'Sending…' : 'Send All Invitations'}
              </button>
            </div>

            {/* recent invites */}
            <div style={{ marginTop: 24, borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
              <h4 style={{ color: TEXT, margin: '0 0 12px', fontSize: 14 }}>Recent Invitations</h4>
              {users.filter(u => u.status === 'pending').length === 0 && (
                <p style={{ color: DIM, fontSize: 13 }}>No pending invitations.</p>
              )}
              {users.filter(u => u.status === 'pending').map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                  <div>
                    <span style={{ color: TEXT, fontSize: 14 }}>{u.contactName}</span>
                    <span style={{ color: DIM, fontSize: 12, marginLeft: 8 }}>{u.company}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: DIM, fontSize: 12 }}>Sent {fmtDate(u.invitedDate)}</span>
                    <button onClick={() => resendInvite(u.id)} style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11 }}>Resend</button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* what happens next */}
          <SectionCard flat icon={<ListChecks size={17} weight="duotone" color={GOLD} />} title="After You Invite">
            <FlowSteps title="" steps={[
              { title: 'Invitation email goes out', desc: 'The sub gets a secure portal link tied to their email — no password to manage.' },
              { title: 'They show as Pending', desc: 'The roster tracks them until first login. Resend the invite from Sub Users any time.' },
              { title: 'Default access: Contract + Schedule', desc: 'New subs start seeing only their contract and the schedule. Expand access in Permissions.' },
              { title: 'Every visit is logged', desc: 'Logins and document views land in the Activity Log automatically.' },
            ]} />
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: PERMISSIONS                           */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'permissions' && (
        <SectionCard flush icon={<ListChecks size={17} weight="duotone" color={GOLD} />} title="Portal Access Permissions" subtitle="Control what each subcontractor can see in their portal">
          <div style={{ overflowX: 'auto' }}>
          <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600}}>Subcontractor</th>
                {ALL_PERMISSIONS_LIST.map(p => (
                  <th key={p.key} style={{ padding: '12px 10px', textAlign: 'center', color: DIM, fontSize: 11, fontWeight: 600}}>{p.label}</th>
                ))}
                <th style={{ padding: '12px 16px', textAlign: 'center', color: DIM, fontSize: 12, fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr><td colSpan={ALL_PERMISSIONS_LIST.length + 2} style={{ padding: 0 }}><PremiumEmpty compact icon={<ListChecks size={30} weight="duotone" color={GOLD} />} title="No subs found" description="Invite a subcontractor to manage their portal permissions here." /></td></tr>
              )}
              {filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.contactName}</div>
                    <div style={{ color: DIM, fontSize: 12 }}>{u.company}</div>
                  </td>
                  {ALL_PERMISSIONS_LIST.map(p => (
                    <td key={p.key} style={{ padding: '10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={u.permissions.includes(p.key)}
                        onChange={() => {
                          const next = u.permissions.includes(p.key) ? u.permissions.filter(x => x !== p.key) : [...u.permissions, p.key];
                          updatePermissions(u.id, next);
                        }} />
                    </td>
                  ))}
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => updatePermissions(u.id, ALL_PERMISSIONS_LIST.map(p => p.key))}
                        style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11, color: GREEN, borderColor: `color-mix(in srgb, ${GREEN} 31%, transparent)` }}>All</button>
                      <button onClick={() => updatePermissions(u.id, [])}
                        style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11, color: RED, borderColor: `color-mix(in srgb, ${RED} 31%, transparent)` }}>None</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: ACTIVITY LOG                          */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'activity' && (
        <SectionCard flat flush icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />} title="Portal Activity Log" subtitle="Track when subs logged in and what they viewed" action={<span style={{ color: DIM, fontSize: 13 }}>{activity.length} entries{intel.events7 > 0 ? ` · ${intel.events7} this week` : ''}</span>}>
          {/* activity context — engagement at a glance before the raw feed */}
          {activity.length > 0 && (
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.02)', fontSize: 12.5, color: DIM }}>
              <span>Last 7 days: <b style={{ color: TEXT }}>{intel.events7}</b> event{intel.events7 === 1 ? '' : 's'}</span>
              <span>Logins: <b style={{ color: GREEN }}>{intel.logins}</b></span>
              {intel.mostActive && <span>Most active: <b style={{ color: GOLD }}>{intel.mostActive}</b></span>}
              {intel.lastEventTs > 0 && <span>Last event: <b style={{ color: TEXT }}>{fmtDateTime(new Date(intel.lastEventTs).toISOString())}</b></span>}
            </div>
          )}
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            {activity.length === 0 && (
              <PremiumEmpty compact icon={<ClockCounterClockwise size={30} weight="duotone" color={GOLD} />} title="No portal activity yet" description="Sub logins and document views will appear here." />
            )}
            {activity.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 14, padding: '14px 20px', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)`,
                background: i % 2 === 0 ? 'transparent' : `color-mix(in srgb, ${BG} 25%, transparent)` }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `color-mix(in srgb, ${BLUE} 13%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: BLUE, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {a.subName.split(' ').map(n => n[0]).join('')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{a.subName} <span style={{ color: DIM, fontWeight: 400 }}>({a.company})</span></span>
                    <span style={{ color: DIM, fontSize: 12 }}>{fmtDateTime(a.timestamp)}</span>
                  </div>
                  <div style={{ color: DIM, fontSize: 13, marginTop: 2 }}>
                    <span style={{ color: a.action.includes('Login') || a.action.includes('Logged in') ? GREEN : a.action.includes('Logout') || a.action.includes('Logged out') ? RED : AMBER }}>
                      {a.action}
                    </span>
                    {a.detail && <span> - {a.detail}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: DOCUMENTS                             */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'documents' && (
        <SectionCard flush icon={<FileText size={17} weight="duotone" color={GOLD} />} title="Document Sharing Controls" subtitle="Control which documents are visible to subcontractors">
          <div style={{ overflowX: 'auto' }}>
          <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Document', 'Category', 'Project', 'Size', 'Uploaded', 'Visibility', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 0 }}><PremiumEmpty compact icon={<FileText size={30} weight="duotone" color={GOLD} />} title="No shared documents yet" description="Documents shared to the sub portal will appear here." /></td></tr>
              )}
              {docs.map(d => (
                <tr key={d.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={16} weight="duotone" color={GOLD} />
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{d.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 13 }}>{d.category}</td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 13 }}>{d.projectName}</td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 13 }}>{d.size}</td>
                  <td style={{ padding: '12px 16px', color: DIM, fontSize: 13 }}>{fmtDate(d.uploadedDate)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {d.visibleToSubs.includes('all') ? (
                      <span style={{ color: GREEN, fontSize: 12, fontWeight: 600 }}>All Subs</span>
                    ) : d.visibleToSubs.length > 0 ? (
                      <span style={{ color: AMBER, fontSize: 12, fontWeight: 600 }}>{d.visibleToSubs.length} sub{d.visibleToSubs.length !== 1 ? 's' : ''}</span>
                    ) : (
                      <span style={{ color: RED, fontSize: 12, fontWeight: 600 }}>Hidden</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setDocShareModal(d)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>Manage</button>
                      {d.visibleToSubs.includes('all') ? (
                        <button onClick={() => toggleDocVisibility(d.id, [])} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: RED, borderColor: `color-mix(in srgb, ${RED} 31%, transparent)` }}>Hide</button>
                      ) : (
                        <button onClick={() => toggleDocVisibility(d.id, ['all'])} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: GREEN, borderColor: `color-mix(in srgb, ${GREEN} 31%, transparent)` }}>Show All</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: COMPLIANCE                            */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'compliance' && (
        <div>
          {/* compliance summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Valid', count: compliance.filter(c => c.status === 'valid').length, color: GREEN, icon: <CheckCircle size={19} weight="duotone" color={GREEN} /> },
              { label: 'Expiring Soon', count: compliance.filter(c => c.status === 'expiring').length, color: AMBER, icon: <WarningCircle size={19} weight="duotone" color={AMBER} /> },
              { label: 'Expired', count: compliance.filter(c => c.status === 'expired').length, color: RED, icon: <XCircle size={19} weight="duotone" color={RED} /> },
              { label: 'Missing', count: compliance.filter(c => c.status === 'missing').length, color: DIM, icon: <FileX size={19} weight="duotone" color={DIM} /> },
            ].map((s, i) => (
              <StatCard key={i} icon={s.icon} label={s.label} value={String(s.count)} accent={s.color} delay={i * 0.04}  href="/app/sub-portal"/>
            ))}
          </div>

          <SectionCard flush icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />} title="Compliance Tracking" subtitle="Insurance, W-9, and license expiration tracking">
            <div style={{ overflowX: 'auto' }}>
            <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Subcontractor', 'Company', 'Document Type', 'Status', 'Expiration', 'File', 'Uploaded'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compliance.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 0 }}><PremiumEmpty compact icon={<ShieldCheck size={30} weight="duotone" color={GOLD} />} title="No compliance documents yet" description="COIs, W-9s, and licenses your subs upload will appear here." /></td></tr>
                )}
                {compliance
                  .filter(c => {
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      return c.subName.toLowerCase().includes(q) || c.company.toLowerCase().includes(q);
                    }
                    return true;
                  })
                  .map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, fontSize: 14 }}>{c.subName}</td>
                    <td style={{ padding: '10px 16px', color: DIM, fontSize: 13 }}>{c.company}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12,
                        background: c.docType === 'insurance' ? `color-mix(in srgb, ${BLUE} 9%, transparent)` : c.docType === 'w9' ? `color-mix(in srgb, ${PURPLE} 9%, transparent)` : `color-mix(in srgb, ${GOLD} 9%, transparent)`,
                        color: c.docType === 'insurance' ? BLUE : c.docType === 'w9' ? PURPLE : GOLD }}>
                        {c.docType === 'w9' ? 'W-9' : c.docType.charAt(0).toUpperCase() + c.docType.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}><StatusBadge status={c.status} /></td>
                    <td style={{ padding: '10px 16px', color: c.status === 'expired' ? RED : c.status === 'expiring' ? AMBER : DIM, fontSize: 13 }}>
                      {c.expirationDate ? fmtDate(c.expirationDate) : 'N/A'}
                    </td>
                    <td style={{ padding: '10px 16px', color: DIM, fontSize: 13 }}>{c.fileName || '—'}</td>
                    <td style={{ padding: '10px 16px', color: DIM, fontSize: 13 }}>{fmtDate(c.uploadedDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: DIRECTORY                             */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'directory' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredUsers.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <PremiumEmpty icon={<AddressBook size={30} weight="duotone" color={GOLD} />} title="No subcontractors found" description="No subs match your current filters. Adjust the filters or invite a subcontractor to build your directory." />
            </div>
          )}
          {filteredUsers.map(u => (
            <div key={u.id} style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 16, padding: 20, cursor: 'pointer',
              boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)', transition: 'border-color 0.2s' }}
              onClick={() => setUserDetailModal(u)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `color-mix(in srgb, ${u.avatarColor} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.avatarColor, fontWeight: 700, fontSize: 18 }}>
                  {u.contactName.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{u.contactName}</div>
                  <div style={{ color: DIM, fontSize: 13 }}>{u.company}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: DIM }}>Trade</span>
                  <span style={{ color: PURPLE }}>{u.trade}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: DIM }}>Email</span>
                  <span style={{ color: TEXT }}>{u.email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: DIM }}>Phone</span>
                  <span style={{ color: TEXT }}>{u.phone || '--'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
                  <span style={{ color: DIM }}>Status</span>
                  <StatusBadge status={u.status} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: DIM }}>Projects</span>
                  <span style={{ color: GOLD }}>{u.projectAccess.length}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: MESSAGES                              */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'messages' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, color: TEXT, fontSize: 16 }}>Announcements & Broadcasts</h3>
              <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>Send messages to all or selected subcontractors</p>
            </div>
            <button onClick={() => setAnnounceModal(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> New Announcement</button>
          </div>

          {/* inline compose */}
          <SectionCard icon={<Megaphone size={17} weight="duotone" color={GOLD} />} title="Quick Broadcast" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={labelStyle}>Subject</label><input value={annSubject} onChange={e => setAnnSubject(e.target.value)} style={inputStyle} placeholder="Announcement subject" /></div>
              <div>
                <label style={labelStyle}>Message</label>
                <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} style={{ ...inputStyle, height: 100, resize: 'vertical' }} placeholder="Write your announcement…" />
              </div>
              <div>
                <label style={labelStyle}>Recipients</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="recipients" checked={annRecipients.includes('all')} onChange={() => setAnnRecipients(['all'])} /> All Subs
                  </label>
                  {ALL_TRADES.map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={annRecipients.includes(t)}
                        onChange={() => {
                          setAnnRecipients(prev => {
                            const next = prev.filter(x => x !== 'all');
                            return next.includes(t) ? next.filter(x => x !== t) : [...next, t];
                          });
                        }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={sendAnnouncement} disabled={annSending || !annSubject || !annBody}
                  style={{ ...goldButtonStyle, opacity: (annSending || !annSubject || !annBody) ? 0.5 : 1 }} className="pmBtn">
                  {annSending ? 'Sending…' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          </SectionCard>

          {/* announcement history */}
          <SectionCard flat flush icon={<Envelope size={17} weight="duotone" color={GOLD} />} title="Announcement History">
            {announcements.length === 0 && (
              <PremiumEmpty compact icon={<Envelope size={30} weight="duotone" color={GOLD} />} title="No announcements sent yet" description="Broadcasts you send to your subcontractors will appear here." />
            )}
            {announcements.map(a => (
              <div key={a.id} style={{ padding: '16px 20px', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: TEXT }}>{a.subject}</span>
                  <span style={{ color: DIM, fontSize: 12 }}>{fmtDateTime(a.sentDate)}</span>
                </div>
                <p style={{ color: DIM, fontSize: 13, margin: '0 0 8px', lineHeight: 1.5 }}>{a.body}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: DIM, fontSize: 12 }}>Sent by: {a.sentBy}</span>
                  <span style={{ color: BORDER }}>|</span>
                  <span style={{ color: DIM, fontSize: 12 }}>To: {a.sentTo.includes('all') ? 'All Subs' : a.sentTo.join(', ')}</span>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </PremiumSurface>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: INVITE SUB                          */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Invite Subcontractor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={labelStyle}>Company Name *</label><input value={invCompany} onChange={e => onInvCompanyChange(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Contact Name *</label><input value={invContact} onChange={e => setInvContact(e.target.value)} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} style={{ ...inputStyle, borderColor: invEmailTrim && !invEmailValid ? `color-mix(in srgb, ${RED} 50%, transparent)` : BORDER }} />
            {invEmailTrim && !invEmailValid && <div style={{ color: RED, fontSize: 11.5, marginTop: 4 }}>Enter a valid email — the invitation and the portal login both use it.</div>}
            {invDup && <div style={{ color: AMBER, fontSize: 11.5, marginTop: 4 }}>{invDup.company || invDup.contactName} is already on the roster ({invDup.status}) — use Resend from Sub Users instead.</div>}
          </div>
          <div>
            <label style={labelStyle}>Trade *{invTradeAuto && invTrade ? <AutoChip /> : null}</label>
            <select value={invTrade} onChange={e => { setInvTrade(e.target.value); setInvTradeAuto(false); }} style={selectStyle}>
              <option value="">Select trade</option>
              {ALL_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {invTradeAuto && invTrade && <div style={{ color: DIM, fontSize: 11.5, marginTop: 4 }}>Inferred from the company name — change it if that is wrong.</div>}
          </div>
          <div>
            <label style={labelStyle}>Project Access{invProjAuto && invProjects.length > 0 ? <AutoChip /> : null}</label>
            {invProjAuto && invProjects.length > 0 && <div style={{ color: DIM, fontSize: 11.5, marginBottom: 2 }}>Your only project — preselected. Uncheck to invite without project access.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {projects.length === 0 && <span style={{ color: DIM, fontSize: 12 }}>No projects yet — create a project first to grant access.</span>}
              {projects.map(p => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={invProjects.includes(p)}
                    onChange={() => { setInvProjAuto(false); setInvProjects(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]); }} />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.5 }}>
            New subs start with <b style={{ color: TEXT }}>Their Contract + Schedule</b> visible — expand access in the Permissions tab after inviting.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => setInviteModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={handleInvite} disabled={invDisabled}
              style={{ ...btnPrimary, opacity: invDisabled ? 0.5 : 1, cursor: invDisabled ? 'not-allowed' : 'pointer' }}>
              {invSending ? 'Sending…' : 'Send Invitation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: BULK INVITE                         */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={bulkInviteModal} onClose={() => setBulkInviteModal(false)} title="Bulk Invite Subcontractors" width={640}>
        <p style={{ color: DIM, fontSize: 13, margin: '0 0 12px' }}>
          Paste or type one subcontractor per line in CSV format:<br />
          <span style={{ color: GOLD, fontFamily: 'monospace' }}>Company, Contact Name, Email, Trade</span>
        </p>
        <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
          style={{ ...inputStyle, height: 220, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          placeholder={'Apex Electric, John Smith, john@apex.com, Electrical\nBlue Plumbing, Jane Doe, jane@blue.com, Plumbing'} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span style={{ color: DIM, fontSize: 12 }}>
            {bulkStats.n > 0 ? `${bulkStats.n} invitation${bulkStats.n === 1 ? '' : 's'} will be sent` : 'No entries'}
            {bulkStats.bad > 0 && <span style={{ color: RED }}> · {bulkStats.bad} invalid email{bulkStats.bad === 1 ? '' : 's'} — fix before sending</span>}
            {bulkStats.badTrade > 0 && <span style={{ color: AMBER }}> · {bulkStats.badTrade} trade{bulkStats.badTrade === 1 ? '' : 's'} outside the canonical list — check spelling</span>}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setBulkInviteModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={handleBulkInvite} disabled={bulkSending || !bulkText.trim()}
              style={{ ...btnPrimary, opacity: (bulkSending || !bulkText.trim()) ? 0.5 : 1 }}>
              {bulkSending ? 'Sending…' : 'Send All'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: PERMISSIONS                         */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={!!permModal} onClose={() => setPermModal(null)} title={`Permissions — ${permModal?.contactName || ''}`}>
        {permModal && (
          <div>
            <p style={{ color: DIM, fontSize: 13, margin: '0 0 16px' }}>Select what <strong style={{ color: TEXT }}>{permModal.contactName}</strong> can see in their portal:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ALL_PERMISSIONS_LIST.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${permModal.permissions.includes(p.key) ? `color-mix(in srgb, ${GREEN} 31%, transparent)` : BORDER}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={permModal.permissions.includes(p.key)}
                    onChange={() => {
                      const next = permModal.permissions.includes(p.key) ? permModal.permissions.filter(x => x !== p.key) : [...permModal.permissions, p.key];
                      setPermModal({ ...permModal, permissions: next });
                    }} />
                  <div>
                    <div style={{ color: TEXT, fontSize: 14, fontWeight: 500 }}>{p.label}</div>
                    <div style={{ color: DIM, fontSize: 12 }}>
                      {p.key === 'contract' ? 'View their contract details and amounts' :
                        p.key === 'schedule' ? 'View project schedule and milestones' :
                        p.key === 'daily_logs' ? 'View daily construction logs' :
                        p.key === 'rfis' ? 'View and respond to RFIs' :
                        p.key === 'submittals' ? 'View and upload submittals' :
                        'View and submit pay applications'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setPermModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { updatePermissions(permModal.id, permModal.permissions); setPermModal(null); }} style={btnPrimary}>Save Permissions</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: DOC SHARING                         */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={!!docShareModal} onClose={() => setDocShareModal(null)} title={`Document Sharing — ${docShareModal?.name || ''}`}>
        {docShareModal && (
          <div>
            <p style={{ color: DIM, fontSize: 13, margin: '0 0 16px' }}>Select who can view <strong style={{ color: TEXT }}>{docShareModal.name}</strong>:</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: GREEN, fontSize: 14, cursor: 'pointer', padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${docShareModal.visibleToSubs.includes('all') ? `color-mix(in srgb, ${GREEN} 31%, transparent)` : BORDER}` }}>
              <input type="checkbox" checked={docShareModal.visibleToSubs.includes('all')}
                onChange={() => {
                  setDocShareModal({ ...docShareModal, visibleToSubs: docShareModal.visibleToSubs.includes('all') ? [] : ['all'] });
                }} />
              All Subcontractors
            </label>
            {!docShareModal.visibleToSubs.includes('all') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflow: 'auto' }}>
                {users.filter(u => u.status === 'active').map(u => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13, cursor: 'pointer', padding: '8px 12px', background: BG, borderRadius: 6, border: `1px solid ${BORDER}` }}>
                    <input type="checkbox" checked={docShareModal.visibleToSubs.includes(u.id)}
                      onChange={() => {
                        const next = docShareModal.visibleToSubs.includes(u.id) ? docShareModal.visibleToSubs.filter(x => x !== u.id) : [...docShareModal.visibleToSubs, u.id];
                        setDocShareModal({ ...docShareModal, visibleToSubs: next });
                      }} />
                    <span style={{ color: TEXT }}>{u.contactName}</span>
                    <span style={{ color: DIM, marginLeft: 4 }}>({u.company})</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setDocShareModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { toggleDocVisibility(docShareModal.id, docShareModal.visibleToSubs); setDocShareModal(null); }} style={btnPrimary}>Save</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: ANNOUNCEMENT                        */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={announceModal} onClose={() => setAnnounceModal(false)} title="New Announcement" width={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={labelStyle}>Subject *</label><input value={annSubject} onChange={e => setAnnSubject(e.target.value)} style={inputStyle} placeholder="Announcement subject" /></div>
          <div>
            <label style={labelStyle}>Message *</label>
            <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} style={{ ...inputStyle, height: 140, resize: 'vertical' }} placeholder="Write your message…" />
          </div>
          <div>
            <label style={labelStyle}>Recipients</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: GREEN, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="ann-recipients" checked={annRecipients.includes('all')} onChange={() => setAnnRecipients(['all'])} /> All Subcontractors
              </label>
              <p style={{ color: DIM, fontSize: 12, margin: '4px 0' }}>Or select by trade:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {ALL_TRADES.map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={annRecipients.includes(t)}
                      onChange={() => setAnnRecipients(prev => {
                        const next = prev.filter(x => x !== 'all');
                        return next.includes(t) ? next.filter(x => x !== t) : [...next, t];
                      })} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => setAnnounceModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={sendAnnouncement} disabled={annSending || !annSubject || !annBody}
              style={{ ...btnPrimary, opacity: (annSending || !annSubject || !annBody) ? 0.5 : 1 }}>
              {annSending ? 'Sending…' : 'Send Announcement'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: USER DETAIL                         */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={!!userDetailModal} onClose={() => setUserDetailModal(null)} title={userDetailModal?.contactName || ''} width={580}>
        {userDetailModal && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: `color-mix(in srgb, ${userDetailModal.avatarColor} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: userDetailModal.avatarColor, fontWeight: 700, fontSize: 22 }}>
                {userDetailModal.contactName.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: TEXT }}>{userDetailModal.contactName}</h3>
                <p style={{ margin: '2px 0 0', color: DIM, fontSize: 14 }}>{userDetailModal.company}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Email', value: userDetailModal.email },
                { label: 'Phone', value: userDetailModal.phone || '—' },
                { label: 'Trade', value: userDetailModal.trade },
                { label: 'Invited', value: fmtDate(userDetailModal.invitedDate) },
                { label: 'Last Login', value: userDetailModal.lastLogin ? fmtDateTime(userDetailModal.lastLogin) : 'Never' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                  <p style={{ color: DIM, fontSize: 11, margin: '0 0 2px'}}>{item.label}</p>
                  <p style={{ color: TEXT, fontSize: 14, margin: 0, wordBreak: 'break-all' }}>{item.value}</p>
                </div>
              ))}
              <div style={{ padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <p style={{ color: DIM, fontSize: 11, margin: '0 0 4px'}}>Status</p>
                <StatusBadge status={userDetailModal.status} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ color: DIM, fontSize: 12, margin: '0 0 6px', fontWeight: 600 }}>Project Access</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {userDetailModal.projectAccess.length === 0 && <span style={{ color: DIM, fontSize: 13 }}>No projects assigned</span>}
                {userDetailModal.projectAccess.map(p => (
                  <span key={p} style={{ padding: '4px 10px', background: `color-mix(in srgb, ${BLUE} 9%, transparent)`, color: BLUE, borderRadius: 6, fontSize: 12 }}>{p}</span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ color: DIM, fontSize: 12, margin: '0 0 6px', fontWeight: 600 }}>Portal Permissions</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {userDetailModal.permissions.length === 0 && <span style={{ color: DIM, fontSize: 13 }}>No permissions</span>}
                {userDetailModal.permissions.map(p => (
                  <span key={p} style={{ padding: '4px 10px', background: `color-mix(in srgb, ${GREEN} 9%, transparent)`, color: GREEN, borderRadius: 6, fontSize: 12 }}>
                    {ALL_PERMISSIONS_LIST.find(x => x.key === p)?.label || p}
                  </span>
                ))}
              </div>
            </div>

            {/* compliance for this user */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ color: DIM, fontSize: 12, margin: '0 0 8px', fontWeight: 600 }}>Compliance</p>
              {compliance.filter(c => c.subName === userDetailModal.contactName).map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: BG, borderRadius: 6, border: `1px solid ${BORDER}`, marginBottom: 6 }}>
                  <span style={{ color: TEXT, fontSize: 13 }}>{c.docType === 'w9' ? 'W-9' : c.docType.charAt(0).toUpperCase() + c.docType.slice(1)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {c.expirationDate && <span style={{ color: DIM, fontSize: 12 }}>Exp: {fmtDate(c.expirationDate)}</span>}
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
              {userDetailModal.status === 'active' && (
                <button onClick={() => { toggleUserStatus(userDetailModal.id, 'disabled'); setUserDetailModal(null); }}
                  style={{ ...btnSecondary, color: RED, borderColor: `color-mix(in srgb, ${RED} 31%, transparent)` }}>Disable Access</button>
              )}
              {userDetailModal.status === 'disabled' && (
                <button onClick={() => { toggleUserStatus(userDetailModal.id, 'active'); setUserDetailModal(null); }}
                  style={{ ...btnSecondary, color: GREEN, borderColor: `color-mix(in srgb, ${GREEN} 31%, transparent)` }}>Enable Access</button>
              )}
              {userDetailModal.status === 'pending' && (
                <button onClick={() => resendInvite(userDetailModal.id)} style={btnSecondary}>Resend Invite</button>
              )}
              <button onClick={() => { setPermModal(userDetailModal); setUserDetailModal(null); }} style={btnPrimary}>Edit Permissions</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
