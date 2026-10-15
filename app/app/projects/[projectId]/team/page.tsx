'use client';
/**
 * Project Team — the job's people: the internal roster (accepted members plus
 * invites sent from here), the project directory slots (PM / super / foreman /
 * owner / architect), work assignments, and subcontractors with portal access.
 *
 * Every read / write is the one this screen already used:
 *   roster + directory   GET   /api/projects/[id]            (team, subs, project)
 *   directory slot       PATCH /api/projects/[id]            { leadership: {...} }
 *   invites              GET/POST /api/team/invite           (?projectId=)
 *   one invite           PATCH / POST (resend) / DELETE /api/team/invite/[inviteId]
 *   work assignments     GET   /api/work-assignments?projectId=, POST (assign / { end })
 *   sub portal link      POST  /api/sub-portal/invite
 */
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  UsersThree, UserPlus, HardHat, EnvelopeSimple, Phone, IdentificationBadge, Briefcase, X,
  Crown, Compass, PencilSimple, LinkSimple, ArrowSquareOut, WarningCircle,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Avatar, CompanyMark, Button, Toolbar, Tabs, DataTable, EmptyState, ItemList, ItemRow,
  FormModal, FormGrid, Field, Input, Select, DetailList, Callout, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import ProjectOwnershipCard from '@/components/projects/ProjectOwnershipCard';
import { confirmDialog } from '@/lib/ui/async-dialog';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_ROLES = ['Admin','Manager','Member','Guest','Client','Sub'];
/** The roster's group filter persists per viewer under the old list toolbar's key. */
const FILTER_KEY = 'sag_flt_team';
type Group = 'all' | 'team' | 'subs';

/** Access level → one status colour (lib/status-colors). */
function accessTone(access: string): BadgeTone {
  const k = String(access || '').toLowerCase();
  if (k === 'admin') return 'lead';
  if (k === 'manager' || k === 'sub portal' || k === 'sub') return 'under_contract';
  if (k === 'client') return 'ongoing';
  return 'neutral';
}

