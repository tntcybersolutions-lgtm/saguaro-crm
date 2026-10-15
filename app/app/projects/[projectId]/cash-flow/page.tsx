'use client';
/**
 * Cash Flow — the six-month forecast: receivables against payables per month,
 * the running balance, retainage release, and the live contract / budget money.
 *
 * Reads  GET /api/projects/:id/cash-flow   (projection: project, periods, summary)
 *        /api/project-context              (live contract + budget snapshot)
 * The projection's own $0 figures defer to the live snapshot, so the screen
 * never shows dead $0 space on a job that has real contract money.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import {
  PageShell, StatRow, Button, Card, DataTable, DetailList, EmptyState, Callout, ItemList, ItemRow,
  Toast, useToast, type Column, type StatItem,
} from '@/components/ui/kit';
import {
  ChartLineUp, ChartBar, Wallet, Buildings, WarningCircle, ArrowsClockwise,
  ArrowDownLeft, ArrowUpRight, Scales, CalendarBlank, HandCoins,
} from '@phosphor-icons/react';

const GREEN = 'var(--success)', RED = 'var(--danger)', DIM = 'var(--text-secondary)';

const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000).toFixed(0) + 'K';
  return fmt(n);
};
const fmt0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const money = (n: number, color?: string) => <span style={{ color, fontWeight: 600 }}>{fmt(n)}</span>;

interface LineItem {
  type: 'receivable' | 'payable' | 'retainage';
  label: string;
  amount: number;
}

interface Period {
  month: string;
  start: string;
  end: string;
  receivables: number;
  payables: number;
  retainage_release: number;
  net: number;
  running_balance: number;
  line_items: LineItem[];
}

interface Summary {
  total_receivables: number;
  total_payables: number;
  net_cash_flow: number;
  retainage_due: number;
  danger_zone: boolean;
}

interface ProjectInfo {
  id: string;
  name: string;
  contract_amount: number;
  adjusted_contract: number;
  retainage_pct: number;
  total_billed: number;
  remaining_to_bill: number;
  total_retainage_held: number;
}

interface CashFlowData {
  project: ProjectInfo;
  periods: Period[];
  summary: Summary;
}

type PeriodRow = Period & { idx: number };

function CashFlowContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const { toast, show } = useToast(4000);

  // Live project money snapshot (/api/project-context) — so this screen never
  // renders $0 dead space when the project has real contract money.
  const { ctx } = useProjectContext(projectId);

  const m = ctx?.money;
  const budget = ctx?.budget;
  const ctxOriginal = Number(m?.originalContract) || 0;
  const ctxCoTotal = Number(m?.approvedCoTotal) || 0;
  const ctxRevised = Number(m?.revisedContract) || (ctxOriginal + ctxCoTotal);
  const ctxBilled = Number(m?.billedToDate) || 0;
  const ctxPaid = Number(m?.paidToDate) || 0;
  const ctxOutstanding = Math.max(0, ctxBilled - ctxPaid);
  const budgetOriginal = Number(budget?.original) || 0;
  const budgetCommitted = Number(budget?.committed) || 0;
  const budgetActual = Number(budget?.actual) || 0;

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/cash-flow`);
      if (!r.ok) throw new Error('Failed to load');
      const d = await r.json();
      // DB numerics can round-trip as strings — coerce every money field once
      // on ingest so chart math and totals never string-concat dollars.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const num = (x: any) => Number(x) || 0;
      if (d && d.project) {
        d.project = { ...d.project, contract_amount: num(d.project.contract_amount), adjusted_contract: num(d.project.adjusted_contract), retainage_pct: num(d.project.retainage_pct), total_billed: num(d.project.total_billed), remaining_to_bill: num(d.project.remaining_to_bill), total_retainage_held: num(d.project.total_retainage_held) };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        d.periods = (d.periods || []).map((per: any) => ({ ...per, receivables: num(per.receivables), payables: num(per.payables), retainage_release: num(per.retainage_release), net: num(per.net), running_balance: num(per.running_balance), line_items: (per.line_items || []).map((li: any) => ({ ...li, amount: num(li.amount) })) }));
        d.summary = { ...(d.summary || {}), total_receivables: num(d.summary?.total_receivables), total_payables: num(d.summary?.total_payables), net_cash_flow: num(d.summary?.net_cash_flow), retainage_due: num(d.summary?.retainage_due), danger_zone: !!d.summary?.danger_zone };
      }
      setData(d);
    } catch (e) {
      console.error('[cash-flow] load failed', e);
      setError('Unable to generate cash flow projection.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleGenerate() {
    setGenerating(true);
    await loadData();
    setGenerating(false);
    show('Projection refreshed with the latest data.');
  }

  const base = `/app/projects/${projectId}`;
  const crumbs = [
    { label: 'Projects', href: '/app/projects' },
    { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
    { label: 'Cash flow' },
  ];
  const refresh = (
    <Button variant="primary" icon={<ArrowsClockwise size={15} weight="bold" />} onClick={handleGenerate} disabled={generating || loading}>
      {generating ? 'Refreshing…' : 'Generate projection'}
    </Button>
  );

  if (loading && !data) {
    return (
      <PageShell crumbs={crumbs} title="Cash flow" subtitle="Six-month forecast of receivables, payables and retainage." actions={refresh}>
        <StatRow items={['Net cash flow (6 mo)', 'Receivables (30 days)', 'Payables (30 days)', 'Retainage due'].map((label) => ({ label, value: '—' }))} />
        <ModuleSkeleton hero={false} kpis={0} rows={6} />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell crumbs={crumbs} title="Cash flow" subtitle="Six-month forecast of receivables, payables and retainage." actions={refresh}>
        {ctx && (
          <StatRow items={[
            { label: 'Revised contract', value: fmt0(ctxRevised), sub: (Number(m?.approvedCoCount) || 0) + ' approved COs', href: `${base}/contracts`, icon: <Buildings size={15} /> },
            { label: 'Billed to date', value: fmt0(ctxBilled), sub: (Number(m?.billedPct) || 0) + '% of revised', icon: <ChartLineUp size={15} /> },
            { label: 'Collected', value: fmt0(ctxPaid), tone: 'good', sub: 'Paid on the contract', icon: <HandCoins size={15} /> },
            { label: 'Outstanding AR', value: fmt0(ctxOutstanding), tone: ctxOutstanding > 0 ? 'default' : 'good', sub: 'Billed, not collected', icon: <Wallet size={15} /> },
          ]} />
        )}
        <EmptyState
          icon={<WarningCircle size={22} />}
          title="Couldn't generate the cash flow"
          text={error || (ctx ? 'The projection did not return. The live contract money above is still current.' : 'No data available.')}
          action={<Button onClick={loadData}>Try again</Button>}
        />
        <Toast message={toast?.message ?? null} tone={toast?.tone} />
      </PageShell>
    );
  }

  const { project, periods, summary } = data;

  // Several projects carry the contract in a different column — when the
  // projection's own numbers are $0, defer to the live ctx.money snapshot.
  const adjContract = (Number(project.adjusted_contract) || 0) > 0 ? Number(project.adjusted_contract) : ctxRevised;
  const billedToDate = (Number(project.total_billed) || 0) > 0 ? Number(project.total_billed) : ctxBilled;
  const remainingToBill = (Number(project.remaining_to_bill) || 0) > 0 ? Number(project.remaining_to_bill) : Math.max(0, adjContract - billedToDate);

  // Chart calculations
  const maxVal = Math.max(
    ...periods.map(p => Math.max(p.receivables, p.payables)),
    1
  );

  // The page's one summary row: the forecast. The live contract money sits in
  // the Budget & collections and Contract position cards below.
  const kpis: StatItem[] = [
    { label: 'Net cash flow (6 mo)', value: fmt(summary.net_cash_flow), sub: summary.danger_zone ? 'Goes negative — review' : 'Incl. retainage release', tone: summary.net_cash_flow >= 0 ? 'good' : 'bad', icon: <ChartLineUp size={15} /> },
    { label: 'Receivables (30 days)', value: fmt(Number(periods[0]?.receivables) || 0), sub: periods[0]?.month, icon: <ArrowDownLeft size={15} /> },
    { label: 'Payables (30 days)', value: fmt(Number(periods[0]?.payables) || 0), sub: periods[0]?.month, icon: <ArrowUpRight size={15} /> },
    { label: 'Retainage due', value: fmt(summary.retainage_due), sub: 'Held at ' + (Number(project.retainage_pct) || 0) + '%', icon: <Scales size={15} /> },
  ];

  const rows: PeriodRow[] = periods.map((p, idx) => ({ ...p, idx }));
  const columns: Column<PeriodRow>[] = [
    { key: 'month', header: 'Period', primary: true, sortable: false, render: p => <span style={{ color: p.running_balance < 0 ? RED : undefined }}>{p.month}</span> },
    { key: 'receivables', header: 'Receivables', align: 'right', sortable: false, format: fmt, total: () => money(summary.total_receivables, GREEN), render: p => money(p.receivables, GREEN) },
    { key: 'payables', header: 'Payables', align: 'right', sortable: false, format: fmt, total: () => money(summary.total_payables, RED), render: p => money(p.payables, RED) },
    { key: 'net', header: 'Net', align: 'right', sortable: false, phone: 'show', format: fmt, total: () => money(summary.net_cash_flow, summary.net_cash_flow >= 0 ? GREEN : RED), render: p => <strong style={{ color: p.net >= 0 ? GREEN : RED }}>{fmt(p.net)}</strong> },
    { key: 'running_balance', header: 'Running balance', align: 'right', sortable: false, phone: 'show', total: () => '—', render: p => <strong style={{ color: p.running_balance < 0 ? RED : undefined }}>{fmt(p.running_balance)}</strong> },
  ];
  const open = expandedRow != null ? periods[expandedRow] : null;
  const variance = budgetOriginal - budgetActual;

  return (
    <PageShell
      crumbs={crumbs}
      title="Cash flow"
      subtitle={<>{project.name} · Contract {fmt(adjContract)}{ctxCoTotal !== 0 ? <> · {Number(m?.approvedCoCount) || 0} approved COs</> : null}</>}
      actions={refresh}
    >
      <StatRow items={kpis} />

      {summary.danger_zone && (
        <Callout tone="danger" icon={<WarningCircle size={18} weight="fill" />} title="Cash goes negative" text="The running balance drops below zero in a projected month. Review payment schedules." />
      )}

      {/* Cash flow chart */}
      <Card title="6-month projection" icon={<ChartBar size={18} />}>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: DIM, flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GREEN, marginRight: 6, verticalAlign: 'middle' }} />Receivables</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: RED, marginRight: 6, verticalAlign: 'middle' }} />Payables</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--info)', marginRight: 6, verticalAlign: 'middle' }} />Net</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 200, paddingBottom: 30, position: 'relative', overflowX: 'auto' }}>
          {/* Zero line */}
          <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, height: 1, background: 'var(--border-default)' }} />

          {periods.map((period, i) => {
            const recHeight = maxVal > 0 ? (period.receivables / maxVal) * 150 : 0;
            const payHeight = maxVal > 0 ? (period.payables / maxVal) * 150 : 0;
            const isNegNet = period.net < 0;
            const isDanger = period.running_balance < 0;

            return (
              <button
                key={i}
                type="button"
                onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                aria-pressed={expandedRow === i}
                aria-label={`${period.month}: net ${fmt(period.net)}`}
                style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
              >
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 160 }}>
                  <div style={{ width: 24, height: Math.max(recHeight, 4), borderRadius: '4px 4px 0 0', background: `linear-gradient(180deg, ${GREEN}, color-mix(in srgb, ${GREEN} 45%, transparent))`, transition: 'height 0.4s ease' }} title={`Receivables: ${fmt(period.receivables)}`} />
                  <div style={{ width: 24, height: Math.max(payHeight, 4), borderRadius: '4px 4px 0 0', background: `linear-gradient(180deg, ${RED}, color-mix(in srgb, ${RED} 45%, transparent))`, transition: 'height 0.4s ease' }} title={`Payables: ${fmt(period.payables)}`} />
                </div>
                <div style={{ width: 52, height: 4, borderRadius: 2, marginTop: 4, background: isNegNet ? RED : 'var(--info)', boxShadow: isDanger ? `0 0 8px ${RED}` : 'none' }} title={`Net: ${fmt(period.net)}`} />
                <div style={{ fontSize: 12, color: isDanger ? RED : expandedRow === i ? 'var(--text-primary)' : DIM, fontWeight: isDanger || expandedRow === i ? 700 : 500, marginTop: 6, textAlign: 'center' }}>{period.month}</div>
                <div style={{ fontSize: 12, color: DIM, textAlign: 'center', marginTop: 2 }}>{fmtK(period.net)}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Period detail — tap a month for its line items */}
      <DataTable<PeriodRow>
        tableId="project-cash-flow"
        exportName="cash-flow"
        columns={columns}
        rows={rows}
        loading={loading}
        rowKey={p => p.idx}
        rowStyle={p => (p.running_balance < 0 ? { background: 'color-mix(in srgb, var(--danger) 8%, transparent)' } : undefined)}
        isSelected={p => p.idx === expandedRow}
        onRowClick={p => setExpandedRow(expandedRow === p.idx ? null : p.idx)}
        empty={<EmptyState icon={<CalendarBlank size={22} />} title="No projected periods" text="Bill a pay application or schedule a commitment payment and the months fill in." />}
      />

      {open && (
        <Card
          title={`${open.month} detail`}
          subtitle={`Net ${fmt(open.net)} · running balance ${fmt(open.running_balance)}`}
          icon={<CalendarBlank size={18} />}
          actions={<Button size="sm" variant="ghost" onClick={() => setExpandedRow(null)}>Close</Button>}
          flush
        >
          {open.line_items.length === 0 && !(open.retainage_release > 0) ? (
            <EmptyState title="No detailed line items for this period" />
          ) : (
            <ItemList>
              {open.line_items.map((item, j) => (
                <ItemRow
                  key={j}
                  icon={item.type === 'receivable' ? <ArrowDownLeft size={16} /> : item.type === 'retainage' ? <Scales size={16} /> : <ArrowUpRight size={16} />}
                  tone={item.type === 'receivable' ? 'success' : item.type === 'retainage' ? 'info' : 'danger'}
                  title={item.label}
                  value={<span style={{ color: item.amount >= 0 ? GREEN : RED, fontWeight: 700 }}>{item.amount >= 0 ? '+' : ''}{fmt(item.amount)}</span>}
                />
              ))}
              {open.retainage_release > 0 && (
                <ItemRow icon={<Scales size={16} />} tone="info" title="Retainage release scheduled" value={<strong>{fmt(open.retainage_release)}</strong>} />
              )}
            </ItemList>
          )}
        </Card>
      )}

      {/* Live budget + collections — committed vs actual from the project snapshot */}
      {ctx && (
        <Card title="Budget & collections" icon={<Wallet size={18} />} subtitle={`${Number(budget?.lineCount) || 0} budget lines — committed vs actual, plus what the owner still owes`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0 40px' }}>
            <DetailList items={[
              ['Budget (original)', fmt0(budgetOriginal)],
              ['Committed', fmt0(budgetCommitted)],
              ['Actual cost to date', <span key="a" style={{ color: budgetCommitted > 0 && budgetActual > budgetCommitted ? RED : undefined }}>{fmt0(budgetActual)}</span>],
              ['Budget variance', <strong key="v" style={{ color: variance >= 0 ? GREEN : RED }}>{(variance >= 0 ? '+' : '-') + fmt0(Math.abs(variance))}</strong>],
            ]} />
            <DetailList items={[
              ['Billed to date', `${fmt0(ctxBilled)} (${Number(m?.billedPct) || 0}%)`],
              ['Collected', <span key="c" style={{ color: GREEN }}>{fmt0(ctxPaid)}</span>],
              ['Outstanding AR', <strong key="o" style={{ color: ctxOutstanding > 0 ? undefined : GREEN }}>{fmt0(ctxOutstanding)}</strong>],
              ['Pay applications', `${Number(m?.payAppCount) || 0}${m?.lastPayApp ? ' — last #' + m.lastPayApp.appNumber : ''}`],
            ]} />
          </div>
        </Card>
      )}

      <Card title="Contract position" icon={<Buildings size={18} />}>
        <DetailList items={[
          ['Adjusted contract', fmt(adjContract)],
          ['Billed to date', fmt(billedToDate)],
          ['Remaining to bill', fmt(remainingToBill)],
          [`Retainage held (${project.retainage_pct}%)`, fmt(project.total_retainage_held)],
        ]} />
      </Card>

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense fallback={<ModuleSkeleton kpis={4} rows={6} />}>
      <CashFlowContent />
    </Suspense>
  );
}
