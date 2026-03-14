'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ── palette ── */
const GOLD = '#D4A017';
const BG = '#07101C';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';

/* ── types ── */
type SubStatus = 'active' | 'pending' | 'disabled';
type PortalPermission = 'contract' | 'schedule' | 'daily_logs' | 'rfis' | 'submittals' | 'pay_apps';
type ComplianceDocType = 'insurance' | 'w9' | 'license';
type ComplianceStatus = 'valid' | 'expiring' | 'expired' | 'missing';
type Tab = 'users' | 'invite' | 'permissions' | 'activity' | 'documents' | 'compliance' | 'directory' | 'messages';

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
function fmtDate(d: string | null): string { return d ? new Date(d).toLocaleDateString() : '--'; }
function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ALL_TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Framing', 'Concrete', 'Roofing', 'Drywall', 'Painting', 'Flooring', 'Steel', 'Landscaping', 'Fire Protection'];
const ALL_PROJECTS = ['Mesa Gateway Phase II', 'Scottsdale Office Tower', 'Tempe Mixed-Use', 'Chandler Medical Center', 'Gilbert Town Center'];
const ALL_PERMISSIONS_LIST: { key: PortalPermission; label: string }[] = [
  { key: 'contract', label: 'Their Contract' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'daily_logs', label: 'Daily Logs' },
  { key: 'rfis', label: 'RFIs' },
  { key: 'submittals', label: 'Submittals' },
  { key: 'pay_apps', label: 'Pay Applications' },
];
const AVATAR_COLORS = [GOLD, BLUE, GREEN, PURPLE, AMBER, '#EC4899', '#14B8A6', '#F97316'];
const DOC_CATEGORIES = ['Drawings', 'Specifications', 'Schedules', 'Safety Plans', 'Meeting Minutes', 'Reports', 'Contracts', 'Photos'];

/* ── seed data ── */
function seedUsers(): SubUser[] {
  const companies = ['Apex Electrical Inc', 'BlueRidge Plumbing', 'Summit HVAC Co', 'Pioneer Framing LLC', 'Desert Concrete Co',
    'Valley Roofing', 'ProWall Drywall', 'ColorTech Painting', 'Southwest Flooring', 'IronWorks Steel'];
  const names = ['Mike Torres', 'Sarah Chen', 'James Kowalski', 'Maria Gonzalez', 'Robert Kim',
    'Lisa Park', 'David Nguyen', 'Amanda Foster', 'Carlos Reyes', 'Jennifer Walsh'];
  const trades = ['Electrical', 'Plumbing', 'HVAC', 'Framing', 'Concrete', 'Roofing', 'Drywall', 'Painting', 'Flooring', 'Steel'];
  const statuses: SubStatus[] = ['active', 'active', 'active', 'active', 'active', 'active', 'pending', 'pending', 'disabled', 'active'];
  return names.map((name, i) => ({
    id: uid(),
    company: companies[i],
    contactName: name,
    email: name.toLowerCase().replace(' ', '.') + '@example.com',
    phone: `(480) ${String(500 + i * 37).padStart(3, '0')}-${String(1000 + i * 111).slice(0, 4)}`,
    trade: trades[i],
    status: statuses[i],
    projectAccess: ALL_PROJECTS.slice(0, 2 + (i % 3)),
    permissions: ALL_PERMISSIONS_LIST.slice(0, 3 + (i % 4)).map(p => p.key),
    invitedDate: new Date(Date.now() - (30 + i * 10) * 86400000).toISOString(),
    lastLogin: statuses[i] === 'active' ? new Date(Date.now() - Math.random() * 5 * 86400000).toISOString() : null,
    avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
  }));
}

