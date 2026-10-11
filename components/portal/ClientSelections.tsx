'use client';
/**
 * The client portal's Selections tab: every finish the owner has to decide,
 * the options the GC offers for each (photo, product, price), how each option
 * sits against its allowance, and the running allowance balance.
 *
 * Choosing goes to POST /api/portal/client/selections (lib/selection-pick).
 * Over the allowance, the client is shown the overage before confirming, and
 * the overage becomes an approved change order on their contract.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Palette, Star, ImageSquare, CheckCircle, ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-secondary)';
const RAISED = 'var(--bg-surface)';
const RAISED2 = 'var(--bg-surface-2)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';
const BORDER = 'rgba(255,255,255,0.12)';

type Option = {
  id: string;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  color?: string | null;
  finish?: string | null;
  price: number;
  image_url?: string | null;
  spec_url?: string | null;
  is_recommended?: boolean | null;
};
type Selection = {
  id: string;
  category?: string | null;
  item_name?: string | null;
  description?: string | null;
  allowance?: number | string | null;
  selected_amount?: number | string | null;
  status?: string | null;
  selected_by?: string | null;
  selected_at?: string | null;
  due_date?: string | null;
  photo_url?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  color?: string | null;
  finish?: string | null;
  options: Option[];
};
type Balance = { allowances: number; chosen: number; balance: number };

const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const isPending = (s: Selection) => String(s.status || 'pending').toLowerCase() === 'pending';
const specLine = (o: { manufacturer?: string | null; model_number?: string | null; model?: string | null; color?: string | null; finish?: string | null }) =>
  [o.manufacturer, o.model_number || o.model, o.color, o.finish].filter(Boolean).join(' · ');

/** "$120 under" / "$450 over" / "On allowance" against the item's allowance. */
function Delta({ allowance, price }: { allowance: number; price: number }) {
  if (!(allowance > 0)) return null;
  const d = Math.round((price - allowance) * 100) / 100;
  if (d === 0) return <span style={{ color: DIM, fontSize: 13, fontWeight: 700 }}>On allowance</span>;
  return (
    <span style={{ color: d > 0 ? RED : GREEN, fontSize: 13, fontWeight: 800 }}>
      {money(Math.abs(d))} {d > 0 ? 'over' : 'under'} allowance
    </span>
  );
}

