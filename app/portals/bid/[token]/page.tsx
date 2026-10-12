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

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WarningCircle, CheckCircle, PaperPlaneTilt, XCircle } from '@phosphor-icons/react';
import BidJacketView, { type Jacket } from '@/components/BidJacketView';
import { SectionCard, PremiumEmpty, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';

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
  alreadySubmitted: { id: string; amount: number | null; submittedAt: string | null } | null;
};

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
      setData(d as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This link is no longer valid.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function respond(action: 'submit' | 'decline') {
    setBusy(action);
    setFormError(null);
    try {
      const r = await fetch(`/api/bid-packages/portal/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'decline'
            ? { action: 'decline' }
            : { action: 'submit', amount: Number(amount.replace(/[^0-9.]/g, '')) || 0, notes, exclusions },
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
                  : <PaperPlaneTilt size={17} weight="duotone" color={GOLD} />
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
                  {money(data.alreadySubmitted?.amount ?? (Number(amount.replace(/[^0-9.]/g, '')) || null))}
                </div>
                <div style={{ color: DIM, fontSize: 13.5, marginTop: 6, lineHeight: 1.6 }}>
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
                <div style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
                  <Field label="Your Bid Amount">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      style={inputStyle}
                    />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: DIM, marginBottom: 6 }}>
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
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>{children}</div>
      <div style={{ maxWidth: 1240, margin: '28px auto 0', color: DIM, fontSize: 11.5, textAlign: 'center' }}>
        Powered by <a href="https://saguarocontrol.net/" style={{ color: GOLD, textDecoration: 'none' }}>Saguaro</a>
      </div>
    </div>
  );
}
