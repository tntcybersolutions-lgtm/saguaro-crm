'use client';
import { useMemo, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useChecklist, toggleChecklist } from '@/lib/hooks/useFranchise';
import { CHECKLIST_TEMPLATE } from '@/lib/franchise-template';
import { C, font, useFranchiseGate, GateLoading } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, Pill } from '@/components/ui/premium';
import { CheckCircle, Check, ListChecks, Flag } from '@phosphor-icons/react';

import { FlatStyles, RowSkeleton } from '@/components/ui/flat';
const PHASE_ORDER = CHECKLIST_TEMPLATE.map((g) => g.phase);

export default function ChecklistsPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { items, loading } = useChecklist();
  const { projects } = useProjects();
  const [site, setSite] = useState('');
  const [done, setDone] = useState<Record<string, boolean>>({});

  const activeSite = site || (projects as any[])[0]?.id || '';
  const isDone = (it: any) => (it.id in done ? done[it.id] : it.is_done);

  const groups = useMemo(() => {
    const mine = (items as any[]).filter((i) => i.project_id === activeSite);
    const byPhase: Record<string, any[]> = {};
    mine.forEach((i) => { (byPhase[i.description || 'Other'] ||= []).push(i); });
    Object.values(byPhase).forEach((arr) => arr.sort((a, b) => String(a.linked_id || '').localeCompare(String(b.linked_id || ''), undefined, { numeric: true })));
    const ordered = [...PHASE_ORDER.filter((p) => byPhase[p]), ...Object.keys(byPhase).filter((p) => !PHASE_ORDER.includes(p))];
    return ordered.map((phase) => {
      const list = byPhase[phase];
      const doneN = list.filter(isDone).length;
      return { phase, list, doneN, pct: list.length ? Math.round((doneN / list.length) * 100) : 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeSite, done]);

  const overall = useMemo(() => {
    const all = groups.flatMap((g) => g.list);
    const d = all.filter(isDone).length;
    return { total: all.length, done: d, pct: all.length ? Math.round((d / all.length) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, done]);

  const phasesComplete = groups.filter((g) => g.pct >= 100).length;

  async function check(it: any) {
    const next = !isDone(it);
    setDone((d) => ({ ...d, [it.id]: next }));
    try { await toggleChecklist(it.id, next); } catch { setDone((d) => { const n = { ...d }; delete n[it.id]; return n; }); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface>
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<ListChecks size={13} weight="fill" color="var(--text-secondary)" />}
        title="Phase"
        accent="Checklists"
        subtitle="The same Phase 1–4 playbook on every site."
        actions={
          <select value={activeSite} onChange={(e) => setSite(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, background: 'var(--bg-surface-2)', color: C.text, fontWeight: 600 }}>
            {(projects as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        } />

      {/* Playbook pulse — real counts for the selected site */}
      {!loading && groups.length > 0 && (
        <StatStrip items={[
          {href: '/app/command-center/checklists',  label: 'Steps Complete', value: `${overall.done}/${overall.total}`, sub: 'On this site' },
          {href: '/app/command-center/checklists',  label: 'Progress', value: `${overall.pct}%`, accent: overall.pct >= 100 ? C.green : C.gold, sub: overall.pct >= 100 ? 'Playbook complete' : 'of the playbook' },
          {href: '/app/command-center/checklists',  label: 'Phases', value: String(groups.length), sub: 'In the template' },
          {href: '/app/command-center/checklists',  label: 'Phases Complete', value: String(phasesComplete), accent: phasesComplete > 0 ? C.green : undefined, sub: `${groups.length - phasesComplete} still open` },
        ]} />
      )}

      {loading ? <><FlatStyles /><RowSkeleton rows={6} /></>
      : groups.length === 0 ? (
        <SectionCard flat>
          <PremiumEmpty icon={<CheckCircle size={32} weight="duotone" color="var(--text-secondary)" />} title="No checklist for this site"
            description="Sites launched from the standardized template come pre-loaded with the full Phase 1–4 checklist." />
        </SectionCard>
      ) : (
        <>
          <SectionCard flat
            title="Overall Progress"
            subtitle={`${overall.done} of ${overall.total} steps complete`}
            icon={<Flag size={16} weight="duotone" color="var(--text-secondary)" />}
            action={<span style={{ fontSize: 20, fontWeight: 900, color: overall.pct >= 100 ? C.green : C.gold, fontVariantNumeric: 'tabular-nums' }}>{overall.pct}%</span>}
            style={{ marginBottom: 18 }}
          >
            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${overall.pct}%`, background: overall.pct >= 100 ? C.green : C.gold, transition: 'width .3s' }} />
            </div>
          </SectionCard>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map((g) => (
              <SectionCard
                key={g.phase}
                title={g.phase}
                action={<Pill tone={g.pct >= 100 ? 'green' : 'neutral'}>{g.doneN}/{g.list.length}</Pill>}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {g.list.map((it) => {
                    const d = isDone(it);
                    return (
                      <button key={it.id} onClick={() => check(it)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', color: 'inherit', fontFamily: 'inherit' }}>
                        <span style={{ marginTop: 1, width: 18, height: 18, borderRadius: 5, border: `2px solid ${d ? C.green : C.border}`, background: d ? C.green : 'var(--bg-surface-2)', color: 'var(--text-primary)', flexShrink: 0, fontSize: 12, fontWeight: 900, lineHeight: '15px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{d ? <Check size={12} weight="bold" color="var(--text-primary)" /> : ''}</span>
                        <span style={{ fontSize: 14, color: d ? C.faint : C.text, textDecoration: d ? 'line-through' : 'none' }}>{it.title}</span>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            ))}
          </div>
        </>
      )}
      </div>
    </PremiumSurface>
  );
}