export default function TeamPage(){
  const params = useParams();
  const projectId = params['projectId'] as string;
  const { toast, show } = useToast(4000);
  const showToast = (msg: string, type: 'success' | 'error') => show(msg, type === 'success' ? 'good' : 'bad');
  const [sendingPortal, setSendingPortal] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [rosterMembers, setRosterMembers] = useState<{key:string,name:string,role:string,email:string,access:string,last:string,userId:string|null,inviteId?:string,company?:string,phone?:string,since?:string}[]>([]);
  /** The project read failed — said in place of the roster, with Try Again. */
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  /* Invites sent from this page. They are team_invites rows (project_id = this
     job) and only become project_team rows when accepted — so the roster, which
     read project_team alone, never showed anyone you had just invited. */
  const [pendingInvites, setPendingInvites] = useState<{id:string,email:string,name?:string|null,role?:string|null,created_at?:string}[]>([]);
  const loadPendingInvites = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/team/invite?projectId=${encodeURIComponent(projectId)}`);
      if (!r.ok) return; // 403 for non-admins: they simply see accepted members
      const j = await r.json();
      setPendingInvites(Array.isArray(j?.invites) ? j.invites : []);
    } catch { /* the roster still shows accepted members */ }
  }, [projectId]);
  useEffect(() => { void loadPendingInvites(); }, [loadPendingInvites]);
  /* Faces: each member's profile photo (signed), from the job banner read —
     keyed by user id, else lower-cased email. Missing → initials. */
  const [faces, setFaces] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    fetch(`/api/projects/${projectId}/banner`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      const m: Record<string, string> = {};
      for (const f of (Array.isArray(j?.team) ? j.team : []) as { key?: string; avatarUrl?: string | null }[]) {
        if (f?.key && f.avatarUrl) m[String(f.key).toLowerCase()] = f.avatarUrl;
      }
      if (alive) setFaces(m);
    }, (e) => console.error('[team] faces read failed', e));
    return () => { alive = false; };
  }, [projectId]);
  const faceFor = (userId: string | null | undefined, email: string | null | undefined) =>
    (userId && faces[String(userId).toLowerCase()]) || (email && faces[String(email).toLowerCase()]) || null;
  const members = React.useMemo(() => {
    const have = new Set(rosterMembers.map(m => (m.email || '').toLowerCase()).filter(Boolean));
    const invited = pendingInvites
      .filter(i => i.email && !have.has(i.email.toLowerCase()))
      .map(i => ({
        key: `invite:${i.id}`, name: (i.name || '').trim() || i.email, role: i.role || 'Member', email: i.email,
        access: i.role || 'Member', last: 'Invite sent', userId: null as string | null, inviteId: i.id,
        company: '', phone: '', since: i.created_at || '',
      }));
    return [...rosterMembers, ...invited];
  }, [rosterMembers, pendingInvites]);
  const [subs, setSubs] = useState<{name:string,role:string,email:string,access:string,last:string}[]>([]);

  /* ── The open roster record (?member=<key> in the URL, so a reload lands on it).
     Rows opened nothing: an invite sent from here could not be checked,
     corrected, resent or withdrawn from this page. ── */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [recEditing, setRecEditing] = useState(false);
  const [recName, setRecName] = useState('');
  const [recRole, setRecRole] = useState('Member');
  const [recBusy, setRecBusy] = useState(false);
  const [recMsg, setRecMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => {
    const sync = () => {
      try { setOpenKey(new URLSearchParams(window.location.search).get('member')); } catch { setOpenKey(null); }
      setRecEditing(false); setRecMsg(null);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const openMember = (key: string) => {
    try { const u = new URL(window.location.href); u.searchParams.set('member', key); window.history.pushState(null, '', u.toString()); } catch { /* URL sync is a convenience */ }
    setOpenKey(key); setRecEditing(false); setRecMsg(null);
  };
  const closeMember = () => {
    try { const u = new URL(window.location.href); u.searchParams.delete('member'); window.history.replaceState(null, '', u.toString()); } catch { /* URL sync is a convenience */ }
    setOpenKey(null); setRecEditing(false); setRecMsg(null);
  };
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteAuto, setInviteAuto] = useState<{name?:boolean;email?:boolean;role?:boolean}>({});
  // Roster search + team/subs group filter (persisted under sag_flt_team).
  const [search, setSearch] = useState('');
  const [showGroup, setShowGroup] = useState<Group>('all');
  const [groupRestored, setGroupRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FILTER_KEY) || '{}') as { filters?: Record<string, string> };
      const g = saved.filters?.show;
      if (g === 'team' || g === 'subs' || g === 'all') setShowGroup(g);
    } catch { /* private mode or a bad value — show everyone */ }
    setGroupRestored(true);
  }, []);
  useEffect(() => {
    if (!groupRestored) return;
    try { window.localStorage.setItem(FILTER_KEY, JSON.stringify({ filters: { show: showGroup } })); }
    catch { /* persistence is best-effort */ }
  }, [groupRestored, showGroup]);
  // Project intelligence — the roster walks in knowing the job's people and parties.
  const [proj, setProj] = useState<any>(null);
  const { ctx } = useProjectContext(projectId);
  // Inline editing of the Project Directory slots (PM / super / foreman / owner / architect).
  const [editRole, setEditRole] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingLeader, setSavingLeader] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/projects/${projectId}`);
        const d = await r.json().catch(() => ({}));
        // A failed read is not an empty team: say so (it used to show "No team members yet").
        if (!r.ok) throw new Error(d.error || 'Could not load this job’s team.');
        setLoadError('');
        if (d.project) setProj(d.project);
        // The API returns the internal roster under `team` (from project_team),
        // not `members`. Map each row to the shape this table renders.
        setRosterMembers((d.team ?? []).map((t: any) => ({
          key: String(t.id || t.user_id || t.email || t.name),
          name: t.name || t.email || 'Team Member',
          role: t.role || 'Member',
          email: t.email || '',
          access: t.role || 'Member',
          last: 'Active',
          // Work assignments key off the auth user id — null until the invite
          // is accepted, which is exactly when assigning becomes possible.
          userId: t.user_id || null,
          company: t.company || '', phone: t.phone || '', since: t.added_at || '',
        })));
        setSubs((d.subs ?? []).map((s: any) => ({ name: s.name, role: 'Subcontractor', email: s.primary_email || s.email || '', access: 'Sub Portal', last: 'Active' })));
      } catch (err) {
        setLoadError(err instanceof Error && err.message ? err.message : 'Could not load this job’s team.');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, reloadKey]);

  /* Opening the invite form puts the cursor in Email. */
  const openInvite = () => {
    setShowInvite(true);
    setInviteAuto({});
    requestAnimationFrame(() => { document.getElementById('tm-invite-email')?.focus(); });
  };
  const closeInvite = () => { if (inviting) return; setShowInvite(false); setInviteMsg(''); };

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setInviteMsg(email ? 'Enter a valid email address — the invite link is sent there.' : 'Enter the email address to send the invite to.');
      document.getElementById('tm-invite-email')?.focus();
      return;
    }
    setInviting(true);
    setInviteMsg('');
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setInviteMsg(json.error || 'Invite failed.'); }
      else if (json.emailed === false) {
        // The invite exists (they are on the roster as Invite sent), but no
        // email went out — say that, and leave the form's message up.
        void loadPendingInvites();
        setInviteEmail(''); setInviteName(''); setInviteRole('Member'); setInviteAuto({});
        setInviteMsg(`Invite saved, but the email didn't go out (${json.emailError || 'email is not set up'}). Open them on the roster to resend.`);
      }
      else {
        setInviteMsg('Invitation sent.');
        // The invitee joins the roster now (as Invite sent), not only once they accept.
        void loadPendingInvites();
        setInviteEmail(''); setInviteName(''); setInviteRole('Member'); setInviteAuto({});
        setTimeout(() => { setShowInvite(false); setInviteMsg(''); }, 1500);
      }
    } catch { setInviteMsg('Network error. Please try again.'); }
    finally { setInviting(false); }
  }

  async function handleSendPortalLink(sub: { name: string; email: string }) {
    if (!sub.email) { showToast('No contact email on file for this subcontractor.', 'error'); return; }
    setSendingPortal(sub.name);
    try {
      const res = await fetch('/api/sub-portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, name: sub.name, company: sub.name, email: sub.email, role: 'Subcontractor' }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'Failed to grant portal access.', 'error'); }
      else {
        // The invite endpoint grants portal access; it does not email the sub.
        // If a token came back, hand the GC a real, copyable portal link.
        const token = json?.data?.token;
        if (token) {
          const link = `${window.location.origin}/portals/sub/${token}`;
          try { await navigator.clipboard.writeText(link); showToast(`Portal link copied for ${sub.email}`, 'success'); }
          catch { showToast(`Portal access granted. Link: ${link}`, 'success'); }
        } else {
          showToast(`Portal access granted for ${sub.email}`, 'success');
        }
      }
    } catch { showToast('Network error. Please try again.', 'error'); }
    finally { setSendingPortal(null); }
  }

  // ── Work assignments — who owns this project day-to-day ────────────────────
  // Active assignments drive each member's My Work hub. SWR keeps the chips
  // live; assign/end are optimistic with rollback so the roster never waits.
  const ASSIGN_ROLES = [
    { value: 'project_manager', label: 'Project Manager' },
    { value: 'superintendent',  label: 'Superintendent' },
    { value: 'foreman',         label: 'Foreman' },
    { value: 'coordinator',     label: 'Coordinator' },
    { value: 'viewer',          label: 'Viewer' },
  ];
  const assignRoleLabel = (v: string) => ASSIGN_ROLES.find(r => r.value === v)?.label || String(v || '').replace(/_/g, ' ');
  const waFetcher = (u: string) => fetch(u).then(r => { if (!r.ok) throw new Error(`Request failed (${r.status})`); return r.json(); });
  const { data: waData, mutate: mutateWa } = useSWR(projectId ? `/api/work-assignments?projectId=${projectId}` : null, waFetcher, { refreshInterval: 60_000 });
  const assignments: any[] = (Array.isArray(waData?.assignments) ? waData.assignments : []).filter((a: any) => (a?.status || 'active') === 'active');
  const assignmentsFor = (userId: string | null) => (userId ? assignments.filter(a => a?.assignee_user_id === userId) : []);
  const [assignBusy, setAssignBusy] = useState(false);
  const [composerUser, setComposerUser] = useState('');
  const [composerRole, setComposerRole] = useState('project_manager');

  async function assignWork(assigneeUserId: string, role: string, assigneeName?: string) {
    if (!assigneeUserId || assignBusy) return;
    if (assignments.some(a => a?.assignee_user_id === assigneeUserId && a?.role === role)) {
      showToast(`${assigneeName || 'That member'} already holds the ${assignRoleLabel(role)} assignment here.`, 'error');
      return;
    }
    const prev = waData;
    setAssignBusy(true);
    // Optimistic: the chip lands immediately; a failed POST rolls it back.
    mutateWa({ ...(prev || {}), assignments: [...assignments, { id: `optimistic-${Date.now()}`, assignee_user_id: assigneeUserId, assignee_name: assigneeName || '', role, status: 'active' }] }, false);
    try {
      const res = await fetch('/api/work-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, assigneeUserId, role }),
      });
      if (!res.ok) throw new Error();
      showToast(`${assigneeName || 'Member'} assigned as ${assignRoleLabel(role)}.`, 'success');
      mutateWa();
    } catch {
      mutateWa(prev, false);
      showToast('Assignment failed — nothing was saved.', 'error');
    } finally { setAssignBusy(false); }
  }

  async function endAssignment(a: any) {
    const prev = waData;
    mutateWa({ ...(prev || {}), assignments: assignments.filter(x => x?.id !== a?.id) }, false);
    try {
      const res = await fetch('/api/work-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end: true, assignmentId: a?.id }),
      });
      if (!res.ok) throw new Error();
      showToast(`Ended the ${assignRoleLabel(a?.role)} assignment.`, 'success');
      mutateWa();
    } catch {
      mutateWa(prev, false);
      showToast('Could not end the assignment.', 'error');
    }
  }

  // Field leadership straight off the project record — PM, super, and foreman,
  // plus the owner and architect of record, each with live contact links.
  const leadership = [
    { role: 'Project Manager', name: proj?.pm_name || proj?.project_manager || '', email: proj?.pm_email || '', phone: proj?.pm_phone || '' },
    { role: 'Superintendent', name: proj?.super_name || proj?.superintendent || '', email: proj?.super_email || '', phone: proj?.super_phone || '' },
    { role: 'Foreman', name: proj?.foreman_name || proj?.foreman || '', email: proj?.foreman_email || '', phone: proj?.foreman_phone || '' },
    { role: 'Owner', name: proj?.owner_name || ctx?.project?.ownerName || '', email: proj?.owner_email || ctx?.project?.ownerEmail || '', phone: proj?.owner_phone || '' },
    { role: 'Architect', name: proj?.architect_name || proj?.architect || ctx?.project?.architectName || '', email: proj?.architect_email || '', phone: proj?.architect_phone || '' },
  ];
  const leadersAssigned = leadership.filter(l => l.name).length;
  /* Directory slots are edited right here. They used to say "Set in Project
     Settings" — a page that does not exist — so an empty slot was a dead end. */
  const LEADER_FIELDS: Record<string, { name: string; email: string }> = {
    'Project Manager': { name: 'pm_name', email: 'pm_email' },
    Superintendent: { name: 'super_name', email: 'super_email' },
    Foreman: { name: 'foreman_name', email: 'foreman_email' },
    Owner: { name: 'owner_name', email: 'owner_email' },
    Architect: { name: 'architect_name', email: 'architect_email' },
  };
  const LEADER_ICONS: Record<string, React.ReactNode> = {
    'Project Manager': <Briefcase size={16} />, Superintendent: <HardHat size={16} />, Foreman: <HardHat size={16} />,
    Owner: <Crown size={16} />, Architect: <Compass size={16} />,
  };
  function startEdit(l: { role: string; name: string; email: string }) {
    setEditRole(l.role); setEditName(l.name || ''); setEditEmail(l.email || '');
  }
  async function saveLeader() {
    if (!editRole) return;
    const f = LEADER_FIELDS[editRole];
    setSavingLeader(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadership: { [f.name]: editName.trim() || null, [f.email]: editEmail.trim() || null } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not save');
      if (body.project) setProj(body.project);
      setEditRole(null);
      showToast(`${editRole} saved`, 'success');
    } catch (err) {
      console.error('[team] save leader', err);
      showToast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSavingLeader(false);
    }
  }
  const ctxSubs = (ctx?.subs || []) as any[];
  const subTrades = Array.from(new Set(ctxSubs.map((s: any) => s.trade).filter(Boolean)));
  const findCtxSub = (name: string) => ctxSubs.find((x: any) => (x.companyName || '').trim().toLowerCase() === (name || '').trim().toLowerCase());
  const fmtMoney = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const ROLE_HINTS: Record<string, string> = {
    Admin: 'Full control — settings, money, and team management.',
    Manager: 'Runs the project — schedule, budget, and documents.',
    Member: 'Day-to-day access — logs, photos, tasks, and field tools.',
    Guest: 'Read-only visibility into this project.',
    Client: 'Owner-facing view — approvals and shared documents only.',
    Sub: 'Subcontractor portal — their scope, waivers, and pay items.',
  };
  // One-tap invite from the directory: prefill the form with the person's
  // name, email, and a role mapped from their directory title.
  const DIRECTORY_ROLE: Record<string, string> = {
    'Project Manager': 'Manager', Superintendent: 'Member', Foreman: 'Member', Owner: 'Client', Architect: 'Guest',
  };
  const memberEmails = new Set(members.map(m=>(m.email||'').toLowerCase()).filter(Boolean));
  // Toolbar-driven roster views — search matches name, role, email, and sub trade.
  const qT = search.trim().toLowerCase();
  const matchPerson = (p: { name: string; role: string; email: string }) =>
    !qT || [p.name, p.role, p.email].some(v => String(v || '').toLowerCase().includes(qT));
  const filteredMembers = members.filter(matchPerson);
  const filteredSubs = subs.filter(s => matchPerson(s) || String(findCtxSub(s.name)?.trade || '').toLowerCase().includes(qT));
  type Member = (typeof members)[number];
  type TeamSub = (typeof subs)[number];
  const memberColumns: Column<Member>[] = [
    { key: 'name', header: 'Name', primary: true, phone: 'show', accessor: m => m.name, render: m => (
      <span className="k-name"><Avatar name={m.name} src={faceFor(m.userId, m.email)} size={32}/><span className="k-name-text"><span>{m.name}</span><span>{m.email}</span></span></span>
    ) },
    { key: 'role', header: 'Role', phone: 'hide', accessor: m => m.role, render: m => m.role },
    { key: 'access', header: 'Access Level', phone: 'show', accessor: m => m.access, render: m => <Badge tone={accessTone(m.access)}>{m.access}</Badge> },
    { key: 'assignments', header: 'Work Assignments', sortable: false, groupable: false, phone: 'show', accessor: m => assignmentsFor(m.userId).map(a => assignRoleLabel(a.role)).join(', '), render: m => (
      <span style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
        {assignmentsFor(m.userId).map(a=>(
          <Badge key={a.id} tone="ongoing">
            {assignRoleLabel(a.role)}
            <button type="button" onClick={()=>endAssignment(a)} title="End this assignment" aria-label={`End ${assignRoleLabel(a.role)} assignment`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,marginLeft:4,padding:0,borderRadius:999,background:'transparent',border:'none',color:'inherit',cursor:'pointer'}}><X size={10} weight="bold"/></button>
          </Badge>
        ))}
        {m.userId ? (
          <Select value="" disabled={assignBusy} onChange={e=>{const r=e.target.value; if(r) assignWork(m.userId!, r, m.name);}} title="Assign work on this project" aria-label={`Assign work to ${m.name}`} style={{minHeight:30,height:30,fontSize:12,padding:'0 8px',width:'auto'}}
            placeholder="+ Assign…" options={ASSIGN_ROLES} />
        ) : (
          <span title="They can be assigned work once they accept their invite" style={{fontSize:12,color:'var(--text-tertiary)',fontStyle:'italic',whiteSpace:'nowrap'}}>Invite Pending</span>
        )}
      </span>
    ) },
    { key: 'last', header: 'Last Active', phone: 'show', accessor: m => m.last, render: m => <Badge tone={m.inviteId ? 'under_contract' : 'ongoing'}>{m.last}</Badge> },
  ];
  const teamSubColumns: Column<TeamSub>[] = [
    { key: 'name', header: 'Company', primary: true, phone: 'show', accessor: s => s.name, render: s => (
      <span className="k-name"><CompanyMark name={s.name} size={32}/><span className="k-name-text"><span>{s.name}</span><span>{s.email || findCtxSub(s.name)?.email || ''}</span></span></span>
    ) },
    { key: 'trade', header: 'Trade', phone: 'show', accessor: s => findCtxSub(s.name)?.trade || '', render: s => { const t = findCtxSub(s.name)?.trade; return t ? <Badge tone="neutral">{t}</Badge> : '—'; } },
    { key: 'contract', header: 'Contract', align: 'right', phone: 'show', total: 'sum', format: fmtMoney, accessor: s => Number(findCtxSub(s.name)?.contractAmount) > 0 ? Number(findCtxSub(s.name)?.contractAmount) : null, render: s => { const a = Number(findCtxSub(s.name)?.contractAmount); return a > 0 ? <span style={{color:'var(--text-primary)',fontWeight:700}}>{fmtMoney(a)}</span> : '—'; } },
    { key: 'access', header: 'Portal Access', phone: 'hide', accessor: s => s.access, render: () => <Badge tone={accessTone('sub portal')}>Sub Portal</Badge> },
  ];
  const openRec = openKey ? members.find(m => m.key === openKey) ?? null : null;
  const startRecEdit = (m: Member) => { setRecName(m.name === m.email ? '' : m.name); setRecRole(m.role || 'Member'); setRecMsg(null); setRecEditing(true); };
  async function saveRecEdit() {
    if (!openRec?.inviteId || recBusy) return;
    setRecBusy(true); setRecMsg(null);
    try {
      const res = await fetch(`/api/team/invite/${openRec.inviteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: recName.trim(), role: recRole }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not save the invite.');
      await loadPendingInvites();
      setRecEditing(false);
      setRecMsg({ text: 'Saved.' });
    } catch (err) {
      setRecMsg({ text: err instanceof Error && err.message ? err.message : 'Could not save the invite.', bad: true });
    } finally { setRecBusy(false); }
  }
  async function resendRec() {
    if (!openRec?.inviteId || recBusy) return;
    setRecBusy(true); setRecMsg(null);
    try {
      const res = await fetch(`/api/team/invite/${openRec.inviteId}`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not resend the invite.');
      setRecMsg(j.emailed === false
        ? { text: `The 7-day clock was reset, but the email didn't go out (${j.emailError || 'email is not set up'}).`, bad: true }
        : { text: `Invite emailed again to ${openRec.email} — the 7-day clock starts over.` });
      void loadPendingInvites();
    } catch (err) {
      setRecMsg({ text: err instanceof Error && err.message ? err.message : 'Could not resend the invite.', bad: true });
    } finally { setRecBusy(false); }
  }
  async function removeRecInvite() {
    if (!openRec?.inviteId || recBusy) return;
    const ok = await confirmDialog({
      title: `Remove the invite to ${openRec.email}?`,
      message: 'Their link stops working. You can invite them again any time.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setRecBusy(true); setRecMsg(null);
    try {
      const res = await fetch(`/api/team/invite/${openRec.inviteId}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not remove the invite.');
      closeMember();
      await loadPendingInvites();
      showToast(`Invite to ${openRec.email} removed`, 'success');
    } catch (err) {
      setRecMsg({ text: err instanceof Error && err.message ? err.message : 'Could not remove the invite.', bad: true });
      void loadPendingInvites();
    } finally { setRecBusy(false); }
  }
  const fmtDay = (iso?: string) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

  function inviteFromDirectory(l:{role:string;name:string;email:string}){
    setInviteName(l.name||'');
    setInviteEmail(l.email||'');
    setInviteRole(DIRECTORY_ROLE[l.role]||'Member');
    setInviteAuto({name:!!l.name,email:!!l.email,role:true});
    setShowInvite(true);
    setInviteMsg('');
  }

  const base = `/app/projects/${projectId}`;
  const invitedCount = members.filter(m => m.inviteId).length;
  const stats: StatItem[] = loading
    ? [
        { label: 'Team Members', value: '—', sub: 'Loading…', icon: <UsersThree size={15} /> },
        { label: 'Subcontractors', value: '—', sub: 'Loading…', icon: <HardHat size={15} /> },
        { label: 'Leadership', value: '—', sub: 'Loading…', icon: <IdentificationBadge size={15} /> },
      ]
    : [
        /* These tiles linked back to this same page, so a tap only reloaded it.
           Each now filters the roster or goes where its number lives. */
        { label: 'Team Members', value: String(members.length), sub: `${members.length - invitedCount} with access${invitedCount ? ` · ${invitedCount} invited` : ''}`, icon: <UsersThree size={15} />, onClick: () => setShowGroup('team'), active: showGroup === 'team' },
        { label: 'Subcontractors', value: String(subs.length), sub: subTrades.length ? `${subTrades.length} trade${subTrades.length === 1 ? '' : 's'} — portal access` : 'Portal access', icon: <HardHat size={15} />, onClick: () => setShowGroup('subs'), active: showGroup === 'subs' },
        { label: 'Leadership', value: `${leadersAssigned}/5`, tone: leadersAssigned >= 3 ? 'good' : 'default', sub: leadersAssigned > 0 ? 'Directory roles assigned' : 'Set them in the directory below', icon: <IdentificationBadge size={15} />, href: '#project-directory' },
        ...(ctx ? [
          { label: 'Owner', value: ctx.defaults?.ownerName || '—', sub: ctx.defaults?.ownerEmail || 'No email on file', icon: <Crown size={15} />, href: proj?.customer_id ? `/app/customers?customer=${encodeURIComponent(proj.customer_id)}` : '#project-directory' } as StatItem,
          { label: 'Architect', value: ctx.defaults?.architectName || '—', sub: 'Design contact', icon: <Compass size={15} />, href: '#project-directory' } as StatItem,
        ] : []),
      ];

  const directoryCard = (
    <Card title="Project Directory" subtitle="Field leadership and parties of record" icon={<IdentificationBadge size={17} />}>
      <ItemList>
        {leadership.map(l => editRole === l.role ? (
          <div key={l.role} className="k-item" style={{ display: 'block' }}>
            <FormGrid cols={2}>
              <Field label={`${l.role} name`}>
                <Input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Name" autoFocus/>
              </Field>
              <Field label={`${l.role} email`}>
                <Input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="Email (optional)"/>
              </Field>
            </FormGrid>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button size="sm" onClick={saveLeader} disabled={savingLeader}>{savingLeader ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="ghost" onClick={()=>setEditRole(null)} disabled={savingLeader}>Cancel</Button>
            </div>
          </div>
        ) : (
          <ItemRow
            key={l.role}
            icon={LEADER_ICONS[l.role]}
            title={l.name || <span style={{ color: 'var(--text-tertiary)' }}>Not assigned</span>}
            desc={
              <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>{l.role}</span>
                {l.email && <a className="k-link" href={`mailto:${l.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><EnvelopeSimple size={12} />{l.email}</a>}
                {l.phone && <a className="k-link" href={`tel:${l.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} />{l.phone}</a>}
                {l.name && !l.email && !l.phone && <span>No contact on file</span>}
              </span>
            }
            action={
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {l.name && l.email && !memberEmails.has(l.email.toLowerCase()) && (
                  <Button size="sm" icon={<UserPlus size={13} />} onClick={()=>inviteFromDirectory(l)}>Invite to Project</Button>
                )}
                {l.name
                  ? <Button size="sm" variant="ghost" icon={<PencilSimple size={13} />} onClick={()=>startEdit(l)}>Edit</Button>
                  : <Button size="sm" onClick={()=>startEdit(l)}>Set {l.role}</Button>}
              </span>
            }
          />
        ))}
      </ItemList>
    </Card>
  );

  let teamBody: React.ReactNode;
  if (loadError) {
    teamBody = <EmptyState icon={<WarningCircle size={22} />} title="Couldn’t load this job’s team" text={loadError} action={<Button onClick={() => setReloadKey(k => k + 1)}>Try Again</Button>} />;
  } else if (!loading && members.length === 0) {
    teamBody = (
      <EmptyState
        icon={<UsersThree size={22} />}
        title="No team members yet"
        text={leadersAssigned > 0 ? `Invite the ${leadersAssigned} leadership role${leadersAssigned === 1 ? '' : 's'} from the directory.` : 'Invite your PM, superintendent and office staff.'}
        action={<Button icon={<UserPlus size={15} weight="bold" />} onClick={openInvite}>Invite Member</Button>}
      />
    );
  } else {
    teamBody = (
      <DataTable<Member>
        tableId="project-team"
        exportName="team"
        columns={memberColumns}
        rows={filteredMembers}
        loading={loading}
        rowKey={m => m.key}
        onRowClick={m => openMember(m.key)}
        isSelected={m => m.key === openKey}
        rowActions={m => [{ label: 'Open', icon: <ArrowSquareOut size={15} />, onClick: () => openMember(m.key) }]}
        defaultSort={{ key: 'name', dir: 'asc' }}
        empty={<EmptyState title="No one matches" text="Change the search." action={<Button onClick={() => setSearch('')}>Clear Search</Button>} />}
      />
    );
  }

  const acceptedMembers = members.filter(m => m.userId);
  const showTeam = showGroup === 'all' || showGroup === 'team';
  const showSubs = showGroup === 'all' || showGroup === 'subs';

  return <>
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Team' },
      ]}
      title="Project Team"
      subtitle="Members, access, assignments and sub portal access."
      actions={<Button variant="primary" icon={<UserPlus size={15} weight="bold" />} onClick={openInvite}>Invite Member</Button>}
    >
      <StatRow items={stats} />

      <Tabs
        tabs={[
          { key: 'all', label: 'Everyone', count: members.length + subs.length },
          { key: 'team', label: 'Internal Team', count: members.length },
          { key: 'subs', label: 'Subcontractors', count: subs.length },
        ]}
        value={showGroup}
        onChange={k => setShowGroup(k as Group)}
      />
      <Toolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search the roster…"
        actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{(showTeam ? filteredMembers.length : 0) + (showSubs ? filteredSubs.length : 0)} of {(showTeam ? members.length : 0) + (showSubs ? subs.length : 0)}</span>}
      />

      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {proj && <ProjectOwnershipCard projectId={projectId} project={proj} onSaved={(p)=>{ if (p && (p as any).id) setProj(p); }}/>}
        <div id="project-directory" style={{ scrollMarginTop: 76 }}>{directoryCard}</div>

        {showTeam && (
          <div id="internal-team" style={{ scrollMarginTop: 76 }}>
            <Card title="Internal Team" icon={<UsersThree size={17} />} flush>{teamBody}</Card>
          </div>
        )}

        {showTeam && (
          <Card title="Work Assignments" subtitle="Shown on each member's My Work hub" icon={<Briefcase size={17} />}>
            {assignments.length > 0 && (
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
                {assignments.map(a=>(
                  <Badge key={a.id} tone="ongoing">
                    {a.assignee_name || members.find(m=>m.userId===a.assignee_user_id)?.name || 'Member'} · {assignRoleLabel(a.role)}
                    <button type="button" onClick={()=>endAssignment(a)} title="End this assignment" aria-label={`End ${assignRoleLabel(a.role)} assignment`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,marginLeft:4,padding:0,borderRadius:999,background:'transparent',border:'none',color:'inherit',cursor:'pointer'}}><X size={10} weight="bold"/></button>
                  </Badge>
                ))}
              </div>
            )}
            {acceptedMembers.length > 0 ? (
              <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
                <div style={{flex:'1 1 220px',minWidth:200}}>
                  <Field label="Team Member" hint="Accepted invites only.">
                    <Select value={composerUser} onChange={e=>setComposerUser(e.target.value)} placeholder="Choose a member…"
                      options={acceptedMembers.map(m => ({ value: m.userId!, label: m.name }))} />
                  </Field>
                </div>
                <div style={{flex:'0 1 210px',minWidth:180}}>
                  <Field label="Assignment Role">
                    <Select value={composerRole} onChange={e=>setComposerRole(e.target.value)} options={ASSIGN_ROLES} />
                  </Field>
                </div>
                <div style={{ paddingBottom: 22 }}>
                  <Button
                    icon={<Briefcase size={15} weight="bold" />}
                    onClick={()=>{const m=members.find(x=>x.userId===composerUser); assignWork(composerUser, composerRole, m?.name); setComposerUser('');}}
                    disabled={!composerUser||assignBusy}
                  >Assign Work</Button>
                </div>
              </div>
            ) : (
              <EmptyState title="Nobody to assign yet" text="Members can be assigned work once they accept their invite." />
            )}
          </Card>
        )}

        {showSubs && (
          <Card title="Subcontractors (Portal Access)" icon={<HardHat size={17} />} actions={<Button size="sm" variant="ghost" icon={<ArrowSquareOut size={14} />} href={`${base}/subs`}>Manage Subs</Button>} flush>
            {subs.length === 0 && !loading ? (
              <EmptyState
                icon={<HardHat size={22} />}
                title="No subcontractors yet"
                text={(ctx?.bidPackages || []).length > 0 ? `Award one of the ${ctx!.bidPackages.length} bid package${ctx!.bidPackages.length === 1 ? '' : 's'}, or add subs.` : 'Add subs or award a bid package.'}
                action={<Button href={`${base}/subs`}>Add Subcontractors</Button>}
              />
            ) : (
              <DataTable<TeamSub>
                tableId="project-team-subs"
                exportName="team-subcontractors"
                columns={teamSubColumns}
                rows={filteredSubs}
                loading={loading}
                rowKey={s => s.name}
                defaultSort={{ key: 'name', dir: 'asc' }}
                rowActions={s => [{ label: sendingPortal === s.name ? 'Working…' : 'Copy Portal Link', icon: <LinkSimple size={14} />, inline: true, onClick: () => { void handleSendPortalLink(s); }, disabled: sendingPortal === s.name }]}
                empty={<EmptyState title="No subcontractors match" text="Change the search." action={<Button onClick={() => setSearch('')}>Clear Search</Button>} />}
              />
            )}
          </Card>
        )}
      </div>
    </PageShell>

    {/* Invite — the keyboard's Go/Enter sends, the same as the button. */}
    <FormModal
      open={showInvite}
      onClose={closeInvite}
      title="Invite Team Member"
      subtitle={ctx?.project?.name ? `Grants access to ${ctx.project.name}` : 'A role-scoped invitation to this project.'}
      onSubmit={handleInvite}
      submitLabel={inviting ? 'Sending…' : 'Send Invitation'}
      busy={inviting}
      error={inviteMsg && inviteMsg !== 'Invitation sent.' ? inviteMsg : null}
    >
      {inviteMsg === 'Invitation sent.' && (
        <div style={{ marginBottom: 12 }}><Callout tone="success" title="Invitation sent." /></div>
      )}
      <FormGrid cols={3}>
        <Field label="Email" required hint={inviteAuto.email ? 'From the project directory.' : 'Accept link expires after 7 days.'}>
          {/* text + email keyboard: the page owns the email rule (the native bubble was easy to miss). */}
          <Input id="tm-invite-email" type="text" inputMode="email" autoComplete="email" autoCapitalize="none" value={inviteEmail} onChange={e=>{setInviteEmail(e.target.value);setInviteAuto(a=>({...a,email:false}));if(inviteMsg&&inviteMsg!=='Invitation sent.')setInviteMsg('');}} placeholder="email@company.com" aria-required="true" aria-invalid={!!inviteMsg && inviteMsg!=='Invitation sent.' ? true : undefined}/>
        </Field>
        <Field label="Name" hint={inviteAuto.name ? 'From the project directory.' : undefined}>
          <Input id="tm-invite-name" type="text" value={inviteName} onChange={e=>{setInviteName(e.target.value);setInviteAuto(a=>({...a,name:false}));}} placeholder="Full name"/>
        </Field>
        <Field label="Role" hint={ROLE_HINTS[inviteRole] || 'Access level for this member.'}>
          <Select id="tm-invite-role" value={inviteRole} onChange={e=>{setInviteRole(e.target.value);setInviteAuto(a=>({...a,role:false}));}} options={INVITE_ROLES} />
        </Field>
      </FormGrid>
    </FormModal>

    {openRec && openRec.inviteId && recEditing && (
      <FormModal
        open
        onClose={() => { if (!recBusy) setRecEditing(false); }}
        title={`Edit invite — ${openRec.email}`}
        subtitle="The name it was sent under and the role they get when they accept."
        onSubmit={saveRecEdit}
        submitLabel="Save Changes"
        busy={recBusy}
        error={recMsg?.bad ? recMsg.text : null}
      >
        <FormGrid cols={2}>
          <Field label="Name">
            <Input id="tm-rec-name" value={recName} onChange={e => setRecName(e.target.value)} placeholder="Full name" maxLength={120} />
          </Field>
          <Field label="Email" hint="To use another address, remove this invite and invite them again.">
            <Input id="tm-rec-email" type="email" value={openRec.email} readOnly />
          </Field>
          <Field label="Role">
            <Select id="tm-rec-role" value={recRole} onChange={e => setRecRole(e.target.value)} options={Array.from(new Set([...INVITE_ROLES, recRole]))} />
          </Field>
        </FormGrid>
      </FormModal>
    )}
    {openRec && !(openRec.inviteId && recEditing) && (
      <FormModal
        open
        onClose={closeMember}
        title={openRec.name}
        subtitle={openRec.inviteId ? `Invited ${fmtDay(openRec.since)} — not accepted yet` : `On this job${openRec.since ? ` since ${fmtDay(openRec.since)}` : ''}`}
        footer={(
          <>
            {recMsg && <span className={recMsg.bad ? 'k-error' : 'k-hint'} role={recMsg.bad ? 'alert' : 'status'} style={{ marginRight: 'auto', alignSelf: 'center' }}>{recMsg.text}</span>}
            <Button variant="ghost" onClick={closeMember}>Close</Button>
            {openRec.inviteId ? (<>
              <Button variant="danger" onClick={() => { void removeRecInvite(); }} disabled={recBusy}>Remove Invite</Button>
              <Button variant="secondary" onClick={() => { void resendRec(); }} disabled={recBusy}>{recBusy ? 'Working…' : 'Resend Invite'}</Button>
              <Button variant="primary" onClick={() => startRecEdit(openRec)} disabled={recBusy}>Edit</Button>
            </>) : (
              <Button variant="primary" href="/app/people?tab=access">Manage Access in People</Button>
            )}
          </>
        )}
      >
        <DetailList items={[
          ['Email', openRec.email || '—'],
          [openRec.inviteId ? 'Role When They Accept' : 'Role', openRec.role || 'Member'],
          ...(!openRec.inviteId ? [
            ['Company', openRec.company || '—'],
            ['Phone', openRec.phone || '—'],
            ['Work Assignments', assignmentsFor(openRec.userId).map(a => assignRoleLabel(a.role)).join(', ') || 'None yet'],
          ] as [string, React.ReactNode][] : []),
          ['Status', <Badge key="st" tone={openRec.inviteId ? 'under_contract' : 'ongoing'}>{openRec.last}</Badge>],
        ]} />
      </FormModal>
    )}
    {openKey && !openRec && !loading && (
      <FormModal open onClose={closeMember} size="sm" title="Not on this job any more" footer={<Button variant="ghost" onClick={closeMember}>Close</Button>}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>That person or invite isn’t on this job’s roster now — the invite may have been accepted, removed or expired.</p>
      </FormModal>
    )}
    <Toast message={toast?.message ?? null} tone={toast?.tone} />
  </>;
}
