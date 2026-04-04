'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';

const GOLD = '#C8960F', DARK = '#0d1117', RAISED = '#ffffff', BORDER = '#E2E5EA', DIM = '#8fa3c0', TEXT = '#e8edf8';
const GREEN = '#1a8a4a', RED = '#c03030';

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
    showToast('Projection refreshed with latest data');
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' as const, color: DIM }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'cfSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
        Generating cash flow projection...
        <style>{`@keyframes cfSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' as const, color: RED }}>
        {error || 'No data available.'}
        <div style={{ marginTop: 12 }}>
          <button onClick={loadData} style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { project, periods, summary } = data;

  // Chart calculations
  const maxVal = Math.max(
    ...periods.map(p => Math.max(p.receivables, p.payables)),
    1
  );

  const kpis = [
    { label: 'Expected Receivables (30d)', value: fmt(periods[0]?.receivables || 0), color: GREEN },
    { label: 'Scheduled Payables (30d)', value: fmt(periods[0]?.payables || 0), color: RED },
    { label: 'Net Cash Flow (6mo)', value: fmt(summary.net_cash_flow), color: summary.net_cash_flow >= 0 ? GREEN : RED },
    { label: 'Retainage Due', value: fmt(summary.retainage_due), color: GOLD },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.ok ? '#14532d' : '#7f1d1d',
          color: TEXT, padding: '12px 24px', borderRadius: 8,
          border: `1px solid ${toast.ok ? GREEN : RED}`,
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.08)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Danger zone pulse animation */}
      {summary.danger_zone && (
        <style>{`
          @keyframes dangerPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(192,48,48,0.4); }
            50% { box-shadow: 0 0 20px 4px rgba(192,48,48,0.6); }
          }
        `}</style>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: DIM }}>Financial</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: '4px 0 2px' }}>Cash Flow Forecast</h1>
          <div style={{ fontSize: 13, color: DIM }}>{project.name} &middot; Contract: {fmt(project.adjusted_contract)}</div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            background: GOLD, color: '#000', border: 'none', borderRadius: 6,
            padding: '10px 22px', fontWeight: 700, fontSize: 13, cursor: generating ? 'wait' : 'pointer',
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? 'Refreshing...' : 'Generate Projection'}
        </button>
      </div>

      {/* Danger Zone Banner */}
      {summary.danger_zone && (
        <div style={{
          background: 'rgba(192,48,48,0.15)', border: `1px solid ${RED}`, borderRadius: 8,
          padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          animation: 'dangerPulse 2s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 18 }}>!</span>
          <div>
            <div style={{ color: '#ff6b6b', fontWeight: 700, fontSize: 14 }}>Negative Cash Flow Detected</div>
            <div style={{ color: DIM, fontSize: 12 }}>Running balance goes negative in projected periods. Review payment schedules.</div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{
            background: RAISED, borderRadius: 8, padding: '16px 20px',
            border: `1px solid ${BORDER}`,
          }}>
            <div style={{ fontSize: 11, color: DIM, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Cash Flow Chart */}
      <div style={{
        background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`,
        padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>6-Month Cash Flow Projection</div>

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
                    background: `linear-gradient(180deg, ${GREEN}, rgba(26,138,74,0.5))`,
                    transition: 'height 0.4s ease',
                  }} title={`Receivables: ${fmt(period.receivables)}`} />

                  {/* Payables bar */}
                  <div style={{
                    width: 24, height: Math.max(payHeight, 4), borderRadius: '4px 4px 0 0',
                    background: `linear-gradient(180deg, ${RED}, rgba(192,48,48,0.5))`,
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
      </div>

      {/* Detail Table */}
      <div style={{
        background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${BORDER}`,
          fontSize: 14, fontWeight: 700, color: TEXT,
        }}>
          Period Detail
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 1fr 40px',
          padding: '10px 20px', borderBottom: `1px solid ${BORDER}`,
          fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase' as const, letterSpacing: 0.5,
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
                  padding: '14px 20px', borderBottom: `1px solid rgba(38,51,71,0.4)`,
                  cursor: 'pointer', fontSize: 13,
                  background: isDanger ? 'rgba(192,48,48,0.08)' : 'transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { if (!isDanger) e.currentTarget.style.background = 'rgba(212,160,23,0.05)'; }}
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
                <div style={{ textAlign: 'center' as const, color: DIM, fontSize: 16, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  v
                </div>
              </div>

              {/* Expanded line items */}
              {isExpanded && (
                <div style={{
                  background: 'rgba(248,249,251,.97)', borderBottom: `1px solid rgba(38,51,71,0.4)`,
                  padding: '12px 20px 12px 40px',
                }}>
                  {period.line_items.length === 0 ? (
                    <div style={{ fontSize: 12, color: DIM, fontStyle: 'italic' as const }}>No detailed line items for this period.</div>
                  ) : (
                    period.line_items.map((item, j) => (
                      <div key={j} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 0', borderBottom: j < period.line_items.length - 1 ? `1px solid rgba(38,51,71,0.3)` : 'none',
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
                      marginTop: 8, padding: '8px 12px', background: 'rgba(212,160,23,0.1)',
                      borderRadius: 6, border: `1px solid rgba(212,160,23,0.3)`,
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
          padding: '14px 20px', background: 'rgba(212,160,23,0.06)',
          borderTop: `2px solid ${GOLD}`,
          fontSize: 13, fontWeight: 800,
        }}>
          <div style={{ color: GOLD }}>TOTAL</div>
          <div style={{ textAlign: 'right' as const, color: GREEN }}>{fmt(summary.total_receivables)}</div>
          <div style={{ textAlign: 'right' as const, color: RED }}>{fmt(summary.total_payables)}</div>
          <div style={{ textAlign: 'right' as const, color: summary.net_cash_flow >= 0 ? GREEN : RED }}>
            {fmt(summary.net_cash_flow)}
          </div>
          <div style={{ textAlign: 'right' as const, color: TEXT }}>--</div>
          <div />
        </div>
      </div>

      {/* Project context card */}
      <div style={{
        marginTop: 24, background: RAISED, borderRadius: 10, border: `1px solid ${BORDER}`,
        padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Adjusted Contract</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{fmt(project.adjusted_contract)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Billed to Date</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{fmt(project.total_billed)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Remaining to Bill</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{fmt(project.remaining_to_bill)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: DIM, fontWeight: 600, marginBottom: 4 }}>Retainage Held ({project.retainage_pct}%)</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{fmt(project.total_retainage_held)}</div>
        </div>
      </div>
    </div>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 40, textAlign: 'center' as const, color: DIM }}>
        Loading cash flow data...
      </div>
    }>
      <CashFlowContent />
    </Suspense>
  );
}
