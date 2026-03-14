'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

/* ── palette ──────────────────────────────────────────── */
const GOLD='#D4A017',BG='#07101C',RAISED='#0D1D2E',BORDER='#1E3A5F',TEXT='#F0F4FF',DIM='#8BAAC8';
const GREEN='#22C55E',RED='#EF4444',AMBER='#F59E0B',BLUE='#3B82F6',PURPLE='#8B5CF6';

/* ── types ────────────────────────────────────────────── */
type PortalStatus = 'active' | 'pending' | 'disabled';

interface PortalUser {
  id: string; name: string; email: string; company: string;
  status: PortalStatus; role: string; phone: string;
  lastLogin: string | null; invitedAt: string;
  projectIds: string[]; accessLink: string;
  permissions: Record<string, boolean>;
}

interface PortalMessage {
  id: string; threadId: string; from: string; fromRole: 'gc' | 'client';
  text: string; ts: string; read: boolean; userId: string;
}

interface ActivityEntry {
  id: string; userId: string; userName: string;
  action: string; ts: string; ip: string; section: string;
}

interface Project {
  id: string; name: string; status?: string;
}

const ROLES = ['Owner', 'Architect', 'Consultant', 'Investor', 'Property Manager'] as const;
const PERM_KEYS = ['Budget', 'Schedule', 'Photos', 'RFIs', 'Documents', 'Daily Logs',
  'Change Orders', 'Invoices', 'Submittals', 'Punch List', 'Selections', 'Messages'] as const;
const TABS = ['Users', 'Messages', 'Permissions', 'Access Matrix', 'Activity Log'] as const;
const STATUS_COLORS: Record<PortalStatus, string> = { active: GREEN, pending: AMBER, disabled: RED };
const STATUS_LABELS: Record<PortalStatus, string> = { active: 'Active', pending: 'Pending', disabled: 'Disabled' };

function uid() { return Math.random().toString(36).slice(2, 11); }
function now() { return new Date().toISOString(); }
function fmtDate(d: string | null) {
  if (!d) return 'Never';
  const x = new Date(d);
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function relTime(d: string | null) {
  if (!d) return 'Never';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function defaultPerms(): Record<string, boolean> {
  const p: Record<string, boolean> = {};
  PERM_KEYS.forEach(k => (p[k] = true));
  return p;
}

/* ── shared inline styles ─────────────────────────────── */
const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 };
const btnGold: React.CSSProperties = { padding: '9px 20px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, color: BG, borderRadius: 8, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' };
const btnOutline: React.CSSProperties = { padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { padding: '8px 16px', background: 'transparent', border: `1px solid ${RED}`, borderRadius: 8, color: RED, fontSize: 13, cursor: 'pointer' };
const inputS: React.CSSProperties = { padding: '9px 14px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const badge = (c: string, bg: string): React.CSSProperties => ({ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c, background: bg, display: 'inline-block' });
const thS: React.CSSProperties = { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: '.6px', textAlign: 'left' as const, borderBottom: `1px solid ${BORDER}` };
const tdS: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: TEXT, borderBottom: `1px solid ${BORDER}22` };

/* ── modal ────────────────────────────────────────────── */
function Modal({ open, onClose, title, children, width = 540 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, width, maxWidth: '94vw', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── toggle ───────────────────────────────────────────── */
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={onToggle}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? GREEN : BORDER, position: 'relative', transition: 'background .2s' }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: on ? 18 : 2, transition: 'left .2s' }} />
      </div>
      {label && <span style={{ fontSize: 13, color: TEXT }}>{label}</span>}
    </div>
  );
}

