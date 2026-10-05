'use client';
/**
 * MarkOutcomeModal — the ONE universal win/loss capture modal.
 *
 * Every surface that can mark a bid Won or Lost (leads kanban, bids history,
 * proposal accept/decline, a manual "Mark Outcome" button, etc.) renders this
 * modal and POSTs to the single canonical funnel: POST /api/bids/outcome.
 * That route records the outcome header + per-CSI lines AND fires the learner,
 * so keeping capture in one component guarantees learning always runs.
 *
 * Props (exact):
 *   open: boolean;                              // controls visibility
 *   onClose: () => void;                        // called on backdrop click, ✕, cancel, or after a successful record
 *   source: 'lead'|'proposal'|'bid'|'package'|'manual';
 *   sourceId?: string;                          // id of the originating record (optional)
 *   defaultOutcome?: 'won'|'lost';              // initial toggle (defaults to 'won')
 *   projectName?: string;                       // passed straight through to the funnel
 *   projectType?: string;                       // passed straight through
 *   trades?: string[];                          // passed straight through
 *   ourAmount?: number;                         // dollars — prefills "Your bid ($)"
 *   onRecorded?: (r: any) => void;              // called with the route's JSON result on success
 *
 * Wiring contract for callers:
 *   import MarkOutcomeModal from '@/components/bids/MarkOutcomeModal';
 *   <MarkOutcomeModal open={open} onClose={() => setOpen(false)} source="lead"
 *     sourceId={lead.id} defaultOutcome="won" projectName={lead.name}
 *     ourAmount={lead.value} onRecorded={(r) => refresh(r)} />
 *
 * On submit the modal assembles the funnel body: dollar inputs become the
 * header dollar fields, and each trade-breakdown row is converted to a lines[]
 * entry with cents (dollars * 100). Header capture works with zero breakdown rows.
 */
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/Toast';

/* ─── Tokens (mirror app/app/page.tsx — dark navy premium) ───────────── */
const GOLD   = 'var(--brand-primary)';
const DARK   = 'var(--bg-surface-2)'; // input / inset surface
const RAISED = 'var(--bg-surface)'; // modal card
const BORDER = 'rgba(255,255,255,0.12)';
const DIM    = 'var(--text-secondary)';
const TEXT   = 'var(--text-primary)';
const GREEN  = 'var(--success)';
const RED    = 'var(--danger)';
const SHADOW_LG = '0 16px 44px rgba(0,0,0,0.10)';

type Outcome = 'won' | 'lost';
type Source = 'lead' | 'proposal' | 'bid' | 'package' | 'manual';

type LineRow = { csiDivision: string; trade: string; ourDollars: string; winningDollars: string };

const REASONS = ['Price', 'Scope', 'Relationship', 'Timing', 'Other'] as const;

export interface MarkOutcomeModalProps {
  open: boolean;
  onClose: () => void;
  source: Source;
  sourceId?: string;
  defaultOutcome?: Outcome;
  projectName?: string;
  projectType?: string;
  trades?: string[];
  ourAmount?: number;
  onRecorded?: (r: any) => void;
}

