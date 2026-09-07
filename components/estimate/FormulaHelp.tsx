'use client';
import React, { useState } from 'react';
import { X, Function as FnIcon, Copy, Check } from '@phosphor-icons/react';
import {
  FUNCTION_HELP, ROW_NAME_HELP, COLUMN_HELP, FORMULA_RECIPES, validateFormula,
} from '@/lib/estimate-formula';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', GREEN = '#45B37D', RED = '#E0644E';

/**
 * The formula reference, and a place to try one before committing it.
 *
 * A formula language nobody can discover is a language nobody uses. The gap
 * between "this grid supports formulas" and "I wrote a formula today" is almost
 * entirely a blank-page problem, so the recipes come first and the function
 * list second — an estimator wants "studs at 16 on centre", not an alphabetical
 * index of maths functions.
 *
 * The scratchpad checks syntax as you type. Finding out a formula is malformed
 * while writing it beats finding out from a red cell three rows later.
 */
export default function FormulaHelp({
  open, onClose, onInsert,
}: {
  open: boolean;
  onClose: () => void;
  /** Drops a formula into the focused cell. */
  onInsert?: (formula: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  if (!open) return null;

  const err = draft.trim() ? validateFormula(draft) : null;

  const copy = (f: string) => {
    void navigator.clipboard?.writeText(f).catch(() => {});
    setCopied(f);
    setTimeout(() => setCopied((c) => (c === f ? null : c)), 1400);
  };

  const chip: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11.5, color: GOLD, background: 'rgba(245,158,11,.10)',
    border: '1px solid rgba(245,158,11,.24)', borderRadius: 5, padding: '1px 6px',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(860px, 100%)', maxHeight: '88vh', background: '#0f0f11', border: '1px solid ' + BORDER, borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}
      >
        <div style={{ padding: '15px 20px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FnIcon size={19} weight="duotone" color={GOLD} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Formulas</div>
              <div style={{ fontSize: 11.5, color: DIM, marginTop: 1 }}>
                Start any number cell with <span style={chip}>=</span> and it becomes arithmetic.
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4 }}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: 18 }}>
          {/* Try it — syntax checked live. */}
          <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 10, padding: 12, marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 7 }}>
              Try one
            </div>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="=CEILING(QTY/16*12,1)+1"
              spellCheck={false}
              style={{
                width: '100%', padding: '9px 11px', background: '#1c1c1e',
                border: `1px solid ${draft.trim() ? (err ? RED : GREEN) : BORDER}`,
                borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
            <div style={{ fontSize: 11.5, marginTop: 6, color: !draft.trim() ? DIM : err ? RED : GREEN }}>
              {!draft.trim()
                ? 'Checked as you type — a malformed formula is caught here, not three rows later.'
                : err
                  ? `${err} — the formula will not evaluate as written.`
                  : 'Well-formed. It will evaluate against whichever row you put it on.'}
            </div>
            {draft.trim() && !err && onInsert && (
              <button
                onClick={() => { onInsert(draft.trim()); onClose(); }}
                style={{ marginTop: 9, padding: '6px 12px', background: GOLD, border: 'none', borderRadius: 6, color: '#1a1206', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
              >
                Put it in the selected cell
              </button>
            )}
          </div>

          {/* Recipes first — an estimator wants the job, not an index. */}
          <Section title="Recipes">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
              {FORMULA_RECIPES.map((r) => (
                <div key={r.label} style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 9, padding: '9px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{r.label}</span>
                    <button
                      onClick={() => copy(r.formula)}
                      title="Copy"
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: copied === r.formula ? GREEN : 'rgba(255,255,255,.35)', display: 'flex' }}
                    >
                      {copied === r.formula ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                    </button>
                  </div>
                  <button
                    onClick={() => setDraft(r.formula)}
                    style={{ ...chip, display: 'block', width: '100%', textAlign: 'left', marginTop: 5, cursor: 'pointer' }}
                  >
                    {r.formula}
                  </button>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 5, lineHeight: 1.45 }}>{r.what}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Named references — the reason to use this grid over Excel. */}
          <Section title="This row">
            <div style={{ fontSize: 11.5, color: DIM, marginBottom: 8, lineHeight: 1.5 }}>
              These name a field on the row the formula sits on, so they keep working when rows are
              sorted, inserted or deleted. A position like <span style={chip}>C5</span> does not.
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {ROW_NAME_HELP.map((n) => (
                <div key={n.name} style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, padding: '6px 9px' }}>
                  <span style={chip}>{n.name}</span>
                  <span style={{ fontSize: 11, color: DIM, marginLeft: 7 }}>{n.what}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Other rows">
            <div style={{ fontSize: 11.5, color: DIM, marginBottom: 8, lineHeight: 1.5 }}>
              Column letter plus row number, as in a spreadsheet. <span style={chip}>F3</span> is row 3&rsquo;s
              material cost; <span style={chip}>SUM(J1:J40)</span> totals forty line totals.
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {COLUMN_HELP.map((c) => (
                <div key={c.letter} style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 7, padding: '6px 9px' }}>
                  <span style={chip}>{c.letter}</span>
                  <span style={{ fontSize: 11, color: DIM, marginLeft: 7 }}>{c.what}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Functions (${FUNCTION_HELP.length})`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 7 }}>
              {FUNCTION_HELP.map((f) => (
                <div key={f.name} style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11.5, fontFamily: 'ui-monospace, monospace', color: GOLD, fontWeight: 700 }}>{f.sig}</div>
                  <div style={{ fontSize: 11, color: DIM, marginTop: 3, lineHeight: 1.45 }}>{f.what}</div>
                  {f.example && (
                    <button onClick={() => setDraft(f.example!)} style={{ ...chip, marginTop: 5, cursor: 'pointer' }}>{f.example}</button>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Worth knowing">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: DIM, lineHeight: 1.7 }}>
              <li>A cell shows its formula while you are in it, and the number it produced once you leave.</li>
              <li>Typing a plain number over a formula clears the formula rather than being overwritten.</li>
              <li><span style={chip}>12%</span> means 0.12. So does <span style={chip}>MAT*12%</span>.</li>
              <li>A formula that refers back to itself reports <span style={chip}>#CIRC!</span> instead of hanging.</li>
              <li>One broken formula marks its own cell and leaves the rest of the estimate computing.</li>
              <li>The evaluated number is what gets saved, so proposals and reports never see formulas.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 9 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
