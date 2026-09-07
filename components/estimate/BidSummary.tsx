'use client';
import React, { useState, useMemo } from 'react';
import {
  CurrencyDollar, WarningOctagon, Warning, Info, CaretDown, CaretRight,
  ShieldCheck, TrendUp,
} from '@phosphor-icons/react';
import {
  bidWaterfall, bucketSplit, assessReadiness,
  type BidInputs, type BidFinding,
} from '@/lib/estimate-bid';
import type { GridRow } from '@/lib/estimate-grid';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C', BLUE = '#6AA9E0', PURPLE = '#A78BFA';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const money2 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SEV: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  blocker: { color: RED, icon: <WarningOctagon size={14} weight="fill" />, label: 'Blocker' },
  warn: { color: AMBER, icon: <Warning size={14} weight="fill" />, label: 'Watch' },
  note: { color: DIM, icon: <Info size={14} weight="fill" />, label: 'Note' },
};

/**
 * Cost to bid price, and whether the bid is ready to send.
 *
 * The two things an estimator does after the lines are typed, and the two
 * things estimating software usually leaves them to do in a spreadsheet. The
 * waterfall shows every step and what it earned; the readiness panel says what
 * is still wrong while there is time to fix it.
 */
export default function BidSummary({
  rows, budgetDivisions, onApplyToProposal,
}: {
  rows: GridRow[];
  budgetDivisions?: string[];
  /** Hands the finished bid price up, for the proposal builder. */
  onApplyToProposal?: (bidPrice: number, inputs: BidInputs) => void;
}) {
  const [inputs, setInputs] = useState<BidInputs>({
    contingencyPct: 3, escalationPct: 0, overheadPct: 8,
    profitPct: 6, profitMode: 'markup', insurancePct: 0, bondPct: 0,
  });
  const [openFindings, setOpenFindings] = useState(true);

  const split = useMemo(() => bucketSplit(rows), [rows]);
  const bid = useMemo(() => {
    try { return bidWaterfall(split.total, inputs); } catch { return null; }
  }, [split.total, inputs]);
  const readiness = useMemo(() => assessReadiness(rows, { budgetDivisions }), [rows, budgetDivisions]);

  const set = (k: keyof BidInputs, v: number | string) => setInputs((p) => ({ ...p, [k]: v }));

  const num: React.CSSProperties = {
    width: '100%', padding: '6px 8px', background: '#1c1c1e', border: '1px solid ' + BORDER,
    borderRadius: 6, color: TEXT, fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 };

  const buckets = [
    { key: 'material', label: 'Material', v: split.material, pct: split.materialPct, c: GOLD },
    { key: 'labor', label: 'Labor', v: split.labor, pct: split.laborPct, c: BLUE },
    { key: 'equipment', label: 'Equipment', v: split.equipment, pct: split.equipmentPct, c: PURPLE },
    { key: 'sub', label: 'Subcontract', v: split.sub, pct: split.subPct, c: GREEN },
  ].filter((b) => b.v > 0);

  const scoreColor = readiness.blockers > 0 ? RED : readiness.score >= 90 ? GREEN : readiness.score >= 70 ? AMBER : RED;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 380px)', gap: 16, alignItems: 'start' }}>

      {/* ── the waterfall ─────────────────────────────────────────────── */}
      <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
          <CurrencyDollar size={17} weight="duotone" color={GOLD} />
          <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>Cost to Bid Price</div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>
            {bid?.multiplier ? `${bid.multiplier}× direct cost` : ''}
          </div>
        </div>

        {/* Inputs */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid ' + BORDER, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
          <div><label style={lbl}>Contingency %</label><input type="number" step={0.5} min={0} value={inputs.contingencyPct ?? 0} onChange={(e) => set('contingencyPct', Number(e.target.value))} style={num} /></div>
          <div><label style={lbl}>Escalation %</label><input type="number" step={0.5} min={0} value={inputs.escalationPct ?? 0} onChange={(e) => set('escalationPct', Number(e.target.value))} style={num} /></div>
          <div><label style={lbl}>Overhead %</label><input type="number" step={0.5} min={0} value={inputs.overheadPct ?? 0} onChange={(e) => set('overheadPct', Number(e.target.value))} style={num} /></div>
          <div>
            <label style={lbl}>Profit %</label>
            <input type="number" step={0.5} min={0} max={inputs.profitMode === 'margin' ? 99 : undefined} value={inputs.profitPct ?? 0} onChange={(e) => set('profitPct', Number(e.target.value))} style={num} />
          </div>
          <div><label style={lbl}>Insurance %</label><input type="number" step={0.1} min={0} value={inputs.insurancePct ?? 0} onChange={(e) => set('insurancePct', Number(e.target.value))} style={num} /></div>
          <div><label style={lbl}>Bond %</label><input type="number" step={0.1} min={0} max={99} value={inputs.bondPct ?? 0} onChange={(e) => set('bondPct', Number(e.target.value))} style={num} /></div>
        </div>

        {/* Markup vs margin — the toggle that is worth real money */}
        <div style={{ padding: '9px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: DIM }}>Profit is a</span>
          {(['markup', 'margin'] as const).map((m) => (
            <button key={m} onClick={() => set('profitMode', m)}
              style={{
                padding: '4px 11px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                background: inputs.profitMode === m ? 'rgba(245,158,11,.18)' : 'transparent',
                border: `1px solid ${inputs.profitMode === m ? GOLD + '66' : BORDER}`,
                color: inputs.profitMode === m ? '#FBBF24' : DIM,
              }}>
              {m}
            </button>
          ))}
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.42)', marginLeft: 4 }}>
            {inputs.profitMode === 'markup'
              ? `added to cost — realised margin ${bid?.realisedMarginPct ?? 0}%`
              : 'this share of the bid price'}
          </span>
        </div>

        {/* Steps */}
        {bid ? (
          <div style={{ padding: '4px 0 6px' }}>
            {bid.steps.map((s, i) => {
              const isCost = s.key === 'cost';
              const share = bid.bidPrice > 0 ? (s.runningTotal / bid.bidPrice) * 100 : 0;
              return (
                <div key={s.key} style={{ padding: '8px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: isCost ? 800 : 600, color: isCost ? TEXT : DIM, minWidth: 108 }}>
                      {s.label}{s.pct ? <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 500 }}> {s.pct}%</span> : null}
                    </span>
                    <span style={{ fontSize: 12, color: isCost ? 'transparent' : GOLD, fontVariantNumeric: 'tabular-nums', minWidth: 92, textAlign: 'right' }}>
                      {isCost ? '' : `+ ${money(s.amount)}`}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
                      {money(s.runningTotal)}
                    </span>
                  </div>
                  {/* A bar per step makes the shape of the bid readable at a glance —
                      where a spreadsheet column of numbers never is. */}
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, share)}%`, background: isCost ? 'rgba(255,255,255,0.28)' : GOLD, borderRadius: 2, transition: 'width .25s' }} />
                  </div>
                  {s.note && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.38)', marginTop: 4, lineHeight: 1.45 }}>{s.note}</div>}
                </div>
              );
            })}

            <div style={{ margin: '8px 16px 4px', padding: '12px 14px', borderRadius: 10, background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.30)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: .5 }}>Bid price</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: TEXT, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{money2(bid.bidPrice)}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: DIM }}>Above direct cost</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: GREEN }}>{money(bid.totalAddOns)}</div>
                {bid.realisedMarginPct != null && (
                  <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                    profit is <strong style={{ color: TEXT }}>{bid.realisedMarginPct}%</strong> of the bid
                  </div>
                )}
              </div>
              {onApplyToProposal && (
                <button
                  onClick={() => onApplyToProposal(bid.bidPrice, inputs)}
                  style={{ padding: '9px 15px', background: GOLD, border: 'none', borderRadius: 8, color: '#1a1206', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', width: '100%' }}
                >
                  Build a proposal at {money(bid.bidPrice)}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, fontSize: 12.5, color: RED }}>
            Those percentages cannot produce a price — a margin or bond rate at 100% is unbounded.
          </div>
        )}
      </div>

      {/* ── readiness and distribution ────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
            <ShieldCheck size={17} weight="duotone" color={scoreColor} />
            <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>Bid Readiness</div>
            <div style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
              {readiness.score}
            </div>
          </div>

          <div style={{ padding: '10px 16px 12px' }}>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${readiness.score}%`, background: scoreColor, borderRadius: 3, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 7, lineHeight: 1.5 }}>
              {readiness.blockers > 0
                ? <><strong style={{ color: RED }}>{readiness.blockers} blocker{readiness.blockers === 1 ? '' : 's'}</strong> — the total is wrong, not just untidy.</>
                : readiness.warnings > 0
                  ? <><strong style={{ color: AMBER }}>{readiness.warnings} thing{readiness.warnings === 1 ? '' : 's'} unresolved</strong> — the number stands, but parts of it will move.</>
                  : readiness.totalLines === 0
                    ? 'No lines yet.'
                    : <><strong style={{ color: GREEN }}>Nothing outstanding.</strong> {readiness.pricedLines} of {readiness.totalLines} lines priced.</>}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', marginTop: 5, lineHeight: 1.45 }}>
              The score is the share of the estimate&rsquo;s value nothing is flagged against — not a verdict on whether the bid is right.
            </div>
          </div>

          {readiness.findings.length > 0 && (
            <>
              <button
                onClick={() => setOpenFindings((v) => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'rgba(255,255,255,0.02)', border: 'none', borderTop: '1px solid ' + BORDER, cursor: 'pointer', color: DIM, fontSize: 11, fontWeight: 700, textAlign: 'left' }}
              >
                {openFindings ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
                {readiness.findings.length} finding{readiness.findings.length === 1 ? '' : 's'}
              </button>
              {openFindings && (
                <div style={{ maxHeight: 340, overflow: 'auto' }}>
                  {readiness.findings.map((f: BidFinding, i) => {
                    const s = SEV[f.severity];
                    return (
                      <div key={i} style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <span style={{ color: s.color, flexShrink: 0, marginTop: 1, display: 'flex' }}>{s.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>{f.title}</div>
                          <div style={{ fontSize: 11, color: DIM, marginTop: 3, lineHeight: 1.5 }}>{f.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Where the money is */}
        {split.total > 0 && (
          <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, padding: '13px 16px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
              <TrendUp size={17} weight="duotone" color={GOLD} />
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>Where the Money Is</div>
            </div>
            <div style={{ display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
              {buckets.map((b) => (
                <div key={b.key} title={`${b.label} ${b.pct}%`} style={{ width: `${b.pct}%`, background: b.c }} />
              ))}
            </div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {buckets.map((b) => (
                <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: b.c, flexShrink: 0 }} />
                  <span style={{ color: DIM }}>{b.label}</span>
                  <span style={{ marginLeft: 'auto', color: TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(b.v)}</span>
                  <span style={{ color: DIM, width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.pct}%</span>
                </div>
              ))}
            </div>
            {/* A split that is plainly wrong is easier to see as a proportion
                than as a column of numbers. */}
            {split.laborPct > 0 && split.laborPct < 8 && split.subPct < 40 && (
              <div style={{ fontSize: 10.5, color: AMBER, marginTop: 9, lineHeight: 1.45 }}>
                Labor is only {split.laborPct}% of cost. On self-performed work that usually means a labor
                rate is missing somewhere.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
