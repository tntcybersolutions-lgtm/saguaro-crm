'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { paletteHex } from '@/lib/design-tokens';
import { textPrompt } from '@/lib/ui/async-dialog';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { CATEGORIES } from '@/lib/permission-categories';
import { getAuthHeaders, getSupabaseBrowser } from '@/lib/supabase-browser';

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
const BLUE = 'var(--info)';
/* Role colours are stored with the role (sent to the API), so they stay hex: the
   approved palette's distinct non-yellow values. Same set as lib/default-roles. */
const ROLE_SWATCH = { blue: paletteHex.blue, green: paletteHex.green, amber: paletteHex.orange, red: paletteHex.red, white: paletteHex.text, lightSlate: paletteHex.text2, slate: paletteHex.text3 } as const;
const ROLE_HEX: string = ROLE_SWATCH.blue;
const PURPLE = 'var(--warning)';

/* ── types ── */
type PermLevel = 'None' | 'View' | 'Edit' | 'Full';
type PermissionMap = Record<string, PermLevel>;
type Tab = 'team' | 'roles' | 'matrix' | 'users' | 'compare' | 'audit';
export type AccessTab = Tab;
const TAB_KEYS: Tab[] = ['team', 'roles', 'matrix', 'users', 'compare', 'audit'];

interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  isBuiltIn: boolean;
  permissions: PermissionMap;
  createdAt: string;
  updatedAt: string;
}

interface UserAssignment {
  id: string;
  userId: string;
  userName: string;
  email: string;
  roleId: string;
  projectId: string | null;
  projectName: string | null;
  assignedAt: string;
  assignedBy: string;
}

interface AuditEntry {
  id: string;
  action: string;
  roleName: string;
  changedBy: string;
  changedAt: string;
  detail: string;
}

const PERM_LEVELS: PermLevel[] = ['None', 'View', 'Edit', 'Full'];

/* Sourced from lib/permission-categories, not copied. This file used to keep
   its own list, which is how a category can exist on the server with no
   checkbox in the UI that grants it. That module is a leaf with no server
   imports precisely so this client component can read it. */

const ROLE_PRESETS: { name: string; desc: string; color: string; perms: PermissionMap }[] = [
  { name: 'Admin', desc: 'Full system access across all modules.', color: ROLE_SWATCH.red,
    perms: Object.fromEntries(CATEGORIES.map(c => [c, 'Full' as PermLevel])) },
  { name: 'Project Manager', desc: 'Manage projects end-to-end, approve COs and pay apps.', color: ROLE_SWATCH.blue,
    perms: Object.fromEntries(CATEGORIES.map(c => [c, c === 'Admin' ? 'View' as PermLevel : 'Full' as PermLevel])) },
  { name: 'Superintendent', desc: 'Field operations — schedule, safety, daily reporting.', color: ROLE_SWATCH.green,
    perms: Object.fromEntries(CATEGORIES.map(c => {
      if (['Schedule','Safety','Documents','RFIs','Submittals'].includes(c)) return [c, 'Edit' as PermLevel];
      if (['Projects','Budget','Change Orders','Pay Apps','Reports'].includes(c)) return [c, 'View' as PermLevel];
      return [c, 'None' as PermLevel];
    })) },
  { name: 'Foreman', desc: 'Daily field reporting and crew management.', color: ROLE_SWATCH.amber,
    perms: Object.fromEntries(CATEGORIES.map(c => {
      if (['Safety','Schedule'].includes(c)) return [c, 'Edit' as PermLevel];
      if (['Projects','Documents','RFIs','Submittals','Reports'].includes(c)) return [c, 'View' as PermLevel];
      return [c, 'None' as PermLevel];
    })) },
  { name: 'Subcontractor', desc: 'Limited access for subcontractor partners.', color: ROLE_SWATCH.lightSlate,
    perms: Object.fromEntries(CATEGORIES.map(c => {
      if (['Submittals','RFIs'].includes(c)) return [c, 'Edit' as PermLevel];
      if (['Projects','Documents','Schedule','Safety','Pay Apps'].includes(c)) return [c, 'View' as PermLevel];
      return [c, 'None' as PermLevel];
    })) },
  { name: 'Read-Only', desc: 'View-only access. Cannot modify any data.', color: ROLE_SWATCH.slate, // stored with the role — a hex, never a CSS variable
    perms: Object.fromEntries(CATEGORIES.map(c => [c, 'View' as PermLevel])) },
];

const ROLE_COLORS: string[] = Object.values(ROLE_SWATCH);
const ROLE_COLOR_NAME: Record<string, string> = { [ROLE_SWATCH.blue]: 'Blue', [ROLE_SWATCH.green]: 'Green', [ROLE_SWATCH.amber]: 'Amber', [ROLE_SWATCH.red]: 'Red', [ROLE_SWATCH.white]: 'White', [ROLE_SWATCH.lightSlate]: 'Light slate', [ROLE_SWATCH.slate]: 'Slate' };

/* ── view types for the two lightweight lookup lists ── */
interface TenantUser {
  id: string; name: string; email: string;
  role?: string | null; title?: string | null; avatarUrl?: string | null;
  createdAt?: string | null; lastSignInAt?: string | null; phone?: string | null;
}
interface TenantProject { id: string; name: string }

/* project_team row — project-level membership (may or may not map to a sign-in) */
interface ProjTeamRow { id: string; user_id: string | null; email: string | null; name: string; project_id: string; role: string | null }

/* Base roles the server treats as an unconditional Full-on-everything bypass
   (mirrors ADMIN_ROLES in lib/permissions.ts). */
const ADMIN_BYPASS = new Set(['admin', 'owner']);

/* One row of the Team tab: a PERSON (profiles + project_team merged), with
   their real grant rollup. Every field traces to a real row — no invention. */
interface PersonRow {
  key: string;
  userId: string | null;          // profiles.id when they have a sign-in
  name: string; email: string;
  avatarUrl: string | null;
  baseRole: string | null;        // profiles.role (or project_team.role for contacts)
  title: string | null;
  status: 'active' | 'invited' | 'contact';
  lastSignInAt: string | null;    // auth.users.last_sign_in_at (real)
  globalGrants: UserAssignment[]; // user_role_assignments, project_id IS NULL
  projectGrants: UserAssignment[];// user_role_assignments, project-scoped
  projectNames: string[];         // project_team memberships
  invite: PendingInvite | null;
}

/* pending sent invite (team_invites row, status='pending') */
interface PendingInvite {
  id: string;
  email: string;
  /* The name typed on the invite form — null until team_invites.name exists
     (see app/api/team/invite/route.ts) and for invites sent before it did. */
  name?: string | null;
  role: string | null;
  created_at: string;
  invited_by: string | null;
}

/* Invites have no expires_at column — they expire 7 days after created_at. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/* Invite email validation — a real address, not just any non-empty string. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── style helpers ── */
const btn = (bg: string, color = TEXT): React.CSSProperties => ({
  background: bg, color, border: 'none', borderRadius: 6, padding: '8px 18px',
  cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'opacity .15s',
});
/* The slate secondary button — every action that is not the screen's one
   yellow primary (row actions, the second header action, modal extras). */
const secBtn = (): React.CSSProperties => ({
  ...btn('var(--bg-surface-2)', TEXT), border: '1px solid var(--border-default)',
});
const inputStyle = (): React.CSSProperties => ({
  background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6,
  padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none',
});
const labelStyle = (): React.CSSProperties => ({
  color: DIM, fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block',
});
const card = (): React.CSSProperties => ({
  background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: 20, marginBottom: 14,
});

/* ── helpers ── */
function emptyPermissions(): PermissionMap {
  return Object.fromEntries(CATEGORIES.map(c => [c, 'None' as PermLevel]));
}

function permLevelColor(level: PermLevel): string {
  switch (level) {
    case 'Full': return GREEN;
    case 'Edit': return BLUE;
    case 'View': return AMBER;
    default: return 'var(--text-tertiary)';
  }
}

