'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useStakeholders, addStakeholder, removeStakeholder } from '@/lib/hooks/useFranchise';
import { C, font, useFranchiseGate, GateLoading, Chip, SearchInput } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, GhostButton } from '@/components/ui/premium';
import { Users, X, Buildings, Envelope, Phone, MapPin, Plus } from '@phosphor-icons/react';

import { FlatStyles, RowSkeleton } from '@/components/ui/flat';
const ROLES = ['Owner / Franchisee', 'PM / Franchisor Rep', 'Saguaro Coordinator', 'General Contractor', 'Project Superintendent', 'Architect / Engineer', 'Municipality / City', 'Material / Equipment Vendor', 'Golf Simulator (Full-Swing)', 'IT / AV', 'Signage'];
const roleColor = (r: string) => {
  const s = String(r || '').toLowerCase();
  if (s.includes('owner') || s.includes('franchis')) return C.gold;
  if (s.includes('contractor') || s.includes('superintendent')) return 'var(--warning)';
  if (s.includes('architect') || s.includes('engineer')) return C.blue;
  if (s.includes('full-swing') || s.includes('simulator')) return C.green;
  if (s.includes('city') || s.includes('municipal')) return 'var(--warning)';
  return C.dim;
};

export default function DirectoryPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { stakeholders, loading } = useStakeholders();
  const { projects } = useProjects();
  const [site, setSite] = useState<'all' | string>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [removed, setRemoved] = useState<Record<string, boolean>>({});

  const list = (stakeholders as any[]).filter((s) => !removed[s.id]);
  const summary = useMemo(() => ({
    total: list.length,
    sites: new Set(list.map((s) => s.project_id)).size,
    roles: new Set(list.map((s) => String(s.role || s.role_label || 'Stakeholder'))).size,
  }), [list]);

  const filtered = list.filter((s) =>
    (site === 'all' || s.project_id === site) &&
    (!q || `${s.name || ''} ${s.company || ''} ${s.role || s.role_label || ''} ${s.email || ''}`.toLowerCase().includes(q.toLowerCase())));

  async function remove(id: string) {
    setRemoved((r) => ({ ...r, [id]: true }));
    try { await removeStakeholder(id); } catch { setRemoved((r) => { const n = { ...r }; delete n[id]; return n; }); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<Users size={13} weight="fill" color={C.gold} />}
        title="Stakeholder"
        accent="Directory"
        subtitle="One roster, every site."
        actions={adding
          ? <GhostButton onClick={() => setAdding(false)}>Close</GhostButton>
          : <GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setAdding(true)}>Add Stakeholder</GoldButton>}
      />

      {adding && <AddForm projects={projects} onDone={() => setAdding(false)} />}

      {/* Roster pulse — real counts across the portfolio */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/command-center/directory',  label: 'Stakeholders', value: String(summary.total), accent: summary.total > 0 ? C.gold : undefined, sub: 'Across the portfolio' },
          {href: '/app/command-center/directory',  label: 'Sites Covered', value: String(summary.sites), sub: 'With a roster' },
          {href: '/app/command-center/directory',  label: 'Distinct Roles', value: String(summary.roles), sub: 'Trades, vendors, authorities' },
        ]} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Chip active={site === 'all'} onClick={() => setSite('all')} count={list.length}>All Sites</Chip>
        {(projects as any[]).map((p) => {
          const n = list.filter((s) => s.project_id === p.id).length;
          if (!n) return null;
          return <Chip key={p.id} active={site === p.id} onClick={() => setSite(p.id)} count={n}>{p.name}</Chip>;
        })}
        <SearchInput value={q} onChange={setQ} placeholder="Search name, company, role…" />
      </div>

      {loading ? <><FlatStyles /><RowSkeleton rows={6} /></>
      : filtered.length === 0 ? (
        list.length === 0 ? (
          <SectionCard>
            <PremiumEmpty icon={<Users size={32} weight="duotone" color={C.gold} />} title="No stakeholders yet"
              description="Build the roster for each location — every trade, vendor, and authority in one place so anyone in the org knows who to call."
              action={<GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setAdding(true)}>Add Your First</GoldButton>} />
          </SectionCard>
        ) : (
          <SectionCard flat>
            <PremiumEmpty compact icon={<Users size={26} weight="duotone" color={C.gold} />} title="Nothing matches"
              description="No stakeholder matches this site or search. Clear the filters to see the full roster." />
          </SectionCard>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map((s) => {
            const role = s.role || s.role_label || 'Stakeholder'; const col = roleColor(role);
            return (
              <div key={s.id} className="pmHover" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 15px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</div>
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: col, background: `${col}18`, padding: '2px 8px', borderRadius: 6, marginTop: 4 }}>{role}</span>
                  </div>
                  <button onClick={() => remove(s.id)} aria-label="Remove" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}><X size={15} weight="regular" color={C.faint} /></button>
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {s.company && <span><Buildings size={14} weight="regular" color={C.dim} style={{ verticalAlign: 'middle', marginRight: 4 }} />{s.company}</span>}
                  {s.email && <a href={`mailto:${s.email}`} style={{ color: C.blue, textDecoration: 'none' }}><Envelope size={14} weight="regular" color={C.blue} style={{ verticalAlign: 'middle', marginRight: 4 }} />{s.email}</a>}
                  {s.phone && <a href={`tel:${s.phone}`} style={{ color: C.blue, textDecoration: 'none' }}><Phone size={14} weight="regular" color={C.blue} style={{ verticalAlign: 'middle', marginRight: 4 }} />{s.phone}</a>}
                  {s.project_name && <Link href={`/app/projects/${s.project_id}`} style={{ color: C.dim, textDecoration: 'none', marginTop: 2 }}><MapPin size={14} weight="regular" color={C.dim} style={{ verticalAlign: 'middle', marginRight: 4 }} />{s.project_name}</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}

function AddForm({ projects, onDone }: { projects: any[]; onDone: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ role: ROLES[0] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', background: 'var(--bg-surface-2)', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.project_id || !f.name) { setErr('Site and name are required.'); return; }
    setBusy(true); setErr('');
    try { await addStakeholder(f); onDone(); } catch (e: any) { setErr(e?.message || "Couldn't add the stakeholder. Please try again."); } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Add Stakeholder" subtitle="Name, role, and how to reach them — tied to a site." icon={<Users size={16} weight="duotone" color={C.gold} />} style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <div><label style={lbl}>Name *</label><input style={inp} value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
        <div><label style={lbl}>Site *</label><select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}><option value="">Select site…</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label style={lbl}>Role</label><select style={inp} value={f.role} onChange={(e) => set('role', e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
        <div><label style={lbl}>Company</label><input style={inp} value={f.company || ''} onChange={(e) => set('company', e.target.value)} /></div>
        <div><label style={lbl}>Email</label><input style={inp} value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label style={lbl}>Phone</label><input style={inp} value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <GoldButton size="md" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Add'}</GoldButton>
        <GhostButton size="md" onClick={onDone}>Cancel</GhostButton>
      </div>
    </SectionCard>
  );
}
