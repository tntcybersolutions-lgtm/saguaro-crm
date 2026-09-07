'use client';
import React, { useMemo } from 'react';
import { ChartLineUp, Scales, TrendDown, TrendUp } from '@phosphor-icons/react';
import HealthPanel, { type PanelFinding } from '@/components/ui/HealthPanel';
import { assessBudget, type BudgetLine } from '@/lib/budget-health';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C', BLUE = '#6AA9E0';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const signed = (n: number) => (n < 0 ? '−' : '+') + money(Math.abs(n));

/**
 * Where the budget stands, and whether the forecast is honest.
 *
 * The waterfall on the left is the one nobody prints: original, approved
 * changes, revised, committed, spent, forecast — in that order, so a budget
 * that does not foot is visible rather than buried in a variance column.
 *
 * The forecast column is the point. A line forecasting its own budget while
 * three-quarters spent is not a forecast, and the three standard readings of
 * cost at completion diverge violently on a job in trouble — so all three are
 * shown, and the spread between them is reported as what it is: the measure of
 * how little is actually known about the outcome.
 */
export default function BudgetIntelligence({ lines }: { lines: BudgetLine[] }) {
  const h = useMemo(() => assessBudget(lines), [lines]);
  const t = h.totals;

  const findings: PanelFinding[] = h.findings.map((f) => ({
    id: f.id, severity: f.severity, title: f.title, detail: f.detail, amount: f.amount, count: f.count,
  }));

  /* Ordered by exposure — the line that will hurt most, first. */
  const worst = [...h.lines]
    .filter((l) => l.forecast.bac > 0)
    .sort((a, b) => a.forecast.variance - b.forecast.variance)
    .slice(0, 8);

  const steps = [
    { key: 'original', label: 'Original budget', value: t.original, color: 'rgba(255,255,255,0.28)' },
    { key: 'changes', label: 'Approved changes', value: t.approvedChanges, color: BLUE, delta: true },
    { key: 'revised', label: 'Revised budget', value: t.revised, color: GOLD, strong: true },
    { key: 'committed', label: 'Committed', value: t.committed, color: BLUE },
    { key: 'actual', label: 'Spent to date', value: t.actual, color: AMBER },
    { key: 'forecast', label: 'Forecast at completion', value: t.forecast, color: t.variance < 0 ? RED : GREEN, strong: true },
  ];
  const scale = Math.max(t.revised, t.forecast, 1);

  const stat = (label: string, value: React.ReactNode, sub?: string, color?: string) => (
    <div style={{ flex: '1 1 140px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 10, padding: '10px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? TEXT, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {stat('Revised budget', money(t.revised), `${money(t.original)} original`)}
        {stat('Forecast', money(t.forecast), t.variance < 0 ? 'projected overrun' : 'inside budget', t.variance < 0 ? RED : GREEN)}
        {stat('Variance', signed(t.variance), t.variance < 0 ? 'over at completion' : 'under at completion', t.variance < 0 ? RED : GREEN)}
        {stat('Spent', money(t.actual), `${t.percentSpent}% of budget`)}
        {stat('Complete', `${t.percentComplete}%`, 'by earned value')}
        {stat('Left to buy', money(t.uncommitted), 'not yet committed', t.uncommitted > 0 ? AMBER : GREEN)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 400px)', gap: 16, alignItems: 'start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* The waterfall, in order, so a budget that does not foot shows. */}
          <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
              <Scales size={17} weight="duotone" color={GOLD} />
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>Where the Budget Stands</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>
                {t.percentSpent}% spent · {t.percentComplete}% earned
              </div>
            </div>
            <div style={{ padding: '6px 0 10px' }}>
              {steps.map((s, i) => (
                <div key={s.key} style={{ padding: '8px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: s.strong ? 800 : 600, color: s.strong ? TEXT : DIM, minWidth: 150 }}>{s.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: s.strong ? 14 : 12.5, fontWeight: 800, color: s.strong ? (s.color === GOLD ? GOLD : s.color) : TEXT, fontVariantNumeric: 'tabular-nums' }}>
                      {s.delta ? signed(s.value) : money(s.value)}
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (Math.abs(s.value) / scale) * 100)}%`, background: s.color, borderRadius: 2, transition: 'width .25s' }} />
                  </div>
                </div>
              ))}

              {/* Spent against earned is the whole of cost control in one line:
                  money out versus work actually done for it. */}
              {t.revised > 0 && (
                <div style={{ margin: '8px 16px 2px', padding: '10px 12px', borderRadius: 9, background: t.percentSpent > t.percentComplete + 5 ? 'rgba(224,100,78,.10)' : 'rgba(69,179,125,.08)', border: `1px solid ${t.percentSpent > t.percentComplete + 5 ? RED : GREEN}33` }}>
                  <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.55 }}>
                    {t.percentSpent > t.percentComplete + 5 ? (
                      <><strong style={{ color: RED }}>{t.percentSpent}% of the money is gone for {t.percentComplete}% of the work.</strong>{' '}
                        Spend running ahead of progress is the earliest signal there is, and the only one
                        that arrives while there is still budget left to do something about it.</>
                    ) : (
                      <><strong style={{ color: GREEN }}>Spend is tracking progress.</strong>{' '}
                        {t.percentSpent}% spent for {t.percentComplete}% earned.</>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line-by-line forecast */}
          {worst.length > 0 && (
            <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
                <ChartLineUp size={17} weight="duotone" color={GOLD} />
                <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>Forecast by Line</div>
                <div style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>worst exposure first</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Cost code', 'Budget', 'Spent', 'CPI', 'Forecast', 'Variance'].map((c, i) => (
                        <th key={c} style={{ padding: '7px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .4, whiteSpace: 'nowrap' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {worst.map((l, i) => {
                      const f = l.forecast;
                      const over = f.variance < 0;
                      return (
                        <tr key={String(l.cost_code ?? i)} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 12px', color: TEXT }}>
                            <div style={{ fontWeight: 600 }}>{String(l.cost_code ?? '—')}</div>
                            <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>{String(l.description ?? '')}</div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: DIM, fontVariantNumeric: 'tabular-nums' }}>{money(f.bac)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: DIM, fontVariantNumeric: 'tabular-nums' }}>{money(f.ac)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: f.cpi == null ? 'rgba(255,255,255,.25)' : f.cpi < 0.95 ? RED : f.cpi > 1.05 ? GREEN : DIM }}>
                            {f.cpi ?? '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {money(f.recommended)}
                            {/* Which reading was used, because "forecast" with
                                no method behind it is just a number. */}
                            <div style={{ fontSize: 9.5, color: f.forecastable ? 'rgba(255,255,255,.32)' : AMBER, fontWeight: 500 }}>
                              {f.method === 'at-rate' ? 'at current rate'
                                : f.method === 'committed' ? 'committed'
                                : f.method === 'no-progress' ? 'floor — no progress entered'
                                : f.method === 'no-cost' ? 'floor — no cost booked yet'
                                : 'at budget'}
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: over ? RED : GREEN, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {over ? <TrendDown size={10} weight="bold" style={{ marginRight: 3 }} /> : <TrendUp size={10} weight="bold" style={{ marginRight: 3 }} />}
                            {signed(f.variance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <HealthPanel
          title="Budget Integrity"
          score={h.score}
          findings={findings}
          blockers={h.blockers}
          warnings={h.warnings}
          summary={
            h.blockers > 0
              ? <><strong style={{ color: RED }}>{h.blockers} blocker{h.blockers === 1 ? '' : 's'}</strong> — numbers derived from this budget cannot be relied on.</>
              : h.warnings > 0
                ? <><strong style={{ color: AMBER }}>{h.warnings} thing{h.warnings === 1 ? '' : 's'} to resolve</strong> before this reports cleanly.</>
                : lines.length === 0 ? 'No budget lines yet.'
                  : <><strong style={{ color: GREEN }}>The budget foots and the forecast is being maintained.</strong></>
          }
          footnote="Original plus approved changes must equal the revised budget, spend must have a commitment behind it, and a forecast must move off the budget once money is being spent."
        />
      </div>
    </div>
  );
}