function permLevelLabel(level: PermLevel): string {
  if (level === 'Full') return 'Full (CRUD + Approve)';
  return level;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

/** Compact "time since" for a sent invite (e.g. "just now", "3h ago", "2d ago"). */
function relTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Countdown label for an invite that expires 7 days after created_at. */
function inviteExpiry(createdIso: string): { label: string; expired: boolean } {
  const created = new Date(createdIso).getTime();
  if (isNaN(created)) return { label: '—', expired: false };
  const remaining = created + INVITE_TTL_MS - Date.now();
  if (remaining <= 0) return { label: 'Expired', expired: true };
  const totalHrs = Math.floor(remaining / (60 * 60 * 1000));
  const days = Math.floor(totalHrs / 24);
  const hrs = totalHrs % 24;
  if (days > 0) return { label: `in ${days}d ${hrs}h`, expired: false };
  if (hrs > 0) return { label: `in ${hrs}h`, expired: false };
  const mins = Math.max(1, Math.floor(remaining / (60 * 1000)));
  return { label: `in ${mins}m`, expired: false };
}

/* ── DB row → view mappers (REAL data only — no mocks) ── */
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRole(row: any): Role {
  const raw = row?.permissions && typeof row.permissions === 'object' ? row.permissions : {};
  const permissions = { ...emptyPermissions(), ...raw } as PermissionMap;
  return {
    id: String(row.id),
    name: row.name ?? 'Untitled Role',
    description: row.description ?? '',
    color: row.color || ROLE_HEX,
    isBuiltIn: !!row.is_builtin,
    permissions,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

function mapAssignment(a: any, us: TenantUser[], ps: TenantProject[]): UserAssignment {
  const u = us.find((x) => x.id === a.userId);
  const p = a.projectId ? ps.find((x) => x.id === a.projectId) : null;
  return {
    id: String(a.id),
    userId: a.userId,
    userName: a.userName || u?.name || 'Unknown',
    email: a.email || u?.email || '',
    roleId: a.roleId,
    projectId: a.projectId ?? null,
    projectName: a.projectName || p?.name || null,
    assignedAt: a.assignedAt ?? new Date().toISOString(),
    assignedBy: a.assignedBy || 'System',
  };
}

/** Seed the six built-in role presets as REAL rows when a tenant has none yet. */
async function seedPresets(headers: Record<string, string>): Promise<void> {
  for (const p of ROLE_PRESETS) {
    const res = await fetch('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: p.name, description: p.desc, permissions: p.perms, color: p.color, is_builtin: true }),
    });
    if (!res.ok) throw new Error('Could not seed the built-in roles.');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ── overlay / modal wrapper ── */
function Modal({ open, onClose, title, width, children }: {
  open: boolean; onClose: () => void; title: string; width?: number;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // A fixed 480–520px box ran ~45px off each side of a 390px phone; it now
  // fits the screen with a 16px gutter and is announced as a dialog.
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      {/* Solid surface: --bg-surface is a 4.5% glass tint, so every form read through to the page under it. */}
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ position: 'relative', background: 'var(--bg-solid-2)', border: `1px solid ${BORDER}`, borderRadius: 'var(--radius-lg, 12px)',
        width: `min(${width ?? 520}px, 100%)`, boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto', padding: 'clamp(18px, 5vw, 28px)', zIndex: 1, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 8 }}>
          <h3 id={titleId} style={{ color: 'var(--text-primary)', margin: 0, fontSize: 18 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn('transparent', DIM), fontSize: 20, padding: '2px 8px', lineHeight: 1, minWidth: 44, minHeight: 44 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* Phone: every button a 44px tap target, 16px inputs (no iOS zoom), the tab
   strip scrolls instead of the page, and the Roles list / role detail stack.
   Before, the 320px + detail grid and 32px padding pushed the page sideways. */
const AM_CSS = `@media (max-width: 767px) {
  .amTap, .amRoot button { min-height: 44px; }
  .amRoot { padding: 16px !important; }
  .amHead { flex-wrap: wrap; gap: 12px; }
  .amTabs { overflow-x: auto; scrollbar-width: none; }
  .amTabs > button { flex: 0 0 auto; padding: 10px 14px !important; }
  .amRolesGrid { grid-template-columns: minmax(0, 1fr) !important; }
  .amPermGrid { grid-template-columns: minmax(92px, 1.3fr) repeat(4, minmax(34px, 1fr)) !important; }
  .amBar { flex-wrap: wrap; }
  .amRoot input:not([type=checkbox]):not([type=radio]), .amRoot select, .amRoot textarea { font-size: 16px !important; min-height: 44px; }
  .amPersonGrid { grid-template-columns: minmax(0, 1fr) !important; }
}
.amPerson { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; }
.amPerson:hover .amPersonName { text-decoration: underline; }
.amPerson:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 6px; }`;

/* ── loading spinner ── */
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${BORDER}`, borderTopColor: 'var(--text-secondary)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ======================================================================== */
/** `jump` opens a tab from outside (the People hub's stat tiles); `n` makes a
 *  second tap on the same tile count. */
export function AccessManager({ jump, onChanged }: { jump?: { tab: Tab; n: number }; onChanged?: () => void } = {}) {
  // Land on Team — the people-first view. Everything else is one tab away.
  const [tab, setTabState] = useState<Tab>('team');
  /* The open tab rides the URL (?view=roles …) so a reload, a shared link or
     the back button lands on the same tab. Before this, every reload dropped
     you on Team — a role you had just created was "gone" until you found the
     Roles tab again. Read once on mount (client-only, no Suspense needed). */
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v && (TAB_KEYS as string[]).includes(v)) setTabState(v as Tab);
    } catch { /* no URL — stay on Team */ }
  }, []);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      const u = new URL(window.location.href);
      if (t === 'team') u.searchParams.delete('view'); else u.searchParams.set('view', t);
      window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* URL sync is cosmetic */ }
  }, []);
  useEffect(() => { if (jump) setTab(jump.tab); }, [jump, setTab]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  /* real tenant lookups (replace the deleted mock arrays) */
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [projects, setProjects] = useState<TenantProject[]>([]);
  const [projTeam, setProjTeam] = useState<ProjTeamRow[]>([]);

  /* Team tab search */
  const [teamSearch, setTeamSearch] = useState('');

  /* transient success / error toast for actions (load errors use `error`) */
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  /* create / edit role modal */
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formColor, setFormColor] = useState(ROLE_COLORS[0]);
  const [formPerms, setFormPerms] = useState<PermissionMap>(emptyPermissions());

  /* compare */
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  /* user filters */
  const [userSearch, setUserSearch] = useState('');
  const [filterRoleId, setFilterRoleId] = useState('');

  /* assign modal */
  const [showAssign, setShowAssign] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignProjectId, setAssignProjectId] = useState('');

  /* invite modal */
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('');

  /* ── pending sent invites (tenant-scoped; used by the Users tab panel) ── */
  /* Who am I, and which id is this tenant's? Needed so the roster does not
     offer a Remove button for the two people the server refuses to remove —
     yourself, and the account owner (whose auth id IS the tenant id). */
  const [meId, setMeId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/auth/me', { headers });
        if (!res.ok) return;
        const me = await res.json();
        setMeId(me?.id ?? null);
        setTenantId(me?.tenantId ?? null);
      } catch { /* non-fatal — the server still refuses both cases */ }
    })();
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/team/invite', { headers });
      if (!res.ok) return;
      const raw = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.invites) ? raw.invites : [];
      setPendingInvites(arr as PendingInvite[]);
    } catch { /* non-fatal — leave the list as-is */ }
  }, []);

  /* Every reload here follows a change (or the first load): the People hub's
     counts above re-read with it, so "Roles Defined" never lags the list. */
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const loadedOnceRef = useRef(false);

  /* ── load data (100% real, tenant-scoped; no mock fallbacks) ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();

      /* Real tenant users (profiles) + real projects, in parallel. */
      const sb = getSupabaseBrowser();
      const [usersRes, projRes, ptRes] = await Promise.all([
        fetch('/api/team/users', { headers }),
        sb.from('projects').select('id, name').order('name'),
        sb.from('project_team').select('id, user_id, email, name, project_id, role'),
      ]);

      // A failed roster read is an error on screen, never an empty team.
      if (!usersRes.ok) throw new Error('Unable to load your team. Please try again.');
      const loadedUsers: TenantUser[] = (((await usersRes.json())?.users ?? []) as TenantUser[]);
      setUsers(loadedUsers);

      const loadedProjects: TenantProject[] = (projRes.data ?? []).map((p) => ({ id: p.id as string, name: (p.name as string) ?? 'Project' }));
      setProjects(loadedProjects);

      /* Project-level memberships (RLS-scoped) — merged into the Team roster. */
      setProjTeam((ptRes.data ?? []) as ProjTeamRow[]);

      /* Roles — seed the built-in presets as REAL rows if this tenant has none. */
      const rolesRes = await fetch('/api/roles', { headers });
      if (!rolesRes.ok) throw new Error('Unable to load roles. Please sign in and try again.');
      const rolesJson = await rolesRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rolesRaw: any[] = Array.isArray(rolesJson) ? rolesJson : Array.isArray(rolesJson?.roles) ? rolesJson.roles : [];
      if (rolesRaw.length === 0) {
        await seedPresets(headers);
        const reRes = await fetch('/api/roles', { headers });
        if (reRes.ok) {
          const reJson = await reRes.json();
          rolesRaw = Array.isArray(reJson) ? reJson : Array.isArray(reJson?.roles) ? reJson.roles : [];
        }
      }
      const loadedRoles = rolesRaw.map(mapRole);
      setRoles(loadedRoles);
      if (loadedRoles.length > 0) {
        setSelectedRoleId((cur) => (cur && loadedRoles.some((r) => r.id === cur) ? cur : loadedRoles[0].id));
        setCompareA((cur) => cur || loadedRoles[0].id);
        setCompareB((cur) => cur || (loadedRoles[1]?.id ?? ''));
      } else {
        setSelectedRoleId(null);
      }

      /* Assignments — denormalized against the REAL users/roles/projects. */
      const assignRes = await fetch('/api/roles/assignments', { headers });
      let loadedAssign: UserAssignment[] = [];
      if (assignRes.ok) {
        const raw = await assignRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.assignments) ? raw.assignments : [];
        loadedAssign = arr.map((a) => mapAssignment(a, loadedUsers, loadedProjects));
      }
      setAssignments(loadedAssign);

      /* Audit — real rows from audit_logs; may legitimately be empty. */
      const auditRes = await fetch('/api/roles/audit', { headers });
      let loadedAudit: AuditEntry[] = [];
      if (auditRes.ok) {
        const raw = await auditRes.json();
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.audit) ? raw.audit : [];
        loadedAudit = arr as AuditEntry[];
      }
      setAudit(loadedAudit);

      /* Pending sent invites — tenant-scoped; may legitimately be empty. */
      await loadInvites();
      // Not on the first load: the hub read its own counts when it mounted.
      if (loadedOnceRef.current) onChangedRef.current?.();
      loadedOnceRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles data.');
    } finally {
      setLoading(false);
    }
  }, [loadInvites]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId) ?? null, [roles, selectedRoleId]);
  const roleA = useMemo(() => roles.find(r => r.id === compareA) ?? null, [roles, compareA]);
  const roleB = useMemo(() => roles.find(r => r.id === compareB) ?? null, [roles, compareB]);

  /* ── actions ── */
  const notify = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const openCreateRole = () => {
    setEditRoleId(null);
    setFormName('');
    setFormDesc('');
    setFormColor(ROLE_COLORS[0]);
    setFormPerms(emptyPermissions());
    setShowRoleModal(true);
  };

  const openEditRole = (role: Role) => {
    if (role.isBuiltIn) return;
    setEditRoleId(role.id);
    setFormName(role.name);
    setFormDesc(role.description);
    setFormColor(role.color);
    setFormPerms({ ...role.permissions });
    setShowRoleModal(true);
  };

  const saveRole = async () => {
    if (!formName.trim()) return;
    const headers = await getAuthHeaders();
    try {
      const body = JSON.stringify({
        name: formName.trim(), description: formDesc.trim(), color: formColor,
        permissions: formPerms, is_builtin: false,
      });
      const res = editRoleId
        ? await fetch(`/api/roles/${editRoleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body })
        : await fetch('/api/roles', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
      if (!res.ok) throw new Error('save failed');
      const saved = await res.json().catch(() => null);
      const savedId: string | null = saved?.role?.id ?? editRoleId ?? null;
      setShowRoleModal(false);
      notify(editRoleId ? 'Role updated.' : 'Role created.');
      await loadData();
      /* Show the role you just saved: open the Roles tab with it selected.
         The tab is in the URL, so a reload lands right back here. */
      if (savedId) setSelectedRoleId(savedId);
      setTab('roles');
    } catch {
      notify('Could not save the role. Please try again.', 'err');
    }
  };

  const duplicateRole = async (source: Role) => {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch('/api/roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          name: `${source.name} (Copy)`, description: source.description, color: source.color,
          permissions: source.permissions, is_builtin: false,
        }),
      });
      if (!res.ok) throw new Error('duplicate failed');
      notify('Role duplicated.');
      await loadData();
    } catch {
      notify('Could not duplicate the role.', 'err');
    }
  };

  const deleteRole = async (id: string) => {
    const r = roles.find(x => x.id === id);
    if (!r || r.isBuiltIn) return;
    if (!(await confirmDialog({ title: 'Please confirm', message: `Delete role "${r.name}"? Users will be unassigned.`, danger: true }))) return;
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/roles/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('delete failed');
      if (selectedRoleId === id) setSelectedRoleId(null);
      notify('Role deleted.');
      await loadData();
    } catch {
      notify('Could not delete the role.', 'err');
    }
  };

  const togglePerm = async (roleId: string, category: string, level: PermLevel) => {
    const r = roles.find(x => x.id === roleId);
    if (!r || r.isBuiltIn) return;
    const newPerms: PermissionMap = { ...r.permissions, [category]: level };
    /* optimistic — reverted from server truth on failure */
    setRoles(prev => prev.map(x => x.id === roleId ? { ...x, permissions: newPerms, updatedAt: new Date().toISOString() } : x));
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ permissions: newPerms }),
      });
      if (!res.ok) throw new Error('permission save failed');
    } catch {
      notify(`Could not save "${category}" (${permLevelLabel(level)}).`, 'err');
      await loadData();
    }
  };

  /** Open the assign modal pre-targeted at one person (Team tab action). */
  const openAssignFor = (userId: string) => {
    setAssignUserId(userId);
    setAssignRoleId('');
    setAssignProjectId('');
    setShowAssign(true);
  };

  const assignRole = async () => {
    if (!assignUserId || !assignRoleId) return;
    const headers = await getAuthHeaders();
    try {
      const res = await fetch('/api/roles', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ _type: 'assignment', user_id: assignUserId, role_id: assignRoleId, project_id: assignProjectId || null }),
      });
      if (!res.ok) throw new Error('assign failed');
      setShowAssign(false);
      setAssignUserId('');
      setAssignRoleId('');
      setAssignProjectId('');
      notify('Role assigned.');
      await loadData();
    } catch {
      notify('Could not assign the role.', 'err');
    }
  };

  const removeAssignment = async (id: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/roles/assignments/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('remove failed');
      notify('Assignment removed.');
      await loadData();
    } catch {
      notify('Could not remove the assignment.', 'err');
    }
  };

  /* ── invite-flow intelligence (validation + duplicate detection + role clarity) ── */
  const inviteEmailTrim = inviteEmail.trim();
  const inviteEmailValid = EMAIL_RE.test(inviteEmailTrim);
  const inviteDupUser = inviteEmailTrim ? users.find(u => (u.email || '').toLowerCase() === inviteEmailTrim.toLowerCase()) : undefined;
  const inviteDupPending = inviteEmailTrim ? pendingInvites.find(i => (i.email || '').toLowerCase() === inviteEmailTrim.toLowerCase()) : undefined;
  const inviteRoleObj = inviteRole ? roles.find(r => r.name === inviteRole) ?? null : null;

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    const headers = await getAuthHeaders();
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() || inviteEmail.trim(), role: inviteRole || 'member' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'invite failed');
      setShowInvite(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('');
      // The invite exists either way; "sent" only when the email really went out.
      if (body.emailed === false) notify(`Invite saved, but the email didn't go out (${body.emailError || 'email is not set up'}). Use Resend once email works.`, 'err');
      else notify('Invite sent.');
      await loadData();
      /* The invitee is listed on Team (status Invited) — take you there. */
      setTab('team');
    } catch {
      notify('Could not send the invite.', 'err');
    }
  };

  const cancelInvite = async (id: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/team/invite/${id}`, { method: 'DELETE', headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not cancel the invite.');
      notify('Invite cancelled.');
      await loadInvites();
    } catch (e) {
      notify(e instanceof Error && e.message ? e.message : 'Could not cancel the invite.', 'err');
      await loadInvites();
    }
  };

  const resendInvite = async (id: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/team/invite/${id}`, { method: 'POST', headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not resend the invite.');
      if (body.emailed === false) notify(`The 7-day clock was reset, but the email didn't go out (${body.emailError || 'email is not set up'}).`, 'err');
      else notify('Invite resent — the 7-day clock has been reset.');
      await loadInvites();
    } catch (e) {
      notify(e instanceof Error && e.message ? e.message : 'Could not resend the invite.', 'err');
    }
  };

  const resetUserPassword = async (userId: string, userName: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/team/users/${userId}/reset-password`, { method: 'POST', headers });
      if (!res.ok) throw new Error('reset failed');
      notify(`Password reset email sent to ${userName}.`);
    } catch {
      notify('Could not send the reset email.', 'err');
    }
  };

  /* Remove a person from the company account. Until now an admin could invite
     someone and reset their password and that was the whole lifecycle — a
     super who quit on Friday still had the projects, contracts and payroll on
     Monday. Confirmation is typed, not a dialog button, because this ends
     someone's access to a live job. */
  const removeUser = async (userId: string, userName: string, email: string) => {
    const typed = (await textPrompt({ title: 'Enter a value', label: `Remove ${userName} from this account?\n\n` +
      `Their sign-in is deleted and they lose access immediately. The daily logs, ` +
      `photos and records they wrote stay with the company.\n\n` +
      `Type REMOVE to confirm.` }));
    if (typed?.trim().toUpperCase() !== 'REMOVE') return;
    const headers = await getAuthHeaders();
    try {
      const res = await fetch(`/api/team/users/${userId}`, { method: 'DELETE', headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { notify(body?.error || 'Could not remove that person.', 'err'); return; }
      notify(`${userName}${email ? ` (${email})` : ''} no longer has access.`);
      await loadData(); await loadInvites();
    } catch {
      notify('Could not reach the server.', 'err');
    }
  };

  /* ── one person: open from the Team list, see everything, edit what is theirs ──
     A sign-in's name, job title and phone (PATCH /api/team/users/:id); a pending
     invite's name and the role they get on accepting (PATCH /api/team/invite/:id).
     Access itself stays with Assign Role. A project contact has no sign-in here —
     they are edited on the job's Team page. */
  const [personKey, setPersonKey] = useState<string | null>(null);
  const [personEditing, setPersonEditing] = useState(false);
  const [pName, setPName] = useState('');
  const [pTitle, setPTitle] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pRole, setPRole] = useState('');
  const [pSaving, setPSaving] = useState(false);
  const [pError, setPError] = useState('');
  const openPerson = (r: PersonRow) => { setPersonKey(r.key); setPersonEditing(false); setPError(''); };
  const closePerson = () => { if (!pSaving) { setPersonKey(null); setPersonEditing(false); setPError(''); } };
  const startPersonEdit = () => {
    if (!person) return;
    setPName(person.status === 'invited' ? (person.invite?.name?.trim() || '') : person.name);
    setPTitle(person.title ?? '');
    setPPhone(users.find(u => u.id === person.userId)?.phone ?? '');
    setPRole(person.invite?.role || person.baseRole || 'member');
    setPError('');
    setPersonEditing(true);
  };
  const savePerson = async () => {
    if (!person) return;
    setPSaving(true);
    setPError('');
    try {
      const headers = await getAuthHeaders();
      let res: Response;
      if (person.status === 'invited' && person.invite) {
        res = await fetch(`/api/team/invite/${person.invite.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ name: pName.trim(), role: pRole || 'member' }) });
      } else if (person.status === 'active' && person.userId) {
        if (!pName.trim()) { setPError('A person needs a name.'); setPSaving(false); return; }
        res = await fetch(`/api/team/users/${person.userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ full_name: pName.trim(), title: pTitle.trim(), phone: pPhone.trim() }) });
      } else { setPSaving(false); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setPError(body?.error || 'Could not save. Please try again.'); return; }
      notify('Saved.');
      setPersonEditing(false);
      await loadData();
    } catch {
      setPError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPSaving(false);
    }
  };

  /* ── filtered assignments ── */
  const filteredAssignments = useMemo(() => {
    let list = assignments;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter(a => a.userName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
    }
    if (filterRoleId) list = list.filter(a => a.roleId === filterRoleId);
    return list;
  }, [assignments, userSearch, filterRoleId]);

  /* ── Team roster: EVERYONE — profiles + project_team merged, with the real
        grant rollup per person. Grants come straight from user_role_assignments;
        project memberships from project_team; invite status from team_invites. ── */
  const allTeamRows = useMemo<PersonRow[]>(() => {
    const projName = (pid: string) => projects.find(p => p.id === pid)?.name ?? 'Project';
    const rows = new Map<string, PersonRow>();

    /* 1) Platform sign-ins (profiles). */
    for (const u of users) {
      rows.set(u.id, {
        key: u.id, userId: u.id, name: u.name, email: u.email,
        avatarUrl: u.avatarUrl ?? null, baseRole: u.role ?? null, title: u.title ?? null,
        status: 'active', lastSignInAt: u.lastSignInAt ?? null,
        globalGrants: [], projectGrants: [], projectNames: [], invite: null,
      });
    }
    const byEmail = new Map<string, PersonRow>();
    for (const r of rows.values()) if (r.email) byEmail.set(r.email.toLowerCase(), r);

    /* 2) project_team memberships — attach to a sign-in when they map (by
          user_id, else by email), otherwise a project-contact row. */
    for (const pt of projTeam) {
      const target = (pt.user_id && rows.get(pt.user_id)) || (pt.email && byEmail.get(pt.email.toLowerCase())) || null;
      const pn = projName(pt.project_id);
      if (target) {
        if (!target.projectNames.includes(pn)) target.projectNames.push(pn);
      } else {
        const ck = `contact:${(pt.email || pt.name).toLowerCase()}`;
        const existing = rows.get(ck);
        if (existing) {
          if (!existing.projectNames.includes(pn)) existing.projectNames.push(pn);
        } else {
          const row: PersonRow = {
            key: ck, userId: null, name: pt.name || pt.email || 'Unknown', email: pt.email ?? '',
            avatarUrl: null, baseRole: pt.role ?? null, title: null,
            status: 'contact', lastSignInAt: null,
            globalGrants: [], projectGrants: [], projectNames: [pn], invite: null,
          };
          rows.set(ck, row);
          if (row.email) byEmail.set(row.email.toLowerCase(), row);
        }
      }
    }

    /* 3) Pending invites — someone on their way in. An address that already
          has a sign-in keeps Active status (the invite panel still lists it). */
    for (const inv of pendingInvites) {
      const em = (inv.email || '').toLowerCase();
      const existing = em ? byEmail.get(em) : undefined;
      if (existing) {
        // Two pending invites to one address: the newest is the live one, and
        // the row shows its name — before, the row kept the first invite's name
        // while Edit opened the last one, so the form looked empty or wrong.
        const newer = !existing.invite || new Date(inv.created_at || 0).getTime() >= new Date(existing.invite.created_at || 0).getTime();
        if (existing.status !== 'active' && newer) {
          existing.status = 'invited'; existing.invite = inv;
          if (existing.key.startsWith('invite:')) existing.name = inv.name?.trim() || inv.email;
        }
      } else if (em) {
        const row: PersonRow = {
          key: `invite:${inv.id}`, userId: null, name: inv.name?.trim() || inv.email, email: inv.email,
          avatarUrl: null, baseRole: inv.role ?? null, title: null,
          status: 'invited', lastSignInAt: null,
          globalGrants: [], projectGrants: [], projectNames: [], invite: inv,
        };
        rows.set(row.key, row);
        byEmail.set(em, row);
      }
    }

    /* 4) Grant rollup — real user_role_assignments split global vs project. */
    for (const a of assignments) {
      const r = rows.get(a.userId);
      if (!r) continue;
      (a.projectId ? r.projectGrants : r.globalGrants).push(a);
    }

    const rank = { active: 0, invited: 1, contact: 2 } as const;
    return Array.from(rows.values()).sort((x, y) => rank[x.status] - rank[y.status] || x.name.localeCompare(y.name));
  }, [users, projTeam, pendingInvites, assignments, projects]);
  const teamRows = useMemo<PersonRow[]>(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return allTeamRows;
    return allTeamRows.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.baseRole ?? '').toLowerCase().includes(q));
  }, [allTeamRows, teamSearch]);
  // The open person, from the whole roster (the search box never hides the one you opened).
  const person = personKey ? allTeamRows.find(r => r.key === personKey) ?? null : null;

  /* ── tab bar ── */
  const tabs: { key: Tab; label: string }[] = [
    { key: 'team', label: 'Team' },
    { key: 'roles', label: 'Roles' },
    { key: 'matrix', label: 'Permission Matrix' },
    { key: 'users', label: 'Assignments & Invites' },
    { key: 'compare', label: 'Compare Roles' },
    { key: 'audit', label: 'Audit Log' },
  ];

  if (loading) return (
    <div className="amRoot" style={{ minHeight: '100vh', background: BG, padding: 32 }}>
      <h1 className="k-title" style={{ margin: 0, marginBottom: 8 }}>Roles & Permissions</h1>
      <Spinner />
    </div>
  );

  if (error) return (
    <div className="amRoot" style={{ minHeight: '100vh', background: BG, padding: 32 }}>
      <h1 className="k-title" style={{ margin: 0, marginBottom: 8 }}>Roles & Permissions</h1>
      <div style={{ ...card(), borderColor: RED }}>
        <p style={{ color: RED, margin: 0, marginBottom: 12 }}>Error: {error}</p>
        <button onClick={loadData} style={btn(GOLD, 'var(--on-brand)')}>Retry</button>
      </div>
    </div>
  );

  return (
    <div className="amRoot" style={{ minHeight: '100vh', background: BG, padding: 32 }}>
      <style dangerouslySetInnerHTML={{ __html: AM_CSS }} />
      {/* header */}
      <div className="amHead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="k-title" style={{ margin: 0 }}>Roles & Permissions</h1>
          <p style={{ color: DIM, fontSize: 13, margin: '4px 0 0' }}>
            Manage access levels across {CATEGORIES.length} categories — {roles.length} roles configured
          </p>
        </div>
        <button onClick={openCreateRole} style={btn(GOLD, 'var(--on-brand)')}>+ New Role</button>
      </div>

      {/* tab bar */}
      <div className="amTabs" role="tablist" aria-label="Roles and access" style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BORDER}`, marginBottom: 22 }}>
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} style={{
            background: 'transparent', border: 'none', color: tab === t.key ? GOLD : DIM,
            fontWeight: tab === t.key ? 700 : 500, fontSize: 14, padding: '10px 20px',
            borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
            cursor: 'pointer', marginBottom: -2, transition: 'color .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: TEAM — everyone (profiles + project_team merged) ── */}
      {tab === 'team' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Search people…" value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
              style={{ ...inputStyle(), maxWidth: 280 }} />
            <span style={{ color: DIM, fontSize: 12 }}>
              {teamRows.length} {teamRows.length === 1 ? 'person' : 'people'} · {teamRows.filter(r => r.status === 'active').length} sign-ins · {teamRows.filter(r => r.status === 'invited').length} invited · {teamRows.filter(r => r.status === 'contact').length} project contacts
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" className="amTap" onClick={() => setShowInvite(true)} style={secBtn()}>+ Invite User</button>
            <button type="button" className="amTap" onClick={() => { setAssignUserId(''); setAssignRoleId(''); setAssignProjectId(''); setShowAssign(true); }} style={secBtn()}>+ Assign Role</button>
          </div>

          <div style={{ ...card(), overflowX: 'auto' }}>
            <table className="k-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Person', 'Base Role', 'Access', 'Projects', 'Last Active', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600,
                      borderBottom: `2px solid ${BORDER}`, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamRows.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: DIM }}>
                    {teamSearch ? 'No people match your search.' : 'No people yet — invite your first teammate.'}
                  </td></tr>
                ) : teamRows.map(r => {
                  const isBypass = !!r.userId && ADMIN_BYPASS.has((r.baseRole || '').toLowerCase());
                  const ini = (r.name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
                  const inviteExp = r.invite ? inviteExpiry(r.invite.created_at) : null;
                  return (
                    <tr key={r.key} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                      {/* Person */}
                      <td style={{ padding: '10px 12px' }}>
                        <button type="button" className="amPerson" onClick={() => openPerson(r)} aria-label={`Open ${r.name}`}>
                          {r.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{ini}</span>
                          )}
                          <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3 }}>
                            <span className="amPersonName" style={{ color: TEXT, fontWeight: 600 }}>{r.name}</span>
                            <span style={{ color: DIM, fontSize: 12 }}>{[r.email, r.title].filter(Boolean).join(' · ') || '—'}</span>
                          </span>
                        </button>
                      </td>
                      {/* Base role */}
                      <td data-label="Base Role" style={{ padding: '10px 12px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                          color: isBypass ? TEXT : DIM,
                          background: isBypass ? 'var(--bg-surface-2)' : 'rgba(255,255,255,0.05)',
                          border: isBypass ? '1px solid var(--border-strong)' : `1px solid ${BORDER}`,
                          /* Title-case the built-in lowercase base roles ("member");
                             a role name you typed is shown exactly as you typed it. */
                          textTransform: (r.baseRole || 'member') === (r.baseRole || 'member').toLowerCase() ? 'capitalize' : 'none' }}>
                          {r.baseRole || 'member'}
                        </span>
                      </td>
                      {/* Access — computed exactly the way the server enforces it */}
                      <td data-label="Access" style={{ padding: '10px 12px', maxWidth: 300 }}>
                        {isBypass ? (
                          <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>Full — admin bypass ({CATEGORIES.length}/{CATEGORIES.length} categories)</span>
                        ) : r.status !== 'active' ? (
                          <span style={{ color: DIM, fontSize: 12 }}>{r.status === 'invited' ? 'No access until the invite is accepted' : 'No sign-in — project contact only'}</span>
                        ) : r.globalGrants.length === 0 && r.projectGrants.length === 0 ? (
                          <span style={{ color: DIM, fontSize: 12 }}>Member default — view-only, admin locked</span>
                        ) : (
                          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                            {r.globalGrants.map(g => {
                              const role = roles.find(x => x.id === g.roleId);
                              return (
                                <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${BORDER}`, borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 600, color: TEXT }}>
                                  <span style={{ width: 7, height: 7, borderRadius: 4, background: role?.color ?? BORDER, flexShrink: 0 }} />
                                  {role?.name ?? 'Unknown'}
                                  <button onClick={() => removeAssignment(g.id)} title="Remove this grant"
                                    style={{ background: 'transparent', border: 'none', color: RED, cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>x</button>
                                </span>
                              );
                            })}
                            {r.projectGrants.length > 0 && (
                              <span title={r.projectGrants.map(g => `${roles.find(x => x.id === g.roleId)?.name ?? 'Role'} @ ${g.projectName ?? 'Project'}`).join('\n')}
                                style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`,
                                  borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 700, color: AMBER }}>
                                {r.projectGrants.length} project-scoped
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      {/* Projects (project_team memberships) */}
                      <td data-label="Projects" style={{ padding: '10px 12px', color: r.projectNames.length ? TEXT : DIM, fontSize: 12 }}>
                        <span title={r.projectNames.join('\n')}>{r.projectNames.length || '—'}</span>
                      </td>
                      {/* Last active — real auth.users.last_sign_in_at */}
                      <td data-label="Last Active" style={{ padding: '10px 12px', color: r.lastSignInAt ? TEXT : DIM, fontSize: 12 }}>
                        {r.lastSignInAt ? relTimeAgo(r.lastSignInAt) : r.status === 'active' ? 'never signed in' : '—'}
                      </td>
                      {/* Status */}
                      <td data-label="Status" style={{ padding: '10px 12px' }}>
                        {r.status === 'active' ? (
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                            color: GREEN, background: `color-mix(in srgb, ${GREEN} 9%, transparent)`, border: `1px solid ${GREEN}` }}>Active</span>
                        ) : r.status === 'invited' ? (
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                            color: inviteExp?.expired ? RED : AMBER, background: inviteExp?.expired ? `color-mix(in srgb, ${RED} 9%, transparent)` : 'color-mix(in srgb, var(--warning) 9%, transparent)',
                            border: `1px solid ${inviteExp?.expired ? RED : AMBER}` }}>
                            {inviteExp?.expired ? 'Invite Expired' : `Invited · Expires ${inviteExp?.label ?? ''}`}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                            color: DIM, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}` }}>Project Contact</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.status === 'active' && r.userId ? (
                          <>
                            <button type="button" className="amTap" onClick={() => openAssignFor(r.userId!)}
                              style={{ ...secBtn(), padding: '6px 12px' }}>Assign Role</button>
                            <button onClick={() => resetUserPassword(r.userId!, r.name)}
                              style={{ ...btn('transparent', DIM), padding: '6px 12px', marginLeft: 4 }}>Reset Password</button>
                            {/* Destructive action last, and only for someone who
                                is neither you nor the account owner — the server
                                refuses both, so offering the button would only
                                promise something it will not do. */}
                            {r.userId !== meId && r.userId !== tenantId ? (
                              <button onClick={() => removeUser(r.userId!, r.name, r.email ?? '')}
                                style={{ ...btn('transparent', RED), padding: '6px 12px', marginLeft: 4 }}>Remove</button>
                            ) : null}
                          </>
                        ) : r.status === 'invited' && r.invite ? (
                          <>
                            <button onClick={() => resendInvite(r.invite!.id)}
                              style={{ ...secBtn(), padding: '6px 12px' }}>Resend</button>
                            <button onClick={() => cancelInvite(r.invite!.id)}
                              style={{ ...btn('transparent', RED), padding: '6px 12px', marginLeft: 4 }}>Cancel</button>
                          </>
                        ) : (
                          <span style={{ color: DIM, fontSize: 12 }}>No sign-in</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Honest footnote: how Access is computed + what deactivation can and cannot do today. */}
          <p style={{ color: DIM, fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
            Access is computed exactly the way the server enforces it (lib/permissions): admin/owner base roles bypass everything;
            everyone else takes the highest level per category across their role grants; a member with no grants gets the
            View-only default with Admin locked. Remove deletes the person&apos;s sign-in outright, so access ends immediately;
            the records they wrote stay with the company. The account owner cannot be removed here — that goes through account
            deletion. To trim someone&apos;s access without removing them, take away their role grants above. Last-active is
            their real last sign-in.
          </p>
        </div>
      )}

      {/* ── TAB: ROLES ── */}
      {tab === 'roles' && (
        <div className="amRolesGrid" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
          {/* left: role list */}
          <div>
            {roles.map(r => {
              const count = assignments.filter(a => a.roleId === r.id).length;
              const isSelected = r.id === selectedRoleId;
              return (
                <div key={r.id} onClick={() => setSelectedRoleId(r.id)} style={{
                  ...card(), cursor: 'pointer', marginBottom: 8,
                  borderColor: isSelected ? r.color : BORDER,
                  background: isSelected ? `color-mix(in srgb, ${r.color} 7%, transparent)` : RAISED,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: r.color }} />
                      <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.isBuiltIn && (
                        <span style={{ background: 'var(--bg-surface-2)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4 }}>Built-In</span>
                      )}
                      {!r.isBuiltIn && (
                        <span style={{ background: `color-mix(in srgb, ${PURPLE} 13%, transparent)`, color: PURPLE, fontSize: 12, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4 }}>Custom</span>
                      )}
                      <span style={{ color: DIM, fontSize: 12 }}>{count} user{count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <p style={{ color: DIM, fontSize: 12, margin: '6px 0 0', lineHeight: 1.4 }}>{r.description}</p>
                </div>
              );
            })}
          </div>

          {/* right: selected role detail */}
          <div>
            {selectedRole ? (
              <div style={card()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: selectedRole.color }} />
                      <h2 style={{ margin: 0, fontSize: 20 }}>{selectedRole.name}</h2>
                      {selectedRole.isBuiltIn ? (
                        <span style={{ background: 'var(--bg-surface-2)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4 }}>Built-In</span>
                      ) : (
                        <span style={{ background: `color-mix(in srgb, ${PURPLE} 13%, transparent)`, color: PURPLE, fontSize: 12, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4 }}>CUSTOM</span>
                      )}
                    </div>
                    <p style={{ color: DIM, fontSize: 13, margin: 0 }}>{selectedRole.description}</p>
                    <p style={{ color: DIM, fontSize: 12, margin: '6px 0 0' }}>
                      Created {fmtDate(selectedRole.createdAt)} — Last updated {fmtDate(selectedRole.updatedAt)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!selectedRole.isBuiltIn && (
                      <button onClick={() => openEditRole(selectedRole)} style={secBtn()}>Edit</button>
                    )}
                    <button onClick={() => duplicateRole(selectedRole)} style={btn(RAISED, DIM)}>Duplicate</button>
                    {!selectedRole.isBuiltIn && (
                      <button onClick={() => deleteRole(selectedRole.id)} style={btn(RAISED, RED)}>Delete</button>
                    )}
                  </div>
                </div>

                {/* permission grid for selected role */}
                <h4 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 10 }}>Permissions</h4>
                <div className="amPermGrid" style={{ display: 'grid', gridTemplateColumns: '160px repeat(4, 1fr)', gap: 0, fontSize: 12 }}>
                  {/* header */}
                  <div style={{ padding: '8px 10px', fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}` }}>Category</div>
                  {PERM_LEVELS.map(l => (
                    <div key={l} style={{ padding: '8px 10px', fontWeight: 700, color: DIM, textAlign: 'center',
                      borderBottom: `1px solid ${BORDER}` }}>{l === 'Full' ? 'Full (CRUD+)' : l}</div>
                  ))}
                  {/* rows */}
                  {CATEGORIES.map(cat => (
                    <React.Fragment key={cat}>
                      <div style={{ padding: '8px 10px', color: TEXT, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>{cat}</div>
                      {PERM_LEVELS.map(level => {
                        const isActive = selectedRole.permissions[cat] === level;
                        const canEdit = !selectedRole.isBuiltIn;
                        return (
                          <div key={level} style={{ padding: '6px 10px', textAlign: 'center',
                            borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                            <div onClick={() => canEdit && togglePerm(selectedRole.id, cat, level)} style={{
                              width: 22, height: 22, borderRadius: '50%', margin: '0 auto',
                              border: `2px solid ${isActive ? permLevelColor(level) : BORDER}`,
                              background: isActive ? permLevelColor(level) : 'transparent',
                              cursor: canEdit ? 'pointer' : 'default', transition: 'all .15s',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isActive && <span style={{ color: level === 'None' ? DIM : 'var(--on-brand)', fontSize: 12, fontWeight: 700 }}>
                                {level === 'None' ? '-' : '\u2713'}
                              </span>}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

                {/* assigned users for this role */}
                <h4 style={{ color: 'var(--text-primary)', fontSize: 14, marginTop: 22, marginBottom: 10 }}>Assigned Users</h4>
                {assignments.filter(a => a.roleId === selectedRole.id).length === 0 ? (
                  <p style={{ color: DIM, fontSize: 12 }}>No users assigned to this role.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {assignments.filter(a => a.roleId === selectedRole.id).map(a => (
                      <div key={a.id} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                        padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ color: TEXT, fontWeight: 600 }}>{a.userName}</span>
                        {a.projectName && <span style={{ color: AMBER, fontSize: 12 }}>({a.projectName})</span>}
                        <button onClick={() => removeAssignment(a.id)} style={{
                          background: 'transparent', border: 'none', color: RED, cursor: 'pointer',
                          fontSize: 14, padding: 0, lineHeight: 1,
                        }}>x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={card()}>
                <p style={{ color: DIM, textAlign: 'center' }}>Select a role to view details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: PERMISSION MATRIX ── */}
      {tab === 'matrix' && (
        <div style={{ ...card(), overflowX: 'auto' }}>
          <h3 style={{ color: TEXT, margin: '0 0 16px', fontSize: 16 }}>Full Permission Matrix</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, borderBottom: `2px solid ${BORDER}`,
                  position: 'sticky', left: 0, background: RAISED, zIndex: 2 }}>Category</th>
                {roles.map(r => (
                  <th key={r.id} style={{ padding: '10px 8px', textAlign: 'center', borderBottom: `2px solid ${BORDER}`,
                    minWidth: 100 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: r.color }} />
                      <span style={{ color: TEXT, fontWeight: 600, fontSize: 12 }}>{r.name}</span>
                      {r.isBuiltIn ? (
                        <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>Built-In</span>
                      ) : (
                        <span style={{ color: PURPLE, fontSize: 12, fontWeight: 700 }}>CUSTOM</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => (
                <tr key={cat}>
                  <td style={{ padding: '8px 12px', color: TEXT, fontWeight: 500,
                    borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)`, position: 'sticky', left: 0,
                    background: RAISED, zIndex: 1 }}>{cat}</td>
                  {roles.map(r => {
                    const level = r.permissions[cat] ?? 'None';
                    return (
                      <td key={r.id} style={{ padding: '6px 8px', textAlign: 'center',
                        borderBottom: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 12,
                          fontWeight: 600, color: level === 'None' ? DIM : 'var(--text-primary)',
                          background: level === 'None' ? `color-mix(in srgb, ${DIM} 8%, transparent)` : `color-mix(in srgb, ${permLevelColor(level)} 13%, transparent)`,
                          border: `1px solid ${level === 'None' ? 'transparent' : permLevelColor(level)}`,
                        }}>{level === 'Full' ? 'Full' : level}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 12, color: DIM }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GREEN, marginRight: 4 }} />Full = Create, Read, Update, Delete + Approve</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: BLUE, marginRight: 4 }} />Edit = Create, Read, Update</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: AMBER, marginRight: 4 }} />View = Read Only</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: DIM, marginRight: 4 }} />None = No Access</span>
          </div>
        </div>
      )}

      {/* ── TAB: USER ASSIGNMENTS ── */}
      {tab === 'users' && (
        <div>
          <div className="amBar" style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <input placeholder="Search users…" value={userSearch} onChange={e => setUserSearch(e.target.value)}
              style={{ ...inputStyle(), maxWidth: 260 }} />
            <select value={filterRoleId} onChange={e => setFilterRoleId(e.target.value)}
              style={{ ...inputStyle(), maxWidth: 200 }}>
              <option value="">All Roles</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button type="button" className="amTap" onClick={() => setShowInvite(true)} style={secBtn()}>+ Invite User</button>
            <button type="button" className="amTap" onClick={() => setShowAssign(true)} style={secBtn()}>+ Assign Role</button>
          </div>

          {/* ── Pending sent invites (expiry countdown + cancel / resend) ── */}
          <div style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: pendingInvites.length ? 14 : 0 }}>
              <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 15 }}>Pending Invites</h3>
              {pendingInvites.length > 0 && (
                <span style={{ color: DIM, fontSize: 12 }}>
                  {pendingInvites.length} pending
                </span>
              )}
            </div>
            {pendingInvites.length === 0 ? (
              <p style={{ color: DIM, fontSize: 12, margin: 0 }}>No pending invites.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Invitee', 'Role', 'Sent', 'Expires', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600,
                        borderBottom: `2px solid ${BORDER}`, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map(inv => {
                    const exp = inviteExpiry(inv.created_at);
                    return (
                      <tr key={inv.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                        <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 500 }}>
                          {inv.name?.trim() ? (
                            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3 }}>
                              <span>{inv.name}</span>
                              <span style={{ color: DIM, fontSize: 12, fontWeight: 400 }}>{inv.email}</span>
                            </span>
                          ) : inv.email}
                        </td>
                        <td style={{ padding: '10px 12px', color: DIM }}>{inv.role || 'member'}</td>
                        <td style={{ padding: '10px 12px', color: DIM, fontSize: 12 }}>{relTimeAgo(inv.created_at)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {exp.expired ? (
                            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                              fontSize: 12, fontWeight: 700, color: RED, background: `color-mix(in srgb, ${RED} 13%, transparent)`,
                              border: `1px solid ${RED}` }}>Expired</span>
                          ) : (
                            <span style={{ color: AMBER, fontSize: 12, fontWeight: 600 }}>{exp.label}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => resendInvite(inv.id)}
                            style={{ ...secBtn(), padding: '6px 12px' }}>Resend</button>
                          <button onClick={() => cancelInvite(inv.id)}
                            style={{ ...btn('transparent', RED), padding: '6px 12px', marginLeft: 8 }}>Cancel</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={card()}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['User', 'Email', 'Role', 'Scope', 'Assigned', 'By', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600,
                      borderBottom: `2px solid ${BORDER}`, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: DIM }}>No assignments found.</td></tr>
                ) : filteredAssignments.map(a => {
                  const role = roles.find(r => r.id === a.roleId);
                  return (
                    <tr key={a.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                      <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 500 }}>{a.userName}</td>
                      <td style={{ padding: '10px 12px', color: DIM }}>{a.email}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: role?.color ?? BORDER }} />
                          <span style={{ color: TEXT, fontWeight: 500 }}>{role?.name ?? 'Unknown'}</span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: a.projectName ? AMBER : DIM, fontSize: 12 }}>
                        {a.projectName ?? 'Global'}
                      </td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 12 }}>{fmtDate(a.assignedAt)}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 12 }}>{a.assignedBy}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => resetUserPassword(a.userId, a.userName)}
                          style={{ ...secBtn(), padding: '6px 12px' }}>Reset Password</button>
                        <button onClick={() => removeAssignment(a.id)}
                          style={{ ...btn('transparent', RED), padding: '6px 12px', marginLeft: 8 }}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: COMPARE ROLES ── */}
      {tab === 'compare' && (
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle()}>Role A</label>
              <select value={compareA} onChange={e => setCompareA(e.target.value)} style={inputStyle()}>
                <option value="">Select role…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 8px 8px', color: DIM, fontWeight: 700 }}>vs</div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle()}>Role B</label>
              <select value={compareB} onChange={e => setCompareB(e.target.value)} style={inputStyle()}>
                <option value="">Select role…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          {roleA && roleB ? (
            <div style={card()}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: DIM, borderBottom: `2px solid ${BORDER}`, width: '30%' }}>Category</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: `2px solid ${BORDER}`, width: '30%' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: roleA.color }} />
                        <span style={{ color: TEXT, fontWeight: 600 }}>{roleA.name}</span>
                      </span>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: `2px solid ${BORDER}`, width: '10%' }}>
                      <span style={{ color: DIM, fontSize: 12 }}>Match</span>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: `2px solid ${BORDER}`, width: '30%' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: roleB.color }} />
                        <span style={{ color: TEXT, fontWeight: 600 }}>{roleB.name}</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => {
                    const lA = roleA.permissions[cat] ?? 'None';
                    const lB = roleB.permissions[cat] ?? 'None';
                    const match = lA === lB;
                    return (
                      <tr key={cat} style={{ background: match ? 'transparent' : `color-mix(in srgb, ${RED} 3%, transparent)` }}>
                        <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 500, borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>{cat}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                          <span style={{ padding: '3px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                            color: lA === 'None' ? DIM : 'var(--text-primary)', background: `color-mix(in srgb, ${permLevelColor(lA)} 13%, transparent)`,
                            border: `1px solid ${permLevelColor(lA)}` }}>{lA}</span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                          {match ? (
                            <span style={{ color: GREEN, fontSize: 16 }}>=</span>
                          ) : (
                            <span style={{ color: RED, fontSize: 14, fontWeight: 700 }}>{'\u2260'}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                          <span style={{ padding: '3px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                            color: lB === 'None' ? DIM : 'var(--text-primary)', background: `color-mix(in srgb, ${permLevelColor(lB)} 13%, transparent)`,
                            border: `1px solid ${permLevelColor(lB)}` }}>{lB}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* summary */}
              <div style={{ marginTop: 16, display: 'flex', gap: 20, fontSize: 12, color: DIM }}>
                <span>Matching: <strong style={{ color: GREEN }}>
                  {CATEGORIES.filter(c => (roleA.permissions[c] ?? 'None') === (roleB.permissions[c] ?? 'None')).length}
                </strong> / {CATEGORIES.length}</span>
                <span>Differences: <strong style={{ color: RED }}>
                  {CATEGORIES.filter(c => (roleA.permissions[c] ?? 'None') !== (roleB.permissions[c] ?? 'None')).length}
                </strong></span>
              </div>
            </div>
          ) : (
            <div style={card()}>
              <p style={{ color: DIM, textAlign: 'center' }}>Select two roles to compare their permissions side by side.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: AUDIT LOG ── */}
      {tab === 'audit' && (
        <div style={card()}>
          <h3 style={{ color: TEXT, margin: '0 0 16px', fontSize: 16 }}>Permission Change Audit Log</h3>
          {audit.length === 0 ? (
            <p style={{ color: DIM, textAlign: 'center', padding: 30 }}>No audit entries.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Action', 'Role', 'Changed By', 'Date', 'Detail'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: DIM, fontWeight: 600,
                      borderBottom: `2px solid ${BORDER}`, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map(a => {
                  let actionColor = DIM;
                  if (a.action.includes('Created') || a.action.includes('Duplicated')) actionColor = GREEN;
                  else if (a.action.includes('Updated') || a.action.includes('Override') || a.action.includes('Scope')) actionColor = AMBER;
                  else if (a.action.includes('Deleted') || a.action.includes('Unassigned')) actionColor = RED;
                  else if (a.action.includes('Assigned')) actionColor = BLUE;
                  return (
                    <tr key={a.id} style={{ borderBottom: `1px solid color-mix(in srgb, ${BORDER} 8%, transparent)` }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: actionColor, fontWeight: 600, fontSize: 12 }}>{a.action}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TEXT }}>{a.roleName}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 12 }}>{a.changedBy}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 12 }}>{fmtDateTime(a.changedAt)}</td>
                      <td style={{ padding: '10px 12px', color: DIM, fontSize: 12, maxWidth: 320 }}>{a.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MODAL: CREATE / EDIT ROLE ── */}
      <Modal open={showRoleModal} onClose={() => setShowRoleModal(false)}
        title={editRoleId ? 'Edit Role' : 'Create New Role'} width={680}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div>
            <label style={labelStyle()}>Role Name</label>
            <input value={formName} onChange={e => setFormName(e.target.value)}
              placeholder="e.g. Safety Coordinator" style={inputStyle()} />
          </div>
          <div>
            <label style={labelStyle()}>Color</label>
            <div role="radiogroup" aria-label="Role color" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ROLE_COLORS.map(c => (
                <button key={c} type="button" role="radio" aria-checked={formColor.toUpperCase() === c} aria-label={ROLE_COLOR_NAME[c]} title={ROLE_COLOR_NAME[c]}
                  onClick={() => setFormColor(c)}
                  style={{ width: 44, height: 44, padding: 0, display: 'grid', placeItems: 'center', background: 'none', border: 0, cursor: 'pointer' }}>
                  <span aria-hidden style={{
                    width: 30, height: 30, borderRadius: '50%', background: c, boxSizing: 'border-box',
                    border: formColor.toUpperCase() === c ? `3px solid ${TEXT}` : '1px solid var(--border-default)',
                    transition: 'border .15s',
                  }} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle()}>Description</label>
          <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
            placeholder="Describe what this role is for…" rows={2}
            style={{ ...inputStyle(), resize: 'vertical' }} />
        </div>

        {/* permission matrix in modal */}
        <label style={labelStyle()}>Permission Matrix</label>
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, marginBottom: 18, overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(4, 1fr)', gap: 0, fontSize: 12 }}>
            <div style={{ padding: '6px 8px', fontWeight: 700, color: DIM }}>Category</div>
            {PERM_LEVELS.map(l => (
              <div key={l} style={{ padding: '6px 8px', fontWeight: 700, color: DIM, textAlign: 'center' }}>
                {l === 'Full' ? 'Full (CRUD+)' : l}
              </div>
            ))}
            {CATEGORIES.map(cat => (
              <React.Fragment key={cat}>
                <div style={{ padding: '6px 8px', color: TEXT, borderTop: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>{cat}</div>
                {PERM_LEVELS.map(level => {
                  const isActive = formPerms[cat] === level;
                  return (
                    <div key={level} style={{ padding: '4px 8px', textAlign: 'center', borderTop: `1px solid color-mix(in srgb, ${BORDER} 13%, transparent)` }}>
                      <div onClick={() => setFormPerms(prev => ({ ...prev, [cat]: level }))} style={{
                        width: 20, height: 20, borderRadius: '50%', margin: '0 auto', cursor: 'pointer',
                        border: `2px solid ${isActive ? permLevelColor(level) : BORDER}`,
                        background: isActive ? permLevelColor(level) : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s',
                      }}>
                        {isActive && level !== 'None' && <span style={{ color: 'var(--on-brand)', fontSize: 12, fontWeight: 700 }}>{'\u2713'}</span>}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          {/* quick set buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setFormPerms(Object.fromEntries(CATEGORIES.map(c => [c, 'None' as PermLevel])))}
              style={{ ...btn(RAISED, DIM), fontSize: 12, padding: '4px 10px' }}>Set All None</button>
            <button onClick={() => setFormPerms(Object.fromEntries(CATEGORIES.map(c => [c, 'View' as PermLevel])))}
              style={{ ...btn(RAISED, AMBER), fontSize: 12, padding: '4px 10px' }}>Set All View</button>
            <button onClick={() => setFormPerms(Object.fromEntries(CATEGORIES.map(c => [c, 'Edit' as PermLevel])))}
              style={{ ...btn(RAISED, BLUE), fontSize: 12, padding: '4px 10px' }}>Set All Edit</button>
            <button onClick={() => setFormPerms(Object.fromEntries(CATEGORIES.map(c => [c, 'Full' as PermLevel])))}
              style={{ ...btn(RAISED, GREEN), fontSize: 12, padding: '4px 10px' }}>Set All Full</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setShowRoleModal(false)} style={btn(RAISED, DIM)}>Cancel</button>
          <button onClick={saveRole} disabled={!formName.trim()} style={{
            ...btn(GOLD, 'var(--on-brand)'), opacity: formName.trim() ? 1 : 0.5,
          }}>{editRoleId ? 'Save Changes' : 'Create Role'}</button>
        </div>
      </Modal>

      {/* ── MODAL: ASSIGN ROLE TO USER ── */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Assign Role to User" width={480}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle()}>User</label>
          <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)} style={inputStyle()}>
            <option value="">Select user…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.email ? ` (${u.email})` : ''}</option>)}
          </select>
          {users.length === 0 && (
            <p style={{ color: DIM, fontSize: 12, marginTop: 4 }}>No tenant users found. Invite someone first.</p>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle()}>Role</label>
          <select value={assignRoleId} onChange={e => setAssignRoleId(e.target.value)} style={inputStyle()}>
            <option value="">Select role…</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle()}>Project Scope (Optional)</label>
          <select value={assignProjectId} onChange={e => setAssignProjectId(e.target.value)} style={inputStyle()}>
            <option value="">Global (All Projects)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p style={{ color: DIM, fontSize: 12, marginTop: 4 }}>Leave as Global to apply this role across all projects.</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setShowAssign(false)} style={btn(RAISED, DIM)}>Cancel</button>
          <button onClick={assignRole} disabled={!assignUserId || !assignRoleId} style={{
            ...btn(GOLD, 'var(--on-brand)'), opacity: assignUserId && assignRoleId ? 1 : 0.5,
          }}>Assign</button>
        </div>
      </Modal>

      {/* ── MODAL: INVITE USER ── */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite User" width={480}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle()}>Email</label>
          <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
            placeholder="name@company.com" style={{ ...inputStyle(), borderColor: inviteEmailTrim && !inviteEmailValid ? 'rgba(248,113,113,0.55)' : BORDER }} />
          {inviteEmailTrim && !inviteEmailValid && (
            <p style={{ color: RED, fontSize: 12, marginTop: 4, marginBottom: 0 }}>Enter a valid email address — the invite link is delivered there.</p>
          )}
          {inviteDupUser && (
            <p style={{ color: AMBER, fontSize: 12, marginTop: 4, marginBottom: 0 }}>Already a team member ({inviteDupUser.name || inviteDupUser.email}) — no invite needed. Assign them a role from the Users tab instead.</p>
          )}
          {!inviteDupUser && inviteDupPending && (
            <p style={{ color: AMBER, fontSize: 12, marginTop: 4, marginBottom: 0 }}>An invite to this address is already pending (sent {relTimeAgo(inviteDupPending.created_at)}) — resending resets its 7-day clock.</p>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle()}>Name</label>
          <input value={inviteName} onChange={e => setInviteName(e.target.value)}
            placeholder="Full name (optional)" style={inputStyle()} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle()}>Role</label>
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={inputStyle()}>
            <option value="">Member (Default)</option>
            {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          {/* Role clarity — what the selected role can actually do, before sending */}
          {inviteRoleObj ? (
            <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: inviteRoleObj.color, flexShrink: 0 }} />
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 700 }}>{inviteRoleObj.name}</span>
                {inviteRoleObj.isBuiltIn && <span style={{ color: DIM, fontSize: 12, fontWeight: 700 }}>Built-In</span>}
              </div>
              {inviteRoleObj.description && <p style={{ color: DIM, fontSize: 12, margin: '0 0 6px', lineHeight: 1.45 }}>{inviteRoleObj.description}</p>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PERM_LEVELS.slice().reverse().map(lv => {
                  const n = Object.values(inviteRoleObj.permissions).filter(p => p === lv).length;
                  if (!n) return null;
                  return (
                    <span key={lv} style={{ fontSize: 12, fontWeight: 700, color: permLevelColor(lv), background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '2px 8px' }}>
                      {n} {lv === 'Full' ? 'Full' : lv}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ color: DIM, fontSize: 12, marginTop: 6, marginBottom: 0 }}>Member — standard access with no elevated permissions. You can assign a granular role any time from the Users tab.</p>
          )}
          <p style={{ color: DIM, fontSize: 12, marginTop: 6 }}>An invite email is recorded and the team is notified. Invites expire 7 days after they are sent.</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setShowInvite(false)} style={btn(RAISED, DIM)}>Cancel</button>
          <button onClick={sendInvite} disabled={!inviteEmailValid} style={{
            ...btn(GOLD, 'var(--on-brand)'), opacity: inviteEmailValid ? 1 : 0.5, cursor: inviteEmailValid ? 'pointer' : 'not-allowed',
          }}>Send Invite</button>
        </div>
      </Modal>

      {/* ── MODAL: ONE PERSON ── */}
      <Modal open={!!person} onClose={closePerson} title={person ? (personEditing ? `Edit ${person.status === 'invited' ? 'Invite' : 'Person'}` : person.name) : ''} width={520}>
        {person && !personEditing && (
          <div>
            <div className="amPersonGrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {([
                ['Name', person.name],
                ['Email', person.email || '—'],
                ['Status', person.status === 'active' ? 'Active sign-in' : person.status === 'invited' ? (person.invite && inviteExpiry(person.invite.created_at).expired ? 'Invite expired' : 'Invited — not accepted yet') : 'Project contact (no sign-in)'],
                [person.status === 'invited' ? 'Role on accepting' : 'Base role', person.invite?.role || person.baseRole || 'member'],
                ['Job title', person.title || '—'],
                ['Phone', users.find(u => u.id === person.userId)?.phone || '—'],
                ['Projects', person.projectNames.length ? person.projectNames.join(', ') : '—'],
                ['Last active', person.lastSignInAt ? relTimeAgo(person.lastSignInAt) : person.status === 'active' ? 'never signed in' : '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div style={labelStyle()}>{k}</div>
                  <div style={{ color: TEXT, fontSize: 14, overflowWrap: 'anywhere' }}>{v}</div>
                </div>
              ))}
            </div>
            {person.status === 'contact' && (
              <p style={{ color: DIM, fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>
                No sign-in — this person is a contact on {person.projectNames.length === 1 ? 'a job' : 'jobs'}. Edit them on that job&apos;s Team page, or invite them to give them a sign-in.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
              {(person.status === 'active' || person.status === 'invited') && (
                <button type="button" onClick={startPersonEdit} style={{ ...btn(GOLD, 'var(--on-brand)') }}>Edit Details</button>
              )}
              {person.status === 'active' && person.userId && (
                <button type="button" onClick={() => { const id = person.userId!; setPersonKey(null); openAssignFor(id); }} style={secBtn()}>Assign Role</button>
              )}
              {person.status === 'invited' && person.invite && (
                <>
                  <button type="button" onClick={() => resendInvite(person.invite!.id)} style={secBtn()}>Resend Invite</button>
                  <button type="button" onClick={async () => { await cancelInvite(person.invite!.id); setPersonKey(null); await loadData(); }} style={btn(RAISED, RED)}>Cancel Invite</button>
                </>
              )}
              {person.status === 'contact' && (
                <button type="button" onClick={() => { setInviteEmail(person.email); setInviteName(person.name); setPersonKey(null); setShowInvite(true); }} style={btn(GOLD, 'var(--on-brand)')} disabled={!person.email}>Invite to Sign In</button>
              )}
            </div>
          </div>
        )}
        {person && personEditing && (
          <form onSubmit={(e) => { e.preventDefault(); void savePerson(); }}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle()} htmlFor="am-p-name">Name</label>
              <input id="am-p-name" value={pName} onChange={e => setPName(e.target.value)} placeholder={person.status === 'invited' ? 'Full name (optional)' : 'Full name'} style={inputStyle()} />
            </div>
            {person.status === 'active' ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle()} htmlFor="am-p-title">Job title</label>
                  <input id="am-p-title" value={pTitle} onChange={e => setPTitle(e.target.value)} placeholder="e.g. Superintendent" style={inputStyle()} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle()} htmlFor="am-p-phone">Phone</label>
                  <input id="am-p-phone" type="tel" value={pPhone} onChange={e => setPPhone(e.target.value)} placeholder="Mobile" style={inputStyle()} />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle()} htmlFor="am-p-role">Role when they accept</label>
                <select id="am-p-role" value={pRole} onChange={e => setPRole(e.target.value)} style={inputStyle()}>
                  <option value="member">Member (Default)</option>
                  {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  {pRole && pRole !== 'member' && !roles.some(r => r.name === pRole) && <option value={pRole}>{pRole}</option>}
                </select>
                <p style={{ color: DIM, fontSize: 12, margin: '6px 0 0' }}>The email address can&apos;t change — the link already went there. Cancel and invite the right address instead.</p>
              </div>
            )}
            {pError && <p role="alert" style={{ color: RED, fontSize: 13, margin: '0 0 12px' }}>{pError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setPersonEditing(false)} disabled={pSaving} style={btn(RAISED, DIM)}>Cancel</button>
              <button type="submit" disabled={pSaving} style={{ ...btn(GOLD, 'var(--on-brand)'), opacity: pSaving ? 0.6 : 1 }}>{pSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9500,
          background: 'var(--bg-solid-2)', border: `1px solid ${toast.kind === 'err' ? RED : GREEN}`,
          borderLeft: `4px solid ${toast.kind === 'err' ? RED : GREEN}`, borderRadius: 8,
          padding: '12px 18px', color: TEXT, fontSize: 13, fontWeight: 600,
          boxShadow: 'var(--shadow-lg, 0 8px 28px rgba(0,0,0,0.45))', maxWidth: 340,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
