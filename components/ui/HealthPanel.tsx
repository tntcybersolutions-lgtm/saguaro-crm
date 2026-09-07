'use client';
import React, { useState } from 'react';
import { WarningOctagon, Warning, Info, CheckCircle, CaretDown, CaretRight, ShieldCheck } from '@phosphor-icons/react';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';

export type PanelSeverity = 'blocker' | 'warn' | 'note';

export interface PanelFinding {
  id?: string;
  severity: PanelSeverity;
  title: string;
  detail: string;
  /** Industry threshold this is measured against, where there is one. */
  threshold?: string;
  amount?: number;
  count?: number;
  passed?: boolean;
}

const SEV: Record<PanelSeverity, { color: string; node: React.ReactNode; label: string }> = {
  blocker: { color: RED, node: <WarningOctagon size={14} weight="fill" />, label: 'Blocker' },
  warn: { color: AMBER, node: <Warning size={14} weight="fill" />, label: 'Watch' },
  note: { color: DIM, node: <Info size={14} weight="fill" />, label: 'Note' },
};

/**
 * A readiness score and the findings behind it.
 *
 * Shared by the estimate, the schedule and the budget, because the shape of the
 * question is the same in all three: this thing totals correctly, but is it
 * actually fit to send, build to, or report against? Keeping one component
 * means the three screens cannot drift into three different vocabularies for
 * the same idea.
 *
 * Passed checks are shown too, folded away. A list that only ever shows
 * failures gives no sense of what was examined, and "12 checks passed" is what
 * makes the two that failed worth reading.
 */
export default function HealthPanel({
  title, score, findings, passed = [], blockers, warnings, summary, footnote, dense,
}: {
  title: string;
  score: number;
  findings: PanelFinding[];
  passed?: PanelFinding[];
  blockers: number;
  warnings: number;
  /** One line under the bar saying what the score means right now. */
  summary?: React.ReactNode;
  footnote?: React.ReactNode;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [showPassed, setShowPassed] = useState(false);

  const color = blockers > 0 ? RED : score >= 90 ? GREEN : score >= 70 ? AMBER : RED;

  return (
    <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
        <ShieldCheck size={17} weight="duotone" color={color} />
        <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>{title}</div>
        <div style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
      </div>

      <div style={{ padding: dense ? '9px 16px 11px' : '10px 16px 12px' }}>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, score))}%`, background: color, borderRadius: 3, transition: 'width .3s' }} />
        </div>
        {summary && <div style={{ fontSize: 11, color: DIM, marginTop: 7, lineHeight: 1.5 }}>{summary}</div>}
        {footnote && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', marginTop: 5, lineHeight: 1.45 }}>{footnote}</div>}
      </div>

      {findings.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'rgba(255,255,255,0.02)', border: 'none', borderTop: '1px solid ' + BORDER, cursor: 'pointer', color: DIM, fontSize: 11, fontWeight: 700, textAlign: 'left' }}
          >
            {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
            {findings.length} finding{findings.length === 1 ? '' : 's'}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {blockers > 0 && <span style={{ color: RED }}>{blockers} blocker{blockers === 1 ? '' : 's'}</span>}
              {warnings > 0 && <span style={{ color: AMBER }}>{warnings} watch</span>}
            </span>
          </button>

          {open && (
            <div style={{ maxHeight: dense ? 300 : 420, overflow: 'auto' }}>
              {findings.map((f, i) => {
                const s = SEV[f.severity];
                return (
                  <div key={f.id ?? i} style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span style={{ color: s.color, flexShrink: 0, marginTop: 1, display: 'flex' }}>{s.node}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>{f.title}</div>
                      <div style={{ fontSize: 11, color: DIM, marginTop: 3, lineHeight: 1.5 }}>{f.detail}</div>
                      {/* Citing the industry threshold matters: arguing with an
                          owner's scheduler is easier against the standard they
                          are already using than against a number we invented. */}
                      {f.threshold && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.34)', marginTop: 4, fontWeight: 600 }}>{f.threshold}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {passed.length > 0 && (
        <>
          <button
            onClick={() => setShowPassed((v) => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', background: 'transparent', border: 'none', borderTop: '1px solid ' + BORDER, cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: 10.5, fontWeight: 700, textAlign: 'left' }}
          >
            {showPassed ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />}
            <CheckCircle size={11} weight="fill" color={GREEN} />
            {passed.length} check{passed.length === 1 ? '' : 's'} passed
          </button>
          {showPassed && (
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {passed.map((f, i) => (
                <div key={f.id ?? i} style={{ padding: '7px 16px 7px 34px', borderTop: '1px solid rgba(255,255,255,0.03)', fontSize: 11, color: 'rgba(255,255,255,.45)', lineHeight: 1.45 }}>
                  {f.title}
                  {f.threshold && <span style={{ color: 'rgba(255,255,255,.28)' }}> · {f.threshold}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
