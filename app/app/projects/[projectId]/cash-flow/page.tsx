'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, InsightRow,
  goldButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import {
  ChartLineUp, TrendUp, TrendDown, Scales, Vault, ChartBar, Wallet,
  Table as TableIcon, Buildings, WarningCircle, CaretDown, ArrowsClockwise,
} from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)', DIM = '#D4D4D8', TEXT = '#FFFFFF';
const GREEN = '#2CFF7A', RED = '#FF3B30';

const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000).toFixed(0) + 'K';
  return fmt(n);
};

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

function CashFlowContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Live project money snapshot (/api/project-context) — so this screen never
  // renders $0 dead space when the project has real contract money.
  const { ctx } = useProjectContext(projectId);

  const money = ctx?.money;
  const budget = ctx?.budget;
  const ctxOriginal = Number(money?.originalContract) || 0;
  const ctxCoTotal = Number(money?.approvedCoTotal) || 0;
  const ctxRevised = Number(money?.revisedContract) || (ctxOriginal + ctxCoTotal);
  const ctxBilled = Number(money?.billedToDate) || 0;
  const ctxPaid = Number(money?.paidToDate) || 0;
  const ctxOutstanding = Math.max(0, ctxBilled - ctxPaid);
  const budgetOriginal = Number(budget?.original) || 0;
  const budgetCommitted = Number(budget?.committed) || 0;
  const budgetActual = Number(budget?.actual) || 0;
  const fmt0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/cash-flow`);
      if (!r.ok) throw new Error('Failed to load');
      const d = await r.json();
      // DB numerics can round-trip as strings — coerce every money field once
      // on ingest so chart math and totals never string-concat dollars.
      const num = (x: any) => Number(x) || 0;
      if (d && d.project) {
        d.project = { ...d.project, contract_amount: num(d.project.contract_amount), adjusted_contract: num(d.project.adjusted_contract), retainage_pct: num(d.project.retainage_pct), total_billed: num(d.project.total_billed), remaining_to_bill: num(d.project.remaining_to_bill), total_retainage_held: num(d.project.total_retainage_held) };
        d.periods = (d.periods || []).map((per: any) => ({ ...per, receivables: num(per.receivables), payables: num(per.payables), retainage_release: num(per.retainage_release), net: num(per.net), running_balance: num(per.running_balance), line_items: (per.line_items || []).map((li: any) => ({ ...li, amount: num(li.amount) })) }));
        d.summary = { ...(d.summary || {}), total_receivables: num(d.summary?.total_receivables), total_payables: num(d.summary?.total_payables), net_cash_flow: num(d.summary?.net_cash_flow), retainage_due: num(d.summary?.retainage_due), danger_zone: !!d.summary?.danger_zone };
      }
      setData(d);
    } catch {
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
    showToast('Projection refreshed with the latest data.');
  }

  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={6} />
      </PremiumSurface>
    );
  }

  if (error || !data) {
    return (
      <PremiumSurface maxWidth={2200}>
        {ctx && (
          <StatStrip items={[
            {href: `/app/projects/${projectId}/contracts`,  label: 'Revised Contract', value: fmt0(ctxRevised), sub: (Number(money?.approvedCoCount) || 0) + ' approved COs' },
            {href: `/app/projects/${projectId}/cash-flow`,  label: 'Billed to Date', value: fmt0(ctxBilled), sub: (Number(money?.billedPct) || 0) + '% of revised' },
            {href: `/app/projects/${projectId}/cash-flow`,  label: 'Collected', value: fmt0(ctxPaid), accent: GREEN, sub: 'Paid on the contract' },
            {href: `/app/projects/${projectId}/cash-flow`,  label: 'Outstanding AR', value: fmt0(ctxOutstanding), accent: ctxOutstanding > 0 ? GOLD : GREEN, sub: 'Billed, not collected' },
          ]} />
        )}
        <SectionCard>
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Couldn't Generate Cash Flow"
            description={error || (ctx ? 'The projection did not return — the live contract money above is still current. Retry to rebuild the 6-month forecast.' : 'No data available.')}
            action={<button onClick={loadData} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
          />
        </SectionCard>
      </PremiumSurface>
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

  const kpis = [
    { label: 'Expected Receivables (30d)', value: fmt(Number(periods[0]?.receivables) || 0), sub: periods[0]?.month, color: GREEN, icon: <TrendUp size={19} weight="duotone" color={GREEN} /> },
    { label: 'Scheduled Payables (30d)', value: fmt(Number(periods[0]?.payables) || 0), sub: periods[0]?.month, color: RED, icon: <TrendDown size={19} weight="duotone" color={RED} /> },
    { label: 'Net Cash Flow (6mo)', value: fmt(summary.net_cash_flow), sub: summary.danger_zone ? 'Goes negative — review' : 'Incl. retainage release', color: summary.net_cash_flow >= 0 ? GREEN : RED, icon: <Scales size={19} weight="duotone" color={summary.net_cash_flow >= 0 ? GREEN : RED} /> },
    { label: 'Retainage Due', value: fmt(summary.retainage_due), sub: 'Held at ' + (Number(project.retainage_pct) || 0) + '%', color: GOLD, icon: <Vault size={19} weight="duotone" color={GOLD} /> },
  ];

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.ok ? '#2CFF7A' : '#FF3B30',
          color: '#fff', padding: '12px 24px', borderRadius: 8,
          border: `1px solid ${toast.ok ? GREEN : RED}`,
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Danger zone pulse animation */}
      {summary.danger_zone && (
        <style>{`
          @keyframes dangerPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.4); }
            50% { box-shadow: 0 0 20px 4px rgba(255,59,48,0.6); }
          }
        `}</style>
      )}

      {/* Header */}
      <ModuleHero
        eyebrow="Financial"
        eyebrowIcon={<ChartLineUp size={13} weight="fill" color={GOLD} />}
        title="Cash Flow"
        accent="Forecast"
        subtitle={<>{project.name} &middot; Contract: {fmt(adjContract)}{ctxCoTotal !== 0 ? <> &middot; {Number(money?.approvedCoCount) || 0} approved COs</> : null}</>}
        actions={
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="pmBtn"
            style={{ ...goldButtonStyle, cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.6 : 1 }}
          >
            <ArrowsClockwise size={15} weight="bold" />
            {generating ? 'Refreshing…' : 'Generate Projection'}
          </button>
        }
      />

      {/* Live money strip — what the system already knows about this project */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/contracts`,  label: 'Revised Contract', value: fmt0(ctxRevised), sub: `${Number(money?.approvedCoCount) || 0} approved CO${(Number(money?.approvedCoCount) || 0) === 1 ? '' : 's'}` },
          {href: `/app/projects/${projectId}/cash-flow`,  label: 'Billed to Date', value: fmt0(ctxBilled), sub: `${Number(money?.billedPct) || 0}% of revised` },
          {href: `/app/projects/${projectId}/cash-flow`,  label: 'Collected', value: fmt0(ctxPaid), accent: GREEN, sub: `${Number(money?.payAppCount) || 0} pay app${(Number(money?.payAppCount) || 0) === 1 ? '' : 's'}` },
          {href: `/app/projects/${projectId}/cash-flow`,  label: 'Outstanding AR', value: fmt0(ctxOutstanding), accent: ctxOutstanding > 0 ? GOLD : GREEN, sub: 'Billed, not yet collected' },
          {href: `/app/projects/${projectId}/cash-flow`,  label: 'Committed', value: fmt0(budgetCommitted), sub: budgetOriginal > 0 ? `Of ${fmt0(budgetOriginal)} budget` : 'No budget lines yet' },
          {href: `/app/projects/${projectId}/cash-flow`,  label: 'Cost to Date', value: fmt0(budgetActual), accent: budgetCommitted > 0 && budgetActual > budgetCommitted ? RED : undefined, sub: budgetCommitted > 0 ? `${Math.round((budgetActual / budgetCommitted) * 100)}% of committed` : 'From approved bills' },
        ]} />
      )}

      {/* Danger Zone Banner */}
      {summary.danger_zone && (
        <div style={{
          background: 'rgba(255,59,48,0.12)', border: `1px solid ${RED}`, borderRadius: 12,
          padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
          animation: 'dangerPulse 2s ease-in-out infinite',
        }}>
          <WarningCircle size={22} weight="fill" color="#ff6b6b" />
          <div>
            <div style={{ color: '#ff6b6b', fontWeight: 700, fontSize: 14 }}>Negative Cash Flow Detected</div>
            <div style={{ color: DIM, fontSize: 12 }}>Running balance goes negative in projected periods. Review payment schedules.</div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {kpis.map((kpi, i) => (
          <StatCard
            key={i}
            icon={kpi.icon}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
            accent={kpi.color}
            delay={0.04 * i}
           href={`/app/projects/${projectId}/cash-flow`}/>
        ))}
      </div>

      {/* Cash Flow Chart */}
      <SectionCard flat
        title="6-Month Cash Flow Projection"
        icon={<ChartBar size={17} weight="duotone" color={GOLD} />}
        style={{ marginBottom: 24 }}
      >
        {/* Chart legend */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 11, color: DIM }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GREEN, marginRight: 6, verticalAlign: 'middle' }} />Receivables</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: RED, marginRight: 6, verticalAlign: 'middle' }} />Payables</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GOLD, marginRight: 6, verticalAlign: 'middle' }} />Net</span>
        </div>

        {/* Bars */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 200, paddingBottom: 30, position: 'relative' as const }}>
          {/* Zero line */}
          <div style={{
            position: 'absolute' as const, bottom: 30, left: 0, right: 0,
            height: 1, background: BORDER,
          }} />

          {periods.map((period, i) => {
            const recHeight = maxVal > 0 ? (period.receivables / maxVal) * 150 : 0;
            const payHeight = maxVal > 0 ? (period.payables / maxVal) * 150 : 0;
            const netPct = maxVal > 0 ? (Math.abs(period.net) / maxVal) * 150 : 0;
            const isNegNet = period.net < 0;
            const isDanger = period.running_balance < 0;

            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', position: 'relative' as const }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 160 }}>
                  {/* Receivables bar */}
                  <div style={{
                    width: 24, height: Math.max(recHeight, 4), borderRadius: '4px 4px 0 0',
                    background: `linear-gradient(180deg, ${GREEN}, rgba(44,255,122,0.45))`,
                    transition: 'height 0.4s ease',
                  }} title={`Receivables: ${fmt(period.receivables)}`} />

                  {/* Payables bar */}
                  <div style={{
                    width: 24, height: Math.max(payHeight, 4), borderRadius: '4px 4px 0 0',
                    background: `linear-gradient(180deg, ${RED}, rgba(255,59,48,0.45))`,
                    transition: 'height 0.4s ease',
                  }} title={`Payables: ${fmt(period.payables)}`} />
                </div>

                {/* Net indicator */}
                <div style={{
                  width: 52, height: 4, borderRadius: 2, marginTop: 4,
                  background: isNegNet ? RED : GOLD,
                  boxShadow: isDanger ? `0 0 8px ${RED}` : 'none',
                }} title={`Net: ${fmt(period.net)}`} />

                {/* Month label */}
                <div style={{
                  fontSize: 10, color: isDanger ? '#ff6b6b' : DIM, fontWeight: isDanger ? 700 : 500,
                  marginTop: 6, textAlign: 'center' as const,
                }}>
                  {period.month}
                </div>

                {/* Amount labels */}
                <div style={{ fontSize: 9, color: DIM, textAlign: 'center' as const, marginTop: 2 }}>
                  {fmtK(period.net)}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Detail Table */}
      <SectionCard
        title="Period Detail"
        icon={<TableIcon size={17} weight="duotone" color={GOLD} />}
        flush
        style={{ marginBottom: 24 }}
      >
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 1fr 40px',
          padding: '10px 20px', borderBottom: `1px solid ${BORDER}`,
          fontSize: 11, fontWeight: 700, color: DIM,
        }}>
          <div>Period</div>
          <div style={{ textAlign: 'right' as const }}>Receivables</div>
          <div style={{ textAlign: 'right' as const }}>Payables</div>
          <div style={{ textAlign: 'right' as const }}>Net</div>
          <div style={{ textAlign: 'right' as const }}>Running Balance</div>
          <div />
        </div>

        {/* Table rows */}
        {periods.map((period, i) => {
          const isExpanded = expandedRow === i;
          const isDanger = period.running_balance < 0;

          return (
            <React.Fragment key={i}>
              <div
                onClick={() => setExpandedRow(isExpanded ? null : i)}
                style={{
                  display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 1fr 40px',
                  padding: '14px 20px', borderBottom: `1px solid rgba(255,255,255,0.08)`,
                  cursor: 'pointer', fontSize: 13,
                  background: isDanger ? 'rgba(255,59,48,0.08)' : 'transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { if (!isDanger) e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary) 5%, transparent)'; }}
                onMouseLeave={(e) => { if (!isDanger) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ color: TEXT, fontWeight: 600 }}>{period.month}</div>
                <div style={{ textAlign: 'right' as const, color: GREEN, fontWeight: 600 }}>{fmt(period.receivables)}</div>
                <div style={{ textAlign: 'right' as const, color: RED, fontWeight: 600 }}>{fmt(period.payables)}</div>
                <div style={{
                  textAlign: 'right' as const, fontWeight: 700,
                  color: period.net >= 0 ? GREEN : RED,
                }}>
                  {fmt(period.net)}
                </div>
                <div style={{
                  textAlign: 'right' as const, fontWeight: 700,
                  color: isDanger ? '#ff6b6b' : TEXT,
                }}>
                  {fmt(period.running_balance)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <CaretDown size={14} weight="bold" />
                </div>
              </div>

              {/* Expanded line items */}
              {isExpanded && (
                <div style={{
                  background: 'var(--bg-surface-2)', borderBottom: `1px solid rgba(255,255,255,0.08)`,
                  padding: '12px 20px 12px 40px',
                }}>
                  {period.line_items.length === 0 ? (
                    <div style={{ fontSize: 12, color: DIM, fontStyle: 'italic' as const }}>No detailed line items for this period.</div>
                  ) : (
                    period.line_items.map((item, j) => (
                      <div key={j} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 0', borderBottom: j < period.line_items.length - 1 ? `1px solid rgba(255,255,255,0.08)` : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: item.type === 'receivable' ? GREEN : item.type === 'retainage' ? GOLD : RED,
                          }} />
                          <span style={{ fontSize: 12, color: TEXT }}>{item.label}</span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: item.amount >= 0 ? GREEN : RED,
                        }}>
                          {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                        </span>
                      </div>
                    ))
                  )}
                  {period.retainage_release > 0 && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', background: 'var(--brand-primary-08)',
                      borderRadius: 6, border: `1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)`,
                      fontSize: 11, color: GOLD,
                    }}>
                      Retainage release scheduled: {fmt(period.retainage_release)}
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Summary footer */}
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 1fr 40px',
          padding: '14px 20px', background: 'var(--brand-primary-08)',
          borderTop: `2px solid ${GOLD}`,
          fontSize: 13, fontWeight: 800,
        }}>
          <div style={{ color: GOLD }}>Total</div>
          <div style={{ textAlign: 'right' as const, color: GREEN }}>{fmt(summary.total_receivables)}</div>
          <div style={{ textAlign: 'right' as const, color: RED }}>{fmt(summary.total_payables)}</div>
          <div style={{ textAlign: 'right' as const, color: summary.net_cash_flow >= 0 ? GREEN : RED }}>
            {fmt(summary.net_cash_flow)}
          </div>
          <div style={{ textAlign: 'right' as const, color: TEXT }}>—</div>
          <div />
        </div>
      </SectionCard>

      {/* Live budget + collections — committed vs actual from the project snapshot */}
      {ctx && (
        <SectionCard flat title="Budget & Collections" icon={<Wallet size={17} weight="duotone" color={GOLD} />} subtitle={`${Number(budget?.lineCount) || 0} budget lines — committed vs actual, plus what the owner still owes`} style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0 40px' }}>
            <div>
              <InsightRow label="Budget (Original)" value={fmt0(budgetOriginal)} />
              <InsightRow label="Committed" value={fmt0(budgetCommitted)} />
              <InsightRow label="Actual Cost to Date" value={fmt0(budgetActual)} accent={budgetCommitted > 0 && budgetActual > budgetCommitted ? RED : undefined} />
              <InsightRow label="Budget Variance" value={(budgetOriginal - budgetActual >= 0 ? '+' : '-') + fmt0(Math.abs(budgetOriginal - budgetActual))} accent={budgetOriginal - budgetActual >= 0 ? GREEN : RED} strong />
            </div>
            <div>
              <InsightRow label="Billed to Date" value={`${fmt0(ctxBilled)} (${Number(money?.billedPct) || 0}%)`} />
              <InsightRow label="Collected" value={fmt0(ctxPaid)} accent={GREEN} />
              <InsightRow label="Outstanding AR" value={fmt0(ctxOutstanding)} accent={ctxOutstanding > 0 ? GOLD : GREEN} strong />
              <InsightRow label="Pay Applications" value={`${Number(money?.payAppCount) || 0}${money?.lastPayApp ? ' — last #' + money.lastPayApp.appNumber : ''}`} />
            </div>
          </div>
        </SectionCard>
      )}

      {/* Project context card */}
      <SectionCard flat title="Contract Position" icon={<Buildings size={17} weight="duotone" color={GOLD} />}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Adjusted Contract</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{fmt(adjContract)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Billed to Date</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{fmt(billedToDate)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Remaining to Bill</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{fmt(remainingToBill)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Retainage Held ({project.retainage_pct}%)</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{fmt(project.total_retainage_held)}</div>
          </div>
        </div>
      </SectionCard>
    </PremiumSurface>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense fallback={
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={4} rows={6} />
      </PremiumSurface>
    }>
      <CashFlowContent />
    </Suspense>
  );
}
