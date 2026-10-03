'use client';
/**
 * People & Access — unified hub.
 * ONE nav home for the two people-shaped surfaces that used to be separate
 * sidebar items (and read as duplicate modules):
 *   • Directory     → workforce / HR crew records (employees, certs, pay,
 *                     assignments, incident history)  → <PeopleDirectory/>
 *   • Roles & Access → the RBAC platform: roles, permission matrix, user
 *                     assignments, invites, audit log → <AccessManager/>
 * A top segmented control switches between them; ?tab=access deep-links
 * straight to the access side (used by the /app/roles-permissions redirect
 * and the Settings tile).
 *
 * Presentation: dressed in the cinematic premium kit (PremiumSurface aurora +
 * ModuleHero) to match the Dashboard. The two child surfaces render inside the
 * surface unchanged. (The segmented switch is no longer position:sticky because
 * PremiumSurface's root is overflow:hidden, which nullifies sticky — the tab
 * chooser now sits at the top of the content like the rest of the kit.)
 */
import { useState, useEffect } from 'react';
import { UsersThree, ShieldCheck } from '@phosphor-icons/react';
import { PeopleDirectory } from '@/components/team/PeopleDirectory';
import { AccessManager } from '@/components/team/AccessManager';
import { PremiumSurface, ModuleHero, StatStrip, IconChip } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { getAuthHeaders, getSupabaseBrowser } from '@/lib/supabase-browser';

// Kit-aligned literals (mirror components/ui/premium.tsx tokens)
const GOLD = 'var(--brand-primary)', GOLD_HI = 'var(--brand-primary-strong)';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.42)';

type Tab = 'directory' | 'access';

const TABS = [
  { key: 'directory' as const, label: 'Directory', sub: 'Crew & HR records', Icon: UsersThree },
  { key: 'access' as const, label: 'Roles & Access', sub: 'Users, roles & permissions', Icon: ShieldCheck },
];

/* Roster snapshot for the hub StatStrip — the screen walks in already knowing
   the team: sign-ins, roles, assignment coverage, invite health, crew certs.
   Read-only aggregation over the same tenant-scoped APIs the two child
   surfaces use; non-fatal (strip simply hides) if anything fails. */
interface HubSnap { users: number; roles: number; assigns: number; invites: number; expired: number; crew: number; osha: number }

export default function PeopleAccessHub() {
  // Default landing = Roles & Access (the RBAC platform). Directory is one tap away.
  const [tab, setTab] = useState<Tab>('access');
  const [snap, setSnap] = useState<HubSnap | null>(null);

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
      } catch { /* non-fatal — the strip hides */ }
    })();
    return () => { alive = false; };
  }, []);

  // Deep-link support (?tab=directory|access) — read once on mount, client-only
  // so no prerender/Suspense requirement from useSearchParams.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'directory') setTab('directory');
      else if (t === 'access') setTab('access');
    } catch { /* no-op */ }
  }, []);

  const select = (t: Tab) => {
    setTab(t);
    // keep the URL honest so refresh / share lands on the same tab
    try {
      const url = t === 'access' ? '/app/people?tab=access' : '/app/people';
      window.history.replaceState(null, '', url);
    } catch { /* no-op */ }
  };

  return (
    <PremiumSurface maxWidth={1180} pad="40px 20px 0">
      {/* ── cinematic header ── */}
      <ModuleHero
        eyebrow="Team"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('team').vivid ?? moduleAccent('team').hex}><UsersThree size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('team').hex}
        title="People &"
        accent="Access"
        subtitle="Crew records and role-based access, in one place."
      />

      {/* ── roster intelligence strip — what the system already knows ── */}
      {snap && (
        <StatStrip items={[
          {href: '/app/people', label: 'Team Members', value: String(snap.users), sub: 'Platform sign-ins' },
          {href: '/app/people', label: 'Roles Defined', value: String(snap.roles), sub: snap.roles > 0 ? 'Permission templates in force' : 'Built-ins seed on first visit' },
          {href: '/app/people', 
            label: 'Role Assignments', value: String(snap.assigns),
            accent: snap.users > 0 && snap.assigns === 0 ? 'var(--brand-primary-strong)' : undefined,
            sub: snap.assigns > 0 ? 'Users mapped to roles' : snap.users > 0 ? 'No roles assigned yet — start in Users' : 'Assign roles from Roles & Access',
          },
          {href: '/app/people', 
            label: 'Pending Invites', value: String(snap.invites),
            accent: snap.expired > 0 ? '#ef4444' : snap.invites > 0 ? 'var(--brand-primary-strong)' : undefined,
            sub: snap.expired > 0 ? `${snap.expired} expired — resend from Users` : snap.invites > 0 ? 'Invites expire after 7 days' : 'None outstanding',
          },
          {href: '/app/people', label: 'Crew Directory', value: String(snap.crew), sub: snap.crew > 0 ? `${snap.osha} OSHA certified` : 'Add employees in Directory' },
        ]} />
      )}

      {/* ── unified segmented switch ── */}
      <div style={{ marginBottom: 26 }}>
        <div
          style={{
            display: 'inline-flex', flexWrap: 'wrap',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
            border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: 5, gap: 5,
            boxShadow: '0 20px 50px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {TABS.map(({ key, label, sub, Icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                onClick={() => select(key)}
                className="pmBtn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  border: 'none', cursor: 'pointer', borderRadius: 10, padding: '9px 16px',
                  background: on ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})` : 'transparent',
                  color: on ? '#1A1206' : MUTED,
                  boxShadow: on ? '0 10px 26px -12px color-mix(in srgb, var(--brand-primary) 70%, transparent)' : 'none',
                  transition: 'background .18s ease, color .18s ease',
                }}
              >
                <Icon size={20} weight={on ? 'fill' : 'regular'} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'rgba(26,18,6,0.72)' : FAINT }}>{sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── active surface ── */}
      {tab === 'directory' ? <PeopleDirectory /> : <AccessManager />}
    </PremiumSurface>
  );
}
