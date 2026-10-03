'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/hooks/useProjects';
import { useBudget, useChangeOrders, createChangeOrder, advanceChangeOrder } from '@/lib/hooks/useFranchise';
import { C, font, fmtMoney, fmtMoneyShort, useFranchiseGate, GateLoading, Chip, EmptyState } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, FlowSteps, GoldButton, GhostButton } from '@/components/ui/premium';
import { CurrencyDollar, NotePencil, ArrowRight, Plus } from '@phosphor-icons/react';

const CO_STAGES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Issued', color: C.dim }, pricing: { label: 'GC Pricing', color: '#5AC8FA' },
  pm_review: { label: 'PM Review', color: C.blue }, architect_review: { label: 'Architect Review', color: '#AF52DE' },
  pending_owner: { label: 'Owner Approval', color: C.gold }, approved: { label: 'Executed', color: C.green },
  schedule_updated: { label: 'Schedule Updated', color: '#30B0C7' }, budget_updated: { label: 'Budget Updated', color: '#34C759' },
  rejected: { label: 'Rejected', color: C.red },
};

export default function BudgetPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { budgets, loading } = useBudget();
  const { changeOrders } = useChangeOrders();
  const { projects } = useProjects();
  const [tab, setTab] = useState<'budget' | 'cos'>('budget');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => {
    const b = budgets as any[];
    // DB numerics can round-trip as strings — Number() every figure before
    // math so one stringly-typed row can never string-concat the totals.
    const n = (v: unknown) => Number(v) || 0;
    return {
      original: b.reduce((s, x) => s + n(x.original), 0),
      approvedCO: b.reduce((s, x) => s + n(x.approvedCO), 0),
      pendingCO: b.reduce((s, x) => s + n(x.pendingCO), 0),
      committed: b.reduce((s, x) => s + n(x.committed), 0),
      actual: b.reduce((s, x) => s + n(x.actual), 0),
      forecast: b.reduce((s, x) => s + n(x.forecast), 0),
      revised: b.reduce((s, x) => s + n(x.revised), 0),
    };
  }, [budgets]);
  const portfolioVar = totals.revised - totals.forecast;

  async function act(id: string, action: 'advance' | 'reject') {
    if (busy[id]) return;
    let reason: string | undefined;
    if (action === 'reject') { reason = typeof window !== 'undefined' ? window.prompt('Reason for rejection?') || undefined : undefined; if (reason === undefined) return; }
    setBusy((b) => ({ ...b, [id]: true }));
    try { await advanceChangeOrder(id, action, reason); } catch { /* noop */ } finally { setBusy((b) => ({ ...b, [id]: false })); }
  }

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={1200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<CurrencyDollar size={13} weight="fill" color={C.gold} />}
        title="Budget &"
        accent="Change Orders"
        subtitle="Original, revised, and forecast across every site."
        actions={tab === 'cos' ? (
          adding
            ? <GhostButton onClick={() => setAdding(false)}>Close</GhostButton>
            : <GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setAdding(true)}>New Change Order</GoldButton>
        ) : undefined}
      />

      {/* Portfolio money strip — Original / Committed / Actual / Variance plus CO exposure, every figure Number()-coerced in the totals memo */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/command-center/budget',  label: 'Portfolio Original', value: fmtMoneyShort(Number(totals.original) || 0), accent: C.gold, sub: `${(budgets as any[]).length} site budget${(budgets as any[]).length === 1 ? '' : 's'}` },
          {href: '/app/command-center/budget',  label: 'Committed', value: fmtMoneyShort(Number(totals.committed) || 0), sub: 'Subcontracts + POs' },
          {href: '/app/command-center/budget',  label: 'Actual to Date', value: fmtMoneyShort(Number(totals.actual) || 0), sub: 'Billed against budgets' },
          {href: '/app/command-center/budget',  label: 'Approved COs', value: '+' + fmtMoneyShort(Number(totals.approvedCO) || 0), accent: C.green, sub: 'In revised budgets' },
          {href: '/app/command-center/budget',  label: 'Pending COs', value: fmtMoneyShort(Number(totals.pendingCO) || 0), accent: totals.pendingCO ? C.gold : undefined, sub: totals.pendingCO ? 'Awaiting approval' : 'None in flight' },
          {href: '/app/command-center/budget',  label: 'Revised Budget', value: fmtMoneyShort(Number(totals.revised) || 0), sub: 'Original + approved COs' },
          {href: '/app/command-center/budget',  label: 'Forecast Variance', value: (portfolioVar >= 0 ? '+' : '') + fmtMoneyShort(portfolioVar), accent: portfolioVar < 0 ? C.red : C.green, sub: portfolioVar < 0 ? 'Over budget' : 'Under budget' },
        ]} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Chip active={tab === 'budget'} onClick={() => setTab('budget')} count={(budgets as any[]).length}>Budget</Chip>
        <Chip active={tab === 'cos'} color={C.gold} onClick={() => setTab('cos')} count={(changeOrders as any[]).length}>Change Orders</Chip>
      </div>

      {tab === 'cos' && adding && <COForm projects={projects} onDone={() => setAdding(false)} />}

      {loading ? <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
      : tab === 'budget' ? (
        (budgets as any[]).length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(250px,1fr)', gap: 14, alignItems: 'start' }}>
            <SectionCard
              icon={<CurrencyDollar size={17} weight="duotone" color={C.gold} />}
              title="No Site Budgets Yet — Seed Them per Project"
              subtitle="Original, committed, actual, and forecast variance per site."
            >
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginBottom: 14 }}>
                Every project has its own Budget page — seed lines there by CSI division or pull bid-package estimates in one tap.
              </div>
              {((projects || []) as any[]).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {((projects || []) as any[]).slice(0, 8).map((p: any) => (
                    <Link key={p.id} href={`/app/projects/${p.id}/budget`} className="pmHover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: C.text, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.gold, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>Open Budget <ArrowRight size={13} color={C.gold} /></span>
                    </Link>
                  ))}
                  {((projects || []) as any[]).length > 8 && <div style={{ fontSize: 11.5, color: C.dim, paddingTop: 2 }}>+{((projects || []) as any[]).length - 8} more projects — open any project to reach its budget.</div>}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: C.dim }}>Create a project first — its budget page is ready the moment the project exists.</div>
              )}
            </SectionCard>
            <SectionCard flat>
              <FlowSteps title="How the Roll-Up Builds" steps={[
                { title: 'Seed Lines by CSI Division', desc: 'On each project: pick a division, or pull bid-package estimates in one tap.' },
                { title: 'Committed Books Itself', desc: 'Awarded subcontracts and POs land on their coded lines.' },
                { title: 'Actuals Flow from Bills', desc: 'Approved invoices hit the lines — nothing re-typed.' },
                { title: 'Variance Rolls Up Here', desc: 'Original, committed, actual, and forecast across every site.' },
              ]} />
            </SectionCard>
          </div>
        )
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {(budgets as any[]).map((b) => (
            <div key={b.project_id} className="pmHover" style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${b.variance < 0 ? C.red : C.green}`, borderRadius: 14, padding: '16px 18px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <Link href={`/app/projects/${b.project_id}`} style={{ fontSize: 15, fontWeight: 800, color: C.text, textDecoration: 'none' }}>{b.project_name}</Link>
                <span style={{ fontSize: 13, fontWeight: 800, color: b.variance < 0 ? C.red : C.green }}>{b.variance < 0 ? '' : '+'}{fmtMoneyShort(b.variance)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden', margin: '10px 0 12px' }}>
                <div style={{ height: '100%', width: `${Math.min(100, b.pctSpent)}%`, background: b.pctSpent > 100 ? C.red : C.gold }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 13 }}>
                <Line label="Original" v={b.original} />
                <Line label="Approved COs" v={b.approvedCO} color={C.green} plus />
                <Line label="Revised" v={b.revised} bold />
                <Line label="Pending COs" v={b.pendingCO} color={C.gold} plus />
                <Line label="Committed" v={b.committed} />
                <Line label="Actual" v={b.actual} />
                <Line label="Forecast" v={b.forecast} bold />
                <Line label="Contingency" v={b.contingency} color={C.dim} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        (changeOrders as any[]).length === 0 ? (
          <SectionCard>
            <PremiumEmpty icon={<NotePencil size={32} weight="duotone" color={C.gold} />} title="No change orders"
              description="Every change routes the same way: Issued, GC Pricing, PM Review, Architect Review, Owner Approval, Executed, Schedule Updated, Budget Updated."
              action={<GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setAdding(true)}>New Change Order</GoldButton>} />
          </SectionCard>
        )
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(changeOrders as any[]).map((co) => {
            const st = CO_STAGES[String(co.status)] || CO_STAGES.draft; const final = co.status === 'budget_updated' || co.status === 'rejected';
            return (
              <div key={co.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${st.color}`, borderRadius: 12, padding: '13px 15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>CO #{co.co_number} · {co.title}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{co.project_name || 'Site'}{co.amount != null ? ` · ${fmtMoney(Number(co.amount) || 0)}` : ''}{co.schedule_impact_days ? ` · +${co.schedule_impact_days}d` : ''}</div>
                    {co.status === 'rejected' && co.rejection_reason && <div style={{ fontSize: 12, color: C.red, marginTop: 3 }}>Rejected: {co.rejection_reason}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: st.color, background: `${st.color}18`, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{st.label}</span>
                    {!final && <>
                      <button onClick={() => act(co.id, 'advance')} disabled={busy[co.id]} className="pmBtn" style={{ padding: '6px 11px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Advance <ArrowRight size={13} weight="regular" color="#fff" style={{ verticalAlign: 'middle' }} /></button>
                      <button onClick={() => act(co.id, 'reject')} disabled={busy[co.id]} className="pmBtn" style={{ padding: '6px 11px', borderRadius: 8, border: `1px solid ${C.red}`, background: 'var(--bg-surface)', color: C.red, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Reject</button>
                    </>}
                  </div>
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

function Line({ label, v, color, bold, plus }: { label: string; v: number; color?: string; bold?: boolean; plus?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
    <span style={{ color: C.dim }}>{label}</span>
    <span style={{ fontWeight: bold ? 800 : 600, color: color || C.text, fontVariantNumeric: 'tabular-nums' }}>{plus && v ? '+' : ''}{fmtMoney(Number(v) || 0)}</span>
  </div>;
}

function COForm({ projects, onDone }: { projects: any[]; onDone: () => void }) {
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', background: 'var(--bg-surface-2)', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.project_id || !f.title) { setErr('Site and title are required.'); return; }
    setBusy(true); setErr('');
    try { await createChangeOrder(f); onDone(); } catch (e: any) { setErr(e?.message || "Couldn't save the change order. Please try again."); } finally { setBusy(false); }
  }
  return (
    <SectionCard title="New Change Order" subtitle="Routes through GC pricing, reviews, and owner approval automatically." icon={<NotePencil size={16} weight="duotone" color={C.gold} />} style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Title *</label><input style={inp} placeholder="e.g. Added rooftop screening" value={f.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
        <div><label style={lbl}>Site *</label><select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}><option value="">Select…</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label style={lbl}>Amount</label><input type="number" style={inp} value={f.amount || ''} onChange={(e) => set('amount', e.target.value)} /></div>
        <div><label style={lbl}>Schedule Impact (Days)</label><input type="number" style={inp} value={f.schedule_impact_days || ''} onChange={(e) => set('schedule_impact_days', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Scope of Change</label><textarea style={{ ...inp, minHeight: 52, resize: 'vertical', fontFamily: font }} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <GoldButton size="md" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Issue Change Order'}</GoldButton>
        <GhostButton size="md" onClick={onDone}>Cancel</GhostButton>
      </div>
    </SectionCard>
  );
}
