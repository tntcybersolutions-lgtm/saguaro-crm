'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Warning, ListDashes } from '@phosphor-icons/react';

const GOLD = '#F59E0B', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', ORANGE = '#B85C2A';

const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

interface Line {
  id: string; sort_order: number | null; description: string;
  quantity: number | null; unit: string | null; unit_price: number | null;
  total_price: number | null; is_optional: boolean | null; notes: string | null;
}

/**
 * The priced breakdown behind one proposal.
 *
 * `proposal_lines` had rows in it and was read by no code in the platform, so a
 * proposal could state $2,850,000 and be unable to show a single line of what
 * that bought. This is the first thing that reads it.
 *
 * It also reports when the header amount and the lines disagree. On live data
 * two proposals were out by $398,200 and $51,600 — the header and the breakdown
 * are entered independently and nothing had ever compared them. The difference
 * is shown rather than silently corrected: only the estimator knows which of the
 * two numbers is the right one.
 *
 * The comparison is against BASE lines only. Optional scope is quoted beside the
 * price, not inside it, so counting it would report a proposal as reconciling
 * when the client has not agreed to buy that part.
 */
export default function ProposalLines({ proposalId, headerAmount }: { proposalId: string; headerAmount: number }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [lineTotal, setLineTotal] = useState(0);
  const [optionalTotal, setOptionalTotal] = useState(0);
  const [reconciles, setReconciles] = useState(true);
  const [difference, setDifference] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/proposals/${proposalId}/lines`);
      const d = await r.json();
      if (!r.ok) { setError(d?.error || 'Could not load the breakdown.'); setLines([]); return; }
      setLines(d.lines ?? []);
      setLineTotal(Number(d.lineTotal) || 0);
      setOptionalTotal(Number(d.optionalTotal) || 0);
      setReconciles(d.reconciles !== false);
      setDifference(Number(d.difference) || 0);
    } catch {
      setError('Could not load the breakdown.'); setLines([]);
    }
  }, [proposalId]);

  useEffect(() => { load(); }, [load]);

  if (lines === null) return <div style={{ padding: '14px 18px', color: DIM, fontSize: 12.5 }}>Loading breakdown…</div>;

  if (error) return <div style={{ padding: '14px 18px', color: ORANGE, fontSize: 12.5 }}>{error}</div>;

  if (lines.length === 0) {
    return (
      <div style={{ padding: '16px 18px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <ListDashes size={16} weight="duotone" color={DIM} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.5 }}>
          This proposal has no line breakdown — it states {money0(headerAmount)} with nothing behind it.
          Use <span style={{ color: GOLD, fontWeight: 700 }}>Build from Estimate</span> to generate one from the project&apos;s estimate.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0 10px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['Description', 'Qty', 'Unit', 'Rate', 'Amount'].map((h, i) => (
              <th key={h} style={{ padding: '7px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '7px 14px', color: TEXT }}>
                {l.description}
                {l.is_optional && <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, color: GOLD, textTransform: 'uppercase' }}>optional</span>}
                {l.notes && <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>{l.notes}</div>}
              </td>
              <td style={{ padding: '7px 14px', textAlign: 'right', color: DIM }}>{l.quantity ?? ''}</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', color: DIM }}>{l.unit ?? ''}</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', color: DIM }}>{l.unit_price != null ? money(l.unit_price) : ''}</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', color: TEXT, fontWeight: 700 }}>{money(Number(l.total_price) || 0)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <td colSpan={4} style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: TEXT }}>Sum of lines</td>
            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: GOLD }}>{money(lineTotal)}</td>
          </tr>
          {optionalTotal > 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '2px 14px 8px', textAlign: 'right', fontSize: 11.5, color: DIM }}>Optional scope</td>
              <td style={{ padding: '2px 14px 8px', textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: DIM }}>{money(optionalTotal)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {!reconciles && (
        <div style={{ margin: '10px 14px 2px', display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 9, background: `${ORANGE}14`, border: `1px solid ${ORANGE}38` }}>
          <Warning size={15} weight="duotone" color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
            <span style={{ color: TEXT, fontWeight: 700 }}>
              The stated amount and the lines differ by {money0(Math.abs(difference))}.
            </span>{' '}
            This proposal states {money0(headerAmount)} while its lines add to {money0(lineTotal)}
            {difference > 0 ? ' — the extra is not itemised anywhere.' : ' — the lines total more than the proposal states.'}
          </div>
        </div>
      )}
    </div>
  );
}
