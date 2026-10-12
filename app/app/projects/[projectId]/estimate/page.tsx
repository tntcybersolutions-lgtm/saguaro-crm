'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSort, useSortedRows, SortTh, SortBar } from '@/components/ui/sort';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Table, T } from '@/components/ui/shell';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, FlowSteps, goldButtonStyle } from '@/components/ui/premium';
import { toCents, toDollars, extend, sumCents, addCents } from '@/lib/calc';
import { Package, Ruler, Rows, Receipt, DownloadSimple, Stack } from '@phosphor-icons/react';
import { CSI_DIVISIONS, classifyToCSI } from '@/lib/construction-intelligence';

interface EstimateLine {
  csi_code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total: number;
}

interface TakeoffData {
  id: string;
  materials: EstimateLine[];
  labor_cost: number;
  material_cost: number;
  total_cost: number;
  square_footage: number;
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtSigned = (n: number) => (Number(n) < 0 ? '-' : '+') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const EST_COLS: { key: string; label: string; budgetOnly?: boolean }[] = [
  { key: 'div', label: 'Div' }, { key: 'name', label: 'Division' }, { key: 'count', label: 'Items' }, { key: 'total', label: 'Estimate' }, { key: 'pct', label: '% of Materials' },
  { key: 'budget', label: 'Budget', budgetOnly: true }, { key: 'variance', label: 'Variance', budgetOnly: true },
];

export default function EstimatePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [takeoff, setTakeoff] = useState<TakeoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchTakeoff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/takeoffs/latest?projectId=${projectId}`);
      if (!res.ok) { setTakeoff(null); return; }
      const data = await res.json();
      // /api/takeoffs/latest answers { data: takeoff | null } (lib/api-response
      // ok()); the page read `data.takeoff`, which never existed, so every
      // estimate said "No Takeoff Data Yet" while /takeoff showed a full one.
      const t = data?.takeoff ?? data?.data ?? null;
      if (t) {
        const materials: EstimateLine[] = (t.materials || t.takeoff_materials || t.line_items || []).map((m: any) => {
          const quantity = Number(m.quantity) || 0;
          const unit_cost = Number(m.unit_cost ?? m.unit_price) || 0;
          const stored = Number(m.total ?? m.total_cost) || 0;
          // Line extended cost = quantity × unit cost, exact cents (never float qty*price).
          const lineCents = stored ? toCents(stored) : extend(quantity, toCents(unit_cost));
          return {
            csi_code: m.csi_code || m.code || '',
            description: m.description || m.name || '',
            quantity,
            unit: m.unit || 'EA',
            unit_cost,
            total: toDollars(lineCents),
          };
        });
        const materialCents = sumCents(materials.map(m => toCents(m.total)));
        const laborCents = toCents(t.labor_cost || 0);
        const materialCost = toDollars(materialCents);
        setTakeoff({
          id: t.id,
          materials,
          labor_cost: toDollars(laborCents),
          material_cost: materialCost,
          total_cost: toDollars(addCents(materialCents, laborCents)),
          square_footage: t.square_footage || t.sqft || 0,
        });
      } else {
        setTakeoff(null);
      }
    } catch {
      setTakeoff(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTakeoff(); }, [fetchTakeoff]);

  // Project intelligence — one snapshot ties the estimate to the live contract,
  // budget, and bid-package money. Enhancement-only; the page renders without it.
  const { ctx } = useProjectContext(projectId);

  // ── Live money from the snapshot (DB numerics can round-trip as strings — always Number()||0 before math) ──
  const money = ctx?.money;
  const originalContract = Number(money?.originalContract) || 0;
  const revisedContract = Number(money?.revisedContract) || 0;
  const budgetOriginal = Number(ctx?.budget?.original) || 0;
  const budgetLineCount = Number(ctx?.budget?.lineCount) || 0;
  const budgetLines = (ctx?.budget?.lines || []) as any[];
  const bidPackages = (ctx?.bidPackages || []) as any[];
  const awardedPkgs = bidPackages.filter(b => String(b.status || '').toLowerCase() === 'awarded');
  const awardedTotal = awardedPkgs.reduce((s, b) => s + (Number(b.awardedAmount) || 0), 0);

  // ── Canonical CSI division rollup — every line lands in a MasterFormat division ──
  const divKey = (code: string, desc: string) => {
    const digits = String(code || '').replace(/[^0-9]/g, '').slice(0, 2);
    return digits && CSI_DIVISIONS[digits] ? digits : classifyToCSI(desc || '');
  };
  const budgetByDiv = new Map<string, number>();
  for (const b of budgetLines) {
    const d = divKey(String(b.division || b.costCode || ''), String(b.description || ''));
    budgetByDiv.set(d, (budgetByDiv.get(d) || 0) + (Number(b.original) || 0));
  }
  const rollupMap = new Map<string, { cents: number; count: number }>();
  for (const m of (takeoff?.materials || [])) {
    const d = divKey(m.csi_code, m.description);
    const prev = rollupMap.get(d) || { cents: 0, count: 0 };
    rollupMap.set(d, { cents: addCents(prev.cents, toCents(m.total)), count: prev.count + 1 });
  }
  const rollup = Array.from(rollupMap.entries())
    .map(([div, r]) => ({ div, name: CSI_DIVISIONS[div]?.name || 'Uncategorized', total: toDollars(r.cents), count: r.count, budget: budgetByDiv.get(div) || 0 }))
    .sort((a, b) => a.div.localeCompare(b.div));
  const estSort = useSort(null);
  const estSortValue = useCallback((r: (typeof rollup)[number], key: string): unknown => {
    if (key === 'pct') return takeoff && takeoff.material_cost > 0 ? r.total / takeoff.material_cost : 0;
    if (key === 'variance') return r.budget > 0 ? r.total - r.budget : null;
    if (key === 'budget') return r.budget > 0 ? r.budget : null;
    return (r as unknown as Record<string, unknown>)[key];
  }, [takeoff]);
  const sortedRollup = useSortedRows(rollup, estSort.sort, estSortValue);
  const estBudgetDelta = takeoff ? takeoff.total_cost - budgetOriginal : 0;
  const matBudgetDelta = takeoff ? takeoff.material_cost - budgetOriginal : 0;
  const impliedMargin = takeoff ? revisedContract - takeoff.total_cost : 0;

  function exportCSV() {
    if (!takeoff) return;
    setExporting(true);
    const header = 'CSI Code,Description,Quantity,Unit,Unit Cost,Total\n';
    const rows = takeoff.materials.map(m =>
      `"${m.csi_code}","${m.description}",${m.quantity},"${m.unit}",${m.unit_cost},${m.total}`
    ).join('\n');
    const summary = `\n\nMaterial Cost,,,,,"${fmt(takeoff.material_cost)}"\nLabor Cost,,,,,"${fmt(takeoff.labor_cost)}"\nTotal,,,,,"${fmt(takeoff.total_cost)}"`;
    if (takeoff.square_footage > 0) {
      const costPerSF = takeoff.total_cost / takeoff.square_footage;
      // appending to summary
    }
    const blob = new Blob([header + rows + summary], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <PremiumSurface maxWidth={2200}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: T.muted }}>Loading estimate data…</div>
      ) : !takeoff ? (
        <>
          <ModuleHero
            eyebrow={ctx?.project?.name || 'Estimating'}
            eyebrowIcon={<Ruler size={13} weight="fill" color="var(--text-secondary)" />}
            title="Project"
            accent="Estimate"
            subtitle="From the latest takeoff, rolled up by CSI division."
          />
          {ctx && (
            <StatStrip items={[
              {href: `/app/projects/${projectId}/contracts`,  label: 'Original Contract', value: fmt0(originalContract), sub: 'The number the estimate answers to' },
              {href: `/app/projects/${projectId}/contracts`,  label: 'Revised Contract', value: fmt0(revisedContract), sub: (Number(money?.approvedCoCount) || 0) + ' approved CO' + ((Number(money?.approvedCoCount) || 0) === 1 ? '' : 's') },
              {href: `/app/projects/${projectId}/budget`,  label: 'Project Budget', value: fmt0(budgetOriginal), sub: budgetLineCount > 0 ? budgetLineCount + ' CSI-coded lines' : 'No budget lines yet' },
              {href: `/app/projects/${projectId}/bid-packages`,  label: 'Bid Packages', value: String(bidPackages.length), sub: awardedPkgs.length > 0 ? awardedPkgs.length + ' awarded · ' + fmt0(awardedTotal) : 'None awarded yet' },
              {href: `/app/projects/${projectId}/subs`,  label: 'Subs on the Job', value: String((ctx?.subs || []).length), sub: 'Ready to price scopes' },
            ]} />
          )}
          <SectionCard flush>
            <div style={{ display: 'grid', gridTemplateColumns: ctx ? 'minmax(0, 1fr) 360px' : '1fr', alignItems: 'stretch' }}>
              <PremiumEmpty
                icon={<Package size={30} weight="duotone" color="var(--text-secondary)" />}
                title="No Takeoff Data Yet"
                description={budgetOriginal > 0
                  ? `The budget already carries ${fmt0(budgetOriginal)} across ${budgetLineCount} CSI line${budgetLineCount === 1 ? '' : 's'} — run a blueprint takeoff and the estimate rolls up division-by-division right against it.`
                  : 'Run a blueprint analysis and the AI extracts quantities, prices them, and rolls the estimate up by CSI division here.'}
                action={
                  <a href={`/app/projects/${projectId}/takeoff`} style={goldButtonStyle} className="pmBtn">Go to Takeoff</a>
                }
              />
              {ctx && (
                <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', padding: '22px 24px' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--c-text-2)', marginBottom: 12 }}>How the Estimate Builds</div>
                  <FlowSteps title="" steps={[
                    { title: 'Upload Plans in Takeoff', desc: 'AI scans the sheets and extracts quantities with CSI codes.' },
                    { title: 'Lines Price Themselves', desc: 'Unit costs extend into a priced, exportable estimate.' },
                    { title: 'Divisions Roll Up Here', desc: 'Every line lands in its canonical MasterFormat division.' },
                    { title: 'Estimate Meets Budget', desc: budgetLineCount > 0 ? `Compared division-by-division against your ${budgetLineCount}-line budget.` : 'Seed the budget from it and track committed vs. actual.' },
                  ]} />
                </div>
              )}
            </div>
          </SectionCard>
        </>
      ) : (
        <>
          <ModuleHero
            eyebrow={ctx?.project?.name || 'Estimating'}
            eyebrowIcon={<Ruler size={13} weight="fill" color="var(--text-secondary)" />}
            title="Project"
            accent="Estimate"
            subtitle={`Priced from the latest blueprint takeoff — ${takeoff.materials.length} line${takeoff.materials.length === 1 ? '' : 's'} across ${rollup.length} CSI division${rollup.length === 1 ? '' : 's'}`}
            actions={
              <button
                onClick={exportCSV}
                disabled={exporting}
                className="pmBtn"
                style={{ ...goldButtonStyle, opacity: exporting ? 0.6 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
              >
                <DownloadSimple size={15} weight="bold" /> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            }
          />

          {/* One summary: the estimate's own money, then how it sits against the budget and contract */}
          <StatStrip items={[
            {href: `/app/projects/${projectId}/estimate`,  label: 'Estimate Total', value: fmt0(takeoff.total_cost), sub: takeoff.materials.length + ' lines · ' + rollup.length + ' division' + (rollup.length === 1 ? '' : 's') },
            {href: `/app/projects/${projectId}/estimate`,  label: 'Material Cost', value: fmt(takeoff.material_cost) },
            {href: `/app/projects/${projectId}/estimate`,  label: 'Labor Cost', value: fmt(takeoff.labor_cost) },
            {href: `/app/projects/${projectId}/estimate`,  label: 'Cost per SF', value: takeoff.square_footage > 0 ? fmt(takeoff.total_cost / takeoff.square_footage) : 'N/A', sub: takeoff.square_footage > 0 ? `${takeoff.square_footage.toLocaleString()} SF` : undefined },
            ...(ctx ? [
              {href: `/app/projects/${projectId}/budget`,  label: 'Est. vs. Budget', value: budgetOriginal > 0 ? fmtSigned(estBudgetDelta) : '—', accent: budgetOriginal > 0 ? (estBudgetDelta > 0 ? 'var(--danger)' : 'var(--success)') : undefined, sub: budgetOriginal > 0 ? (estBudgetDelta > 0 ? 'Estimate runs over the budget' : 'Estimate fits inside the budget') : 'Seed the budget to compare' },
              {href: `/app/projects/${projectId}/estimate`,  label: 'Implied Margin', value: revisedContract > 0 ? fmt0(impliedMargin) : '—', accent: revisedContract > 0 ? (impliedMargin >= 0 ? 'var(--success)' : 'var(--danger)') : undefined, sub: revisedContract > 0 ? Math.round((impliedMargin / revisedContract) * 100) + '% of revised contract' : 'Set the contract to see margin' },
            ] : []),
          ]} />

          {/* Division Rollup — canonical MasterFormat, tied to the budget */}
          {rollup.length > 0 && (
            <SectionCard
              title="CSI Division Rollup"
              subtitle={budgetLineCount > 0 ? 'Estimate vs. budget by MasterFormat division' : 'Material lines grouped by canonical MasterFormat division'}
              icon={<Stack size={17} weight="duotone" color="var(--text-secondary)" />}
              action={<a href={`/app/projects/${projectId}/budget`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--link)', textDecoration: 'none' }}>{budgetLineCount > 0 ? 'Open Budget' : 'Seed the Budget'}</a>}
              flush
              style={{ marginBottom: 24 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <SortBar columns={EST_COLS.filter(c => budgetLineCount > 0 || !c.budgetOnly)} sort={estSort.sort} onChange={estSort.setSort} />
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {EST_COLS.filter(c => budgetLineCount > 0 || !c.budgetOnly).map(c => (
                        <SortTh key={c.key} col={c.key} label={c.label} sort={estSort.sort} onSort={estSort.cycle} align={c.key === 'div' || c.key === 'name' ? 'left' : 'right'} style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, color: T.muted, borderBottom: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap' }} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRollup.map(r => {
                      const pctOfMat = takeoff.material_cost > 0 ? (r.total / takeoff.material_cost) * 100 : 0;
                      const variance = r.total - r.budget;
                      return (
                        <tr key={r.div} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '9px 14px', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace' }}>{r.div}</td>
                          <td style={{ padding: '9px 14px', color: T.white, fontWeight: 600, minWidth: 180 }}>
                            {r.name}
                            <div style={{ marginTop: 5, height: 4, width: '100%', maxWidth: 220, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: Math.min(100, pctOfMat) + '%', borderRadius: 999, background: 'linear-gradient(90deg,var(--brand-primary),var(--brand-primary-strong))' }} />
                            </div>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: T.muted }}>{r.count}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: T.white, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.total)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: T.muted, whiteSpace: 'nowrap' }}>{pctOfMat.toFixed(1)}%</td>
                          {budgetLineCount > 0 && (
                            <>
                              <td style={{ padding: '9px 14px', textAlign: 'right', color: r.budget > 0 ? T.white : T.muted, whiteSpace: 'nowrap' }}>{r.budget > 0 ? fmt(r.budget) : '—'}</td>
                              <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: r.budget > 0 ? (variance > 0 ? 'var(--danger)' : 'var(--success)') : T.muted }}>{r.budget > 0 ? fmtSigned(variance) : 'Not budgeted'}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)' }}>
                      <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 800, fontSize: 12, color: T.white, letterSpacing: 0.3 }}>All Divisions — Materials</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: T.muted }}>{takeoff.materials.length}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmt(takeoff.material_cost)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: T.muted }}>100%</td>
                      {budgetLineCount > 0 && (
                        <>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: T.white, whiteSpace: 'nowrap' }}>{fmt(budgetOriginal)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', color: matBudgetDelta > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtSigned(matBudgetDelta)}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                Labor of {fmt(takeoff.labor_cost)} is carried outside the division rollup — grand total {fmt(takeoff.total_cost)}.{budgetLineCount > 0 ? ' Division budgets come from the project budget lines; variance is estimate minus budget.' : ' Seed the project budget to see division-by-division variance here.'}
              </div>
            </SectionCard>
          )}

          {/* Line Items Table */}
          <SectionCard flat
            title="Line Items"
            icon={<Rows size={17} weight="duotone" color="var(--text-secondary)" />}
            action={<span style={{ fontSize: 12, color: T.muted }}>{takeoff.materials.length} items</span>}
            flush
          >
            <Table
              headers={['CSI Code', 'Description', 'Quantity', 'Unit', 'Unit Cost', 'Total']}
              rows={takeoff.materials.map(m => [
                <span key="c" style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace' }}>{m.csi_code}</span>,
                m.description,
                <span key="q" style={{ color: T.white }}>{m.quantity.toLocaleString()}</span>,
                <span key="u" style={{ color: T.muted }}>{m.unit}</span>,
                <span key="uc" style={{ color: T.muted }}>{fmt(m.unit_cost)}</span>,
                <span key="t" style={{ fontWeight: 600, color: T.white }}>{fmt(m.total)}</span>,
              ])}
            />
          </SectionCard>

          {/* Summary Footer */}
          <SectionCard flat
            title="Estimate Summary"
            icon={<Receipt size={17} weight="duotone" color="var(--text-secondary)" />}
            style={{ marginTop: 20 }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>Material Cost</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{fmt(takeoff.material_cost)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>Labor Cost</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{fmt(takeoff.labor_cost)}</div>
              </div>
              <div style={{ textAlign: 'right', paddingLeft: 24, borderLeft: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.white }}>{fmt(takeoff.total_cost)}</div>
              </div>
              {takeoff.square_footage > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>Cost per SF</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(takeoff.total_cost / takeoff.square_footage)}</div>
                </div>
              )}
              {budgetOriginal > 0 && (
                <div style={{ textAlign: 'right', paddingLeft: 24, borderLeft: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>vs. Budget</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: estBudgetDelta > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtSigned(estBudgetDelta)}</div>
                </div>
              )}
              {revisedContract > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>Implied Margin</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: impliedMargin >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt0(impliedMargin)}</div>
                </div>
              )}
            </div>
          </SectionCard>
        </>
      )}
    </PremiumSurface>
  );
}