/** Parse a possibly-formatted dollar string ("2,500,000" / "$1200.50") → number | null. */
function parseDollars(s: string): number | null {
  const cleaned = (s || '').replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: DIM,
  marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7,
  padding: '9px 12px', color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function MarkOutcomeModal({
  open, onClose, source, sourceId, defaultOutcome, projectName, projectType, trades, ourAmount, onRecorded,
}: MarkOutcomeModalProps) {
  const { showToast } = useToast();

  const [outcome, setOutcome] = useState<Outcome>(defaultOutcome ?? 'won');
  const [ourBid, setOurBid] = useState('');
  const [winningBid, setWinningBid] = useState('');
  const [reason, setReason] = useState<string>('');
  const [awardedTo, setAwardedTo] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [rows, setRows] = useState<LineRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // Reset to the caller's defaults each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setOutcome(defaultOutcome ?? 'won');
    setOurBid(ourAmount != null ? String(ourAmount) : '');
    setWinningBid('');
    setReason('');
    setAwardedTo('');
    setShowBreakdown(false);
    setRows([]);
    setPending(false);
    setError('');
  }, [open, defaultOutcome, ourAmount]);

  const close = useCallback(() => { if (!pending) onClose(); }, [pending, onClose]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const isLost = outcome === 'lost';

  const addRow = () => setRows(r => [...r, { csiDivision: '', trade: '', ourDollars: '', winningDollars: '' }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const setRow = (i: number, patch: Partial<LineRow>) =>
    setRows(r => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError('');

    const ourAmt = parseDollars(ourBid);
    const winAmt = parseDollars(winningBid);

    // Assemble the funnel body. Only include fields that carry meaning.
    const body: Record<string, unknown> = { source, outcome };
    if (sourceId) body.sourceId = sourceId;
    if (ourAmt != null) body.ourAmount = ourAmt;
    if (isLost && winAmt != null) body.winningAmount = winAmt;
    if (isLost && reason) body.reason = reason;
    if (isLost && awardedTo.trim()) body.awardedTo = awardedTo.trim();
    if (projectName) body.projectName = projectName;
    if (projectType) body.projectType = projectType;
    if (Array.isArray(trades) && trades.length) body.trades = trades;

    if (showBreakdown) {
      const lines = rows
        .filter(row => row.csiDivision.trim() || row.ourDollars || row.winningDollars)
        .map(row => {
          const our = parseDollars(row.ourDollars);
          const win = parseDollars(row.winningDollars);
          const line: Record<string, unknown> = { csiDivision: row.csiDivision.trim().slice(0, 2) };
          if (row.trade.trim()) line.trade = row.trade.trim();
          if (our != null) line.ourSellCents = Math.round(our * 100);
          if (win != null) line.winningSellCents = Math.round(win * 100);
          return line;
        })
        .filter(line => String(line.csiDivision || '').length > 0);
      if (lines.length) body.lines = lines;
    }

    setPending(true);
    try {
      const res = await fetch('/api/bids/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let json: any = null;
      try { json = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok || !json || json.success === false) {
        setPending(false);
        setError('We couldn’t record this outcome. Please check the amounts and try again.');
        return;
      }
      if (showToast) showToast(outcome === 'won' ? 'Bid marked as won.' : 'Bid marked as lost.', 'success');
      else { /* recorded */ }
      onRecorded?.(json);
      onClose();
    } catch {
      setPending(false);
      setError('Something went wrong reaching the server. Please try again.');
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: SHADOW_LG }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: RAISED, zIndex: 1 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>Mark Outcome</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {projectName ? projectName : 'Record whether you won or lost this bid'}
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close"
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          {/* Won / Lost segmented toggle */}
          <div style={{ display: 'flex', gap: 0, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 9, padding: 4, marginBottom: 16 }}>
            {(['won', 'lost'] as Outcome[]).map(o => {
              const active = outcome === o;
              const accent = o === 'won' ? GREEN : RED;
              return (
                <button
                  key={o} type="button" onClick={() => setOutcome(o)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
                    background: active ? accent : 'transparent',
                    color: active ? 'var(--text-primary)' : DIM,
                    transition: 'background .15s, color .15s',
                  }}
                >
                  {o === 'won' ? 'Won' : 'Lost'}
                </button>
              );
            })}
          </div>

          {/* Your bid */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Your Bid ($)</label>
            <input
              value={ourBid} onChange={e => setOurBid(e.target.value)} inputMode="decimal"
              placeholder="e.g. 2,500,000" style={inputStyle}
              onFocus={e => (e.target.style.borderColor = GOLD)}
              onBlur={e => (e.target.style.borderColor = BORDER)}
            />
          </div>

          {/* Winning bid — only meaningful when Lost */}
          {isLost && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Winning Bid ($)</label>
              <input
                value={winningBid} onChange={e => setWinningBid(e.target.value)} inputMode="decimal"
                placeholder="Optional — the amount that won" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = GOLD)}
                onBlur={e => (e.target.style.borderColor = BORDER)}
              />
            </div>
          )}

          {/* Lost-only: reason chips + awarded to */}
          {isLost && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Reason</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {REASONS.map(r => {
                    const active = reason === r;
                    return (
                      <button
                        key={r} type="button" onClick={() => setReason(active ? '' : r)}
                        style={{
                          padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          background: active ? 'var(--brand-primary-12)' : DARK,
                          border: `1px solid ${active ? GOLD : BORDER}`,
                          color: active ? GOLD : DIM,
                          transition: 'all .15s',
                        }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Awarded To</label>
                <input
                  value={awardedTo} onChange={e => setAwardedTo(e.target.value)}
                  placeholder="Competitor or firm (optional)" style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = GOLD)}
                  onBlur={e => (e.target.style.borderColor = BORDER)}
                />
              </div>
            </>
          )}

          {/* Optional trade breakdown */}
          <div style={{ marginTop: 4, marginBottom: 16, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
            <button
              type="button" onClick={() => { setShowBreakdown(s => !s); if (!showBreakdown && rows.length === 0) addRow(); }}
              style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ display: 'inline-block', transform: showBreakdown ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
              Add trade breakdown {rows.length > 0 ? `(${rows.length})` : ''}
            </button>

            {showBreakdown && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 90px 90px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ ...labelStyle, marginBottom: 0, fontSize: 9 }}>CSI</div>
                  <div style={{ ...labelStyle, marginBottom: 0, fontSize: 9 }}>Trade</div>
                  <div style={{ ...labelStyle, marginBottom: 0, fontSize: 9 }}>Your $</div>
                  <div style={{ ...labelStyle, marginBottom: 0, fontSize: 9 }}>Winning $</div>
                  <div />
                </div>
                {rows.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 90px 90px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <input
                      value={row.csiDivision} onChange={e => setRow(i, { csiDivision: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                      inputMode="numeric" placeholder="09" maxLength={2}
                      style={{ ...inputStyle, padding: '8px 8px', textAlign: 'center' }}
                      onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORDER)}
                    />
                    <input
                      value={row.trade} onChange={e => setRow(i, { trade: e.target.value })}
                      placeholder="Drywall" style={{ ...inputStyle, padding: '8px 10px' }}
                      onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORDER)}
                    />
                    <input
                      value={row.ourDollars} onChange={e => setRow(i, { ourDollars: e.target.value })}
                      inputMode="decimal" placeholder="0" style={{ ...inputStyle, padding: '8px 8px' }}
                      onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORDER)}
                    />
                    <input
                      value={row.winningDollars} onChange={e => setRow(i, { winningDollars: e.target.value })}
                      inputMode="decimal" placeholder="0" style={{ ...inputStyle, padding: '8px 8px' }}
                      onFocus={e => (e.target.style.borderColor = GOLD)} onBlur={e => (e.target.style.borderColor = BORDER)}
                    />
                    <button type="button" onClick={() => removeRow(i)} aria-label="Remove row"
                      style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                ))}
                <button
                  type="button" onClick={addRow}
                  style={{ marginTop: 4, background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 7, color: DIM, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '7px 12px', width: '100%' }}
                >
                  + Add Trade
                </button>
              </div>
            )}
          </div>

          {error && (
            <div style={{ color: RED, fontSize: 12, marginBottom: 12, background: 'rgba(255,59,48,0.10)', border: `1px solid rgba(255,59,48,0.3)`, borderRadius: 7, padding: '9px 12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button" onClick={close} disabled={pending}
              style={{ flex: '0 0 auto', padding: '11px 18px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontWeight: 700, fontSize: 13, cursor: pending ? 'not-allowed' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={pending}
              style={{ flex: 1, padding: '11px', background: pending ? 'var(--brand-primary-35)' : GOLD, border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontWeight: 800, fontSize: 14, cursor: pending ? 'not-allowed' : 'pointer' }}
            >
              {pending ? 'Recording…' : outcome === 'won' ? 'Record Win' : 'Record Loss'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MarkOutcomeModal;
