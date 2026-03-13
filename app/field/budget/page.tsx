'use client';
/**
 * Saguaro Field — Budget View
 * Full project budget: summary cards, cost code breakdown, charts, cash flow, drill-down.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';

/* ── Types ─────────────────────────────────────────────── */

interface BudgetSummary {
  original_budget: number;
  approved_changes: number;
  revised_budget: number;
  committed: number;
  spent_to_date: number;
  forecast_at_completion: number;
  variance: number;
}

interface CostCodeLineItem {
  id: string;
  description: string;
  amount: number;
  type: string;
  vendor?: string;
  date?: string;
}

interface CostCode {
  id: string;
  code: string;
  description: string;
  division?: string;
  budget: number;
  committed: number;
  actual: number;
  forecast: number;
  variance: number;
  line_items?: CostCodeLineItem[];
}

interface MonthlyCashFlow {
  month: string;
  budgeted: number;
  actual: number;
}

interface BudgetData {
  summary: BudgetSummary;
  cost_codes: CostCode[];
  cash_flow: MonthlyCashFlow[];
}

type ViewMode = 'overview' | 'drilldown';
type FilterMode = 'all' | 'over' | 'under' | 'warning';

/* ── Helpers ───────────────────────────────────────────── */

function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatUSDFull(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function varianceColor(variance: number, budget: number): string {
  if (budget === 0) return DIM;
  const pctUsed = budget > 0 ? (budget - variance) / budget : 0;
  if (variance < 0) return RED;
  if (pctUsed > 0.9) return AMBER;
  return GREEN;
}

function formatDate(d: string | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Styles ────────────────────────────────────────────── */

const card: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 12 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#0A1628', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 };
const badge = (bg: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${bg}22`, color: bg });
const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '8px 18px', background: active ? GOLD : 'transparent', color: active ? '#000' : DIM, fontWeight: 700, border: `1px solid ${active ? GOLD : BORDER}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, transition: 'all .2s' });
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as const, width: 'auto', minWidth: 140, display: 'inline-block' };
const summaryCard = (borderColor: string): React.CSSProperties => ({ ...card, borderLeft: `3px solid ${borderColor}`, padding: '14px 16px' });
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: TEXT, borderBottom: `1px solid ${BORDER}08` };

/* ── Main Component ────────────────────────────────────── */

function BudgetPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('overview');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [filterDivision, setFilterDivision] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [selectedCostCode, setSelectedCostCode] = useState<CostCode | null>(null);
  const [showChart, setShowChart] = useState(true);

  const fetchBudget = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget`);
      if (!res.ok) throw new Error('Failed to load budget');
      const d = await res.json();
      setData(d);
    } catch {
      setError('Unable to load budget data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);

  if (!projectId) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: RED, fontWeight: 600 }}>No project selected.</p>
        <button onClick={() => router.push('/field')} style={{ padding: '10px 22px', background: GOLD, color: '#000', fontWeight: 700, border: 'none', borderRadius: 10, cursor: 'pointer' }}>Back to Projects</button>
      </div>
    );
  }

  /* ── Filtering cost codes ─────────────────────────────── */

  const costCodes = data?.cost_codes || [];
  const divisions = Array.from(new Set(costCodes.map((c) => c.division).filter(Boolean))) as string[];

  const filteredCodes = costCodes.filter((cc) => {
    if (filterCode && !cc.code.toLowerCase().includes(filterCode.toLowerCase()) && !cc.description.toLowerCase().includes(filterCode.toLowerCase())) return false;
    if (filterDivision && cc.division !== filterDivision) return false;
    if (filter === 'over' && cc.variance >= 0) return false;
    if (filter === 'under' && cc.variance <= 0) return false;
    if (filter === 'warning') {
      const pctUsed = cc.budget > 0 ? cc.actual / cc.budget : 0;
      if (cc.variance < 0) return true;
      if (pctUsed > 0.9) return true;
      return false;
    }
    return true;
  });

  /* ── Drill-down into cost code ────────────────────────── */

  if (view === 'drilldown' && selectedCostCode) {
    const vc = varianceColor(selectedCostCode.variance, selectedCostCode.budget);
    const items = selectedCostCode.line_items || [];

    return (
      <div style={{ padding: '18px 16px', maxWidth: 800, margin: '0 auto' }}>
        <button onClick={() => { setView('overview'); setSelectedCostCode(null); }} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Budget
        </button>

        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: TEXT }}>{selectedCostCode.code}</h1>
        <p style={{ margin: '0 0 16px', color: DIM, fontSize: 14 }}>{selectedCostCode.description}</p>

        {/* Cost code summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
          <div style={summaryCard(BLUE)}>
            <div style={{ fontSize: 11, color: DIM }}>Budget</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{formatUSD(selectedCostCode.budget)}</div>
          </div>
          <div style={summaryCard(GOLD)}>
            <div style={{ fontSize: 11, color: DIM }}>Committed</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{formatUSD(selectedCostCode.committed)}</div>
          </div>
          <div style={summaryCard(AMBER)}>
            <div style={{ fontSize: 11, color: DIM }}>Actual</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{formatUSD(selectedCostCode.actual)}</div>
          </div>
          <div style={summaryCard(GREEN)}>
            <div style={{ fontSize: 11, color: DIM }}>Forecast</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{formatUSD(selectedCostCode.forecast)}</div>
          </div>
          <div style={summaryCard(vc)}>
            <div style={{ fontSize: 11, color: DIM }}>Variance</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: vc }}>{selectedCostCode.variance >= 0 ? '+' : ''}{formatUSD(selectedCostCode.variance)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: DIM }}>Spent vs Budget</span>
            <span style={{ fontSize: 12, color: vc, fontWeight: 600 }}>
              {selectedCostCode.budget > 0 ? formatPct(selectedCostCode.actual / selectedCostCode.budget) : '0%'}
            </span>
          </div>
          <div style={{ height: 10, background: '#0A1628', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, selectedCostCode.budget > 0 ? (selectedCostCode.actual / selectedCostCode.budget) * 100 : 0)}%`, background: vc, borderRadius: 6, transition: 'width .5s' }} />
          </div>
        </div>

        {/* Line items table */}
        <h3 style={{ margin: '16px 0 8px', fontSize: 16, fontWeight: 700, color: TEXT }}>Line Items ({items.length})</h3>
        {items.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: DIM }}>No line items recorded</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0A1628' }}>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Vendor</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.description}</td>
                    <td style={tdStyle}><span style={badge(item.type === 'actual' ? AMBER : item.type === 'committed' ? BLUE : DIM)}>{item.type}</span></td>
                    <td style={tdStyle}>{item.vendor || '\u2014'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatUSDFull(item.amount)}</td>
                    <td style={tdStyle}>{formatDate(item.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ── Main overview ────────────────────────────────────── */

  const summary = data?.summary;
  const cashFlow = data?.cash_flow || [];
  const maxCashFlow = Math.max(...cashFlow.map((cf) => Math.max(cf.budgeted, cf.actual)), 1);

  return (
    <div style={{ padding: '18px 16px', maxWidth: 900, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg>
        Back
      </button>

      <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: TEXT }}>Project Budget</h1>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: DIM }}>Loading budget...</div>}
      {error && <div style={{ ...card, borderColor: RED, color: RED, padding: 12 }}>{error}</div>}

      {!loading && data && summary && (
        <>
          {/* ── Summary Cards ──────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            <div style={summaryCard(BLUE)}>
              <div style={{ fontSize: 11, color: DIM }}>Original Budget</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{formatUSD(summary.original_budget)}</div>
            </div>
            <div style={summaryCard(GOLD)}>
              <div style={{ fontSize: 11, color: DIM }}>Approved Changes</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: summary.approved_changes >= 0 ? GREEN : RED }}>{summary.approved_changes >= 0 ? '+' : ''}{formatUSD(summary.approved_changes)}</div>
            </div>
            <div style={summaryCard(GOLD)}>
              <div style={{ fontSize: 11, color: DIM }}>Revised Budget</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{formatUSD(summary.revised_budget)}</div>
            </div>
            <div style={summaryCard(BLUE)}>
              <div style={{ fontSize: 11, color: DIM }}>Committed</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{formatUSD(summary.committed)}</div>
            </div>
            <div style={summaryCard(AMBER)}>
              <div style={{ fontSize: 11, color: DIM }}>Spent to Date</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{formatUSD(summary.spent_to_date)}</div>
            </div>
            <div style={summaryCard(GREEN)}>
              <div style={{ fontSize: 11, color: DIM }}>Forecast at Completion</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{formatUSD(summary.forecast_at_completion)}</div>
            </div>
            <div style={summaryCard(summary.variance >= 0 ? GREEN : RED)}>
              <div style={{ fontSize: 11, color: DIM }}>Variance</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: summary.variance >= 0 ? GREEN : RED }}>{summary.variance >= 0 ? '+' : ''}{formatUSD(summary.variance)}</div>
            </div>
          </div>

          {/* ── Budget vs Actual Chart (pure CSS bars) ──── */}
          <div style={{ ...card, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>Budget vs Actual</h2>
              <button onClick={() => setShowChart(!showChart)} style={{ background: 'none', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
                {showChart ? 'Hide' : 'Show'}
              </button>
            </div>
            {showChart && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredCodes.slice(0, 15).map((cc) => {
                  const maxVal = Math.max(cc.budget, cc.actual, cc.forecast, 1);
                  const budgetPct = (cc.budget / maxVal) * 100;
                  const actualPct = (cc.actual / maxVal) * 100;
                  const vc = varianceColor(cc.variance, cc.budget);
                  return (
                    <div key={cc.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: TEXT, fontWeight: 600 }}>{cc.code}</span>
                        <span style={{ color: vc, fontWeight: 600 }}>{cc.variance >= 0 ? '+' : ''}{formatUSD(cc.variance)}</span>
                      </div>
                      <div style={{ position: 'relative', height: 20, background: '#0A1628', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, height: '50%', width: `${budgetPct}%`, background: BLUE, borderRadius: '6px 6px 0 0', opacity: 0.7, transition: 'width .5s' }} />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, height: '50%', width: `${actualPct}%`, background: vc, borderRadius: '0 0 6px 6px', transition: 'width .5s' }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: DIM, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: BLUE, opacity: 0.7 }} /> Budget</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: GREEN }} /> Actual (under)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: RED }} /> Actual (over)</div>
                </div>
              </div>
            )}
          </div>

          {/* ── Cash Flow Section ──────────────────────────── */}
          {cashFlow.length > 0 && (
            <div style={{ ...card, marginBottom: 18 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: TEXT }}>Monthly Cash Flow</h2>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, paddingBottom: 24, overflowX: 'auto' }}>
                {cashFlow.map((cf) => {
                  const bH = (cf.budgeted / maxCashFlow) * 120;
                  const aH = (cf.actual / maxCashFlow) * 120;
                  return (
                    <div key={cf.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 40, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                        <div style={{ width: 14, height: bH, background: `${BLUE}88`, borderRadius: '4px 4px 0 0', transition: 'height .5s' }} title={`Budget: ${formatUSD(cf.budgeted)}`} />
                        <div style={{ width: 14, height: aH, background: cf.actual > cf.budgeted ? RED : GREEN, borderRadius: '4px 4px 0 0', transition: 'height .5s' }} title={`Actual: ${formatUSD(cf.actual)}`} />
                      </div>
                      <div style={{ fontSize: 10, color: DIM, marginTop: 4, whiteSpace: 'nowrap' }}>{cf.month}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: DIM, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: `${BLUE}88` }} /> Budgeted</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: GREEN }} /> Actual</div>
              </div>
            </div>
          )}

          {/* ── Filters ────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT, marginRight: 8 }}>Cost Codes</h2>
            <button onClick={() => setFilter('all')} style={tabStyle(filter === 'all')}>All</button>
            <button onClick={() => setFilter('over')} style={tabStyle(filter === 'over')}>Over Budget</button>
            <button onClick={() => setFilter('under')} style={tabStyle(filter === 'under')}>Under Budget</button>
            <button onClick={() => setFilter('warning')} style={tabStyle(filter === 'warning')}>Warnings</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input style={{ ...inputStyle, width: 200 }} placeholder="Search code or description..." value={filterCode} onChange={(e) => setFilterCode(e.target.value)} />
            {divisions.length > 0 && (
              <select style={selectStyle} value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}>
                <option value="">All Divisions</option>
                {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>

          {/* ── Cost Code Table ─────────────────────────────── */}
          {filteredCodes.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: DIM }}>No cost codes match filters</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: RAISED, borderRadius: 14, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: '#0A1628' }}>
                    <th style={thStyle}>Code</th>
                    <th style={thStyle}>Description</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Budget</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Committed</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actual</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Forecast</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Variance</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((cc) => {
                    const vc = varianceColor(cc.variance, cc.budget);
                    const pctUsed = cc.budget > 0 ? cc.actual / cc.budget : 0;
                    return (
                      <tr key={cc.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedCostCode(cc); setView('drilldown'); }}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap' }}>{cc.code}</td>
                        <td style={tdStyle}>{cc.description}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatUSD(cc.budget)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatUSD(cc.committed)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatUSD(cc.actual)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatUSD(cc.forecast)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: vc, fontVariantNumeric: 'tabular-nums' }}>
                          {cc.variance >= 0 ? '+' : ''}{formatUSD(cc.variance)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ width: 60, margin: '0 auto' }}>
                            <div style={{ height: 6, background: '#0A1628', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, pctUsed * 100)}%`, background: vc, borderRadius: 4, transition: 'width .4s' }} />
                            </div>
                            <div style={{ fontSize: 10, color: vc, marginTop: 2, fontWeight: 600 }}>{formatPct(pctUsed)}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr style={{ background: '#0A1628' }}>
                    <td style={{ ...tdStyle, fontWeight: 800, color: TEXT }} colSpan={2}>TOTALS</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{formatUSD(filteredCodes.reduce((s, c) => s + c.budget, 0))}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{formatUSD(filteredCodes.reduce((s, c) => s + c.committed, 0))}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{formatUSD(filteredCodes.reduce((s, c) => s + c.actual, 0))}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{formatUSD(filteredCodes.reduce((s, c) => s + c.forecast, 0))}</td>
                    {(() => {
                      const totalVar = filteredCodes.reduce((s, c) => s + c.variance, 0);
                      return (
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: totalVar >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
                          {totalVar >= 0 ? '+' : ''}{formatUSD(totalVar)}
                        </td>
                      );
                    })()}
                    <td style={tdStyle} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BudgetPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8BAAC8' }}>Loading budget...</div>}>
      <BudgetPage />
    </Suspense>
  );
}