/* ── stat box ─────────────────────────────────────────── */
function Stat({ label, value, color = GOLD }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/* ── MAIN COMPONENT ───────────────────────────────────── */
/* ══════════════════════════════════════════════════════════ */
export default function ClientPortalPage() {
  const [tab, setTab] = useState<typeof TABS[number]>('Users');
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [actLog, setActLog] = useState<ActivityEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PortalStatus | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState('all');

  /* modals */
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editUser, setEditUser] = useState<PortalUser | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<PortalUser | null>(null);

  /* invite form */
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invCompany, setInvCompany] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invRole, setInvRole] = useState<string>('Owner');
  const [invProjects, setInvProjects] = useState<Set<string>>(new Set());
  const [invPerms, setInvPerms] = useState<Record<string, boolean>>(defaultPerms);
  const [invError, setInvError] = useState('');
  const [invSaving, setInvSaving] = useState(false);

  /* bulk invite */
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  /* messages */
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  /* activity log filters */
  const [logSearch, setLogSearch] = useState('');
  const [logSection, setLogSection] = useState('all');

  /* copied link feedback */
  const [copiedLink, setCopiedLink] = useState('');

  /* ── fetch data ─────────────────────────────────────── */
  const fetchPortalUsers = useCallback(async () => {
    try {
      const r = await fetch('/api/client-portal/users');
      if (!r.ok) throw new Error('Failed to load portal users');
      const d = await r.json();
      setUsers(d.users ?? d ?? []);
    } catch (e: any) { setError(e.message); }
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch('/api/client-portal/messages');
      if (!r.ok) throw new Error('Failed to load messages');
      const d = await r.json();
      setMessages(d.messages ?? d ?? []);
    } catch { /* silent */ }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const r = await fetch('/api/client-portal/activity');
      if (!r.ok) throw new Error('Failed to load activity');
      const d = await r.json();
      setActLog(d.entries ?? d ?? []);
    } catch { /* silent */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const r = await fetch('/api/projects/list');
      if (r.ok) { const d = await r.json(); setProjects(d.projects ?? []); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPortalUsers(), fetchMessages(), fetchActivity(), fetchProjects()])
      .finally(() => setLoading(false));
  }, [fetchPortalUsers, fetchMessages, fetchActivity, fetchProjects]);

  /* scroll to bottom on new message */
  useEffect(() => {
    if (msgEndRef.current) msgEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedThread]);

  /* ── filtered users ─────────────────────────────────── */
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.name.toLowerCase().includes(q) &&
            !u.email.toLowerCase().includes(q) &&
            !u.company.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [users, statusFilter, roleFilter, search]);

  /* ── thread helpers ─────────────────────────────────── */
  const threads = useMemo(() => {
    const map = new Map<string, { user: PortalUser; lastMsg: PortalMessage; unread: number }>();
    const userMap = new Map(users.map(u => [u.id, u]));
    messages.forEach(m => {
      const existing = map.get(m.userId);
      const user = userMap.get(m.userId);
      if (!user) return;
      const unread = (!m.read && m.fromRole === 'client') ? 1 : 0;
      if (!existing || new Date(m.ts) > new Date(existing.lastMsg.ts)) {
        map.set(m.userId, { user, lastMsg: m, unread: (existing?.unread ?? 0) + unread });
      } else {
        existing.unread += unread;
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.lastMsg.ts).getTime() - new Date(a.lastMsg.ts).getTime());
  }, [messages, users]);

  const threadMessages = useMemo(() => {
    if (!selectedThread) return [];
    return messages.filter(m => m.userId === selectedThread)
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }, [messages, selectedThread]);

  /* ── activity log filtered ──────────────────────────── */
  const filteredLog = useMemo(() => {
    return actLog.filter(e => {
      if (logSection !== 'all' && e.section !== logSection) return false;
      if (logSearch) {
        const q = logSearch.toLowerCase();
        if (!e.userName.toLowerCase().includes(q) && !e.action.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [actLog, logSection, logSearch]);

  const logSections = useMemo(() => {
    const s = new Set(actLog.map(e => e.section));
    return Array.from(s).sort();
  }, [actLog]);

  /* ── actions ────────────────────────────────────────── */
  async function inviteUser() {
    setInvError('');
    if (!invName.trim()) { setInvError('Name is required'); return; }
    if (!invEmail.trim() || !invEmail.includes('@')) { setInvError('Valid email is required'); return; }
    if (!invCompany.trim()) { setInvError('Company is required'); return; }
    if (invProjects.size === 0 && projects.length > 0) { setInvError('Select at least one project'); return; }
    setInvSaving(true);
    try {
      const payload = {
        name: invName.trim(), email: invEmail.trim(), company: invCompany.trim(),
        phone: invPhone.trim(), role: invRole,
        projectIds: Array.from(invProjects), permissions: invPerms,
      };
      const r = await fetch('/api/client-portal/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to invite user'); }
      const d = await r.json();
      setUsers(prev => [d.user ?? { ...payload, id: uid(), status: 'pending' as PortalStatus, lastLogin: null, invitedAt: now(), accessLink: 'https://portal.saguaro.app/c/' + uid(), projectIds: Array.from(invProjects), permissions: invPerms }, ...prev]);
      resetInviteForm();
      setInviteOpen(false);
    } catch (e: any) { setInvError(e.message); } finally { setInvSaving(false); }
  }

  function resetInviteForm() {
    setInvName(''); setInvEmail(''); setInvCompany(''); setInvPhone('');
    setInvRole('Owner'); setInvProjects(new Set()); setInvPerms(defaultPerms()); setInvError('');
  }

  async function bulkInvite() {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    if (!lines.length) return;
    setBulkSaving(true);
    try {
      const entries = lines.map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || '', email: parts[1] || '', company: parts[2] || '', role: parts[3] || 'Owner' };
      }).filter(e => e.name && e.email.includes('@'));
      const r = await fetch('/api/client-portal/users/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: entries }),
      });
      if (!r.ok) throw new Error('Bulk invite failed');
      const d = await r.json();
      const created: PortalUser[] = (d.users ?? entries).map((u: any) => ({
        id: u.id || uid(), name: u.name, email: u.email, company: u.company || '',
        status: 'pending' as PortalStatus, role: u.role || 'Owner', phone: '',
        lastLogin: null, invitedAt: now(), projectIds: [],
        accessLink: 'https://portal.saguaro.app/c/' + uid(), permissions: defaultPerms(),
      }));
      setUsers(prev => [...created, ...prev]);
      setBulkText(''); setBulkOpen(false);
    } catch (e: any) { setError(e.message); } finally { setBulkSaving(false); }
  }

  async function toggleUserStatus(user: PortalUser, newStatus: PortalStatus) {
    try {
      await fetch(`/api/client-portal/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
      setConfirmDisable(null);
    } catch { setError('Failed to update user status'); }
  }

  async function updatePermission(userId: string, perm: string) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const updated = { ...user.permissions, [perm]: !user.permissions[perm] };
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: updated } : u));
    try {
      await fetch(`/api/client-portal/users/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: updated }),
      });
    } catch { /* revert on error */
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: user.permissions } : u));
    }
  }

  async function updateProjectAccess(userId: string, projectId: string, grant: boolean) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const updated = grant
      ? [...user.projectIds, projectId]
      : user.projectIds.filter(p => p !== projectId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, projectIds: updated } : u));
    try {
      await fetch(`/api/client-portal/users/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: updated }),
      });
    } catch {
      setUsers(prev => prev.map(u => u.id === userId ? user : u));
    }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selectedThread) return;
    setSendingMsg(true);
    try {
      const payload = { userId: selectedThread, text: newMsg.trim(), fromRole: 'gc' };
      const r = await fetch('/api/client-portal/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const created: PortalMessage = r.ok ? (await r.json()).message ?? {
        id: uid(), threadId: selectedThread, from: 'Contractor', fromRole: 'gc' as const,
        text: newMsg.trim(), ts: now(), read: true, userId: selectedThread,
      } : {
        id: uid(), threadId: selectedThread, from: 'Contractor', fromRole: 'gc' as const,
        text: newMsg.trim(), ts: now(), read: true, userId: selectedThread,
      };
      setMessages(prev => [...prev, created]);
      setNewMsg('');
    } catch { /* optimistic */ } finally { setSendingMsg(false); }
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(link); setTimeout(() => setCopiedLink(''), 2000);
    }).catch(() => { });
  }

  async function resendInvite(user: PortalUser) {
    try {
      await fetch(`/api/client-portal/users/${user.id}/resend`, { method: 'POST' });
    } catch { /* silent */ }
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── TAB: Users ──────────────────────────────────────── */
  /* ══════════════════════════════════════════════════════ */
  function UsersTab() {
    return (<>
      {/* toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, or company..."
          style={{ ...inputS, width: 280, flex: 'none' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          style={{ ...inputS, width: 140, flex: 'none', cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="disabled">Disabled</option>
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ ...inputS, width: 150, flex: 'none', cursor: 'pointer' }}>
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => { resetInviteForm(); setInviteOpen(true); }} style={btnGold}>+ Invite Client</button>
        <button onClick={() => setBulkOpen(true)} style={btnOutline}>Bulk Invite</button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <Stat label="Total Users" value={users.length} />
        <Stat label="Active" value={users.filter(u => u.status === 'active').length} color={GREEN} />
        <Stat label="Pending" value={users.filter(u => u.status === 'pending').length} color={AMBER} />
        <Stat label="Disabled" value={users.filter(u => u.status === 'disabled').length} color={RED} />
      </div>

      {/* user table */}
      <div style={{ ...card, padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: BG }}>
              <th style={thS}>Name / Company</th>
              <th style={thS}>Email</th>
              <th style={thS}>Role</th>
              <th style={thS}>Status</th>
              <th style={thS}>Projects</th>
              <th style={thS}>Last Login</th>
              <th style={thS}>Access Link</th>
              <th style={thS}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr><td colSpan={8} style={{ ...tdS, textAlign: 'center', color: DIM, padding: 48 }}>
                {search || statusFilter !== 'all' || roleFilter !== 'all'
                  ? 'No users match your filters'
                  : 'No portal users yet. Invite your first client above.'}
              </td></tr>
            )}
            {filteredUsers.map(u => (
              <tr key={u.id}
                style={{ transition: 'background .15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = BG)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={tdS}>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: DIM }}>{u.company}</div>
                </td>
                <td style={{ ...tdS, color: DIM, fontSize: 12 }}>{u.email}</td>
                <td style={tdS}>
                  <span style={badge(
                    u.role === 'Owner' ? GOLD : u.role === 'Architect' ? BLUE : u.role === 'Investor' ? PURPLE : AMBER,
                    u.role === 'Owner' ? 'rgba(212,160,23,.14)' : u.role === 'Architect' ? 'rgba(59,130,246,.14)' : u.role === 'Investor' ? 'rgba(139,92,246,.14)' : 'rgba(245,158,11,.14)'
                  )}>{u.role}</span>
                </td>
                <td style={tdS}>
                  <span style={badge(STATUS_COLORS[u.status], STATUS_COLORS[u.status] + '22')}>
                    {STATUS_LABELS[u.status]}
                  </span>
                </td>
                <td style={{ ...tdS, fontSize: 12, color: DIM }}>
                  {u.projectIds.length > 0
                    ? u.projectIds.map(pid => projects.find(p => p.id === pid)?.name || pid).join(', ')
                    : 'None'}
                </td>
                <td style={{ ...tdS, color: DIM, fontSize: 12 }}>{relTime(u.lastLogin)}</td>
                <td style={tdS}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => copyLink(u.accessLink)}
                      style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}>
                      {copiedLink === u.accessLink ? 'Copied!' : 'Copy'}
                    </button>
                    {u.status === 'pending' && (
                      <button onClick={() => resendInvite(u)}
                        style={{ background: 'none', border: 'none', color: BLUE, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                        Resend
                      </button>
                    )}
                  </div>
                </td>
                <td style={tdS}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditUser(u)}
                      style={{ ...btnOutline, padding: '5px 10px', fontSize: 11 }}>Edit</button>
                    {u.status !== 'disabled' ? (
                      <button onClick={() => setConfirmDisable(u)}
                        style={{ ...btnDanger, padding: '5px 10px', fontSize: 11 }}>Disable</button>
                    ) : (
                      <button onClick={() => toggleUserStatus(u, 'active')}
                        style={{ ...btnOutline, padding: '5px 10px', fontSize: 11, borderColor: GREEN, color: GREEN }}>
                        Enable
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite New Client User" width={580}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {invError && (
            <div style={{ padding: '10px 14px', background: `${RED}15`, border: `1px solid ${RED}44`, borderRadius: 8, color: RED, fontSize: 13 }}>
              {invError}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Full Name *</label>
              <input value={invName} onChange={e => setInvName(e.target.value)} style={inputS} placeholder="Jane Doe" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Email *</label>
              <input value={invEmail} onChange={e => setInvEmail(e.target.value)} style={inputS} placeholder="jane@example.com" type="email" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Company *</label>
              <input value={invCompany} onChange={e => setInvCompany(e.target.value)} style={inputS} placeholder="Mitchell Development" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Phone</label>
              <input value={invPhone} onChange={e => setInvPhone(e.target.value)} style={inputS} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Role</label>
            <select value={invRole} onChange={e => setInvRole(e.target.value)} style={{ ...inputS, cursor: 'pointer' }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* project access checkboxes */}
          {projects.length > 0 && (
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 8 }}>Project Access *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', padding: '8px 12px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                {projects.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: TEXT }}>
                    <input type="checkbox" checked={invProjects.has(p.id)}
                      onChange={() => {
                        setInvProjects(prev => {
                          const s = new Set(prev);
                          s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                          return s;
                        });
                      }}
                      style={{ accentColor: GOLD }} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* permissions toggles */}
          <div>
            <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 8 }}>Portal Permissions</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              {PERM_KEYS.map(k => (
                <Toggle key={k} on={invPerms[k] ?? true}
                  onToggle={() => setInvPerms(p => ({ ...p, [k]: !p[k] }))} label={k} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button onClick={() => setInviteOpen(false)} style={btnOutline}>Cancel</button>
            <button onClick={inviteUser} style={{ ...btnGold, opacity: invSaving ? 0.6 : 1 }} disabled={invSaving}>
              {invSaving ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* bulk invite modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Invite Clients" width={620}>
        <p style={{ color: DIM, fontSize: 13, margin: '0 0 12px' }}>
          One client per line: <span style={{ color: TEXT, fontWeight: 600 }}>Name, Email, Company, Role</span> (company/role optional)
        </p>
        <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={10}
          style={{ ...inputS, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6 }}
          placeholder={'Sarah Johnson, sarah@example.com, Mitchell Dev, Owner\nMike Torres, mike@torres-arch.com, Torres Architecture, Architect\nLisa Wang, lisa@investco.com, InvestCo, Investor'} />
        <div style={{ marginTop: 8, fontSize: 12, color: DIM }}>
          {bulkText.trim().split('\n').filter(Boolean).length} user(s) to invite
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button onClick={() => setBulkOpen(false)} style={btnOutline}>Cancel</button>
          <button onClick={bulkInvite} style={{ ...btnGold, opacity: bulkSaving ? 0.6 : 1 }} disabled={bulkSaving}>
            {bulkSaving ? 'Inviting...' : 'Invite All'}
          </button>
        </div>
      </Modal>

      {/* edit user modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit: ${editUser?.name ?? ''}`} width={520}>
        {editUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Role</label>
              <select value={editUser.role}
                onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                style={{ ...inputS, cursor: 'pointer' }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Company</label>
              <input value={editUser.company}
                onChange={e => setEditUser({ ...editUser, company: e.target.value })}
                style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: DIM, display: 'block', marginBottom: 4 }}>Phone</label>
              <input value={editUser.phone}
                onChange={e => setEditUser({ ...editUser, phone: e.target.value })}
                style={inputS} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button onClick={() => setEditUser(null)} style={btnOutline}>Cancel</button>
              <button onClick={async () => {
                try {
                  await fetch(`/api/client-portal/users/${editUser.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: editUser.role, company: editUser.company, phone: editUser.phone }),
                  });
                  setUsers(prev => prev.map(u => u.id === editUser.id ? editUser : u));
                  setEditUser(null);
                } catch { setError('Failed to update user'); }
              }} style={btnGold}>Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      {/* confirm disable modal */}
      <Modal open={!!confirmDisable} onClose={() => setConfirmDisable(null)} title="Disable Portal Access" width={440}>
        {confirmDisable && (
          <div>
            <p style={{ color: DIM, fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
              Are you sure you want to disable portal access for <span style={{ color: TEXT, fontWeight: 600 }}>{confirmDisable.name}</span>?
              They will no longer be able to log in or view project data.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmDisable(null)} style={btnOutline}>Cancel</button>
              <button onClick={() => toggleUserStatus(confirmDisable, 'disabled')}
                style={{ ...btnDanger, background: RED, color: '#fff' }}>Disable Access</button>
            </div>
          </div>
        )}
      </Modal>
    </>);
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── TAB: Messages ──────────────────────────────────── */
  /* ══════════════════════════════════════════════════════ */
  function MessagesTab() {
    return (
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 280px)', minHeight: 480 }}>
        {/* thread sidebar */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 14, fontWeight: 700, color: TEXT }}>
            Conversations
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 && (
              <div style={{ padding: 24, color: DIM, fontSize: 13, textAlign: 'center' }}>
                No conversations yet. Messages from clients will appear here.
              </div>
            )}
            {threads.map(t => (
              <div key={t.user.id}
                onClick={() => setSelectedThread(t.user.id)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${BORDER}22`,
                  background: selectedThread === t.user.id ? BG : 'transparent',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => { if (selectedThread !== t.user.id) e.currentTarget.style.background = BG; }}
                onMouseLeave={e => { if (selectedThread !== t.user.id) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{t.user.name}</span>
                  {t.unread > 0 && (
                    <span style={{ width: 20, height: 20, borderRadius: 10, background: GOLD, color: BG, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {t.unread}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.lastMsg.text}
                </div>
                <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>{relTime(t.lastMsg.ts)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* message area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', ...card, padding: 0, overflow: 'hidden' }}>
          {!selectedThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 14 }}>
              Select a conversation to view messages
            </div>
          ) : (
            <>
              {/* thread header */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: `${GOLD}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: GOLD }}>
                  {(users.find(u => u.id === selectedThread)?.name || '?')[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>
                    {users.find(u => u.id === selectedThread)?.name}
                  </div>
                  <div style={{ fontSize: 11, color: DIM }}>
                    {users.find(u => u.id === selectedThread)?.company}
                  </div>
                </div>
              </div>

              {/* messages list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {threadMessages.length === 0 && (
                  <div style={{ color: DIM, textAlign: 'center', padding: 40, fontSize: 13 }}>
                    No messages in this thread yet. Start the conversation below.
                  </div>
                )}
                {threadMessages.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.fromRole === 'client' ? 'flex-start' : 'flex-end' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 16px', borderRadius: 12,
                      background: m.fromRole === 'client' ? BG : `${GOLD}18`,
                      border: `1px solid ${m.fromRole === 'client' ? BORDER : GOLD + '33'}`,
                    }}>
                      <div style={{ fontSize: 11, color: DIM, marginBottom: 4, fontWeight: 600 }}>
                        {m.from} <span style={{ fontWeight: 400 }}>- {relTime(m.ts)}</span>
                      </div>
                      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.5 }}>{m.text}</div>
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>

              {/* compose */}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10 }}>
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  style={{ ...inputS, flex: 1 }} placeholder="Type a message..." />
                <button onClick={sendMessage}
                  style={{ ...btnGold, opacity: sendingMsg ? 0.6 : 1 }} disabled={sendingMsg}>
                  {sendingMsg ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── TAB: Permissions ──────────────────────────────── */
  /* ══════════════════════════════════════════════════════ */
  function PermissionsTab() {
    const activeUsers = users.filter(u => u.status !== 'disabled');
    return (<>
      <p style={{ color: DIM, fontSize: 13, margin: '0 0 18px' }}>
        Control what each client can see in their portal. Changes are saved automatically.
      </p>
      <div style={{ ...card, padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr style={{ background: BG }}>
              <th style={{ ...thS, position: 'sticky', left: 0, background: BG, zIndex: 2, minWidth: 200 }}>Client</th>
              {PERM_KEYS.map(k => <th key={k} style={{ ...thS, textAlign: 'center', minWidth: 80 }}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeUsers.length === 0 && (
              <tr><td colSpan={PERM_KEYS.length + 1} style={{ ...tdS, textAlign: 'center', color: DIM, padding: 48 }}>
                No active portal users to manage permissions for.
              </td></tr>
            )}
            {activeUsers.map(u => (
              <tr key={u.id}>
                <td style={{ ...tdS, position: 'sticky', left: 0, background: RAISED, zIndex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: DIM }}>{u.role} - {u.company}</div>
                </td>
                {PERM_KEYS.map(k => (
                  <td key={k} style={{ ...tdS, textAlign: 'center' }}>
                    <Toggle on={u.permissions[k] ?? false} onToggle={() => updatePermission(u.id, k)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* quick presets */}
      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: TEXT }}>Quick Permission Presets</h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Full Access', desc: 'Enable all permissions', perms: PERM_KEYS.reduce((a, k) => ({ ...a, [k]: true }), {} as Record<string, boolean>) },
            { label: 'View Only', desc: 'Photos, Schedule, Documents only', perms: PERM_KEYS.reduce((a, k) => ({ ...a, [k]: ['Photos', 'Schedule', 'Documents'].includes(k) }), {} as Record<string, boolean>) },
            { label: 'Financial', desc: 'Budget, Invoices, Change Orders', perms: PERM_KEYS.reduce((a, k) => ({ ...a, [k]: ['Budget', 'Invoices', 'Change Orders'].includes(k) }), {} as Record<string, boolean>) },
            { label: 'Minimal', desc: 'Photos and Messages only', perms: PERM_KEYS.reduce((a, k) => ({ ...a, [k]: ['Photos', 'Messages'].includes(k) }), {} as Record<string, boolean>) },
          ].map(preset => (
            <div key={preset.label}
              style={{ ...card, padding: '12px 18px', cursor: 'pointer', flex: '0 0 auto', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}
              onClick={() => {
                if (activeUsers.length === 0) return;
                setUsers(prev => prev.map(u =>
                  u.status !== 'disabled' ? { ...u, permissions: { ...preset.perms } } : u));
              }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: GOLD, marginBottom: 4 }}>{preset.label}</div>
              <div style={{ fontSize: 11, color: DIM }}>{preset.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </>);
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── TAB: Access Matrix ─────────────────────────────── */
  /* ══════════════════════════════════════════════════════ */
  function AccessMatrixTab() {
    const activeUsers = users.filter(u => u.status !== 'disabled');
    return (<>
      <p style={{ color: DIM, fontSize: 13, margin: '0 0 18px' }}>
        Manage which clients can access which projects. Check a box to grant access.
      </p>
      {projects.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: DIM, padding: 48 }}>
          No projects found. Create projects first to manage access.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: BG }}>
                <th style={{ ...thS, position: 'sticky', left: 0, background: BG, zIndex: 2, minWidth: 200 }}>Client</th>
                {projects.map(p => (
                  <th key={p.id} style={{ ...thS, textAlign: 'center', minWidth: 120, maxWidth: 180 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeUsers.length === 0 && (
                <tr><td colSpan={projects.length + 1} style={{ ...tdS, textAlign: 'center', color: DIM, padding: 48 }}>
                  No active users to assign projects to.
                </td></tr>
              )}
              {activeUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ ...tdS, position: 'sticky', left: 0, background: RAISED, zIndex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: DIM }}>{u.company}</div>
                  </td>
                  {projects.map(p => {
                    const hasAccess = u.projectIds.includes(p.id);
                    return (
                      <td key={p.id} style={{ ...tdS, textAlign: 'center' }}>
                        <div
                          onClick={() => updateProjectAccess(u.id, p.id, !hasAccess)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, margin: '0 auto', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: hasAccess ? `${GREEN}22` : 'transparent',
                            border: `2px solid ${hasAccess ? GREEN : BORDER}`,
                            transition: 'all .15s', fontSize: 14, color: GREEN,
                          }}>
                          {hasAccess ? '\u2713' : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* summary stats */}
      <div style={{ marginTop: 22, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {projects.map(p => {
          const count = activeUsers.filter(u => u.projectIds.includes(p.id)).length;
          return (
            <div key={p.id} style={{ ...card, minWidth: 180, flex: '0 0 auto' }}>
              <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? GREEN : DIM }}>
                {count} <span style={{ fontSize: 12, fontWeight: 500, color: DIM }}>user{count !== 1 ? 's' : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>);
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── TAB: Activity Log ──────────────────────────────── */
  /* ══════════════════════════════════════════════════════ */
  function ActivityLogTab() {
    return (<>
      {/* filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={logSearch} onChange={e => setLogSearch(e.target.value)}
          placeholder="Search activity..." style={{ ...inputS, width: 260, flex: 'none' }} />
        <select value={logSection} onChange={e => setLogSection(e.target.value)}
          style={{ ...inputS, width: 160, flex: 'none', cursor: 'pointer' }}>
          <option value="all">All Sections</option>
          {logSections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: DIM }}>{filteredLog.length} entries</span>
      </div>

      {/* stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <Stat label="Total Activity" value={actLog.length} color={BLUE} />
        <Stat label="Last 7 Days" value={actLog.filter(e => Date.now() - new Date(e.ts).getTime() < 604800000).length} color={GREEN} />
        <Stat label="Unique Users" value={new Set(actLog.map(e => e.userId)).size} color={PURPLE} />
        <Stat label="Today" value={actLog.filter(e => {
          const d = new Date(e.ts); const t = new Date();
          return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
        }).length} color={GOLD} />
      </div>

      {/* log entries */}
      <div style={{ ...card, maxHeight: 520, overflowY: 'auto' }}>
        {filteredLog.length === 0 && (
          <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 40 }}>
            No activity entries found.
          </div>
        )}
        {filteredLog.slice(0, 100).map((e, i) => (
          <div key={e.id || i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: i < filteredLog.length - 1 ? `1px solid ${BORDER}22` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 16, background: `${BLUE}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: BLUE, flexShrink: 0,
              }}>
                {(e.userName || '?')[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <span style={{ fontWeight: 600, color: TEXT, fontSize: 13 }}>{e.userName}</span>
                  <span style={{ color: DIM, fontSize: 13, marginLeft: 6 }}>{e.action}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                  {e.section && (
                    <span style={badge(BLUE, `${BLUE}18`)}>{e.section}</span>
                  )}
                  {e.ip && (
                    <span style={{ fontSize: 11, color: DIM }}>IP: {e.ip}</span>
                  )}
                </div>
              </div>
            </div>
            <span style={{ color: DIM, fontSize: 11, whiteSpace: 'nowrap', marginLeft: 12 }}>
              {fmtDate(e.ts)}
            </span>
          </div>
        ))}
        {filteredLog.length > 100 && (
          <div style={{ textAlign: 'center', padding: 14, color: DIM, fontSize: 12 }}>
            Showing first 100 of {filteredLog.length} entries
          </div>
        )}
      </div>

      {/* top users by activity */}
      <div style={{ marginTop: 22 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: TEXT }}>Most Active Users</h4>
        <div style={card}>
          {(() => {
            const counts = new Map<string, { name: string; count: number }>();
            actLog.forEach(e => {
              const existing = counts.get(e.userId);
              if (existing) existing.count++;
              else counts.set(e.userId, { name: e.userName, count: 1 });
            });
            const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 10);
            const max = sorted[0]?.count || 1;
            if (sorted.length === 0) return <div style={{ color: DIM, fontSize: 13 }}>No activity data</div>;
            return sorted.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: i < sorted.length - 1 ? `1px solid ${BORDER}22` : 'none' }}>
                <div style={{ width: 140, fontWeight: 600, fontSize: 13, color: TEXT }}>{item.name}</div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: BG, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(item.count / max * 100)}%`, background: `linear-gradient(90deg,${GOLD},${AMBER})`, borderRadius: 4, transition: 'width .4s' }} />
                </div>
                <div style={{ width: 60, textAlign: 'right', fontSize: 12, color: DIM }}>{item.count} actions</div>
              </div>
            ));
          })()}
        </div>
      </div>
    </>);
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── RENDER ─────────────────────────────────────────── */
  /* ══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto', minHeight: '100vh' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: TEXT }}>Client Portal Management</h1>
          <div style={{ fontSize: 13, color: DIM, marginTop: 5 }}>
            Manage portal access, messaging, permissions, and activity for your clients and owners
          </div>
        </div>
      </div>

      {/* error banner */}
      {error && (
        <div style={{ padding: '12px 18px', background: `${RED}15`, border: `1px solid ${RED}44`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16 }}>x</button>
        </div>
      )}

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
              color: tab === t ? GOLD : DIM, fontSize: 14, fontWeight: tab === t ? 700 : 500,
              cursor: 'pointer', transition: 'color .2s',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div style={{ display: 'inline-block', width: 40, height: 40, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ color: DIM, fontSize: 14, marginTop: 16 }}>Loading portal data...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <>
          {tab === 'Users' && <UsersTab />}
          {tab === 'Messages' && <MessagesTab />}
          {tab === 'Permissions' && <PermissionsTab />}
          {tab === 'Access Matrix' && <AccessMatrixTab />}
          {tab === 'Activity Log' && <ActivityLogTab />}
        </>
      )}
    </div>
  );
}