function seedActivity(): ActivityEntry[] {
  const actions = ['Logged in', 'Viewed contract', 'Downloaded drawing', 'Submitted pay app', 'Viewed schedule',
    'Uploaded insurance cert', 'Viewed daily log', 'Submitted RFI response', 'Viewed submittal', 'Logged out'];
  const entries: ActivityEntry[] = [];
  for (let i = 0; i < 25; i++) {
    entries.push({
      id: uid(),
      subId: `sub-${i % 10}`,
      subName: ['Mike Torres', 'Sarah Chen', 'James Kowalski', 'Maria Gonzalez', 'Robert Kim',
        'Lisa Park', 'David Nguyen', 'Amanda Foster', 'Carlos Reyes', 'Jennifer Walsh'][i % 10],
      company: ['Apex Electrical', 'BlueRidge Plumbing', 'Summit HVAC', 'Pioneer Framing', 'Desert Concrete',
        'Valley Roofing', 'ProWall Drywall', 'ColorTech Painting', 'Southwest Flooring', 'IronWorks Steel'][i % 10],
      action: actions[i % actions.length],
      detail: ALL_PROJECTS[i % ALL_PROJECTS.length],
      timestamp: new Date(Date.now() - i * 3600000 * 3).toISOString(),
    });
  }
  return entries;
}

function seedDocs(): SharedDoc[] {
  const docs: SharedDoc[] = [];
  const names = ['Site Plan Rev 3.pdf', 'Structural Specs.pdf', 'Master Schedule.xlsx', 'Safety Plan 2026.pdf',
    'Weekly Meeting Notes 03-06.pdf', 'Soil Report.pdf', 'MEP Drawings Set A.pdf', 'Finish Schedule.xlsx',
    'Progress Photos Feb.zip', 'Inspection Checklist.pdf', 'Concrete Mix Design.pdf', 'Electrical One-Line.pdf'];
  names.forEach((name, i) => {
    docs.push({
      id: uid(),
      name,
      category: DOC_CATEGORIES[i % DOC_CATEGORIES.length],
      projectName: ALL_PROJECTS[i % ALL_PROJECTS.length],
      visibleToSubs: i < 6 ? ['all'] : [],
      uploadedDate: new Date(Date.now() - i * 86400000 * 3).toISOString(),
      size: `${(0.5 + Math.random() * 10).toFixed(1)} MB`,
    });
  });
  return docs;
}

function seedCompliance(): ComplianceRecord[] {
  const records: ComplianceRecord[] = [];
  const subs = ['Mike Torres', 'Sarah Chen', 'James Kowalski', 'Maria Gonzalez', 'Robert Kim',
    'Lisa Park', 'David Nguyen', 'Amanda Foster', 'Carlos Reyes', 'Jennifer Walsh'];
  const companies = ['Apex Electrical', 'BlueRidge Plumbing', 'Summit HVAC', 'Pioneer Framing', 'Desert Concrete',
    'Valley Roofing', 'ProWall Drywall', 'ColorTech Painting', 'Southwest Flooring', 'IronWorks Steel'];
  const docTypes: ComplianceDocType[] = ['insurance', 'w9', 'license'];
  const statusMap: ComplianceStatus[][] = [
    ['valid', 'valid', 'valid'],
    ['valid', 'valid', 'expiring'],
    ['expiring', 'valid', 'valid'],
    ['valid', 'missing', 'valid'],
    ['expired', 'valid', 'expired'],
    ['valid', 'valid', 'valid'],
    ['missing', 'missing', 'missing'],
    ['valid', 'pending' as ComplianceStatus, 'valid'],
    ['valid', 'valid', 'expiring'],
    ['valid', 'valid', 'valid'],
  ];
  subs.forEach((name, si) => {
    docTypes.forEach((dt, di) => {
      const status = (statusMap[si] && statusMap[si][di]) || 'missing';
      const hasFile = status === 'valid' || status === 'expiring' || status === 'expired';
      const exp = status === 'valid' ? new Date(Date.now() + 180 * 86400000).toISOString()
        : status === 'expiring' ? new Date(Date.now() + 20 * 86400000).toISOString()
        : status === 'expired' ? new Date(Date.now() - 30 * 86400000).toISOString()
        : null;
      records.push({
        id: uid(),
        subId: `sub-${si}`,
        subName: name,
        company: companies[si],
        docType: dt,
        status: status as ComplianceStatus,
        expirationDate: dt === 'w9' ? null : exp,
        fileName: hasFile ? `${name.replace(' ', '_')}_${dt}.pdf` : null,
        uploadedDate: hasFile ? new Date(Date.now() - 60 * 86400000).toISOString() : null,
      });
    });
  });
  return records;
}

