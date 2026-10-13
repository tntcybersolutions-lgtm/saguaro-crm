'use client';
import { useMemo, useState } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { moveStage, launchSite } from '@/lib/hooks/useFranchise';
import { computeHealth } from '@/lib/portfolio-health';
import { ROLLOUT_STAGES, STAGE_META, STAGE_IDS, GOLF_TEMPLATE } from '@/lib/franchise-template';
import { num, type Severity } from '@/lib/franchise';
import { C, font, fmtMoneyShort, useFranchiseGate, GateLoading, SevBadge } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, GoldButton, GhostButton, goldButtonStyle } from '@/components/ui/premium';
import { Plus, ArrowLeft, ArrowRight, Cactus, Buildings } from '@phosphor-icons/react';

const SEV_LABEL: Record<Severity, string> = { red: 'Escalate', yellow: 'Watch', green: 'On Track' };

export default function RolloutPipelinePage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { projects, loading } = useProjects();
  const [override, setOverride] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [launching, setLaunching] = useState(false);

  // Effective stage = optimistic override, else stored, else entry stage.
  const stageOf = (p: any): string => override[p.id] || (STAGE_IDS.includes(p.rollout_stage) ? p.rollout_stage : 'site_selection');

  const byStage = useMemo(() => {
    const map: Record<string, any[]> = Object.fromEntries(STAGE_IDS.map((s) => [s, []]));
    ((projects as any[]) || []).forEach((p) => { map[stageOf(p)].push(p); });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, override]);

  const summary = useMemo(() => {
    const list = (projects as any[]) || [];
    const value = list.reduce((s, p) => s + (num(p.contract_value) || 0), 0);
    const inConstruction = list.filter((p) => stageOf(p) === 'construction').length;
    const openingSoon = list.filter((p) => ['inspections_co', 'training_opening'].includes(stageOf(p))).length;
    return { total: list.length, value, inConstruction, openingSoon };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, override]);

  async function shift(p: any, dir: -1 | 1) {
    const cur = STAGE_META[stageOf(p)].order;
    const next = ROLLOUT_STAGES.find((s) => s.order === cur + dir);
    if (!next || busy[p.id]) return;
    setOverride((o) => ({ ...o, [p.id]: next.id }));
    setBusy((b) => ({ ...b, [p.id]: true }));
    try { await moveStage(p.id, next.id); }
    catch { setOverride((o) => { const n = { ...o }; delete n[p.id]; return n; }); } // roll back on failure
    finally { setBusy((b) => ({ ...b, [p.id]: false })); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface>
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<Cactus size={13} weight="fill" />}
          title="Franchise Rollout"
          accent="Pipeline"
          subtitle="Every location from site selection to grand opening."
          actions={
            <GoldButton onClick={() => setLaunching(true)} icon={<Plus size={15} weight="bold" />}>Launch New Site</GoldButton>
          }
        />

        <StatStrip items={[
          {href: '/app/command-center/rollout',  label: 'Locations', value: String(summary.total), icon: <Buildings size={11} weight="bold" /> },
          {href: '/app/command-center/rollout',  label: 'In Construction', value: String(summary.inConstruction), accent: summary.inConstruction > 0 ? C.yellow : undefined },
          {href: '/app/command-center/rollout',  label: 'Opening Soon', value: String(summary.openingSoon), accent: summary.openingSoon > 0 ? C.green : undefined },
          {href: '/app/command-center/rollout',  label: 'Pipeline Value', value: fmtMoneyShort(summary.value), accent: C.gold },
        ]} />

        {loading ? (
          <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading pipeline…</div>
        ) : (
          <SectionCard
            icon={<Cactus size={16} weight="duotone" color="var(--text-secondary)" />}
            title="Pipeline Board"
            subtitle="Every stage carries its playbook duration and committed value."
            flush
          >
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: 16, alignItems: 'flex-start' }}>
              {ROLLOUT_STAGES.map((stage) => {
                const items = byStage[stage.id] || [];
                const colValue = items.reduce((s, p) => s + (num(p.contract_value) || 0), 0);
                return (
                  <div key={stage.id} style={{ flex: '0 0 288px', width: 288, background: 'var(--bg-surface-2)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: stage.color }} />
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{stage.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.dim }}>{items.length}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 8px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, background: `color-mix(in srgb, ${stage.color} 9%, transparent)`, borderRadius: 5, padding: '1px 6px' }}>{stage.weeks}</span>
                      <span style={{ fontSize: 12, color: colValue > 0 ? C.gold : C.faint, fontWeight: 600 }}>{colValue > 0 ? fmtMoneyShort(colValue) : '—'}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                      {items.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', padding: '18px 0', border: `1px dashed ${C.border}`, borderRadius: 10 }}>Empty</div>
                      ) : items.map((p) => {
                        const h = computeHealth(p);
                        return (
                          <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${stage.color}`, borderRadius: 10, padding: '10px 11px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                              <Link href={`/app/projects/${p.id}`} style={{ fontSize: 13, fontWeight: 800, color: C.text, textDecoration: 'none', lineHeight: 1.25 }}>{p.name || 'Untitled'}</Link>
                              <SevBadge sev={h.status as Severity} label={SEV_LABEL[h.status as Severity]} />
                            </div>
                            <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                              {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                              {num(p.contract_value) ? ` · ${fmtMoneyShort(num(p.contract_value))}` : ''}
                            </div>
                            {/* progress */}
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-surface-2)', overflow: 'hidden', margin: '8px 0 9px' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, num(p.percent_complete) || 0))}%`, background: stage.color }} />
                            </div>
                            {/* stage controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button onClick={() => shift(p, -1)} disabled={busy[p.id] || STAGE_META[stageOf(p)].order === 0}
                                style={arrowStyle(busy[p.id] || STAGE_META[stageOf(p)].order === 0)}><ArrowLeft size={13} weight="regular" style={{ verticalAlign: 'middle' }} /></button>
                              <button onClick={() => shift(p, 1)} disabled={busy[p.id] || STAGE_META[stageOf(p)].order === STAGE_IDS.length - 1}
                                style={arrowStyle(busy[p.id] || STAGE_META[stageOf(p)].order === STAGE_IDS.length - 1)}>Advance <ArrowRight size={13} weight="regular" style={{ verticalAlign: 'middle' }} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {launching && <LaunchModal onClose={() => setLaunching(false)} />}
      </div>
    </PremiumSurface>
  );
}

function arrowStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '5px 8px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${C.border}`, background: disabled ? 'var(--bg-base)' : 'var(--bg-surface-2)', color: disabled ? C.faint : C.text,
  };
}

function LaunchModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ state: 'AZ' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: 'var(--bg-surface-2)', color: C.text, width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.name) { setErr('Site name is required.'); return; }
    setBusy(true); setErr('');
    try { const r = await launchSite(f); setDone(r); }
    catch (e: any) { setErr(e?.message || "Couldn't launch the site. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,4,8,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: 'min(560px, 100%)', boxShadow: '0 24px 80px rgba(2,4,8,0.55)', fontFamily: font, color: C.text }}>
        {done ? (
          <div>
            <div className="k-dialog-title" style={{ marginBottom: 6 }}><Cactus size={22} weight="fill" color="var(--text-secondary)" style={{ verticalAlign: 'middle', marginRight: 6 }} />{f.name} launched</div>
            <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, margin: '0 0 16px' }}>
              Created from the <b>{GOLF_TEMPLATE.name}</b> playbook and pre-loaded with{' '}
              <b>{done.seeded?.phases ?? 0}</b> phases, <b>{done.seeded?.milestones ?? 0}</b> milestones,{' '}
              <b>{done.seeded?.longLead ?? 0}</b> long-lead items, <b>{done.seeded?.risks ?? 0}</b> standard risks,
              and the standard <b>01–12 document folders</b>. It enters the pipeline at <b>Site Selection</b>.
            </p>
            {done.warnings?.length > 0 && (
              <div style={{ fontSize: 12, color: C.yellow, marginBottom: 12 }}>Note: {done.warnings.join('; ')}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href={`/app/projects/${done.project?.id}`} className="pmBtn" style={goldButtonStyle}>Open Site</Link>
              <GhostButton onClick={onClose}>Done</GhostButton>
            </div>
          </div>
        ) : (
          <>
            <div className="k-dialog-title" style={{ marginBottom: 4 }}>Launch New Site</div>
            <p style={{ fontSize: 13, color: C.dim, margin: '0 0 16px', lineHeight: 1.5 }}>
              Spins up a new location and pre-loads the standardized golf-franchise playbook — phases, milestones, long-lead procurement, and the standard risk register.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Site Name *</label><input style={inp} placeholder="e.g. Back Nine Tempe" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
              <div><label style={lbl}>City</label><input style={inp} value={f.city || ''} onChange={(e) => set('city', e.target.value)} /></div>
              <div><label style={lbl}>State</label><input style={inp} value={f.state || ''} onChange={(e) => set('state', e.target.value)} /></div>
              <div><label style={lbl}>Contract Value</label><input type="number" style={inp} placeholder="e.g. 4200000" value={f.contract_value || ''} onChange={(e) => set('contract_value', e.target.value)} /></div>
              <div><label style={lbl}>Target Start Date</label><SaguaroDatePicker style={inp} value={f.start_date || ''} onChange={(v) => set('start_date', v)} /></div>
            </div>
            {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <GoldButton onClick={submit} disabled={busy}>{busy ? 'Launching…' : 'Launch Site'}</GoldButton>
              <GhostButton onClick={onClose}>Cancel</GhostButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
