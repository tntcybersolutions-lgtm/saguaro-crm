'use client';

/**
 * Bid leveling.
 *
 * The low number is almost never the low bid. Bidders quote different scopes —
 * one excludes the trenching, another carries the fire caulking, a third
 * assumes owner-supplied fixtures — and awarding on the raw figure is how a GC
 * buys a $40,000 change order on day one. This screen exists to add the missing
 * scope back onto each bid until they describe the same job, and then to say
 * who is actually cheapest.
 *
 * Three things are put in front of the GC before any number:
 *
 *   THE SPREAD. A 4% spread across five bidders means the scope was clear. A
 *   40% spread means somebody has misread it, and the cheapest bid is the one
 *   most likely to be wrong. It is the first thing an estimator looks at and it
 *   was nowhere in the product.
 *
 *   WHO HAS NOT ANSWERED. Levelling three bids out of eight is a different
 *   decision from levelling three out of three, and the five missing are the
 *   risk. Shown, not hidden behind a tab.
 *
 *   EACH BIDDER'S OWN WORDS. Their exclusions verbatim, beside their number,
 *   because that text is where the gap actually is.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Scales, WarningCircle, CheckCircle, CaretLeft, Trophy, ClockCountdown,
} from '@phosphor-icons/react';
import { PremiumSurface, SectionCard, StatCard, PremiumEmpty, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';

const GOLD = '#C8960F';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const HAIR = 'rgba(255,255,255,0.10)';
const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const RED = '#EF4444';

type Bid = {
  id: string; company: string; email: string | null;
  base: number; gap: number; adjusted: number;
  exclusions: string | null; inclusions: string | null; clarifications: string | null;
  scheduleDays: number | null; bond: boolean; notes: string | null; submittedAt: string | null;
};

type Payload = {
  package: { id: string; name: string; trade: string | null; budget: number | null; levelingComplete: boolean; levelingCompletedAt: string | null; dueDate: string | null };
  bids: Bid[];
  scopeLines: Array<{ id: string; code: string; description: string; quantity: number | null; unit: string }>;
  awaiting: Array<{ company: string; status: string }>;
  summary: { received: number; invited: number; low: number | null; high: number | null; spreadPct: number; vsBudget: number | null };
};

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}`;

export default function BidLevelingPage() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const router = useRouter();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bid-packages/${id}/leveling`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load the bids.');
      setData(d as Payload);
      setGaps(Object.fromEntries((d.bids as Bid[]).map((b) => [b.id, b.gap ? String(b.gap) : ''])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the bids.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveGap(bidId: string) {
    setBusy(bidId);
    try {
      await fetch(`/api/bid-packages/${id}/leveling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId, gap: Number(String(gaps[bidId] || '').replace(/[^0-9.-]/g, '')) || 0 }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy('complete');
    try {
      await fetch(`/api/bid-packages/${id}/leveling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complete: true, scopeLines: data?.scopeLines ?? [] }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  /* Spread is the headline judgement, so it carries the colour. Under 10% the
     field agrees on the scope; past 25% somebody has priced a different job. */
  const spreadTone = useMemo(() => {
    const s = data?.summary.spreadPct ?? 0;
    if (!data || data.summary.received < 2) return DIM;
    return s <= 10 ? GREEN : s <= 25 ? AMBER : RED;
  }, [data]);

  if (loading) {
    return <PremiumSurface><div style={{ padding: 40, color: DIM }}>Loading bids…</div></PremiumSurface>;
  }

  if (error || !data) {
    return (
      <PremiumSurface>
        <SectionCard>
          <PremiumEmpty
            icon={<WarningCircle size={30} weight="duotone" color={AMBER} />}
            title="Could not load the bids"
            description={error || 'The bid package was not found.'}
            action={
              <button onClick={() => router.push(`/app/projects/${projectId}/bid-packages`)} style={ghostButtonStyle}>
                Back to bid packages
              </button>
            }
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  const { package: pkg, bids, awaiting, summary } = data;
  const lowAdjusted = bids.length ? bids[0].adjusted : 0;

  return (
    <PremiumSurface>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 4px 48px' }}>
        <Link
          href={`/app/projects/${projectId}/bid-packages/${id}`}
          style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, textDecoration: 'none' }}
        >
          <CaretLeft size={14} weight="bold" /> Back to package
        </Link>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>
            Bid Leveling
          </div>
          <h1 style={{ fontSize: 'clamp(23px, 3.2vw, 31px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
            {pkg.trade || pkg.name}
          </h1>
          <div style={{ color: DIM, fontSize: 14 }}>
            {summary.received} of {summary.invited} invited {summary.received === 1 ? 'bidder has' : 'bidders have'} priced this
            {pkg.levelingComplete ? ' · levelling marked complete' : ''}
          </div>
        </div>

        {/* The four numbers an estimator reads first. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
          <StatCard icon={<Trophy size={19} weight="duotone" color={GOLD} />} label="Low (adjusted)" value={money(lowAdjusted || summary.low)} />
          <StatCard
            icon={<Scales size={19} weight="duotone" color={spreadTone} />}
            label="Spread"
            value={summary.received >= 2 ? `${summary.spreadPct}%` : '—'}
            accent={summary.received >= 2 ? spreadTone : undefined}
          />
          <StatCard
            icon={<ClockCountdown size={19} weight="duotone" color={awaiting.length ? AMBER : GREEN} />}
            label="Still out"
            value={String(awaiting.length)}
            accent={awaiting.length ? AMBER : GREEN}
          />
          <StatCard
            icon={<CheckCircle size={19} weight="duotone" color={GOLD} />}
            label="vs estimate"
            value={summary.vsBudget == null ? '—' : `${summary.vsBudget > 0 ? '+' : ''}${summary.vsBudget}%`}
            accent={summary.vsBudget == null ? undefined : summary.vsBudget <= 0 ? GREEN : summary.vsBudget <= 10 ? AMBER : RED}
          />
        </div>

        {/* What the spread means, in words. A number without a reading is just
            a number, and this is the judgement the GC is actually making. */}
        {summary.received >= 2 && (
          <div
            style={{
              border: `1px solid ${summary.spreadPct > 25 ? 'rgba(239,68,68,0.35)' : HAIR}`,
              background: summary.spreadPct > 25 ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)',
              borderRadius: 12, padding: '13px 15px', marginBottom: 18,
              color: summary.spreadPct > 25 ? '#FCA5A5' : DIM, fontSize: 13.5, lineHeight: 1.6,
            }}
          >
            {summary.spreadPct <= 10
              ? 'The field is tight — the bidders read the scope the same way, so the low number is probably a real low bid.'
              : summary.spreadPct <= 25
                ? 'A moderate spread. Read the exclusions below before treating the low number as the low bid.'
                : `A ${summary.spreadPct}% spread means someone has priced a different job. The cheapest bid here is the one most likely to be missing scope — level it before you award.`}
          </div>
        )}

        {awaiting.length > 0 && (
          <SectionCard flat title={`Still awaiting ${awaiting.length}`} icon={<ClockCountdown size={17} weight="duotone" color={AMBER} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {awaiting.map((a, i) => (
                <span key={i} style={{ border: `1px solid ${HAIR}`, borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: DIM }}>
                  {a.company} <span style={{ color: a.status === 'declined' ? RED : AMBER }}>· {a.status}</span>
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {bids.length === 0 ? (
          <SectionCard>
            <PremiumEmpty
              icon={<Scales size={28} weight="duotone" color={DIM} />}
              title="No bids to level yet"
              description="Once bidders submit through their jacket link, they appear here side by side."
            />
          </SectionCard>
        ) : (
          <SectionCard flat title="Bids, levelled" icon={<Scales size={17} weight="duotone" color={GOLD} />} flush>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
                <thead>
                  <tr>
                    {['Bidder', 'Base bid', 'Scope gap', 'Adjusted', 'Their exclusions', ''].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${HAIR}`, fontWeight: 700 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b, i) => {
                    const isLow = i === 0 && b.adjusted > 0;
                    const delta = lowAdjusted > 0 ? b.adjusted - lowAdjusted : 0;
                    return (
                      <tr key={b.id} style={{ borderBottom: `1px solid ${HAIR}`, background: isLow ? 'rgba(34,197,94,0.06)' : undefined }}>
                        <td style={{ padding: '12px 14px', color: TEXT, fontWeight: 600 }}>
                          {isLow && <Trophy size={13} weight="fill" color={GREEN} style={{ marginRight: 6, verticalAlign: -1 }} />}
                          {b.company}
                          <div style={{ fontSize: 11.5, color: DIM, fontWeight: 400, marginTop: 2 }}>
                            {b.bond ? 'Bid bond ✓' : 'No bid bond'}
                            {b.scheduleDays ? ` · ${b.scheduleDays} days` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{money(b.base)}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <input
                            value={gaps[b.id] ?? ''}
                            onChange={(e) => setGaps((g) => ({ ...g, [b.id]: e.target.value }))}
                            onBlur={() => saveGap(b.id)}
                            inputMode="decimal"
                            placeholder="0"
                            style={{
                              width: 110, background: 'rgba(0,0,0,0.35)', border: `1px solid ${HAIR}`,
                              borderRadius: 8, padding: '7px 10px', color: TEXT, fontSize: 13,
                              outline: 'none', fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                          {busy === b.id && <span style={{ marginLeft: 8, fontSize: 11, color: DIM }}>saving…</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: isLow ? GREEN : TEXT }}>
                          {money(b.adjusted)}
                          {delta > 0 && (
                            <div style={{ fontSize: 11.5, color: DIM, fontWeight: 400, marginTop: 2 }}>+{money(delta)} over low</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: b.exclusions ? '#FCD34D' : DIM, maxWidth: 320, fontSize: 12.5, lineHeight: 1.5 }}>
                          {b.exclusions || <span style={{ color: DIM }}>None stated</span>}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <Link
                            href={`/app/projects/${projectId}/bid-packages/${id}`}
                            style={{ ...ghostButtonStyle, fontSize: 12, padding: '6px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}
                          >
                            Award
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {bids.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <button
              onClick={complete}
              disabled={busy !== null || pkg.levelingComplete}
              style={{ ...goldButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: pkg.levelingComplete ? 0.55 : 1 }}
            >
              <CheckCircle size={15} weight="bold" />
              {pkg.levelingComplete ? 'Levelling complete' : busy === 'complete' ? 'Saving…' : 'Mark levelling complete'}
            </button>
            <span style={{ color: DIM, fontSize: 12.5 }}>
              Gap values save as you leave each field, and the low bid is recalculated on adjusted totals.
            </span>
          </div>
        )}
      </div>
    </PremiumSurface>
  );
}