export default function ClientSelections({ token, onToast }: { token: string; onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Selection[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [confirm, setConfirm] = useState<{ sel: Selection; option: Option | null } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`/api/portal/client/selections?token=${token}`, { headers: { 'x-portal-token': token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'load failed');
      setRows(j.selections || []);
      setBalance(j.balance || null);
    } catch {
      setError('Your selections could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setConfirm(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, busy]);

  async function choose() {
    if (!confirm) return;
    setBusy(true);
    try {
      const r = await fetch('/api/portal/client/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ selection_id: confirm.sel.id, option_id: confirm.option?.id || null, notes: note.trim() || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Your choice could not be saved.');
      onToast(j.changeOrder
        ? `Saved. Change order #${j.changeOrder.co_number} for ${money(j.changeOrder.amount)} was added to your contract.`
        : 'Saved — your contractor has been told.');
      setConfirm(null);
      setNote('');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Your choice could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: DIM }}>Loading your selections…</div>;
  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', border: `1px solid ${BORDER}`, borderRadius: 14, background: RAISED }}>
        <WarningCircle size={30} weight="duotone" color={RED} />
        <div style={{ color: TEXT, fontWeight: 700, margin: '10px 0 14px' }}>{error}</div>
        <button type="button" onClick={() => { setLoading(true); load(); }} style={btn(false)}>Try again</button>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', border: `1px solid ${BORDER}`, borderRadius: 14, background: RAISED }}>
        <Palette size={34} weight="duotone" color={GOLD} />
        <div style={{ color: TEXT, fontWeight: 800, fontSize: 17, marginTop: 10 }}>No selections yet</div>
        <div style={{ color: DIM, marginTop: 6, fontSize: 14 }}>When your contractor posts finishes for you to choose, they show here with photos and prices.</div>
      </div>
    );
  }

  const decided = rows.filter((s) => !isPending(s)).length;
  const groups: Record<string, Selection[]> = {};
  for (const s of rows) (groups[s.category || 'General'] ||= []).push(s);
  const bal = balance || { allowances: 0, chosen: 0, balance: 0 };

  return (
    <div>
      {/* Running allowance balance */}
      <div className="csSum" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Allowances', value: money(bal.allowances), color: TEXT },
          { label: 'Chosen so far', value: money(bal.chosen), color: TEXT },
          { label: bal.balance < 0 ? 'Over allowance' : 'Allowance left', value: money(Math.abs(bal.balance)), color: bal.balance < 0 ? RED : GREEN },
        ].map((k) => (
          <div key={k.label} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: DIM, marginBottom: 22 }}>{decided} of {rows.length} decided{bal.allowances > 0 ? ' · the balance counts the items you have chosen' : ''}</div>

      {Object.entries(groups).map(([cat, items]) => (
        <section key={cat} style={{ marginBottom: 26 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 900, color: GOLD }}>{cat}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.map((s) => {
              const allowance = Number(s.allowance) || 0;
              const pending = isPending(s);
              return (
                <div key={s.id} style={{ background: RAISED, border: `1px solid ${pending ? BORDER : 'color-mix(in srgb, var(--success) 35%, transparent)'}`, borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{s.item_name || 'Selection'}</div>
                    <div style={{ fontSize: 13, color: DIM }}>
                      {allowance > 0 ? <>Allowance <b style={{ color: TEXT }}>{money(allowance)}</b></> : 'No allowance'}
                      {pending && s.due_date ? <> · decide by {new Date(`${s.due_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</> : null}
                    </div>
                  </div>
                  {s.description && <div style={{ fontSize: 14, color: DIM, marginTop: 6 }}>{s.description}</div>}

                  {!pending ? (
                    <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      {s.photo_url && <img src={s.photo_url} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 10, border: `1px solid ${BORDER}` }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: GREEN, fontWeight: 800, fontSize: 14 }}>
                          <CheckCircle size={18} weight="fill" /> {String(s.status || 'selected').replace(/^\w/, (c) => c.toUpperCase())}
                        </div>
                        <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginTop: 4 }}>{money(Number(s.selected_amount) || 0)} <Delta allowance={allowance} price={Number(s.selected_amount) || 0} /></div>
                        {specLine(s) && <div style={{ color: DIM, fontSize: 13, marginTop: 2 }}>{specLine(s)}</div>}
                        {s.selected_by && <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>Chosen by {s.selected_by}{s.selected_at ? ` · ${new Date(s.selected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>}
                      </div>
                    </div>
                  ) : s.options.length ? (
                    <div className="csOpts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
                      {s.options.map((o) => (
                        <div key={o.id} style={{ background: RAISED2, border: `1px solid ${o.is_recommended ? 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' : BORDER}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {o.image_url
                            ? <img src={o.image_url} alt={o.name} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                            : <div style={{ aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM }}><ImageSquare size={36} weight="duotone" /></div>}
                          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                            {o.is_recommended && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: GOLD, fontSize: 12, fontWeight: 800 }}><Star size={13} weight="fill" /> Recommended</span>}
                            <div style={{ color: TEXT, fontWeight: 800, fontSize: 15 }}>{o.name}</div>
                            {specLine(o) && <div style={{ color: DIM, fontSize: 13 }}>{specLine(o)}</div>}
                            {o.description && <div style={{ color: DIM, fontSize: 13 }}>{o.description}</div>}
                            <div style={{ color: TEXT, fontWeight: 900, fontSize: 20, marginTop: 4 }}>{money(o.price)}</div>
                            <Delta allowance={allowance} price={o.price} />
                            {o.spec_url && (
                              <a href={o.spec_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: GOLD, fontSize: 13, fontWeight: 700, minHeight: 32 }}>
                                Product details <ArrowSquareOut size={13} />
                              </a>
                            )}
                            <button type="button" onClick={() => { setNote(''); setConfirm({ sel: s, option: o }); }} style={{ ...btn(true), marginTop: 'auto' }}>Choose this</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (Number(s.selected_amount) || 0) > 0 || specLine(s) ? (
                    <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: DIM, fontSize: 12 }}>Your contractor specified</div>
                        {specLine(s) && <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>{specLine(s)}</div>}
                        <div style={{ color: TEXT, fontSize: 15 }}>{money(Number(s.selected_amount) || 0)} <Delta allowance={allowance} price={Number(s.selected_amount) || 0} /></div>
                      </div>
                      <button type="button" onClick={() => { setNote(''); setConfirm({ sel: s, option: null }); }} style={btn(true)}>Approve</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, color: DIM, fontSize: 14 }}>Your contractor is preparing options for this.</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {confirm && (() => {
        const allowance = Number(confirm.sel.allowance) || 0;
        const price = confirm.option ? confirm.option.price : Number(confirm.sel.selected_amount) || 0;
        const over = Math.round((price - allowance) * 100) / 100;
        return (
          <div role="dialog" aria-modal="true" aria-label="Confirm your choice" className="csSheetWrap"
            onClick={(e) => { if (e.target === e.currentTarget && !busy) setConfirm(null); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="csSheet" style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ color: DIM, fontSize: 13 }}>{confirm.sel.item_name}</div>
              <div style={{ color: TEXT, fontSize: 20, fontWeight: 900, margin: '4px 0 2px' }}>{confirm.option ? `Choose ${confirm.option.name}?` : 'Approve as specified?'}</div>
              <div style={{ color: TEXT, fontSize: 18, fontWeight: 800 }}>{money(price)}</div>
              {allowance > 0 && over > 0 ? (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${RED}`, background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: TEXT, fontSize: 14, lineHeight: 1.5 }}>
                  This is <b style={{ color: RED }}>{money(over)} over</b> your {money(allowance)} allowance. Choosing it adds a change order for <b>{money(over)}</b> to your contract.
                </div>
              ) : allowance === 0 && price > 0 ? (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${RED}`, background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: TEXT, fontSize: 14, lineHeight: 1.5 }}>
                  There is no allowance for this item, so choosing it adds a change order for <b>{money(price)}</b> to your contract.
                </div>
              ) : allowance > 0 ? (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${GREEN}`, background: 'color-mix(in srgb, var(--success) 10%, transparent)', color: TEXT, fontSize: 14 }}>
                  Within your {money(allowance)} allowance{over < 0 ? ` — ${money(-over)} to spare` : ''}.
                </div>
              ) : null}
              <label htmlFor="cs-note" style={{ display: 'block', color: DIM, fontSize: 13, margin: '14px 0 6px' }}>Note for your contractor (optional)</label>
              <textarea id="cs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: RAISED2, color: TEXT, fontSize: 16, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="button" disabled={busy} onClick={() => setConfirm(null)} style={{ ...btn(false), flex: 1 }}>Back</button>
                <button type="button" disabled={busy} onClick={choose} style={{ ...btn(true), flex: 2, opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Saving…' : over > 0 || (allowance === 0 && price > 0) ? `Choose — add ${money(allowance > 0 ? over : price)}` : confirm.option ? 'Choose' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 560px){.csSum{grid-template-columns:1fr 1fr 1fr;gap:6px}.csSum>div{padding:10px!important}.csSum>div>div:first-child{font-size:17px!important}.csOpts{grid-template-columns:1fr!important}.csSheetWrap{align-items:flex-end!important;padding:0!important}.csSheet{border-radius:16px 16px 0 0!important;max-width:none!important;padding-bottom:calc(20px + env(safe-area-inset-bottom))!important}}' }} />
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    minHeight: 44,
    padding: '10px 16px',
    borderRadius: 10,
    border: primary ? 'none' : `1px solid ${BORDER}`,
    background: primary ? GOLD : 'transparent',
    color: primary ? 'var(--on-brand)' : TEXT,
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
  };
}
