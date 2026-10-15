'use client';
/**
 * People & Access — unified hub, Pass 4 on the kit.
 * ONE nav home for the two people-shaped surfaces that used to be separate
 * sidebar items (and read as duplicate modules):
 *   • Directory     → workforce / HR crew records (employees, certs, pay,
 *                     assignments, incident history)  → <PeopleDirectory/>
 *   • Roles & Access → the RBAC platform: roles, permission matrix, user
 *                     assignments, invites, audit log → <AccessManager/>
 * Kit Tabs switch between them; ?tab=access deep-links straight to the access
 * side (used by the /app/roles-permissions redirect and the Settings tile).
 * The two child surfaces render unchanged.
 */
import { useState, useEffect } from 'react';
import { PageShell, StatRow, Tabs, type StatItem } from '@/components/ui/kit';
import { PeopleDirectory } from '@/components/team/PeopleDirectory';
import { AccessManager, type AccessTab } from '@/components/team/AccessManager';
import { getAuthHeaders, getSupabaseBrowser } from '@/lib/supabase-browser';

type Tab = 'directory' | 'access';

/* Roster snapshot for the hub StatRow — the screen walks in already knowing
   the team: sign-ins, roles, assignment coverage, invite health, crew certs.
   Read-only aggregation over the same tenant-scoped APIs the two child
   surfaces use; non-fatal (the row simply hides) if anything fails. */
interface HubSnap { users: number; roles: number; assigns: number; invites: number; expired: number; crew: number; osha: number }

const CSS = `
.ppWs > .k-page { max-width: none; }
.ppTabs { margin-bottom: 4px; }
@media (max-width: 640px) {
  .ppWs .k-stat, .ppWs .k-tab { min-height: 44px; }
}
`;

export default function PeopleAccessHub() {
  // Default landing = Roles & Access (the RBAC platform). Directory is one tap away.
  const [tab, setTab] = useState<Tab>('access');
  const [snap, setSnap] = useState<HubSnap | null>(null);
  // A stat tile opens the Roles & Access tab that holds what it counts.
  const [jump, setJump] = useState<{ tab: AccessTab; n: number } | undefined>(undefined);
  // Bumped by Roles & Access after every change, so the counts re-read with it.
  const [snapRev, setSnapRev] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const sb = getSupabaseBrowser();
        const [uRes, rRes, iRes, aRes, empRes] = await Promise.all([
          fetch('/api/team/users', { headers }),
          fetch('/api/roles', { headers }),
          fetch('/api/team/invite', { headers }),
          fetch('/api/roles/assignments', { headers }),
          sb.from('employees').select('id, is_active, osha_10_certified, osha_30_certified'),
        ]);
        const uJson = uRes.ok ? await uRes.json() : {};
        const userCount = Array.isArray(uJson?.users) ? uJson.users.length : 0;
        const rJson = rRes.ok ? await rRes.json() : {};
        const rolesArr: unknown[] = Array.isArray(rJson) ? rJson : Array.isArray(rJson?.roles) ? rJson.roles : [];
        const iJson = iRes.ok ? await iRes.json() : {};
        const invArr: { created_at?: string }[] = Array.isArray(iJson) ? iJson : Array.isArray(iJson?.invites) ? iJson.invites : [];
        // Invites have no expires_at column — they expire 7 days after created_at.
        const expired = invArr.filter(v => v?.created_at && Date.now() - new Date(v.created_at).getTime() > 7 * 86400000).length;
        const aJson = aRes.ok ? await aRes.json() : {};
        const assignArr: unknown[] = Array.isArray(aJson) ? aJson : Array.isArray(aJson?.assignments) ? aJson.assignments : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emp: any[] = (empRes as any)?.data ?? [];
        const crewActive = emp.filter(e => e?.is_active !== false);
        const osha = crewActive.filter(e => e?.osha_10_certified || e?.osha_30_certified).length;
        if (alive) setSnap({ users: userCount, roles: rolesArr.length, assigns: assignArr.length, invites: invArr.length, expired, crew: crewActive.length, osha });
      } catch { /* non-fatal — the row hides */ }
    })();
    return () => { alive = false; };
  }, [snapRev]);

  // Deep-link support (?tab=directory|access) — read once on mount, client-only
  // so no prerender/Suspense requirement from useSearchParams.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'directory') setTab('directory');
      else if (t === 'access') setTab('access');
    } catch { /* no-op */ }
  }, []);

  const select = (t: Tab, sub?: AccessTab) => {
    setTab(t);
    if (sub) setJump((j) => ({ tab: sub, n: (j?.n ?? 0) + 1 }));
    // keep the URL honest so refresh / share lands on the same tab
    try {
      const url = t === 'access' ? '/app/people?tab=access' : '/app/people';
      window.history.replaceState(null, '', url);
    } catch { /* no-op */ }
  };

  const stats: StatItem[] | null = snap && [
    { label: 'Team Members', value: snap.users, sub: 'Platform sign-ins', onClick: () => select('access', 'team') },
    { label: 'Roles Defined', value: snap.roles, sub: snap.roles > 0 ? 'Permission templates in force' : 'Built-ins seed on first visit', onClick: () => select('access', 'roles') },
    { label: 'Role Assignments', value: snap.assigns, tone: snap.users > 0 && snap.assigns === 0 ? 'warn' : 'default', sub: snap.assigns > 0 ? 'Users mapped to roles' : snap.users > 0 ? 'No roles assigned yet — start in Users' : 'Assign roles from Roles & Access', onClick: () => select('access', 'users') },
    { label: 'Pending Invites', value: snap.invites, tone: snap.expired > 0 ? 'bad' : snap.invites > 0 ? 'warn' : 'default', sub: snap.expired > 0 ? `${snap.expired} expired — resend from Users` : snap.invites > 0 ? 'Invites expire after 7 days' : 'None outstanding', onClick: () => select('access', 'users') },
    { label: 'Crew Directory', value: snap.crew, sub: snap.crew > 0 ? `${snap.osha} OSHA certified` : 'Add employees in Directory', onClick: () => select('directory') },
  ];

  return (
    <div className="ppWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Settings', href: '/app/settings' }, { label: 'People & Access' }]}
        title="People & Access"
        subtitle="Your crew, and what each person can see and do."
      >
        {stats && <StatRow items={stats} />}

        <div className="ppTabs">
          <Tabs
            value={tab}
            onChange={(k) => select(k as Tab)}
            tabs={[
              { key: 'access', label: 'Roles & Access', count: snap?.users },
              { key: 'directory', label: 'Directory', count: snap?.crew },
            ]}
          />
        </div>

        {/* ── active surface (unchanged child components) ── */}
        {tab === 'directory' ? <PeopleDirectory /> : <AccessManager jump={jump} onChanged={() => setSnapRev((n) => n + 1)} />}
      </PageShell>
    </div>
  );
}
