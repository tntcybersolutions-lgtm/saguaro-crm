'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { usePortals, createPortal, revokePortal } from '@/lib/hooks/useFranchise';
import { C, font, fmtDate, useFranchiseGate, GateLoading } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, DangerButton, Pill, ghostButtonStyle } from '@/components/ui/premium';
import { LinkSimple, CheckCircle, Buildings, Eye } from '@phosphor-icons/react';

export default function PortalsPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { portals, loading } = usePortals();
  const { projects } = useProjects();
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [gone, setGone] = useState<Record<string, boolean>>({});

  const list = (portals as any[]).filter((p) => !gone[p.id] && p.is_active);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function create() {
    if (!f.project_id) { setErr('Pick a site.'); return; }
    setBusy(true); setErr('');
    try { await createPortal(f); setF({}); } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  }
  async function copy(url: string, id: string) {
    try { await navigator.clipboard.writeText(origin + url); setCopied(id); setTimeout(() => setCopied(''), 1800); } catch { /* noop */ }
  }
  async function revoke(id: string) {
    setGone((g) => ({ ...g, [id]: true }));
    try { await revokePortal(id); } catch { setGone((g) => { const n = { ...g }; delete n[id]; return n; }); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  const viewed = list.filter((p) => p.last_accessed_at).length;
  const sites = new Set(list.map((p) => p.project_id)).size;

  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: '#1c1c1e', color: C.text, width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, display: 'block' };

  return (
    <PremiumSurface maxWidth={1000} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<LinkSimple size={13} weight="fill" />}
          title="Franchisee"
          accent="Portals"
          subtitle="A private read-only link per owner. No login required."
        />

        {!loading && (
          <StatStrip items={[
            {href: '/app/command-center/portals',  label: 'Active Portals', value: String(list.length), icon: <LinkSimple size={11} weight="bold" /> },
            {href: '/app/command-center/portals',  label: 'Sites', value: String(sites), icon: <Buildings size={11} weight="bold" /> },
            {href: '/app/command-center/portals',  label: 'Viewed', value: String(viewed), accent: viewed > 0 ? C.green : undefined, icon: <Eye size={11} weight="bold" /> },
            {href: '/app/command-center/portals',  label: 'Awaiting First View', value: String(list.length - viewed), accent: list.length - viewed > 0 ? C.yellow : undefined },
          ]} />
        )}

        <SectionCard
          icon={<LinkSimple size={16} weight="duotone" color={C.gold} />}
          title="Generate a Portal Link"
          subtitle="Pick a site and name the owner — the link is read-only and always current."
          style={{ marginBottom: 18 }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 220px' }}>
              <label style={lbl}>Site</label>
              <select style={inp} value={f.project_id || ''} onChange={(e) => setF((p) => ({ ...p, project_id: e.target.value }))}>
                <option value="">Select site…</option>
                {(projects as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 160px' }}><label style={lbl}>Owner name</label><input style={inp} value={f.owner_name || ''} onChange={(e) => setF((p) => ({ ...p, owner_name: e.target.value }))} /></div>
            <div style={{ flex: '1 1 160px' }}><label style={lbl}>Owner email</label><input style={inp} value={f.owner_email || ''} onChange={(e) => setF((p) => ({ ...p, owner_email: e.target.value }))} /></div>
            <GoldButton onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Generate Link'}</GoldButton>
          </div>
          {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        </SectionCard>

        {loading ? (
          <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : list.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty
              icon={<LinkSimple size={32} weight="duotone" color={C.gold} />}
              title="No owner portals yet"
              description="Generate a private link for each franchisee — they'll see live progress, milestones, and budget status for their location without touching your operations."
            />
          </SectionCard>
        ) : (
          <SectionCard title="Active Portals" subtitle={`${list.length} live link${list.length === 1 ? '' : 's'} across ${sites} site${sites === 1 ? '' : 's'}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((p) => (
                <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{p.project_name || 'Site'}</span>
                        {p.last_accessed_at
                          ? <Pill tone="green" caps>Viewed {fmtDate(p.last_accessed_at)}</Pill>
                          : <Pill tone="amber" caps>Not viewed yet</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                        {p.owner_name ? `${p.owner_name}${p.owner_email ? ` · ${p.owner_email}` : ''}` : 'No owner named'}
                      </div>
                      <code style={{ fontSize: 11, color: C.faint, wordBreak: 'break-all' }}>{origin}{p.url}</code>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                      <Link href={p.url} target="_blank" className="pmBtn" style={{ ...ghostButtonStyle, padding: '9px 16px', fontSize: 13, borderRadius: 10 }}>Preview</Link>
                      <GoldButton size="md" onClick={() => copy(p.url, p.id)} icon={copied === p.id ? <CheckCircle size={14} weight="fill" /> : <LinkSimple size={14} weight="bold" />}>
                        {copied === p.id ? 'Copied' : 'Copy Link'}
                      </GoldButton>
                      <DangerButton size="md" onClick={() => revoke(p.id)}>Revoke</DangerButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </PremiumSurface>
  );
}
