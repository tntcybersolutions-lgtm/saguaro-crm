'use client';
import { useMemo, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { usePreSite, setPreSite } from '@/lib/hooks/useFranchise';
import { PRESITE_CHECKLIST } from '@/lib/franchise-template';
import { C, font, useFranchiseGate, GateLoading } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty } from '@/components/ui/premium';
import { Clipboard, Flag, CheckCircle } from '@phosphor-icons/react';

import { FlatStyles, RowSkeleton } from '@/components/ui/flat';
type PState = 'open' | 'passed' | 'flagged';

export default function PreSitePage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { items, loading } = usePreSite();
  const { projects } = useProjects();
  const [site, setSite] = useState('');
  const [override, setOverride] = useState<Record<string, PState>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const activeSite = site || (projects as any[])[0]?.id || '';
  const stateOf = (it: any): PState => (override[it.id] as PState) || (it.state as PState) || 'open';

  const view = useMemo(() => {
    const mine = (items as any[]).filter((i) => i.project_id === activeSite);
    mine.sort((a, b) => String(a.linked_id || '').localeCompare(String(b.linked_id || ''), undefined, { numeric: true }));
    const passed = mine.filter((i) => stateOf(i) === 'passed').length;
    const flagged = mine.filter((i) => stateOf(i) === 'flagged').length;
    const reviewed = passed + flagged;
    return { list: mine, passed, flagged, reviewed, pct: mine.length ? Math.round((reviewed / mine.length) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeSite, override]);

  async function mark(it: any, next: PState) {
    const cur = stateOf(it);
    const target = cur === next ? 'open' : next; // tapping the active state clears it
    setOverride((o) => ({ ...o, [it.id]: target }));
    setBusy((b) => ({ ...b, [it.id]: true }));
    try { await setPreSite(it.id, target); }
    catch { setOverride((o) => { const n = { ...o }; delete n[it.id]; return n; }); }
    finally { setBusy((b) => ({ ...b, [it.id]: false })); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  const pill = (active: boolean, color: string): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer',
    border: `1px solid ${active ? color : C.border}`, background: active ? color : 'var(--bg-surface-2)', color: active ? 'var(--text-primary)' : C.dim,
  });

  return (
    <PremiumSurface maxWidth={960} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<Clipboard size={13} weight="fill" />}
          title="Pre-Site"
          accent="Inspection"
          subtitle="Feasibility due diligence before lease and build."
          actions={
            <select value={activeSite} onChange={(e) => setSite(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, background: 'var(--bg-surface-2)', color: C.text, fontWeight: 600 }}>
              {(projects as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          }
        />

        {loading ? (
          <><FlatStyles /><RowSkeleton rows={6} /></>
        ) : view.list.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty
              icon={<Clipboard size={32} weight="duotone" color={C.gold} />}
              title="No pre-site checklist for this site"
              description={`Sites launched from the template come pre-loaded with the ${PRESITE_CHECKLIST.length}-point pre-site feasibility inspection.`}
            />
          </SectionCard>
        ) : (
          <>
            <StatStrip items={[
              {href: '/app/command-center/pre-site',  label: 'Reviewed', value: `${view.reviewed}/${view.list.length}`, accent: view.pct >= 100 ? C.green : C.gold },
              {href: '/app/command-center/pre-site',  label: 'Passed', value: String(view.passed), accent: C.green },
              {href: '/app/command-center/pre-site',  label: 'Flagged', value: String(view.flagged), accent: view.flagged ? C.red : undefined, sub: view.flagged ? 'Needs resolution' : 'Clear' },
              {href: '/app/command-center/pre-site',  label: 'Complete', value: `${view.pct}%`, accent: view.pct >= 100 ? C.green : C.gold },
            ]} />
            {view.flagged > 0 && (
              <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 12, padding: '11px 14px', marginBottom: 14, fontSize: 13, color: C.text }}>
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }}><Flag size={16} weight="fill" color={C.red} /></span> <b>{view.flagged}</b> item(s) flagged — resolve or price these before signing the lease.
              </div>
            )}
            <SectionCard
              icon={<Clipboard size={16} weight="duotone" color={C.gold} />}
              title="Feasibility Checklist"
              subtitle={`${view.list.length} points — pass what clears, flag what could kill or re-price the deal.`}
              bodyStyle={{ padding: '6px 20px 10px' }}
            >
              {view.list.map((it) => {
                const st = stateOf(it);
                const bar = st === 'passed' ? C.green : st === 'flagged' ? C.red : C.border;
                return (
                  <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center', borderBottom: `1px solid rgba(255,255,255,0.07)`, borderLeft: `3px solid ${bar}`, paddingLeft: 10, padding: '11px 4px 11px 10px' }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: st === 'passed' ? C.faint : C.text, textDecoration: st === 'passed' ? 'line-through' : 'none' }}>{it.title}</span>
                    <button onClick={() => mark(it, 'passed')} disabled={busy[it.id]} className="pmBtn" style={pill(st === 'passed', C.green)}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}><CheckCircle size={13} weight="regular" /> Pass</span></button>
                    <button onClick={() => mark(it, 'flagged')} disabled={busy[it.id]} className="pmBtn" style={pill(st === 'flagged', C.red)}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}><Flag size={13} weight="regular" /> Flag</span></button>
                  </div>
                );
              })}
            </SectionCard>
          </>
        )}
      </div>
    </PremiumSurface>
  );
}
