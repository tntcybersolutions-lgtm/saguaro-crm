'use client';

/**
 * BidFormEditor — the lines every bidder prices, editable after creation.
 *
 * A package's lines used to be fixed the moment it was made: the wizard's
 * Step 2 was the only chance, a package built from a takeoff or the heatmap
 * could not be corrected, and a jacket with no bid form could not be priced.
 * The jacket's "Add line items" (#bid-form) lands here.
 *
 * Add, edit, reorder and remove go through /api/bid-packages/[id]/items, which
 * answers with the whole list in bid-form order — the order the jacket and the
 * bidder see — so this never shows an order the jacket does not.
 */

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Plus, PencilSimple, Trash, ArrowUp, ArrowDown, FloppyDisk, X } from '@phosphor-icons/react';
import { SectionCard, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { Input } from '@/components/ui/kit';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { toCents, toDollars, sumCents } from '@/lib/calc';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-secondary)';
const HAIR = 'rgba(255,255,255,0.07)';

export type BidFormLine = {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total: number;
};

/** API rows → lines. The one mapping, used by the package page and this editor. */
export function toBidFormLines(rows: Array<Record<string, any>>): BidFormLine[] {
  return (rows || []).map((it) => ({
    id: String(it.id),
    code: String(it.csi_code || it.code || it.cost_code || ''),
    description: String(it.description || it.title || ''),
    quantity: Number(it.quantity) || 0,
    unit: String(it.unit || it.uom || ''),
    unit_cost: Number(it.unit_price ?? it.unit_cost) || 0,
    total: Number(it.total_amount ?? it.total) || 0,
  }));
}

const fmt = (n: number) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

type Draft = { code: string; description: string; quantity: string; unit: string };
const blank: Draft = { code: '', description: '', quantity: '1', unit: 'LS' };

