'use client';
/**
 * The options a GC offers the client for one selection — name, price, photo,
 * product — shown in the selection's detail panel. The client sees the same
 * options in the client portal (Selections tab) and picks one there; over the
 * allowance, the pick becomes an approved change order (lib/selection-pick).
 *
 * Photos go up through the job's photo pipeline (lib/media-upload uploadPhoto),
 * so they also land in the job's gallery; the option keeps the photo's URL and
 * every read re-signs it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash, Star, ImageSquare, Storefront } from '@phosphor-icons/react';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { uploadPhoto } from '@/lib/media-upload';
import { confirmDialog } from '@/lib/ui/async-dialog';

const GOLD = 'var(--brand-primary)', TEXT = 'var(--text-primary)', DIM = 'var(--text-secondary)';
const BORDER = 'rgba(255,255,255,0.12)', RAISED2 = 'var(--bg-surface-2)', GREEN = 'var(--success)', RED = 'var(--danger)';

type Option = {
  id: string; name: string; price: number; manufacturer?: string | null; model_number?: string | null;
  color?: string | null; finish?: string | null; image_url?: string | null; spec_url?: string | null; is_recommended?: boolean | null;
};
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const EMPTY = { name: '', price: '', manufacturer: '', model: '', color: '', finish: '', link: '', recommended: false };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', minHeight: 44, background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 16 };

export default function SelectionOptions({ selectionId, projectId, allowance, pending, onToast }: {
  selectionId: string; projectId: string; allowance: number; pending: boolean;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`/api/selections/${selectionId}/options`, { headers: await getAuthHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'load failed');
      setOptions(j.options || []);
    } catch {
      setError('Could not load the options.');
    } finally {
      setLoading(false);
    }
  }, [selectionId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  async function add() {
    const price = Number(form.price);
    if (!form.name.trim()) { onToast('Give the option a name.', 'error'); return; }
    if (form.price === '' || !Number.isFinite(price) || price < 0) { onToast('Enter the price to the client.', 'error'); return; }
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (file) {
        const photo = await uploadPhoto(file, { projectId, album: 'Other', title: `Selection option — ${form.name.trim()}` });
        imageUrl = typeof photo.url === 'string' ? photo.url : null;
      }
      const r = await fetch(`/api/selections/${selectionId}/options`, {
        method: 'POST',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, price, manufacturer: form.manufacturer, model_number: form.model, color: form.color,
          finish: form.finish, spec_url: form.link, is_recommended: form.recommended, image_url: imageUrl,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not add the option.');
      setOptions((prev) => [...prev, j.option]);
      setForm({ ...EMPTY });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setAdding(false);
      onToast('Option added — your client sees it in their portal.');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not add the option.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(o: Option) {
    if (!(await confirmDialog({ title: 'Remove this option?', message: `"${o.name}" will no longer be offered to the client.`, danger: true }))) return;
    try {
      const r = await fetch(`/api/selections/${selectionId}/options/${o.id}`, { method: 'DELETE', headers: await getAuthHeaders() });
      if (!r.ok) throw new Error('remove failed');
      setOptions((prev) => prev.filter((x) => x.id !== o.id));
    } catch {
      onToast('Could not remove the option.', 'error');
    }
  }

  const delta = (price: number) => {
    if (!(allowance > 0)) return null;
    const d = Math.round((price - allowance) * 100) / 100;
    if (d === 0) return <span style={{ color: DIM }}>on allowance</span>;
    return <span style={{ color: d > 0 ? RED : GREEN, fontWeight: 700 }}>{money(Math.abs(d))} {d > 0 ? 'over' : 'under'}</span>;
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Storefront size={16} weight="duotone" /> Options for Your Client
        </div>
        {pending && !adding && (
          <button type="button" onClick={() => setAdding(true)} style={{ minHeight: 36, padding: '6px 12px', borderRadius: 8, border: `1px solid ${GOLD}`, background: 'transparent', color: 'var(--text-primary)', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={13} weight="bold" /> Add Option
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: DIM, marginBottom: 10, lineHeight: 1.45 }}>
        {pending
          ? 'Your client picks one in their portal (Selections). Over the allowance, the difference becomes a change order they approve when they choose.'
          : 'The client has made this choice — reopen it by setting the status back to Pending.'}
      </div>

      {loading ? <div style={{ color: DIM, fontSize: 13, padding: 8 }}>Loading options…</div>
        : error ? <div style={{ color: RED, fontSize: 13 }}>{error} <button type="button" onClick={() => load()} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700 }}>Retry</button></div>
        : options.length === 0 && !adding ? <div style={{ color: DIM, fontSize: 13 }}>No options yet{pending ? ' — add two or three for the client to compare, or leave none and they approve the item as specified.' : '.'}</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {options.map((o) => (
              <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8 }}>
                {o.image_url
                  ? <img src={o.image_url} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  : <div style={{ width: 56, height: 42, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, flexShrink: 0, border: `1px dashed ${BORDER}` }}><ImageSquare size={20} /></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: TEXT, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {o.is_recommended && <Star size={12} weight="fill" color="var(--text-secondary)" />}{o.name}
                  </div>
                  <div style={{ fontSize: 12, color: DIM }}>{money(o.price)} {delta(o.price)}</div>
                </div>
                {pending && (
                  <button type="button" aria-label={`Remove ${o.name}`} onClick={() => remove(o)} style={{ minWidth: 40, minHeight: 40, borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: RED, cursor: 'pointer' }}>
                    <Trash size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      {adding && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input aria-label="Option name" placeholder="Option name *  (e.g. Quartz — Calacatta)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inp} />
          <input aria-label="Price to the client" type="number" min={0} inputMode="decimal" placeholder={`Price to the client *${allowance > 0 ? `  (allowance ${money(allowance)})` : ''}`} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} style={inp} />
          {form.price !== '' && allowance > 0 && <div style={{ fontSize: 12, color: DIM }}>{delta(Number(form.price) || 0)} vs the allowance</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input aria-label="Manufacturer" placeholder="Manufacturer" value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} style={inp} />
            <input aria-label="Model" placeholder="Model / SKU" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} style={inp} />
            <input aria-label="Color" placeholder="Color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={inp} />
            <input aria-label="Finish" placeholder="Finish" value={form.finish} onChange={(e) => setForm((f) => ({ ...f, finish: e.target.value }))} style={inp} />
          </div>
          <input aria-label="Product link" placeholder="Product link (https://…)" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} style={inp} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: TEXT, fontSize: 14, cursor: 'pointer' }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 14, color: DIM, maxWidth: '100%' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: TEXT, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.recommended} onChange={(e) => setForm((f) => ({ ...f, recommended: e.target.checked }))} style={{ width: 18, height: 18 }} />
            Mark as recommended
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={saving} onClick={add} style={{ flex: 2, minHeight: 44, borderRadius: 8, border: 'none', background: GOLD, color: 'var(--on-brand)', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? (file ? 'Uploading photo…' : 'Saving…') : 'Save Option'}
            </button>
            <button type="button" disabled={saving} onClick={() => { setAdding(false); setForm({ ...EMPTY }); setFile(null); }} style={{ flex: 1, minHeight: 44, borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: DIM, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
