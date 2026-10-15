'use client';

/**
 * The bidder's bid jacket — token-gated, no login.
 *
 * This page is what every bid invitation the product has ever sent was
 * pointing at, and it did not exist. The invite email linked to
 * /portals/sub/<invite token>: a path with no page behind it, whose auth route
 * validates a portal_sub_sessions token rather than an invite token, on a
 * domain that fell back to a dead Vercel preview. Four ways to fail in one URL,
 * which is a large part of why 70 bid packages produced zero bids.
 *
 * A subcontractor has no account and should never need one to price work, so
 * the opaque per-invite token is the capability. They see the same jacket the
 * GC assembled — same component, same assembly — plus the two things they came
 * to do: submit a number, or decline so the GC can re-solicit the trade while
 * there is still time.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { WarningCircle, CheckCircle, PaperPlaneTilt, XCircle, Plus, Trash } from '@phosphor-icons/react';
import BidJacketView, { type Jacket } from '@/components/BidJacketView';
import { SectionCard, PremiumEmpty, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { moneyToCents, MAX_ALTERNATES, type LineQuote, type BondQuote } from '@/lib/bid-leveling';

const GOLD = 'var(--brand-primary)';
const TEXT = '#F0F4FF';
const DIM = 'var(--text-secondary)';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = '#4ADE80';
const AMBER = '#FBBF24';

type Payload = Jacket & {
  invite: { id: string; company: string | null; contact: string | null; email: string | null; status: string };
  canSubmit: boolean;
  closed: boolean;
  alreadySubmitted: {
    id: string; amount: number | null; submittedAt: string | null;
    lines?: { itemId: string; status: LineQuote; amount: number | null }[];
    alternates?: { label: string; amount: number; kind: 'add' | 'deduct' }[];
    bond?: { status: BondQuote; amount: number | null } | null;
    totalNote?: string | null;
    exclusions?: string | null;
    notes?: string | null;
  } | null;
};

type LineEntry = { status: LineQuote; amount: string };
type AltEntry = { label: string; amount: string; kind: 'add' | 'deduct' };

const QUOTE_LABEL: Record<LineQuote, string> = { priced: 'Price', included: 'Included', excluded: 'Excluded', not_quoted: 'Not quoted' };
const BOND_LABEL: Record<BondQuote | 'none', string> = { none: 'No bond quote', included: 'Included in my price', priced: 'Priced separately', not_offered: 'Not offered' };
const usd2 = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const asInput = (n: number | null | undefined) => (n == null ? '' : String(n));

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function BidderJacketPage() {
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [exclusions, setExclusions] = useState('');
  /* The line-item price sheet. lines is keyed by bid_package_items.id. */
  const [lines, setLines] = useState<Record<string, LineEntry>>({});
  const [alts, setAlts] = useState<AltEntry[]>([]);
  const [bond, setBond] = useState<{ status: BondQuote | 'none'; amount: string }>({ status: 'none', amount: '' });
  /* null = the base bid follows the line total; a string = the bidder typed their own. */
  const [override, setOverride] = useState<string | null>(null);
  const [totalNote, setTotalNote] = useState('');
  const [busy, setBusy] = useState<'submit' | 'decline' | null>(null);
  const [done, setDone] = useState<'submitted' | 'declined' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bid-packages/portal/${token}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'This link is no longer valid.');
      const pl = d as Payload;
      setData(pl);
      /* Pre-fill from the bid already on file, so a revision starts from it. */
      const mine = pl.alreadySubmitted;
      const stored = new Map((mine?.lines || []).map((l) => [l.itemId, l]));
      setLines(Object.fromEntries((pl.lineItems || []).map((li) => {
        const st = stored.get(li.id);
        return [li.id, { status: st?.status || 'priced', amount: st?.status === 'priced' ? asInput(st.amount) : '' }];
      })));
      setAlts((mine?.alternates || []).map((a) => ({ label: a.label, amount: asInput(a.amount), kind: a.kind })));
      setBond(mine?.bond ? { status: mine.bond.status, amount: asInput(mine.bond.amount) } : { status: 'none', amount: '' });
      setAmount(mine?.amount != null ? String(mine.amount) : '');
      /* A base that differed from the lines (with its note) stays as typed;
         otherwise the base follows the line total. */
      setOverride(mine?.amount != null && mine.totalNote ? String(mine.amount) : null);
      setTotalNote(mine?.totalNote || '');
      setExclusions(mine?.exclusions || '');
      setNotes(mine?.notes || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This link is no longer valid.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const lineItems = useMemo(() => data?.lineItems || [], [data]);
  const hasSheet = lineItems.length > 0;
  const lineTotalCents = useMemo(
    () => lineItems.reduce((t, li) => (lines[li.id]?.status === 'priced' ? t + (moneyToCents(lines[li.id].amount) || 0) : t), 0),
    [lineItems, lines],
  );
  const pricedCount = lineItems.filter((li) => lines[li.id]?.status === 'priced' && (moneyToCents(lines[li.id].amount) || 0) > 0).length;
  /* The base bid: the line total unless the bidder typed another figure. */
  const baseText = hasSheet ? (override ?? (lineTotalCents ? (lineTotalCents / 100).toFixed(2) : '')) : amount;
  const baseCents = moneyToCents(baseText) ?? 0;
  const differs = hasSheet && pricedCount > 0 && override != null && baseCents !== lineTotalCents;

  const setLine = (id: string, patch: Partial<LineEntry>) =>
    setLines((x) => ({ ...x, [id]: { ...(x[id] || { status: 'priced', amount: '' }), ...patch } }));

  /** Client-side check before sending — the server repeats every one of these. */
  function sheetProblem(): string | null {
    for (const li of lineItems) {
      const l = lines[li.id];
      if (l?.status === 'priced' && moneyToCents(l.amount) == null) {
        return `Price ${li.description || 'every line'}, or mark it Included, Excluded or Not quoted.`;
      }
    }
    if (bond.status === 'priced' && !(moneyToCents(bond.amount) || 0)) return 'Enter the bond price, or pick another bond option.';
    for (const a of alts) {
      if (!a.label.trim() && !a.amount.trim()) continue;
      if (!a.label.trim()) return 'Describe each alternate.';
      if (!(moneyToCents(a.amount) || 0)) return `Enter an amount for "${a.label.trim()}".`;
    }
    if (baseCents <= 0) return 'Enter your bid amount.';
    if (differs && !totalNote.trim()) return 'Your bid amount differs from your line total. Add a note explaining the difference.';
    return null;
  }

  async function respond(action: 'submit' | 'decline') {
    if (action === 'submit') {
      const problem = sheetProblem();
      if (problem) { setFormError(problem); return; }
    }
    setBusy(action);
    setFormError(null);
    try {
      const r = await fetch(`/api/bid-packages/portal/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'decline'
            ? { action: 'decline' }
            : {
                action: 'submit',
                amount: baseCents / 100,
                notes,
                exclusions,
                ...(hasSheet
                  ? {
                      lines: lineItems.map((li) => {
                        const l = lines[li.id] || { status: 'priced', amount: '' };
                        return { itemId: li.id, status: l.status, amount: l.status === 'priced' ? (moneyToCents(l.amount) ?? 0) / 100 : null };
                      }),
                      ...(differs ? { totalNote: totalNote.trim() } : {}),
                    }
                  : {}),
                alternates: alts
                  .filter((a) => a.label.trim() || a.amount.trim())
                  .map((a) => ({ label: a.label.trim(), amount: (moneyToCents(a.amount) ?? 0) / 100, kind: a.kind })),
                ...(bond.status !== 'none'
                  ? { bond: { status: bond.status, amount: bond.status === 'priced' ? (moneyToCents(bond.amount) ?? 0) / 100 : null } }
                  : {}),
              },
        ),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not record your response.');
      setDone(action === 'decline' ? 'declined' : 'submitted');
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not record your response.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Shell><div style={{ padding: 40, color: DIM }}>Opening bid jacket…</div></Shell>;
  }

  if (error || !data) {
    return (
      <Shell>
        <SectionCard>
          <PremiumEmpty
            icon={<WarningCircle size={30} weight="duotone" color={AMBER} />}
            title="This Bid Link Is No Longer Valid"
            description={
              (error || '') +
              ' If you believe this is a mistake, contact the general contractor who invited you.'
            }
          />
        </SectionCard>
      </Shell>
    );
  }

  const submitted = data.alreadySubmitted || done === 'submitted';
  const declined = done === 'declined' || data.invite.status === 'declined';

  return (
    <Shell>
      <BidJacketView
        jacket={data}
        projectId={data.project.id}
        packageId={data.package.id}
        /* No back link: a bidder has nowhere in the app to go back to. */
        backHref={null}
        slot={
          <SectionCard
            flat
            title={declined ? 'You Declined This Invitation' : submitted ? 'Your Bid' : 'Submit Your Bid'}
            icon={
              declined ? <XCircle size={17} weight="duotone" color={DIM} />
                : submitted ? <CheckCircle size={17} weight="duotone" color={GREEN} />
                  : <PaperPlaneTilt size={17} weight="duotone" color="var(--text-secondary)" />
            }
          >
            {declined ? (
              <div style={{ color: DIM, fontSize: 14, lineHeight: 1.6 }}>
                The general contractor has been told you are not bidding this package, so they can
                approach another subcontractor. Nothing further is needed from you.
              </div>
            ) : submitted ? (
              <div>
                <div style={{ fontSize: 26, fontWeight: 700, color: GREEN, fontVariantNumeric: 'tabular-nums' }}>
                  {money(data.alreadySubmitted?.amount ?? (baseCents ? baseCents / 100 : null))}
                </div>
                <div style={{ color: DIM, fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
                  Received{data.alreadySubmitted?.submittedAt
                    ? ` ${new Date(data.alreadySubmitted.submittedAt).toLocaleString()}`
                    : ''}. You can revise it any time before the deadline — submitting again
                  replaces this figure rather than adding a second bid.
                </div>
              </div>
            ) : !data.canSubmit ? (
              <div style={{ color: AMBER, fontSize: 14, lineHeight: 1.6 }}>
                {data.closed
                  ? 'Bidding for this package has closed. The jacket stays open so you can see what was requested.'
                  : 'This invitation is no longer open for bidding.'}
              </div>
            ) : null}

            {!declined && data.canSubmit && (
              <div style={{ marginTop: submitted ? 18 : 0 }}>
                <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
                  {hasSheet && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                        <div style={labelStyle}>Line Prices · {pricedCount}/{lineItems.length} priced</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{usd2(lineTotalCents)}</div>
                      </div>
                      <div style={{ borderTop: `1px solid ${HAIR}` }}>
                        {lineItems.map((li) => {
                          const l = lines[li.id] || { status: 'priced' as LineQuote, amount: '' };
                          const bad = l.status === 'priced' && l.amount.trim() !== '' && moneyToCents(l.amount) == null;
                          return (
                            <div key={li.id} className="bp-line">
                              <div className="bp-desc">
                                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, lineHeight: 1.35 }}>{li.description || 'Scope line'}</div>
                                {(li.code || li.quantity != null) && (
                                  <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                                    {[li.code, li.quantity != null ? `${li.quantity} ${li.unit || ''}`.trim() : ''].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                              <div className="bp-ctl">
                                <select
                                  aria-label={`How ${li.description || 'this line'} is quoted`}
                                  value={l.status}
                                  onChange={(e) => setLine(li.id, { status: e.target.value as LineQuote })}
                                  style={{ ...inputStyle, width: 132, flex: '0 0 132px', padding: '11px 8px' }}
                                >
                                  {(Object.keys(QUOTE_LABEL) as LineQuote[]).map((k) => <option key={k} value={k}>{QUOTE_LABEL[k]}</option>)}
                                </select>
                                {l.status === 'priced' ? (
                                  <input
                                    aria-label={`Price for ${li.description || 'this line'}`}
                                    value={l.amount}
                                    onChange={(e) => setLine(li.id, { amount: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="$0.00"
                                    style={{ ...inputStyle, flex: '1 1 0', minWidth: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...(bad ? { borderColor: 'var(--danger)' } : {}) }}
                                  />
                                ) : (
                                  <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'right', fontSize: 14, fontWeight: 700, color: l.status === 'included' ? 'var(--success)' : 'var(--warning)' }}>
                                    {QUOTE_LABEL[l.status]}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Field label={hasSheet ? 'Base Bid · sum of your lines' : 'Your Bid Amount'}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={baseText}
                        onChange={(e) => (hasSheet ? setOverride(e.target.value) : setAmount(e.target.value))}
                        inputMode="decimal"
                        placeholder="0.00"
                        style={{ ...inputStyle, fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                      />
                      {hasSheet && override != null && (
                        <button type="button" onClick={() => { setOverride(null); setTotalNote(''); }} style={{ ...ghostButtonStyle, whiteSpace: 'nowrap', minHeight: 44 }}>
                          Use line total
                        </button>
                      )}
                    </div>
                  </Field>
                  {differs && (
                    <Field label={`Why your bid differs from your line total (${usd2(lineTotalCents)})`}>
                      <textarea
                        value={totalNote}
                        onChange={(e) => setTotalNote(e.target.value)}
                        rows={2}
                        placeholder="Discount for award of the full package"
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </Field>
                  )}

                  <div>
                    <div style={{ ...labelStyle, marginBottom: 6 }}>Alternates (Optional)</div>
                    {alts.map((a, i) => (
                      <div key={i} className="bp-alt">
                        <input
                          aria-label={`Alternate ${i + 1} description`}
                          value={a.label}
                          onChange={(e) => setAlts((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))}
                          placeholder={`Alternate ${i + 1}`}
                          style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0 }}
                        />
                        <div style={{ display: 'flex', gap: 8, flex: '1 1 220px', minWidth: 0 }}>
                          <select
                            aria-label={`Alternate ${i + 1} add or deduct`}
                            value={a.kind}
                            onChange={(e) => setAlts((x) => x.map((y, j) => (j === i ? { ...y, kind: e.target.value === 'deduct' ? 'deduct' : 'add' } : y)))}
                            style={{ ...inputStyle, width: 96, flex: '0 0 96px', padding: '11px 8px' }}
                          >
                            <option value="add">Add</option>
                            <option value="deduct">Deduct</option>
                          </select>
                          <input
                            aria-label={`Alternate ${i + 1} amount`}
                            value={a.amount}
                            onChange={(e) => setAlts((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))}
                            inputMode="decimal"
                            placeholder="$0.00"
                            style={{ ...inputStyle, flex: '1 1 0', minWidth: 0, textAlign: 'right' }}
                          />
                          <button
                            type="button"
                            aria-label={`Remove alternate ${i + 1}`}
                            onClick={() => setAlts((x) => x.filter((_, j) => j !== i))}
                            style={{ ...ghostButtonStyle, minWidth: 44, minHeight: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash size={16} weight="bold" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {alts.length < MAX_ALTERNATES && (
                      <button
                        type="button"
                        onClick={() => setAlts((x) => [...x, { label: '', amount: '', kind: 'add' }])}
                        style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}
                      >
                        <Plus size={15} weight="bold" /> Add Alternate
                      </button>
                    )}
                  </div>

                  <Field label={data.requirements?.bond ? 'Bond · required for this package' : 'Bond (Optional)'}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <select
                        value={bond.status}
                        onChange={(e) => setBond((b) => ({ ...b, status: e.target.value as BondQuote | 'none' }))}
                        style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
                      >
                        {(Object.keys(BOND_LABEL) as (BondQuote | 'none')[]).map((k) => <option key={k} value={k}>{BOND_LABEL[k]}</option>)}
                      </select>
                      {bond.status === 'priced' && (
                        <input
                          aria-label="Bond price"
                          value={bond.amount}
                          onChange={(e) => setBond((b) => ({ ...b, amount: e.target.value }))}
                          inputMode="decimal"
                          placeholder="$0.00"
                          style={{ ...inputStyle, flex: '1 1 140px', minWidth: 0, textAlign: 'right' }}
                        />
                      )}
                    </div>
                  </Field>
                  <Field label="Exclusions (Optional)">
                    <textarea
                      value={exclusions}
                      onChange={(e) => setExclusions(e.target.value)}
                      rows={2}
                      placeholder="Anything your price does not include"
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                  <Field label="Notes to the General Contractor (Optional)">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Clarifications, assumptions, lead times"
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                </div>

                {formError && (
                  <div style={{ color: '#F87171', fontSize: 13, marginTop: 12, fontWeight: 600 }}>{formError}</div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                  <button
                    onClick={() => respond('submit')}
                    disabled={busy !== null}
                    style={{ ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                  >
                    <PaperPlaneTilt size={15} weight="bold" />
                    {busy === 'submit' ? 'Sending…' : submitted ? 'Revise My Bid' : 'Submit Bid'}
                  </button>
                  {!submitted && (
                    <button
                      onClick={() => respond('decline')}
                      disabled={busy !== null}
                      style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                    >
                      <XCircle size={15} weight="bold" />
                      {busy === 'decline' ? 'Sending…' : 'Not Bidding This One'}
                    </button>
                  )}
                </div>
                <div style={{ color: DIM, fontSize: 12, marginTop: 10, lineHeight: 1.55 }}>
                  Declining tells the general contractor early enough to approach someone else —
                  it is more useful to them than silence.
                </div>
              </div>
            )}
          </SectionCard>
        }
      />
    </Shell>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.35)',
  border: `1px solid ${HAIR}`,
  borderRadius: 10,
  padding: '11px 13px',
  color: TEXT,
  /* 16px: anything smaller makes iOS zoom the whole page on focus, and subs
     price work from a phone in a truck as often as from a desk. */
  fontSize: 16,
  outline: 'none',
};

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: DIM };

/* One line per scope item: description on top, choice + amount under it on a
   phone; side by side from 640px up. */
const SHEET_CSS = `
.bp-line{display:flex;flex-direction:column;gap:8px;padding:10px 0;border-bottom:1px solid ${HAIR}}
.bp-desc{min-width:0}
.bp-ctl{display:flex;gap:8px;align-items:center;min-width:0}
.bp-alt{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
@media (min-width:640px){
  .bp-line{flex-direction:row;align-items:center;gap:14px}
  .bp-desc{flex:1 1 auto}
  .bp-ctl{flex:0 0 340px}
}
`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: DIM, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

/** The bidder is not inside the app, so this supplies the page ground and a
 *  quiet attribution rather than the signed-in shell. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: TEXT, padding: 'clamp(16px, 4vw, 40px) clamp(12px, 4vw, 28px)' }}>
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>{children}</div>
      <div style={{ maxWidth: 1240, margin: '28px auto 0', color: DIM, fontSize: 12, textAlign: 'center' }}>
        Powered by <a href="https://saguarocontrol.net/" style={{ color: 'var(--link)', textDecoration: 'none' }}>Saguaro</a>
      </div>
    </div>
  );
}
