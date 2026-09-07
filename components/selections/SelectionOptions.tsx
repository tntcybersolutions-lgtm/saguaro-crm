'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash, Star, CheckCircle, LinkSimple, Image as ImageIcon } from '@phosphor-icons/react';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', GREEN = '#1a8a4a', RED = '#c03030', ORANGE = '#B85C2A';

const fmt = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
/* A per-unit rate keeps its cents. Rounding $10.67/SF to "$11" beside a
   $12,804 total invites the client to multiply and find the arithmetic wrong —
   the same rounding mistake that once reported a $1.50 cost-per-dollar as $1. */
const rate = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PricedOption {
  id: string; name: string; description?: string | null; manufacturer?: string | null;
  model_number?: string | null; color?: string | null; finish?: string | null;
  unit_cost?: number | null; quantity?: number | null;
  image_url?: string | null; spec_url?: string | null; is_recommended?: boolean | null;
  cost: number; varianceIfChosen: number | null; effect: string; isChosen: boolean;
}

/**
 * The priced choices presented for one selection.
 *
 * This is the half of a selections log Buildern gets right and Saguaro had the
 * tables for but never used: rather than one item with one price, the builder
 * presents several options with photos and spec sheets, and the client picks.
 *
 * Each option is priced against the allowance at the moment of choosing, so the
 * reader sees "adds $6,600" rather than "$21,600" and a number on another
 * screen they are expected to subtract themselves.
 */
export default function SelectionOptions({
  selectionId, allowance, onPicked,
}: {
  selectionId: string;
  allowance: number;
  /* Awaited so the list can refresh once the pick has actually landed —
     otherwise the option the user just chose keeps offering "Choose", because
     isChosen is derived server-side from the amount now on the selection. */
  onPicked: (amount: number, name: string) => void | Promise<void>;
}) {
  const [options, setOptions] = useState<PricedOption[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', manufacturer: '', unit_cost: '', quantity: '1', image_url: '', spec_url: '', is_recommended: false });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/selections/${selectionId}/options`);
      const d = await r.json();
      setOptions(r.ok ? (d.options ?? []) : []);
    } catch { setOptions([]); }
  }, [selectionId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/selections/${selectionId}/options`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim() || null,
          unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
          quantity: form.quantity === '' ? 1 : Number(form.quantity),
          image_url: form.image_url.trim() || null,
          spec_url: form.spec_url.trim() || null,
          is_recommended: form.is_recommended,
          sort_order: (options?.length ?? 0) + 1,
        }),
      });
      if (r.ok) {
        setForm({ name: '', manufacturer: '', unit_cost: '', quantity: '1', image_url: '', spec_url: '', is_recommended: false });
        setAdding(false);
        load();
      }
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/selections/${selectionId}/options?optionId=${id}`, { method: 'DELETE' });
      load();
    } finally { setBusy(false); }
  }

  if (options === null) return <div style={{ fontSize: 12, color: DIM }}>Loading options…</div>;

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', background: '#1c1c1e', border: '1px solid ' + BORDER,
    borderRadius: 6, color: TEXT, fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: .5 }}>
          Options presented {options.length > 0 && <span style={{ color: DIM, fontWeight: 600 }}>· {options.length}</span>}
        </div>
        <button onClick={() => setAdding(!adding)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'rgba(245,158,11,.12)', border: `1px solid ${GOLD}44`, borderRadius: 6, color: '#FBBF24', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={12} weight="bold" /> {adding ? 'Cancel' : 'Add option'}
        </button>
      </div>

      {options.length === 0 && !adding && (
        <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
          No options presented yet. Add two or three and the client can choose — each one priced against
          the {allowance > 0 ? fmt(allowance) + ' allowance' : 'allowance'} so they see the difference before they decide.
        </div>
      )}

      {adding && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <input style={inp} placeholder="Option name — e.g. Porcelain plank" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={inp} placeholder="Manufacturer" value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} />
            <input style={inp} placeholder="Unit cost" type="number" value={form.unit_cost} onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))} />
            <input style={inp} placeholder="Quantity" type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: DIM, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_recommended} onChange={(e) => setForm((f) => ({ ...f, is_recommended: e.target.checked }))} />
              Recommend this one
            </label>
          </div>
          <input style={inp} placeholder="Image URL (optional)" value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} />
          <input style={inp} placeholder="Spec sheet URL (optional)" value={form.spec_url} onChange={(e) => setForm((f) => ({ ...f, spec_url: e.target.value }))} />
          {form.unit_cost !== '' && (
            <div style={{ fontSize: 11, color: DIM }}>
              {fmt(Number(form.unit_cost) * (Number(form.quantity) || 1))}
              {allowance > 0 && (() => {
                const v = allowance - Number(form.unit_cost) * (Number(form.quantity) || 1);
                return <span style={{ color: v < 0 ? RED : GREEN, fontWeight: 700 }}> — {v < 0 ? `adds ${fmt(Math.abs(v))}` : v > 0 ? `${fmt(v)} under allowance` : 'exactly the allowance'}</span>;
              })()}
            </div>
          )}
          <button onClick={add} disabled={busy || !form.name.trim()}
            style={{ padding: '8px 0', background: 'rgba(245,158,11,.16)', border: `1px solid ${GOLD}55`, borderRadius: 7, color: '#FBBF24', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || !form.name.trim() ? .5 : 1 }}>
            {busy ? 'Adding…' : 'Add option'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {options.map((o) => {
          const over = o.varianceIfChosen != null && o.varianceIfChosen < 0;
          return (
            <div key={o.id} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8,
              background: o.isChosen ? 'rgba(26,138,74,.10)' : '#0f0f11',
              border: `1px solid ${o.isChosen ? GREEN + '66' : BORDER}`,
            }}>
              {o.image_url
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={o.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#1c1c1e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ImageIcon size={16} weight="duotone" color={DIM} />
                  </div>}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{o.name}</span>
                  {o.is_recommended && <Star size={12} weight="fill" color={GOLD} />}
                  {o.isChosen && <CheckCircle size={13} weight="fill" color="#4ade80" />}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>
                  {[o.manufacturer, o.quantity && o.unit_cost ? `${o.quantity} × ${rate(o.unit_cost)}` : null].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2, color: over ? RED : o.varianceIfChosen ? GREEN : DIM }}>
                  {fmt(o.cost)} — {o.effect}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
                {o.isChosen ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#4ade80', whiteSpace: 'nowrap' }}>
                    <CheckCircle size={12} weight="fill" /> Chosen
                  </span>
                ) : (
                  <button onClick={async () => { setBusy(true); try { await onPicked(o.cost, o.name); await load(); } finally { setBusy(false); } }} disabled={busy}
                    style={{ padding: '3px 9px', background: 'rgba(26,138,74,.14)', border: `1px solid ${GREEN}55`, borderRadius: 5, color: '#4ade80', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: busy ? .5 : 1 }}>
                    Choose
                  </button>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  {o.spec_url && (
                    <a href={o.spec_url} target="_blank" rel="noopener noreferrer" title="Spec sheet"
                      style={{ padding: 3, color: DIM, display: 'flex' }}>
                      <LinkSimple size={13} weight="bold" />
                    </a>
                  )}
                  <button onClick={() => remove(o.id)} disabled={busy} title="Remove option"
                    style={{ padding: 3, background: 'none', border: 'none', color: ORANGE, cursor: 'pointer', display: 'flex' }}>
                    <Trash size={13} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
