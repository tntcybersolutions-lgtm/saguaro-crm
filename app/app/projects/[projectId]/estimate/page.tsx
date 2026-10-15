'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Button, DataTable, EmptyState,
  type Column, type StatItem,
} from '@/components/ui/kit';
import { toCents, toDollars, extend, sumCents, addCents } from '@/lib/calc';
import { Package, Ruler, Rows, Receipt, DownloadSimple, Stack, Calculator, Cube, Users, Scales, ChartLineUp, Handshake, Wallet, UsersThree } from '@phosphor-icons/react';
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

type RollupRow = { div: string; name: string; total: number; count: number; budget: number };
type LineRow = EstimateLine & { key: string };

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
    .sort((a, b) => a.div.localeCompare(b.div)) as RollupRow[];
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

  const base = `/app/projects/${projectId}`;
  const crumbs = [
    { label: 'Projects', href: '/app/projects' },
    { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
    { label: 'Estimate' },
  ];
  const varianceColor = (n: number) => (n > 0 ? 'var(--danger)' : 'var(--success)');
  const hasBudget = budgetLineCount > 0;
  const approvedCos = Number(money?.approvedCoCount) || 0;

  if (loading) {
    return (
      <PageShell crumbs={crumbs} title="Estimate" subtitle="From the latest takeoff, rolled up by CSI division.">
        <StatRow items={['Estimate Total', 'Material Cost', 'Labor Cost', 'Est. vs. Budget', 'Implied Margin'].map(label => ({ label, value: '—', sub: 'Loading…' }))} />
        <Card title="CSI Division Rollup" icon={<Stack size={17} />} flush>
          <DataTable<RollupRow> columns={[{ key: 'div', header: 'Div' }, { key: 'name', header: 'Division', primary: true }, { key: 'total', header: 'Estimate', align: 'right' }]} rows={[]} rowKey={r => r.div} loading toolbar={false} />
        </Card>
      </PageShell>
    );
  }

  if (!takeoff) {
    const ctxStats: StatItem[] = ctx ? [
      { label: 'Original Contract', value: fmt0(originalContract), sub: 'What the estimate answers to', icon: <Handshake size={15} />, href: `${base}/contracts` },
      { label: 'Revised Contract', value: fmt0(revisedContract), sub: `${approvedCos} approved CO${approvedCos === 1 ? '' : 's'}`, icon: <Receipt size={15} />, href: `${base}/contracts` },
      { label: 'Project Budget', value: fmt0(budgetOriginal), sub: budgetLineCount > 0 ? `${budgetLineCount} CSI-coded lines` : 'No budget lines yet', icon: <Wallet size={15} />, href: `${base}/budget` },
      { label: 'Bid Packages', value: String(bidPackages.length), sub: awardedPkgs.length > 0 ? `${awardedPkgs.length} awarded · ${fmt0(awardedTotal)}` : 'None awarded yet', icon: <Package size={15} />, href: `${base}/bid-packages` },
      { label: 'Subs on the Job', value: String((ctx?.subs || []).length), sub: 'Ready to price scopes', icon: <UsersThree size={15} />, href: `${base}/subs` },
    ] : [];
    return (
      <PageShell
        crumbs={crumbs}
        title="Estimate"
        subtitle="From the latest takeoff, rolled up by CSI division."
        actions={<Button variant="primary" icon={<Ruler size={15} />} href={`${base}/takeoff`}>Go to Takeoff</Button>}
      >
        {ctx && <StatRow items={ctxStats} />}
        <Card flush>
          <EmptyState
            icon={<Package size={22} />}
            title="No takeoff data yet"
            text={budgetOriginal > 0
              ? `The budget carries ${fmt0(budgetOriginal)} across ${budgetLineCount} CSI line${budgetLineCount === 1 ? '' : 's'}. Run a takeoff and the estimate rolls up against it here.`
              : 'Run a blueprint takeoff and the estimate rolls up by CSI division here.'}
            action={<Button icon={<Ruler size={15} />} href={`${base}/takeoff`}>Go to Takeoff</Button>}
          />
        </Card>
      </PageShell>
    );
  }

  const perSf = takeoff.square_footage > 0 ? takeoff.total_cost / takeoff.square_footage : null;
  const stats: StatItem[] = [
    { label: 'Estimate Total', value: fmt0(takeoff.total_cost), sub: perSf != null ? `${fmt(perSf)} / SF · ${takeoff.square_footage.toLocaleString()} SF` : `${takeoff.materials.length} lines · ${rollup.length} division${rollup.length === 1 ? '' : 's'}`, icon: <Calculator size={15} /> },
    { label: 'Material Cost', value: fmt(takeoff.material_cost), icon: <Cube size={15} /> },
    { label: 'Labor Cost', value: fmt(takeoff.labor_cost), sub: 'Carried outside the division rollup', icon: <Users size={15} /> },
    ...(ctx ? [
      { label: 'Est. vs. Budget', value: budgetOriginal > 0 ? fmtSigned(estBudgetDelta) : '—', tone: budgetOriginal > 0 ? (estBudgetDelta > 0 ? 'bad' : 'good') : 'default', sub: budgetOriginal > 0 ? (estBudgetDelta > 0 ? 'Estimate runs over the budget' : 'Estimate fits inside the budget') : 'Seed the budget to compare', icon: <Scales size={15} />, href: `${base}/budget` } as StatItem,
      { label: 'Implied Margin', value: revisedContract > 0 ? fmt0(impliedMargin) : '—', tone: revisedContract > 0 ? (impliedMargin >= 0 ? 'good' : 'bad') : 'default', sub: revisedContract > 0 ? `${Math.round((impliedMargin / revisedContract) * 100)}% of revised contract` : 'Set the contract to see margin', icon: <ChartLineUp size={15} /> } as StatItem,
    ] : []),
  ];

  const rollupCols: Column<RollupRow>[] = [
    { key: 'div', header: 'Div', width: 64, groupable: false, render: r => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{r.div}</span> },
    {
      key: 'name', header: 'Division', primary: true, phone: 'show',
      render: r => {
        const pct = takeoff.material_cost > 0 ? (r.total / takeoff.material_cost) * 100 : 0;
        return (
          <div style={{ minWidth: 160 }}>
            {r.name}
            <div style={{ marginTop: 5, height: 4, width: '100%', maxWidth: 220, borderRadius: 999, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: Math.min(100, pct) + '%', borderRadius: 999, background: 'var(--chart-1)' }} />
            </div>
          </div>
        );
      },
    },
    { key: 'count', header: 'Items', align: 'right', total: 'sum' },
    { key: 'total', header: 'Estimate', align: 'right', phone: 'show', total: 'sum', format: fmt, render: r => <strong>{fmt(r.total)}</strong> },
    { key: 'pct', header: '% of Materials', align: 'right', accessor: r => (takeoff.material_cost > 0 ? r.total / takeoff.material_cost : 0), render: r => `${(takeoff.material_cost > 0 ? (r.total / takeoff.material_cost) * 100 : 0).toFixed(1)}%` },
  ];
  if (hasBudget) {
    rollupCols.push(
      { key: 'budget', header: 'Budget', align: 'right', accessor: r => (r.budget > 0 ? r.budget : null), total: () => fmt(budgetOriginal), render: r => (r.budget > 0 ? fmt(r.budget) : '—') },
      {
        key: 'variance', header: 'Variance', align: 'right', phone: 'show', accessor: r => (r.budget > 0 ? r.total - r.budget : null),
        total: () => <span style={{ color: varianceColor(matBudgetDelta) }}>{fmtSigned(matBudgetDelta)}</span>,
        render: r => r.budget > 0
          ? <span style={{ fontWeight: 700, color: varianceColor(r.total - r.budget) }}>{fmtSigned(r.total - r.budget)}</span>
          : <span style={{ color: 'var(--text-tertiary)' }}>Not budgeted</span>,
      },
    );
  }

  const lineRows: LineRow[] = takeoff.materials.map((m, i) => ({ ...m, key: String(i) }));
  const lineCols: Column<LineRow>[] = [
    { key: 'csi_code', header: 'CSI Code', width: 110, render: m => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{m.csi_code || '—'}</span> },
    { key: 'description', header: 'Description', primary: true, phone: 'show' },
    { key: 'quantity', header: 'Quantity', align: 'right', render: m => m.quantity.toLocaleString() },
    { key: 'unit', header: 'Unit' },
    { key: 'unit_cost', header: 'Unit Cost', align: 'right', render: m => fmt(m.unit_cost) },
    { key: 'total', header: 'Total', align: 'right', phone: 'show', total: 'sum', format: fmt, render: m => <strong>{fmt(m.total)}</strong> },
  ];

  return (
    <PageShell
      crumbs={crumbs}
      title="Estimate"
      subtitle={`From the latest takeoff — ${takeoff.materials.length} line${takeoff.materials.length === 1 ? '' : 's'} across ${rollup.length} CSI division${rollup.length === 1 ? '' : 's'}.`}
      actions={
        <>
          <Button icon={<DownloadSimple size={15} />} onClick={exportCSV} disabled={exporting}>{exporting ? 'Exporting…' : 'Export CSV'}</Button>
          <Button variant="primary" icon={<Ruler size={15} />} href={`${base}/takeoff`}>Open Takeoff</Button>
        </>
      }
    >
      <StatRow items={stats} />

      {/* Division Rollup — canonical MasterFormat, tied to the budget */}
      {rollup.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Card
            title="CSI Division Rollup"
            icon={<Stack size={17} />}
            subtitle={`Labor of ${fmt(takeoff.labor_cost)} sits outside the rollup — grand total ${fmt(takeoff.total_cost)}.`}
            actions={<Button size="sm" variant="ghost" href={`${base}/budget`}>{hasBudget ? 'Open Budget' : 'Seed the Budget'}</Button>}
            flush
          >
            <DataTable<RollupRow>
              tableId="project-estimate-rollup"
              exportName="estimate-divisions"
              columns={rollupCols}
              rows={rollup}
              rowKey={r => r.div}
              defaultSort={{ key: 'div', dir: 'asc' }}
            />
          </Card>
        </div>
      )}

      <Card title="Line Items" icon={<Rows size={17} />} subtitle={`${takeoff.materials.length} item${takeoff.materials.length === 1 ? '' : 's'}`} flush>
        <DataTable<LineRow>
          tableId="project-estimate-lines"
          exportName="estimate-lines"
          columns={lineCols}
          rows={lineRows}
          rowKey={m => m.key}
          empty={<EmptyState title="No line items on this takeoff" action={<Button href={`${base}/takeoff`}>Open Takeoff</Button>} />}
        />
      </Card>
    </PageShell>
  );
}
