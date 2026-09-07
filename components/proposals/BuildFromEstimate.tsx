'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { X, MagicWand, Warning, CheckCircle, Info } from '@phosphor-icons/react';
import { goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', GREEN = '#3dd68c', RED = '#ef4444', ORANGE = '#B85C2A';

const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

interface BuiltLine {
  sort_order: number; description: string; quantity: number | null; unit: string | null;
  unit_price: number | null; total_price: number; is_optional: boolean; notes: string | null;
}
interface Built {
  lines: BuiltLine[];
  exclusions: string[];
  allowances: { description: string; amount: number }[];
  costTotal: number; sellTotal: number; optionalTotal: number; marginPct: number | null;
  omitted: { description: string; reason: string }[];
}

/**
 * Build a client proposal from the project's estimate.
 *
 * Buildern converts estimates into client documents in one step. The step this
 * adds is the preview: the document is built and shown — every line, every
 * exclusion, everything the estimate could not price — before anything is
 * written. A generated proposal the user has not read is how a wrong number
 * reaches a client with their name on it.
 */
export default function BuildFromEstimate({
  projectId, open, onClose, onCreated,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (proposalId: string) => void;
}) {
  const [granularity, setGranularity] = useState<'division' | 'line'>('division');
  const [upliftMode, setUpliftMode] = useState<'markup' | 'margin'>('markup');
  const [upliftPct, setUpliftPct] = useState<number>(15);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<Built | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/proposals/from-estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, preview: true, granularity, upliftMode, upliftPct }),
      });
      const d = await r.json();
      if (!r.ok) { setPreview(null); setError(d?.error || 'Could not build a proposal from this estimate.'); return; }
      setPreview(d as Built);
    } catch {
      setPreview(null); setError('Could not reach the estimate. Please try again.');
    } finally { setLoading(false); }
  }, [projectId, granularity, upliftMode, upliftPct]);

  /* Rebuild whenever a setting changes — the preview IS the answer to "what
     does 15% margin do to this", so making the user press a button to find out
     defeats it. Debounced so typing a percentage doesn't fire per keystroke. */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [open, load]);

  if (!open) return null;

  async function create() {
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/proposals/from-estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, granularity, upliftMode, upliftPct, title: title.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d?.proposal) throw new Error(d?.error || 'create failed');
      onCreated(d.proposal.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the proposal.');
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = {
    padding: '8px 10px', background: '#1c1c1e', border: '1px solid ' + BORDER,
    borderRadius: 6, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: DIM,
    textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5,
  };
  const seg = (on: boolean): React.CSSProperties => ({
    padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    background: on ? 'rgba(245,158,11,.18)' : 'transparent',
    color: on ? '#FBBF24' : DIM, border: 'none', borderRadius: 6,
  });

  const base = preview?.sellTotal ?? 0;
  const opt = preview?.optionalTotal ?? 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(940px, 100%)', maxHeight: '90vh', background: '#0f0f11',
          border: '1px solid ' + BORDER, borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,.6)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MagicWand size={19} weight="duotone" color={GOLD} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Build Proposal from Estimate</div>
              <div style={{ fontSize: 11.5, color: DIM, marginTop: 1 }}>
                Priced from the project&apos;s estimate lines. Nothing is saved until you create it.
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 4 }}>
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Controls */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid ' + BORDER, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, alignItems: 'start' }}>
          <div>
            <label style={label}>Detail</label>
            <div style={{ display: 'flex', gap: 4, background: RAISED, borderRadius: 8, padding: 3, border: '1px solid ' + BORDER }}>
              <button style={seg(granularity === 'division')} onClick={() => setGranularity('division')}>By division</button>
              <button style={seg(granularity === 'line')} onClick={() => setGranularity('line')}>Every line</button>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 5, lineHeight: 1.45 }}>
              {granularity === 'division'
                ? 'One priced row per CSI division — the usual client-facing summary.'
                : 'Every estimate line, with quantities and unit rates shown.'}
            </div>
          </div>

          <div>
            <label style={label}>Uplift</label>
            <div style={{ display: 'flex', gap: 4, background: RAISED, borderRadius: 8, padding: 3, border: '1px solid ' + BORDER }}>
              <button style={seg(upliftMode === 'markup')} onClick={() => setUpliftMode('markup')}>Markup</button>
              <button style={seg(upliftMode === 'margin')} onClick={() => setUpliftMode('margin')}>Margin</button>
            </div>
            {/* Builders use these words interchangeably and they are not the
                same arithmetic. Saying so here is cheaper than discovering it
                on a signed contract. */}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 5, lineHeight: 1.45 }}>
              {upliftMode === 'markup'
                ? <>Added to cost. {upliftPct}% markup on $100 of cost sells at {money0(100 * (1 + upliftPct / 100))}.</>
                : <>Share of the sell price. {upliftPct}% margin on $100 of cost sells at {upliftPct < 100 ? money0(100 / (1 - upliftPct / 100)) : '—'}.</>}
            </div>
          </div>

          <div>
            <label style={label}>Percentage</label>
            <input
              type="number" value={upliftPct} min={0} max={upliftMode === 'margin' ? 99 : 500} step={0.5}
              onChange={(e) => setUpliftPct(Number(e.target.value))}
              style={{ ...inp, width: '100%' }}
            />
            {upliftMode === 'margin' && upliftPct >= 100 && (
              <div style={{ fontSize: 11, color: RED, marginTop: 5 }}>Margin must be under 100%.</div>
            )}
          </div>

          <div>
            <label style={label}>Title</label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Proposal" style={{ ...inp, width: '100%' }}
            />
          </div>
        </div>

        {/* Preview */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: 200 }}>
          {loading && <div style={{ textAlign: 'center', color: DIM, padding: 40 }}>Pricing the estimate…</div>}

          {!loading && error && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)' }}>
              <Warning size={17} weight="duotone" color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{error}</div>
            </div>
          )}

          {!loading && !error && preview && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Description', granularity === 'line' ? 'Qty' : '', granularity === 'line' ? 'Unit' : '', granularity === 'line' ? 'Rate' : '', 'Amount'].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: DIM, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.sort_order} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '9px 12px', color: TEXT }}>
                        {l.description}
                        {l.is_optional && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase' }}>optional</span>}
                        {l.notes && <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{l.notes}</div>}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: DIM }}>{l.quantity ?? ''}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: DIM }}>{l.unit ?? ''}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: DIM }}>{l.unit_price != null ? money(l.unit_price) : ''}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: TEXT, fontWeight: 700 }}>{money(l.total_price)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 800, color: TEXT }}>Proposal total</td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: GOLD }}>{money(base)}</td>
                  </tr>
                  {opt > 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '4px 12px 11px', textAlign: 'right', fontSize: 12, color: DIM }}>Optional scope, if accepted</td>
                      <td style={{ padding: '4px 12px 11px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: DIM }}>{money(opt)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Margin check — the builder's number, never printed for the client. */}
              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Stat label="Estimated cost" value={money0(preview.costTotal)} />
                <Stat label="Proposal total" value={money0(base)} accent={GOLD} />
                <Stat label="Gross profit" value={money0(base - preview.costTotal)} accent={base > preview.costTotal ? GREEN : RED} />
                <Stat label="Realised margin" value={preview.marginPct != null ? `${preview.marginPct}%` : '—'} accent={base > preview.costTotal ? GREEN : RED} />
              </div>

              {preview.allowances.length > 0 && (
                <Note tone="info" title={`${preview.allowances.length} allowance${preview.allowances.length === 1 ? '' : 's'} carried into the proposal`}>
                  {preview.allowances.map((a) => `${a.description} — ${money0(a.amount)}`).join(' · ')}
                  <div style={{ marginTop: 4, opacity: .8 }}>An allowance is a placeholder the client&apos;s final selection can move. Call them out on the document.</div>
                </Note>
              )}

              {preview.exclusions.length > 0 && (
                <Note tone="info" title={`${preview.exclusions.length} exclusion${preview.exclusions.length === 1 ? '' : 's'} carried as text, not as priced lines`}>
                  {preview.exclusions.join(' · ')}
                </Note>
              )}

              {preview.omitted.length > 0 && (
                <Note tone="warn" title={`${preview.omitted.length} estimate line${preview.omitted.length === 1 ? '' : 's'} left off`}>
                  {preview.omitted.map((o) => o.description).join(' · ')}
                  <div style={{ marginTop: 4, opacity: .8 }}>
                    Each carries no cost on the estimate. Printing them at $0.00 would read to a client as free — price them on the estimate if they belong here.
                  </div>
                </Note>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '13px 20px', borderTop: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11.5, color: DIM }}>
            {preview ? `${preview.lines.length} line${preview.lines.length === 1 ? '' : 's'} · ${money0(base)}` : ' '}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            <button
              onClick={create}
              disabled={saving || loading || !preview || preview.lines.length === 0}
              style={{ ...goldButtonStyle, opacity: (saving || loading || !preview || preview.lines.length === 0) ? .55 : 1 }}
              className="pmBtn"
            >
              <CheckCircle size={15} weight="bold" /> {saving ? 'Creating…' : 'Create Proposal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 10, padding: '10px 13px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent ?? TEXT, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function Note({ tone, title, children }: { tone: 'info' | 'warn'; title: string; children: React.ReactNode }) {
  const c = tone === 'warn' ? ORANGE : GOLD;
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 10, background: `${c}12`, border: `1px solid ${c}33` }}>
      {tone === 'warn'
        ? <Warning size={16} weight="duotone" color={c} style={{ flexShrink: 0, marginTop: 1 }} />
        : <Info size={16} weight="duotone" color={c} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>{title}</div>
        <div style={{ fontSize: 11.5, color: DIM, marginTop: 3, lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}