export default function BidFormEditor({ packageId, lines, onLinesChanged, onToast }: {
  packageId: string;
  lines: BidFormLine[];
  /** The saved list, so the page's totals follow without a reload. */
  onLinesChanged: (lines: BidFormLine[]) => void;
  onToast?: (msg: string, color?: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<Draft>(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  /* The jacket's "Add Line Items" link lands on #bid-form. */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#bid-form') {
      if (lines.length === 0) setAdding(true);
      requestAnimationFrame(() => card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(key: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = '') {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/items${query}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.items)) throw new Error(d.error || 'Could not save the bid form.');
      onLinesChanged(toBidFormLines(d.items));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the bid form.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const payload = (d: Draft) => ({
    code: d.code, description: d.description, unit: d.unit,
    quantity: d.quantity.trim() === '' ? null : d.quantity,
  });

  async function saveEdit(id: string) {
    if (!draft.description.trim()) { setError('A line needs a description.'); return; }
    if (await call(`edit:${id}`, 'PATCH', { itemId: id, ...payload(draft) })) { setEditingId(null); onToast?.('Line saved.'); }
  }
  async function saveAdd() {
    if (!add.description.trim()) { setError('A line needs a description.'); return; }
    if (await call('add', 'POST', payload(add))) { setAdd(blank); onToast?.('Line added to the bid form.'); }
  }
  async function remove(line: BidFormLine) {
    if (!(await confirmDialog({ title: 'Remove this line?', message: `"${line.description}" comes off the bid form every bidder prices.`, danger: true, confirmLabel: 'Remove Line' }))) return;
    if (await call(`del:${line.id}`, 'DELETE', undefined, `?itemId=${encodeURIComponent(line.id)}`)) onToast?.('Line removed.');
  }

  const total = toDollars(sumCents(lines.map((l) => toCents(l.total))));

  return (
    <div id="bid-form" ref={card} style={{ marginBottom: 20, scrollMarginTop: 80 }}>
      <style>{`
        .bfe-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 6px 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid ${HAIR}; }
        .bfe-meta { display: flex; gap: 14px; align-items: center; color: ${DIM}; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .bfe-acts { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
        .bfe-act { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 34px; min-width: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.04); color: ${TEXT}; font-size: 12px; font-weight: 700; cursor: pointer; }
        .bfe-act:disabled { opacity: .4; cursor: not-allowed; }
        .bfe-form { display: grid; grid-template-columns: minmax(80px, 120px) minmax(0, 1fr) minmax(70px, 100px) minmax(60px, 90px); gap: 8px; align-items: end; }
        .bfe-label { font-size: 12px; font-weight: 800; color: ${DIM}; margin-bottom: 4px; }
        @media (max-width: 640px) {
          .bfe-row { grid-template-columns: 26px minmax(0, 1fr); padding: 12px 14px; }
          .bfe-meta { grid-column: 2; }
          .bfe-act, .bfe-btn { min-height: 44px; min-width: 44px; }
          .bfe-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
          .bfe-form .bfe-desc { grid-column: 1 / -1; order: -1; }
        }
      `}</style>
      <SectionCard
        title={`Bid Form · ${lines.length} line${lines.length === 1 ? '' : 's'}`}
        subtitle="What every bidder prices, in this order."
        icon={<FileText size={17} weight="duotone" color="var(--text-secondary)" />}
        action={!adding ? (
          <button className="bfe-btn pmBtn" onClick={() => { setAdding(true); setError(null); }} style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} weight="bold" /> Add Line
          </button>
        ) : undefined}
        flush
      >
        {lines.length === 0 && !adding && (
          <div style={{ padding: '18px 16px', color: DIM, fontSize: 14, lineHeight: 1.6 }}>
            No lines yet — a jacket without a bid form gives bidders nothing to price. Add the first line.
          </div>
        )}

        {lines.map((l, i) => (
          editingId === l.id ? (
            <div key={l.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${HAIR}`, background: 'var(--bg-surface-2)' }}>
              <LineForm d={draft} set={setDraft} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="bfe-btn pmBtn" onClick={() => saveEdit(l.id)} disabled={busy !== null} style={{ ...goldButtonStyle, padding: '9px 16px' }}>
                  <FloppyDisk size={14} weight="bold" /> {busy === `edit:${l.id}` ? 'Saving…' : 'Save Line'}
                </button>
                <button className="bfe-btn pmBtn" onClick={() => { setEditingId(null); setError(null); }} disabled={busy !== null} style={{ ...ghostButtonStyle, padding: '9px 14px' }}>
                  <X size={14} weight="bold" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={l.id} className="bfe-row">
              <div style={{ color: DIM, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{l.description || '—'}</div>
                {l.code && <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{l.code}</div>}
              </div>
              <div className="bfe-meta">
                <span>{l.quantity} {l.unit}</span>
                {l.total > 0 && <span style={{ color: TEXT, fontWeight: 700 }}>{fmt(l.total)}</span>}
              </div>
              <div className="bfe-acts">
                <button className="bfe-act" aria-label={`Move line ${i + 1} up`} disabled={busy !== null || i === 0} onClick={() => call(`mv:${l.id}`, 'PATCH', { itemId: l.id, move: 'up' })}><ArrowUp size={13} weight="bold" /></button>
                <button className="bfe-act" aria-label={`Move line ${i + 1} down`} disabled={busy !== null || i === lines.length - 1} onClick={() => call(`mv:${l.id}`, 'PATCH', { itemId: l.id, move: 'down' })}><ArrowDown size={13} weight="bold" /></button>
                <button className="bfe-act" disabled={busy !== null} onClick={() => { setEditingId(l.id); setError(null); setDraft({ code: l.code, description: l.description, quantity: String(l.quantity), unit: l.unit }); }}><PencilSimple size={13} weight="bold" /> Edit</button>
                <button className="bfe-act" disabled={busy !== null} onClick={() => remove(l)} style={{ color: 'var(--danger)' }}><Trash size={13} weight="bold" /> Remove</button>
              </div>
            </div>
          )
        ))}

        {adding && (
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${HAIR}` }}>
            <LineForm d={add} set={setAdd} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="bfe-btn pmBtn" onClick={saveAdd} disabled={busy !== null} style={{ ...goldButtonStyle, padding: '9px 16px' }}>
                <Plus size={14} weight="bold" /> {busy === 'add' ? 'Adding…' : 'Add to Bid Form'}
              </button>
              <button className="bfe-btn pmBtn" onClick={() => { setAdding(false); setAdd(blank); setError(null); }} disabled={busy !== null} style={{ ...ghostButtonStyle, padding: '9px 14px' }}>
                <X size={14} weight="bold" /> Done
              </button>
            </div>
          </div>
        )}

        {error && <div role="alert" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>{error}</div>}

        {total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', background: 'var(--bg-surface-2)' }}>
            <span style={{ color: DIM, fontWeight: 700, fontSize: 12 }}>Estimate (GC only — bidders never see it)</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function LineForm({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  return (
    <div className="bfe-form">
      <label style={{ display: 'block', minWidth: 0 }}>
        <div className="bfe-label">Code</div>
        <Input value={d.code} onChange={(e) => set({ ...d, code: e.target.value })} placeholder="26 05 00" />
      </label>
      <label className="bfe-desc" style={{ display: 'block', minWidth: 0 }}>
        <div className="bfe-label">Description</div>
        <Input value={d.description} onChange={(e) => set({ ...d, description: e.target.value })} placeholder="What the bidder prices" />
      </label>
      <label style={{ display: 'block', minWidth: 0 }}>
        <div className="bfe-label">Qty</div>
        <Input value={d.quantity} onChange={(e) => set({ ...d, quantity: e.target.value })} inputMode="decimal" />
      </label>
      <label style={{ display: 'block', minWidth: 0 }}>
        <div className="bfe-label">Unit</div>
        <Input value={d.unit} onChange={(e) => set({ ...d, unit: e.target.value })} placeholder="LS" />
      </label>
    </div>
  );
}
