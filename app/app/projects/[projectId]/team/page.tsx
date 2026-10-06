'use client';
import React, { useState, useEffect, useRef } from 'react';
import { DataTable, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import useSWR from 'swr';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { UsersThree, UserPlus, HardHat, EnvelopeSimple, Phone, IdentificationBadge, ClockCounterClockwise, Briefcase, X } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, FlowSteps, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { moduleAccent } from '@/lib/module-identity';
import { Button, Input } from '@/components/ui/kit';
import ProjectOwnershipCard from '@/components/projects/ProjectOwnershipCard';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)',GREEN='var(--success)',RED='var(--danger)',BLUE='var(--warning)';
const fmt = (n:number) => '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function Badge({label,color='var(--text-secondary)',bg='rgba(163,172,187,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color}}>{label}</span>;
}

export default function TeamPage(){
  const params = useParams();
  const projectId = params['projectId'] as string;
  const { showToast } = useToast();
  const [sendingPortal, setSendingPortal] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [members, setMembers] = useState<{name:string,role:string,email:string,access:string,last:string,userId:string|null}[]>([]);
  const [subs, setSubs] = useState<{name:string,role:string,email:string,access:string,last:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteAuto, setInviteAuto] = useState<{name?:boolean;email?:boolean;role?:boolean}>({});
  // ListToolbar state — roster search + team/subs group filter (sag_flt_team).
  const [search, setSearch] = useState('');
  const [showGroup, setShowGroup] = useState('all');
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
      try {
        const r = await fetch(`/api/projects/${projectId}`);
        const d = await r.json();
        if (d.project) setProj(d.project);
        // The API returns the internal roster under `team` (from project_team),
        // not `members`. Map each row to the shape this table renders.
        setMembers((d.team ?? []).map((t: any) => ({
          name: t.name || t.email || 'Team Member',
          role: t.role || 'Member',
          email: t.email || '',
          access: t.role || 'Member',
          last: 'Active',
          // Work assignments key off the auth user id — null until the invite
          // is accepted, which is exactly when assigning becomes possible.
          userId: t.user_id || null,
        })));
        setSubs((d.subs ?? []).map((s: any) => ({ name: s.name, role: 'Subcontractor', email: s.primary_email || s.email || '', access: 'Sub Portal', last: 'Active' })));
      } catch {
        setMembers([]);
        setSubs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  /* Opening the invite form has to take you to it. */
  const inviteFormRef = useRef<HTMLDivElement | null>(null);
  const openInvite = () => {
    setShowInvite(true);
    setInviteAuto({});
    requestAnimationFrame(() => {
      inviteFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inviteFormRef.current?.querySelector('input')?.focus();
    });
  };

  async function handleInvite() {
    if (!inviteEmail.trim()) { setInviteMsg('Email is required.'); return; }
    setInviting(true);
    setInviteMsg('');
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteMsg(json.error || 'Invite failed.'); }
      else {
        setInviteMsg('Invitation sent.');
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
  const WORK = moduleAccent('work');
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

  const inputStyle = {width:'100%',padding:'8px 12px',background:'var(--bg-surface-2)',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box' as const};
  const hintStyle: React.CSSProperties = {fontSize:11,color:'var(--c-text-2)',marginTop:5,lineHeight:1.45};

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
      <span className="k-name"><span className="k-avatar" aria-hidden>{m.name[0]}</span><span className="k-name-text"><span>{m.name}</span><span>{m.email}</span></span></span>
    ) },
    { key: 'role', header: 'Role', phone: 'show', accessor: m => m.role, render: m => m.role },
    { key: 'access', header: 'Access Level', phone: 'show', accessor: m => m.access, render: m => <StatusPill module="team_access" status={m.access} size="sm" /> },
    { key: 'assignments', header: 'Work Assignments', sortable: false, phone: 'show', render: m => (
      <span style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
        {assignmentsFor(m.userId).map(a=>(
          <span key={a.id} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 6px 3px 9px',borderRadius:999,background:WORK.soft,border:`1px solid ${WORK.ring}`,color:WORK.hex,fontSize:10.5,fontWeight:800,letterSpacing:.3,whiteSpace:'nowrap' as const}}>
            {assignRoleLabel(a.role)}
            <button onClick={()=>endAssignment(a)} title="End this assignment" aria-label={`End ${assignRoleLabel(a.role)} assignment`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,padding:0,borderRadius:999,background:WORK.soft,border:'none',color:WORK.hex,cursor:'pointer'}}><X size={9} weight="bold"/></button>
          </span>
        ))}
        {m.userId ? (
          <select value="" disabled={assignBusy} onChange={e=>{const r=e.target.value; if(r) assignWork(m.userId!, r, m.name);}} title="Assign work on this project" aria-label={`Assign work to ${m.name}`} className="k-input" style={{height:30,fontSize:12,padding:'0 8px',width:'auto'}}>
            <option value="">+ Assign…</option>
            {ASSIGN_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        ) : (
          <span title="They can be assigned work once they accept their invite" style={{fontSize:11,color:DIM,fontStyle:'italic' as const,whiteSpace:'nowrap' as const}}>Invite Pending</span>
        )}
      </span>
    ) },
    { key: 'last', header: 'Last Active', phone: 'hide', accessor: m => m.last, render: m => <span style={{color:'var(--success)',fontSize:12,fontWeight:700}}>{m.last}</span> },
  ];
  const teamSubColumns: Column<TeamSub>[] = [
    { key: 'name', header: 'Company', primary: true, phone: 'show', accessor: s => s.name, render: s => (
      <span className="k-name"><span className="k-avatar" aria-hidden>{(s.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')}</span><span className="k-name-text"><span>{s.name}</span><span>{s.email || findCtxSub(s.name)?.email || ''}</span></span></span>
    ) },
    { key: 'trade', header: 'Trade', phone: 'show', accessor: s => findCtxSub(s.name)?.trade || '', render: s => findCtxSub(s.name)?.trade || '—' },
    { key: 'contract', header: 'Contract', align: 'right', phone: 'show', accessor: s => Number(findCtxSub(s.name)?.contractAmount) > 0 ? Number(findCtxSub(s.name)?.contractAmount) : null, render: s => { const a = Number(findCtxSub(s.name)?.contractAmount); return a > 0 ? <span style={{color:TEXT,fontWeight:700}}>{fmtMoney(a)}</span> : '—'; } },
    { key: 'access', header: 'Portal Access', phone: 'show', accessor: s => s.access, render: s => <StatusPill module="team_access" status="sub portal" size="sm" /> },
    { key: 'actions', header: 'Actions', sortable: false, phone: 'show', render: s => (
      <button className="k-btn k-btn-secondary k-btn-sm" onClick={e=>{e.stopPropagation();handleSendPortalLink(s);}} disabled={sendingPortal===s.name}>{sendingPortal===s.name?'Working…':'Copy Portal Link'}</button>
    ) },
  ];
  function inviteFromDirectory(l:{role:string;name:string;email:string}){
    setInviteName(l.name||'');
    setInviteEmail(l.email||'');
    setInviteRole(DIRECTORY_ROLE[l.role]||'Member');
    setInviteAuto({name:!!l.name,email:!!l.email,role:true});
    setShowInvite(true);
    setInviteMsg('');
  }

  return <PremiumSurface maxWidth={2200}>
    <ModuleHero
      eyebrow={ctx?.project?.name || 'Project Team'}
      eyebrowIcon={<UsersThree size={13} weight="fill" color={GOLD} />}
      title="Project"
      accent="Team"
      subtitle="Manage project team members and access"
      actions={<button onClick={()=>{ if (showInvite) { setShowInvite(false); } else { openInvite(); } }} style={goldButtonStyle} className="pmBtn"><UserPlus size={15} weight="bold" /> Invite Member</button>}
    />

    {!loading && (
      <>
        {ctx && (
          <StatStrip items={[
            {href: `/app/projects/${projectId}/team`, label:'Project', value: ctx.project?.name || '—', sub: ctx.project?.projectNumber ? `#${ctx.project.projectNumber}` : (ctx.project?.status || 'active')},
            {href: `/app/projects/${projectId}/team`, label:'Owner', value: ctx.defaults?.ownerName || '—', sub: ctx.defaults?.ownerEmail || 'No email on file'},
            {href: `/app/projects/${projectId}/team`, label:'Architect', value: ctx.defaults?.architectName || '—', sub: 'Design contact'},
            {href: `/app/projects/${projectId}/team`, label:'Leadership', value: `${leadersAssigned}/5`, accent: leadersAssigned>=3?'var(--success)':GOLD, sub: leadersAssigned>0?'Directory roles assigned':'Set them in the directory below'},
            {href: `/app/projects/${projectId}/subs`, label:'Trades on the Job', value: String(subTrades.length), sub: ctxSubs.length?`Across ${ctxSubs.length} sub${ctxSubs.length===1?'':'s'}`:'No subs yet'},
          ]}/>
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          <StatCard icon={<UsersThree size={19} weight="duotone" color={GOLD} />} label="Team Members" value={String(members.length)} accent={GOLD} sub={members.length===1?'1 with access':`${members.length} with access`}  href={`/app/projects/${projectId}/team`}/>
          <StatCard icon={<HardHat size={19} weight="duotone" color={BLUE} />} label="Subcontractors" value={String(subs.length)} accent={subs.length?BLUE:undefined} sub={subTrades.length?`${subTrades.length} trade${subTrades.length===1?'':'s'} — portal access`:'Portal access'}  href={`/app/projects/${projectId}/subs`}/>
          <StatCard icon={<IdentificationBadge size={19} weight="duotone" color={leadersAssigned>=3?'var(--success)':GOLD} />} label="Field Leadership" value={`${leadersAssigned}/5`} accent={leadersAssigned>=3?'var(--success)':GOLD} sub="PM · super · foreman · owner · architect"  href={`/app/projects/${projectId}/team`}/>
        </div>
      </>
    )}

    {showInvite && <div ref={inviteFormRef} style={{marginBottom:24}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 320px',gap:18,alignItems:'start'}}>
      <SectionCard title="Invite Team Member" icon={<UserPlus size={17} weight="duotone" color={GOLD} />} subtitle={ctx?.project?.name ? `Grants access to ${ctx.project.name}` : 'Send a role-scoped invitation to this project.'}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5}}>Email{inviteAuto.email && <AutoChip/>}</label>
            <input type="email" value={inviteEmail} onChange={e=>{setInviteEmail(e.target.value);setInviteAuto(a=>({...a,email:false}));}} placeholder="email@company.com" style={inputStyle}/>
            <div style={hintStyle}>They get a secure accept link by email — it expires after 7 days.</div>
          </div>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5}}>Name{inviteAuto.name && <AutoChip/>}</label>
            <input type="text" value={inviteName} onChange={e=>{setInviteName(e.target.value);setInviteAuto(a=>({...a,name:false}));}} placeholder="Full name" style={inputStyle}/>
            <div style={hintStyle}>Shown on the roster and in notifications.</div>
          </div>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5}}>Role{inviteAuto.role && <AutoChip/>}</label>
            <select value={inviteRole} onChange={e=>{setInviteRole(e.target.value);setInviteAuto(a=>({...a,role:false}));}} style={{...inputStyle,cursor:'pointer'}}>
              {['Admin','Manager','Member','Guest','Client','Sub'].map(r=><option key={r}>{r}</option>)}
            </select>
            <div style={hintStyle}>{ROLE_HINTS[inviteRole] || 'Access level for this member.'}</div>
          </div>
        </div>
        {inviteMsg&&<div style={{fontSize:13,marginBottom:12,color:inviteMsg==='Invitation sent.'?GREEN:RED}}>{inviteMsg}</div>}
        <div style={{display:'flex',gap:10}}>
          <button onClick={handleInvite} disabled={inviting} style={{...goldButtonStyle,opacity:inviting?.6:1}} className="pmBtn">{inviting?'Sending…':'Send Invitation'}</button>
          <button onClick={()=>{setShowInvite(false);setInviteMsg('');}} style={ghostButtonStyle} className="pmBtn">Cancel</button>
        </div>
      </SectionCard>
      <SectionCard flat title="After You Send" icon={<ClockCounterClockwise size={17} weight="duotone" color={GOLD} />}>
        <FlowSteps title="" steps={[
          {title:'Invitation Email Goes Out', desc:'A secure accept link is emailed — it expires after 7 days.'},
          {title:'They Create Their Login', desc:'One click sets up their account under your company.'},
          {title:'Roster Updates Itself', desc:`They appear below with ${inviteRole} access the moment they accept.`},
          {title:'Access Stays Adjustable', desc:'Change or revoke roles any time from Roles & Access.'},
        ]}/>
      </SectionCard>
      </div>
    </div>}

    <ListToolbar
      module="team"
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search the roster…"
      filters={[{ key: 'show', label: 'Show', value: showGroup, onChange: setShowGroup, allLabel: 'Everyone', options: [
        { value: 'team', label: 'Internal Team' },
        { value: 'subs', label: 'Subcontractors' },
      ] }]}
      count={{ shown: filteredMembers.length + filteredSubs.length, total: members.length + subs.length }}
      style={{ marginBottom: 16 }}
    />

    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {proj && <ProjectOwnershipCard projectId={projectId} project={proj} onSaved={(p)=>{ if (p && (p as any).id) setProj(p); }}/>}
      <SectionCard title="Project Directory" subtitle="Field leadership and parties of record — set or edit any slot right here" icon={<IdentificationBadge size={17} weight="duotone" color={GOLD} />}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
          {leadership.map(l=>(
            <div key={l.role} style={{padding:'12px 14px',borderRadius:12,border:`1px solid ${l.name?'var(--brand-primary-25)':'rgba(255,255,255,0.08)'}`,background:l.name?'color-mix(in srgb, var(--brand-primary) 5%, transparent)':'rgba(255,255,255,0.02)'}}>
              <div style={{fontSize:10,fontWeight:800,color:DIM,marginBottom:6}}>{l.role}</div>
              {editRole === l.role ? (
                <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
                  <Input aria-label={`${l.role} name`} value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Name" autoFocus/>
                  <Input aria-label={`${l.role} email`} type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="Email (optional)"/>
                  <div style={{display:'flex',gap:6}}>
                    <Button size="sm" variant="primary" onClick={saveLeader} disabled={savingLeader}>{savingLeader?'Saving…':'Save'}</Button>
                    <Button size="sm" variant="ghost" onClick={()=>setEditRole(null)} disabled={savingLeader}>Cancel</Button>
                  </div>
                </div>
              ) : (<>
              <div style={{fontSize:13.5,fontWeight:700,color:l.name?TEXT:'rgba(255,255,255,0.35)',marginBottom:6}}>{l.name||'Not assigned'}</div>
              {l.name ? (
                <div style={{display:'flex',flexDirection:'column' as const,gap:3}}>
                  {l.email&&<a href={`mailto:${l.email}`} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,color:'var(--brand-primary-strong)',textDecoration:'none'}}><EnvelopeSimple size={12} weight="bold" color="var(--brand-primary-strong)"/>{l.email}</a>}
                  {l.phone&&<a href={`tel:${l.phone}`} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,color:DIM,textDecoration:'none'}}><Phone size={12} weight="bold" color={DIM}/>{l.phone}</a>}
                  {!l.email&&!l.phone&&<span style={{fontSize:11,color:'var(--c-text-2)'}}>No contact on file</span>}
                  {l.email && !memberEmails.has(l.email.toLowerCase()) && (
                    <button onClick={()=>inviteFromDirectory(l)} className="pmBtn" style={{marginTop:6,alignSelf:'flex-start',display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',background:'var(--brand-primary-12)',border:'1px solid var(--brand-primary-35)',borderRadius:7,color:'var(--brand-primary-strong)',fontSize:11,fontWeight:800,cursor:'pointer'}}>
                      <UserPlus size={12} weight="bold" color="var(--brand-primary-strong)" /> Invite to Project
                    </button>
                  )}
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={()=>startEdit(l)}>Set {l.role}</Button>
              )}
              {l.name && <div style={{marginTop:6}}><Button size="sm" variant="ghost" onClick={()=>startEdit(l)}>Edit</Button></div>}
              </>)}
            </div>
          ))}
        </div>
      </SectionCard>
      {(showGroup === 'all' || showGroup === 'team') && (
      <SectionCard title="Internal Team" icon={<UsersThree size={17} weight="duotone" color={GOLD} />}>
        {loading ? (
          <div style={{padding:'28px 12px',textAlign:'center',color:DIM,fontSize:13}}>Loading team members…</div>
        ) : members.length === 0 ? (
          <PremiumEmpty
            icon={<UsersThree size={30} weight="duotone" color={GOLD} />}
            title="No team members yet"
            description={leadersAssigned>0 ? `The directory above lists ${leadersAssigned} leadership role${leadersAssigned===1?'':'s'} — invite them so they can log in, post daily logs, and run the schedule.` : 'Invite your PM, superintendent, and office staff — each gets role-scoped access to this project.'}
            action={<button onClick={openInvite} style={goldButtonStyle} className="pmBtn"><UserPlus size={15} weight="bold" /> Invite Member</button>}
            compact
          />
        ) : (
          <DataTable<Member> columns={memberColumns} rows={filteredMembers} rowKey={m => m.userId || m.name} defaultSort={{ key: 'name', dir: 'asc' }} empty="No one matches." />
        )}
      </SectionCard>
      )}

      {(showGroup === 'all' || showGroup === 'team') && (
      <SectionCard
        title="Work Assignments"
        subtitle="Who owns this project day-to-day — assigned members see it on their My Work hub"
        icon={<Briefcase size={17} weight="duotone" color={WORK.hex} />}
        accent={WORK.hex}
      >
        {assignments.length > 0 && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:16}}>
            {assignments.map(a=>(
              <span key={a.id} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'5px 8px 5px 12px',borderRadius:999,background:WORK.soft,border:`1px solid ${WORK.ring}`,color:WORK.hex,fontSize:12,fontWeight:700}}>
                {a.assignee_name || members.find(m=>m.userId===a.assignee_user_id)?.name || 'Member'}
                <span style={{fontSize:9.5,fontWeight:800,opacity:.8}}>{assignRoleLabel(a.role)}</span>
                <button onClick={()=>endAssignment(a)} title="End this assignment" aria-label={`End ${assignRoleLabel(a.role)} assignment`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:16,height:16,padding:0,borderRadius:999,background:WORK.soft,border:'none',color:WORK.hex,cursor:'pointer'}}><X size={10} weight="bold"/></button>
              </span>
            ))}
          </div>
        )}
        {members.some(m=>m.userId) ? (
          <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap' as const}}>
            <div style={{flex:'1 1 220px',minWidth:200}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5}}>Team Member</label>
              <select value={composerUser} onChange={e=>setComposerUser(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
                <option value="">Choose a member…</option>
                {members.filter(m=>m.userId).map(m=><option key={m.userId!} value={m.userId!}>{m.name}</option>)}
              </select>
              <div style={hintStyle}>Only accepted invites appear — pending members show on the roster as Invite Pending.</div>
            </div>
            <div style={{flex:'0 1 210px',minWidth:180}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:5}}>Assignment Role</label>
              <select value={composerRole} onChange={e=>setComposerRole(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
                {ASSIGN_ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div style={hintStyle}>Their scope on this project — it labels the chip on their hub.</div>
            </div>
            <button
              onClick={()=>{const m=members.find(x=>x.userId===composerUser); assignWork(composerUser, composerRole, m?.name); setComposerUser('');}}
              disabled={!composerUser||assignBusy}
              style={{...goldButtonStyle,opacity:!composerUser||assignBusy?.55:1,cursor:!composerUser||assignBusy?'default':'pointer',marginBottom:22}}
              className="pmBtn"
            ><Briefcase size={15} weight="bold" /> Assign Work</button>
          </div>
        ) : (
          <div style={{fontSize:12.5,color:'var(--c-text-2)',lineHeight:1.55}}>
            Invite team members above — once someone accepts their invite they can be assigned work here, and it lands on their My Work hub immediately.
          </div>
        )}
      </SectionCard>
      )}

      {(showGroup === 'all' || showGroup === 'subs') && (
      <SectionCard title="Subcontractors (Portal Access)" icon={<HardHat size={17} weight="duotone" color={GOLD} />}>
        {subs.length === 0 ? (
          <PremiumEmpty
            icon={<HardHat size={30} weight="duotone" color={GOLD} />}
            title="No subcontractors yet"
            description={(ctx?.bidPackages || []).length > 0 ? `${ctx.bidPackages.length} bid package${ctx.bidPackages.length===1?'':'s'} exist on this project — award one, or add subs in the Subs module, and they land here with portal access, waivers, and pay items wired up.` : 'Add subs in the Subs module or award a bid package — each lands here with portal access, lien waivers, and pay items wired up.'}
            compact
          />
        ) : (
          <DataTable<TeamSub> columns={teamSubColumns} rows={filteredSubs} rowKey={s => s.name} defaultSort={{ key: 'name', dir: 'asc' }} empty="No subcontractors match." />
        )}
      </SectionCard>
      )}
    </div>
  </PremiumSurface>;
}