function seedAnnouncements(): Announcement[] {
  return [
    { id: uid(), subject: 'Safety Stand-Down Friday 3/13', body: 'All subs are required to participate in the safety stand-down this Friday at 10 AM. Meet at the main staging area.', sentDate: new Date(Date.now() - 86400000).toISOString(), sentTo: ['all'], sentBy: 'Project Manager' },
    { id: uid(), subject: 'Updated Site Access Hours', body: 'Effective immediately, site access hours are 6:00 AM to 6:00 PM Monday through Saturday. Sunday access requires prior approval.', sentDate: new Date(Date.now() - 3 * 86400000).toISOString(), sentTo: ['all'], sentBy: 'Superintendent' },
    { id: uid(), subject: 'Insurance Cert Reminder', body: 'Please upload your updated insurance certificates before the end of the month. Expired certs will result in restricted portal access.', sentDate: new Date(Date.now() - 7 * 86400000).toISOString(), sentTo: ['all'], sentBy: 'Admin' },
  ];
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
  padding: '9px 20px', background: GOLD, color: BG, border: 'none', borderRadius: 6,
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, background: c + '18', color: c, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
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
  const [tab, setTab] = useState<Tab>('users');

  /* data */
  const [users, setUsers] = useState<SubUser[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [docs, setDocs] = useState<SharedDoc[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

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
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
          setActivity(data.activity || []);
          setDocs(data.docs || []);
          setCompliance(data.compliance || []);
          setAnnouncements(data.announcements || []);
        } else {
          setUsers(seedUsers());
          setActivity(seedActivity());
          setDocs(seedDocs());
          setCompliance(seedCompliance());
          setAnnouncements(seedAnnouncements());
        }
      } catch {
        setUsers(seedUsers());
        setActivity(seedActivity());
        setDocs(seedDocs());
        setCompliance(seedCompliance());
        setAnnouncements(seedAnnouncements());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
    setInvCompany(''); setInvContact(''); setInvEmail(''); setInvTrade(''); setInvProjects([]);
    setInvSending(false);
    setInviteModal(false);
  }, [invCompany, invContact, invEmail, invTrade, invProjects, users.length]);

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
    const ann: Announcement = { id: uid(), subject: annSubject, body: annBody, sentDate: new Date().toISOString(), sentTo: annRecipients, sentBy: 'You' };
    try {
      await fetch('/api/sub-portal/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ann) });
    } catch { /* fallback */ }
    setAnnouncements(prev => [ann, ...prev]);
    setAnnSubject(''); setAnnBody(''); setAnnRecipients(['all']);
    setAnnSending(false);
    setAnnounceModal(false);
  }, [annSubject, annBody, annRecipients]);

  const resendInvite = useCallback((userId: string) => {
    fetch('/api/sub-portal/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }) }).catch(() => {});
    alert('Invitation resent.');
  }, []);

  /* ── tab list ── */
  const TABS: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Sub Users' },
    { key: 'invite', label: 'Invite' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'activity', label: 'Activity Log' },
    { key: 'documents', label: 'Documents' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'directory', label: 'Directory' },
    { key: 'messages', label: 'Messages' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: DIM }}>Loading sub portal...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
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
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '24px 32px' }}>
      {/* ── header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>
            <span style={{ color: GOLD }}>Sub</span> Portal Management
          </h1>
          <p style={{ color: DIM, margin: '4px 0 0', fontSize: 14 }}>Manage subcontractor portal access, compliance, and communications</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setBulkInviteModal(true)} style={btnSecondary}>Bulk Invite</button>
          <button onClick={() => setInviteModal(true)} style={btnPrimary}>+ Invite Sub</button>
        </div>
      </div>

      {/* ── stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Subs', value: stats.total, color: GOLD },
          { label: 'Active', value: stats.active, color: GREEN },
          { label: 'Pending', value: stats.pending, color: AMBER },
          { label: 'Disabled', value: stats.disabled, color: RED },
          { label: 'Expiring Docs', value: stats.compExpiring, color: AMBER },
          { label: 'Expired Docs', value: stats.compExpired, color: RED },
          { label: 'Missing Docs', value: stats.compMissing, color: DIM },
        ].map((s, i) => (
          <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
            <p style={{ color: DIM, fontSize: 12, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 28, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

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
          <input placeholder="Search name, company, email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, maxWidth: 280 }} />
          <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} style={{ ...selectStyle, maxWidth: 180 }}>
            <option value="">All Trades</option>
            {ALL_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ ...selectStyle, maxWidth: 220 }}>
            <option value="">All Projects</option>
            {ALL_PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, maxWidth: 160 }}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: SUB USERS                             */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'users' && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Contact', 'Company', 'Trade', 'Status', 'Last Login', 'Projects', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: DIM }}>No subcontractors found matching filters.</td></tr>
              )}
              {filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}22`, cursor: 'pointer' }}
                  onClick={() => setUserDetailModal(u)}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: u.avatarColor + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.avatarColor, fontWeight: 700, fontSize: 14 }}>
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
                    <span style={{ padding: '3px 10px', borderRadius: 6, background: PURPLE + '18', color: PURPLE, fontSize: 12 }}>{u.trade}</span>
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
                        <button onClick={() => toggleUserStatus(u.id, 'disabled')} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: RED, borderColor: RED + '50' }}>Disable</button>
                      )}
                      {u.status === 'disabled' && (
                        <button onClick={() => toggleUserStatus(u.id, 'active')} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: GREEN, borderColor: GREEN + '50' }}>Enable</button>
                      )}
                      <button onClick={() => setPermModal(u)} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12 }}>Perms</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: INVITE                                */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'invite' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* single invite */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24 }}>
            <h3 style={{ color: GOLD, margin: '0 0 20px', fontSize: 16 }}>Invite Subcontractor</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Company Name *</label><input value={invCompany} onChange={e => setInvCompany(e.target.value)} style={inputStyle} placeholder="Enter company name" /></div>
              <div><label style={labelStyle}>Contact Name *</label><input value={invContact} onChange={e => setInvContact(e.target.value)} style={inputStyle} placeholder="Full name" /></div>
              <div><label style={labelStyle}>Email Address *</label><input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} style={inputStyle} placeholder="email@company.com" /></div>
              <div>
                <label style={labelStyle}>Trade *</label>
                <select value={invTrade} onChange={e => setInvTrade(e.target.value)} style={selectStyle}>
                  <option value="">Select trade</option>
                  {ALL_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Project Access</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {ALL_PROJECTS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={invProjects.includes(p)}
                        onChange={() => setInvProjects(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={handleInvite} disabled={invSending || !invCompany || !invContact || !invEmail || !invTrade}
                style={{ ...btnPrimary, opacity: (invSending || !invCompany || !invContact || !invEmail || !invTrade) ? 0.5 : 1, marginTop: 8 }}>
                {invSending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>

          {/* bulk invite */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24 }}>
            <h3 style={{ color: GOLD, margin: '0 0 8px', fontSize: 16 }}>Bulk Invite</h3>
            <p style={{ color: DIM, fontSize: 13, margin: '0 0 16px' }}>
              Enter one sub per line in CSV format: Company, Contact Name, Email, Trade
            </p>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
              style={{ ...inputStyle, height: 200, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
              placeholder={'Apex Electric, John Smith, john@apex.com, Electrical\nBlue Plumbing, Jane Doe, jane@blue.com, Plumbing'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ color: DIM, fontSize: 12 }}>
                {bulkText.trim() ? `${bulkText.trim().split('\n').filter(l => l.trim()).length} entries` : 'No entries'}
              </span>
              <button onClick={handleBulkInvite} disabled={bulkSending || !bulkText.trim()}
                style={{ ...btnPrimary, opacity: (bulkSending || !bulkText.trim()) ? 0.5 : 1 }}>
                {bulkSending ? 'Sending...' : 'Send All Invitations'}
              </button>
            </div>

            {/* recent invites */}
            <div style={{ marginTop: 24, borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
              <h4 style={{ color: TEXT, margin: '0 0 12px', fontSize: 14 }}>Recent Invitations</h4>
              {users.filter(u => u.status === 'pending').length === 0 && (
                <p style={{ color: DIM, fontSize: 13 }}>No pending invitations.</p>
              )}
              {users.filter(u => u.status === 'pending').map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}22` }}>
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
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: PERMISSIONS                           */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'permissions' && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <h3 style={{ margin: 0, color: TEXT, fontSize: 16 }}>Portal Access Permissions</h3>
            <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>Control what each subcontractor can see in their portal</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>Subcontractor</th>
                {ALL_PERMISSIONS_LIST.map(p => (
                  <th key={p.key} style={{ padding: '12px 10px', textAlign: 'center', color: DIM, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{p.label}</th>
                ))}
                <th style={{ padding: '12px 16px', textAlign: 'center', color: DIM, fontSize: 12, fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr><td colSpan={ALL_PERMISSIONS_LIST.length + 2} style={{ padding: 40, textAlign: 'center', color: DIM }}>No subs found.</td></tr>
              )}
              {filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
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
                        style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11, color: GREEN, borderColor: GREEN + '50' }}>All</button>
                      <button onClick={() => updatePermissions(u.id, [])}
                        style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11, color: RED, borderColor: RED + '50' }}>None</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: ACTIVITY LOG                          */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'activity' && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, color: TEXT, fontSize: 16 }}>Portal Activity Log</h3>
              <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>Track when subs logged in and what they viewed</p>
            </div>
            <span style={{ color: DIM, fontSize: 13 }}>{activity.length} entries</span>
          </div>
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            {activity.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 14, padding: '14px 20px', borderBottom: `1px solid ${BORDER}22`,
                background: i % 2 === 0 ? 'transparent' : BG + '40' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: BLUE + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: BLUE, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
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
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: DOCUMENTS                             */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'documents' && (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, color: TEXT, fontSize: 16 }}>Document Sharing Controls</h3>
              <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>Control which documents are visible to subcontractors</p>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Document', 'Category', 'Project', 'Size', 'Uploaded', 'Visibility', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: BLUE, fontSize: 16 }}>&#128196;</span>
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
                        <button onClick={() => toggleDocVisibility(d.id, [])} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: RED, borderColor: RED + '50' }}>Hide</button>
                      ) : (
                        <button onClick={() => toggleDocVisibility(d.id, ['all'])} style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, color: GREEN, borderColor: GREEN + '50' }}>Show All</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: COMPLIANCE                            */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'compliance' && (
        <div>
          {/* compliance summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Valid', count: compliance.filter(c => c.status === 'valid').length, color: GREEN },
              { label: 'Expiring Soon', count: compliance.filter(c => c.status === 'expiring').length, color: AMBER },
              { label: 'Expired', count: compliance.filter(c => c.status === 'expired').length, color: RED },
              { label: 'Missing', count: compliance.filter(c => c.status === 'missing').length, color: DIM },
            ].map((s, i) => (
              <div key={i} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
                <p style={{ color: s.color, fontSize: 24, fontWeight: 700, margin: '0 0 2px' }}>{s.count}</p>
                <p style={{ color: DIM, fontSize: 12, margin: 0, textTransform: 'uppercase' }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <h3 style={{ margin: 0, color: TEXT, fontSize: 16 }}>Compliance Tracking</h3>
              <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>Insurance, W-9, and license expiration tracking</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {['Subcontractor', 'Company', 'Document Type', 'Status', 'Expiration', 'File', 'Uploaded'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: DIM, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compliance
                  .filter(c => {
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      return c.subName.toLowerCase().includes(q) || c.company.toLowerCase().includes(q);
                    }
                    return true;
                  })
                  .map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, fontSize: 14 }}>{c.subName}</td>
                    <td style={{ padding: '10px 16px', color: DIM, fontSize: 13 }}>{c.company}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12,
                        background: c.docType === 'insurance' ? BLUE + '18' : c.docType === 'w9' ? PURPLE + '18' : GOLD + '18',
                        color: c.docType === 'insurance' ? BLUE : c.docType === 'w9' ? PURPLE : GOLD }}>
                        {c.docType === 'w9' ? 'W-9' : c.docType.charAt(0).toUpperCase() + c.docType.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}><StatusBadge status={c.status} /></td>
                    <td style={{ padding: '10px 16px', color: c.status === 'expired' ? RED : c.status === 'expiring' ? AMBER : DIM, fontSize: 13 }}>
                      {c.expirationDate ? fmtDate(c.expirationDate) : 'N/A'}
                    </td>
                    <td style={{ padding: '10px 16px', color: DIM, fontSize: 13 }}>{c.fileName || '--'}</td>
                    <td style={{ padding: '10px 16px', color: DIM, fontSize: 13 }}>{fmtDate(c.uploadedDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB: DIRECTORY                             */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'directory' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredUsers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: DIM }}>No subcontractors found.</div>
          )}
          {filteredUsers.map(u => (
            <div key={u.id} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, cursor: 'pointer',
              transition: 'border-color 0.2s' }}
              onClick={() => setUserDetailModal(u)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: u.avatarColor + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.avatarColor, fontWeight: 700, fontSize: 18 }}>
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
            <button onClick={() => setAnnounceModal(true)} style={btnPrimary}>+ New Announcement</button>
          </div>

          {/* inline compose */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
            <h4 style={{ color: GOLD, margin: '0 0 16px', fontSize: 15 }}>Quick Broadcast</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={labelStyle}>Subject</label><input value={annSubject} onChange={e => setAnnSubject(e.target.value)} style={inputStyle} placeholder="Announcement subject" /></div>
              <div>
                <label style={labelStyle}>Message</label>
                <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} style={{ ...inputStyle, height: 100, resize: 'vertical' }} placeholder="Write your announcement..." />
              </div>
              <div>
                <label style={labelStyle}>Recipients</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="recipients" checked={annRecipients.includes('all')} onChange={() => setAnnRecipients(['all'])} /> All Subs
                  </label>
                  {ALL_TRADES.slice(0, 6).map(t => (
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
                  style={{ ...btnPrimary, opacity: (annSending || !annSubject || !annBody) ? 0.5 : 1 }}>
                  {annSending ? 'Sending...' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          </div>

          {/* announcement history */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <h4 style={{ margin: 0, color: TEXT, fontSize: 15 }}>Announcement History</h4>
            </div>
            {announcements.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: DIM }}>No announcements sent yet.</div>
            )}
            {announcements.map(a => (
              <div key={a.id} style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}22` }}>
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
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: INVITE SUB                          */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Invite Subcontractor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={labelStyle}>Company Name *</label><input value={invCompany} onChange={e => setInvCompany(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Contact Name *</label><input value={invContact} onChange={e => setInvContact(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Email *</label><input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Trade *</label>
            <select value={invTrade} onChange={e => setInvTrade(e.target.value)} style={selectStyle}>
              <option value="">Select trade</option>
              {ALL_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Project Access</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {ALL_PROJECTS.map(p => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={invProjects.includes(p)}
                    onChange={() => setInvProjects(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => setInviteModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={handleInvite} disabled={invSending || !invCompany || !invContact || !invEmail || !invTrade}
              style={{ ...btnPrimary, opacity: (invSending || !invCompany || !invContact || !invEmail || !invTrade) ? 0.5 : 1 }}>
              {invSending ? 'Sending...' : 'Send Invitation'}
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
            {bulkText.trim() ? `${bulkText.trim().split('\n').filter(l => l.trim()).length} invitations will be sent` : 'No entries'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setBulkInviteModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={handleBulkInvite} disabled={bulkSending || !bulkText.trim()}
              style={{ ...btnPrimary, opacity: (bulkSending || !bulkText.trim()) ? 0.5 : 1 }}>
              {bulkSending ? 'Sending...' : 'Send All'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════ */}
      {/*  MODAL: PERMISSIONS                         */}
      {/* ════════════════════════════════════════════ */}
      <Modal open={!!permModal} onClose={() => setPermModal(null)} title={`Permissions - ${permModal?.contactName || ''}`}>
        {permModal && (
          <div>
            <p style={{ color: DIM, fontSize: 13, margin: '0 0 16px' }}>Select what <strong style={{ color: TEXT }}>{permModal.contactName}</strong> can see in their portal:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ALL_PERMISSIONS_LIST.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${permModal.permissions.includes(p.key) ? GREEN + '50' : BORDER}`, cursor: 'pointer' }}>
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
      <Modal open={!!docShareModal} onClose={() => setDocShareModal(null)} title={`Document Sharing - ${docShareModal?.name || ''}`}>
        {docShareModal && (
          <div>
            <p style={{ color: DIM, fontSize: 13, margin: '0 0 16px' }}>Select who can view <strong style={{ color: TEXT }}>{docShareModal.name}</strong>:</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: GREEN, fontSize: 14, cursor: 'pointer', padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${docShareModal.visibleToSubs.includes('all') ? GREEN + '50' : BORDER}` }}>
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
            <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} style={{ ...inputStyle, height: 140, resize: 'vertical' }} placeholder="Write your message..." />
          </div>
          <div>
            <label style={labelStyle}>Recipients</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: GREEN, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="ann-recipients" checked={annRecipients.includes('all')} onChange={() => setAnnRecipients(['all'])} /> All Subcontractors
              </label>
              <p style={{ color: DIM, fontSize: 12, margin: '4px 0' }}>Or select by trade:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
              {annSending ? 'Sending...' : 'Send Announcement'}
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
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: userDetailModal.avatarColor + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', color: userDetailModal.avatarColor, fontWeight: 700, fontSize: 22 }}>
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
                { label: 'Phone', value: userDetailModal.phone || '--' },
                { label: 'Trade', value: userDetailModal.trade },
                { label: 'Invited', value: fmtDate(userDetailModal.invitedDate) },
                { label: 'Last Login', value: userDetailModal.lastLogin ? fmtDateTime(userDetailModal.lastLogin) : 'Never' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                  <p style={{ color: DIM, fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase' }}>{item.label}</p>
                  <p style={{ color: TEXT, fontSize: 14, margin: 0, wordBreak: 'break-all' }}>{item.value}</p>
                </div>
              ))}
              <div style={{ padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <p style={{ color: DIM, fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase' }}>Status</p>
                <StatusBadge status={userDetailModal.status} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ color: DIM, fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase', fontWeight: 600 }}>Project Access</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {userDetailModal.projectAccess.length === 0 && <span style={{ color: DIM, fontSize: 13 }}>No projects assigned</span>}
                {userDetailModal.projectAccess.map(p => (
                  <span key={p} style={{ padding: '4px 10px', background: BLUE + '18', color: BLUE, borderRadius: 6, fontSize: 12 }}>{p}</span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ color: DIM, fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase', fontWeight: 600 }}>Portal Permissions</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {userDetailModal.permissions.length === 0 && <span style={{ color: DIM, fontSize: 13 }}>No permissions</span>}
                {userDetailModal.permissions.map(p => (
                  <span key={p} style={{ padding: '4px 10px', background: GREEN + '18', color: GREEN, borderRadius: 6, fontSize: 12 }}>
                    {ALL_PERMISSIONS_LIST.find(x => x.key === p)?.label || p}
                  </span>
                ))}
              </div>
            </div>

            {/* compliance for this user */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ color: DIM, fontSize: 12, margin: '0 0 8px', textTransform: 'uppercase', fontWeight: 600 }}>Compliance</p>
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
                  style={{ ...btnSecondary, color: RED, borderColor: RED + '50' }}>Disable Access</button>
              )}
              {userDetailModal.status === 'disabled' && (
                <button onClick={() => { toggleUserStatus(userDetailModal.id, 'active'); setUserDetailModal(null); }}
                  style={{ ...btnSecondary, color: GREEN, borderColor: GREEN + '50' }}>Enable Access</button>
              )}
              {userDetailModal.status === 'pending' && (
                <button onClick={() => resendInvite(userDetailModal.id)} style={btnSecondary}>Resend Invite</button>
              )}
              <button onClick={() => { setPermModal(userDetailModal); setUserDetailModal(null); }} style={btnPrimary}>Edit Permissions</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
