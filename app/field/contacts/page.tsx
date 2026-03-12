'use client';
/**
 * Saguaro Field — Team Contacts
 * Quick-dial project team members. No typing required.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#D4A017';
const RAISED = '#0f1d2b';
const BORDER = '#1e3148';
const TEXT   = '#e8edf8';
const DIM    = '#8fa3c0';
const GREEN  = '#22C55E';
const BLUE   = '#3B82F6';
const RED    = '#EF4444';

const ROLE_COLORS: Record<string, string> = {
  'Project Manager': GOLD,
  'Superintendent': GREEN,
  'Owner': BLUE,
  'Architect': '#8B5CF6',
  'Engineer': '#06B6D4',
  'Inspector': '#F59E0B',
  'Subcontractor': DIM,
  'default': DIM,
};

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  company?: string;
  is_primary: boolean;
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}
function roleColor(role: string): string {
  return ROLE_COLORS[role] || ROLE_COLORS.default;
}

function ContactsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});

    fetch(`/api/projects/${projectId}/team`)
      .then((r) => r.ok ? r.json() : { team: [] })
      .then((d) => setTeam(d.team || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = team.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.role.toLowerCase().includes(search.toLowerCase()) || (m.company || '').toLowerCase().includes(search.toLowerCase())
  );

  const primary = filtered.filter((m) => m.is_primary);
  const rest = filtered.filter((m) => !m.is_primary);

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}>← Back</button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Project Team</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>{projectName}</p>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 16 }}>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, role, company..."
          style={{ ...inp, paddingLeft: 36 }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading team...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
          <p style={{ margin: 0, fontSize: 14 }}>{team.length === 0 ? 'No team members added to this project yet. Add them in the desktop dashboard.' : 'No results match your search.'}</p>
        </div>
      ) : (
        <>
          {/* Primary contacts */}
          {primary.length > 0 && (
            <>
              <p style={secLbl}>Key Contacts</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {primary.map((m) => <ContactCard key={m.id} member={m} />)}
              </div>
            </>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <>
              <p style={secLbl}>All Team ({rest.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rest.map((m) => <ContactCard key={m.id} member={m} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ContactCard({ member: m }: { member: TeamMember }) {
  const color = roleColor(m.role);
  return (
    <div style={{ background: RAISED, border: `1px solid ${m.is_primary ? `rgba(${hexRgb(GOLD)},.3)` : BORDER}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* Avatar */}
      <div style={{ width: 48, height: 48, borderRadius: 14, background: `rgba(${hexRgb(color)}, .15)`, border: `1px solid rgba(${hexRgb(color)}, .3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color, flexShrink: 0 }}>
        {initials(m.name)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>{m.name}</p>
          {m.is_primary && <span style={{ fontSize: 9, background: `rgba(${hexRgb(GOLD)},.2)`, color: GOLD, borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>KEY</span>}
        </div>
        <p style={{ margin: 0, fontSize: 12, color, fontWeight: 600 }}>{m.role}</p>
        {m.company && <p style={{ margin: '1px 0 0', fontSize: 11, color: DIM }}>{m.company}</p>}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {m.phone && (
          <a
            href={`tel:${m.phone}`}
            style={{ width: 40, height: 40, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}
            title={`Call ${m.name}`}
          >
            📞
          </a>
        )}
        {m.email && (
          <a
            href={`mailto:${m.email}`}
            style={{ width: 40, height: 40, background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}
            title={`Email ${m.name}`}
          >
            ✉️
          </a>
        )}
        {m.phone && (
          <a
            href={`sms:${m.phone}`}
            style={{ width: 40, height: 40, background: 'rgba(212,160,23,.15)', border: '1px solid rgba(212,160,23,.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, textDecoration: 'none' }}
            title={`Text ${m.name}`}
          >
            💬
          </a>
        )}
      </div>
    </div>
  );
}

export default function FieldContactsPage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8fa3c0', textAlign: 'center' }}>Loading...</div>}><ContactsPage /></Suspense>;
}

const inp: React.CSSProperties = { width: '100%', background: '#0f1d2b', border: '1px solid #1e3148', borderRadius: 10, padding: '11px 14px', color: '#e8edf8', fontSize: 15, outline: 'none' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8fa3c0', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };
const secLbl: React.CSSProperties = { margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#8fa3c0', textTransform: 'uppercase', letterSpacing: 0.8 };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
