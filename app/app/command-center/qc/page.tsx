'use client';
import { useMemo, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useQC, toggleQC } from '@/lib/hooks/useFranchise';
import { QC_TRADES } from '@/lib/franchise-template';
import { C, font, useFranchiseGate, GateLoading } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty } from '@/components/ui/premium';
import { MagnifyingGlass, Check } from '@phosphor-icons/react';

import { FlatStyles, RowSkeleton } from '@/components/ui/flat';
export default function QCPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { items, loading } = useQC();
  const { projects } = useProjects();
  const [site, setSite] = useState('');
  const [done, setDone] = useState<Record<string, boolean>>({});

  const activeSite = site || (projects as any[])[0]?.id || '';
  const isDone = (it: any) => (it.id in done ? done[it.id] : it.is_done);

  const trades = useMemo(() => {
    const mine = (items as any[]).filter((i) => i.project_id === activeSite);
    mine.sort((a, b) => String(a.linked_id || '').localeCompare(String(b.linked_id || ''), undefined, { numeric: true }));
    const passed = mine.filter(isDone).length;
    return { list: mine, passed, pct: mine.length ? Math.round((passed / mine.length) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeSite, done]);

  async function toggle(it: any) {
    const next = !isDone(it);
    setDone((d) => ({ ...d, [it.id]: next }));
    try { await toggleQC(it.id, next); } catch { setDone((d) => { const n = { ...d }; delete n[it.id]; return n; }); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={900} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<MagnifyingGlass size={13} weight="fill" />}
          title="Quality Control"
          accent="by Trade"
          subtitle="The same 14-trade checklist on every site, before inspection."
          actions={
            <select value={activeSite} onChange={(e) => setSite(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, background: 'var(--bg-surface-2)', color: C.text, fontWeight: 600 }}>
              {(projects as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          }
        />

        {loading ? (
          <><FlatStyles /><RowSkeleton rows={6} /></>
        ) : trades.list.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty
              icon={<MagnifyingGlass size={32} weight="duotone" color="var(--text-secondary)" />}
              title="No QC checklist for this site"
              description={`Sites launched from the template come pre-loaded with the ${QC_TRADES.length}-trade QC checklist.`}
            />
          </SectionCard>
        ) : (
          <>
            <StatStrip items={[
              {href: '/app/command-center/qc',  label: 'Trades Passed', value: `${trades.passed}/${trades.list.length}`, accent: trades.pct >= 100 ? C.green : C.gold },
              {href: '/app/command-center/qc',  label: 'Remaining', value: String(trades.list.length - trades.passed), accent: trades.list.length - trades.passed > 0 ? C.yellow : C.green },
              {href: '/app/command-center/qc',  label: 'QC Complete', value: `${trades.pct}%`, accent: trades.pct >= 100 ? C.green : C.gold },
            ]} />
            <SectionCard
              icon={<MagnifyingGlass size={16} weight="duotone" color="var(--text-secondary)" />}
              title="Trade Checklist"
              subtitle="Tap a trade to mark it passed — it syncs across the whole team."
              bodyStyle={{ padding: '10px 20px 12px' }}
            >
              {trades.list.map((it) => {
                const d = isDone(it);
                return (
                  <button key={it.id} onClick={() => toggle(it)} className="pmBtn" style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px solid rgba(255,255,255,0.07)`, cursor: 'pointer', padding: '11px 4px' }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${d ? C.green : C.border}`, background: d ? C.green : 'var(--bg-surface-2)', color: 'var(--text-primary)', flexShrink: 0, fontSize: 12, fontWeight: 900, lineHeight: '17px', textAlign: 'center' }}>{d ? <Check size={13} weight="bold" color="var(--text-primary)" style={{ verticalAlign: 'middle' }} /> : ''}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: d ? C.faint : C.text, textDecoration: d ? 'line-through' : 'none', flex: 1 }}>{it.title}</span>
                    {d && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Passed</span>}
                  </button>
                );
              })}
            </SectionCard>
          </>
        )}
      </div>
    </PremiumSurface>
  );
}
