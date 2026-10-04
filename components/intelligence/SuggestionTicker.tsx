'use client';

/**
 * SuggestionTicker — the horizontal "learning moments" ticker bar.
 *
 * Renders the live /api/suggestions feed (rule engine over REAL tenant rows —
 * see lib/suggestions.ts) as a scrolling strip of severity-colored items.
 * Every item deep-links into its module; when the target page mounts a
 * <NudgeRing anchorId={...}> matching the suggestion's anchorId, the hash in
 * the link scrolls to and pulses that exact section — the ticker and the ring
 * are synced through the same suggestion feed.
 *
 * Honest by construction: the bar renders NOTHING while loading, on error, or
 * when the engine found nothing — no filler, no invented urgency. Dollar
 * figures (computed from real rows server-side) render gold; motion pauses on
 * hover and is disabled entirely under prefers-reduced-motion (the strip
 * falls back to a plain scrollable row).
 *
 * Every item carries an unobtrusive × — dismissing POSTs to /api/suggestions
 * (learning layer) and optimistically drops the item from the shared SWR cache,
 * so the ticker and every NudgeRing clear together; the server then suppresses
 * the stable id for 30 days on recompute. Following an item's deep link logs
 * an 'accept' the same fire-and-forget way — it never blocks navigation.
 */

import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import type { Suggestion, SuggestionFeed, SuggestionSeverity } from '@/lib/suggestions';

const GOLD_HI = 'var(--brand-primary-strong)'; // white-label aware
// Desert-dusk severity palette — matches the dashboard + intelligence pages.
const RED = '#FF3B30';
const AMBER = 'var(--warning)';
const INFO = 'rgba(255,255,255,0.45)';
const BORDER = 'rgba(255,255,255,0.08)';
const DIM = 'rgba(255,255,255,0.55)';

export const sevColor = (s: SuggestionSeverity): string =>
  s === 'red' ? RED : s === 'amber' ? AMBER : INFO;

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

const FEED_KEY = '/api/suggestions';

/** Shared SWR feed — SWR dedupes by key, so the ticker and every NudgeRing on
 *  a page ride ONE request. Refreshes every 2 minutes to stay "real time".
 *  Dismissal threads through here so both consumers stay ONE system: the
 *  server excludes dismissed ids on recompute, and `dismiss` removes the item
 *  from this shared cache immediately. */
export function useSuggestionFeed(): {
  suggestions: Suggestion[];
  isLoading: boolean;
  error: unknown;
  /** Dismiss: optimistic removal everywhere + 30-day server-side suppression. */
  dismiss: (s: Suggestion) => void;
  /** Accept: fire-and-forget learning receipt — never blocks navigation. */
  logAccept: (s: Suggestion) => void;
} {
  const { data, error, isLoading, mutate } = useSWR<SuggestionFeed>(FEED_KEY, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    refreshInterval: 120_000,
  });

  const record = useCallback((s: Suggestion, action: 'accept' | 'dismiss') => {
    // Fire-and-forget — the learning receipt must never slow the UI.
    void fetch(FEED_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ suggestionId: s.id, rule: s.rule, action, dollars: s.dollars }),
    }).catch(() => {});
  }, []);

  const dismiss = useCallback(
    (s: Suggestion) => {
      // Optimistic removal from the shared cache — the ticker and every
      // NudgeRing ride this one key, so the item vanishes everywhere at once.
      void mutate(
        (cur) => (cur ? { ...cur, suggestions: cur.suggestions.filter((x) => x.id !== s.id) } : cur),
        { revalidate: false },
      );
      record(s, 'dismiss');
    },
    [mutate, record],
  );

  const logAccept = useCallback((s: Suggestion) => record(s, 'accept'), [record]);

  return {
    suggestions: Array.isArray(data?.suggestions) ? data!.suggestions : [],
    isLoading,
    error,
    dismiss,
    logAccept,
  };
}

/** Finding text with the honest dollar figure rendered GOLD. The engine embeds
 *  the amount as `$1,234` built from `dollars` — split on that exact substring
 *  so only real money gets the money color. */
function FindingText({ s }: { s: Suggestion }) {
  if (s.dollars == null) return <>{s.finding}</>;
  const usd = '$' + Math.round(s.dollars).toLocaleString('en-US');
  const parts = s.finding.split(usd);
  if (parts.length === 1) return <>{s.finding}</>;
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: GOLD_HI, fontWeight: 800 }}>{usd}</span>}
          {p}
        </React.Fragment>
      ))}
    </>
  );
}

const TICKER_FX = `
@keyframes sgTickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes sgTickerDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.35)}}
.sgTickerTrack{display:inline-flex;align-items:center;will-change:transform}
.sgTickerViewport:hover .sgTickerTrack{animation-play-state:paused}
.sgTickerItem{transition:background .15s ease,border-color .15s ease}
.sgTickerItem:hover{background:rgba(255,255,255,0.07)!important;border-color:rgba(255,255,255,0.18)!important}
.sgTickerX{opacity:.35;transition:opacity .15s ease,color .15s ease}
.sgTickerItem:hover .sgTickerX{opacity:.75}
.sgTickerX:hover{opacity:1!important;color:#FF3B30!important}
@media (prefers-reduced-motion: reduce){
  .sgTickerTrack{animation:none!important}
  .sgTickerViewport{overflow-x:auto!important}
  .sgTickerDup{display:none!important}
}
`;

function TickerItem({
  s,
  onDismiss,
  onAccept,
  ghost = false,
}: {
  s: Suggestion;
  onDismiss: (s: Suggestion) => void;
  onAccept: (s: Suggestion) => void;
  /** The duplicated loop copy — aria-hidden, so keep it out of the tab order. */
  ghost?: boolean;
}) {
  const c = sevColor(s.severity);
  return (
    <Link
      href={s.href}
      title={s.why}
      className="sgTickerItem"
      tabIndex={ghost ? -1 : undefined}
      onClick={() => onAccept(s)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9, flexShrink: 0,
        margin: '0 5px', padding: '6px 13px 6px 10px', borderRadius: 999,
        background: 'rgba(255,255,255,0.035)', border: `1px solid ${BORDER}`,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7, height: 7, borderRadius: 999, flexShrink: 0,
          background: c, boxShadow: `0 0 8px ${c}`,
        }}
      />
      <span style={{
        fontSize: 9.5, fontWeight: 900, color: c,
        flexShrink: 0,
      }}>
        {s.moduleLabel}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
        <FindingText s={s} />
      </span>
      <span aria-hidden style={{ fontSize: 11, color: DIM, fontWeight: 900, flexShrink: 0 }}>&rarr;</span>
      <button
        type="button"
        className="sgTickerX"
        aria-label="Dismiss suggestion"
        title="Dismiss — won't resurface for 30 days"
        tabIndex={ghost ? -1 : undefined}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(s); }}
        style={{
          background: 'none', border: 'none', padding: '0 1px', margin: 0,
          color: DIM, fontSize: 13, fontWeight: 700, lineHeight: 1,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        &times;
      </button>
    </Link>
  );
}

export default function SuggestionTicker({ style }: { style?: React.CSSProperties }) {
  const { suggestions, dismiss, logAccept } = useSuggestionFeed();

  const { reds, ambers, dollarsAtStake } = useMemo(() => {
    let r = 0, a = 0, d = 0;
    for (const s of suggestions) {
      if (s.severity === 'red') r++;
      else if (s.severity === 'amber') a++;
      if (s.dollars != null) d += s.dollars;
    }
    return { reds: r, ambers: a, dollarsAtStake: d };
  }, [suggestions]);

  // Nothing found (or still loading / failed) → no bar at all. Never filler.
  if (suggestions.length === 0) return null;

  const worst = reds > 0 ? RED : ambers > 0 ? AMBER : INFO;
  // Slow, readable drift — scaled to content so density never speeds it up.
  const duration = Math.max(28, suggestions.length * 7);

  return (
    <div
      role="region"
      aria-label={`${suggestions.length} live suggestions`}
      style={{
        position: 'relative', display: 'flex', alignItems: 'stretch',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
        border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.03)',
        ...style,
      }}
    >
      <style>{TICKER_FX}</style>

      {/* Left cap — live pulse + counts + honest total $ at stake */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        padding: '10px 16px', borderRight: `1px solid ${BORDER}`,
        background: 'rgba(20,20,22,0.6)', position: 'relative', zIndex: 1,
      }}>
        <span aria-hidden style={{
          width: 8, height: 8, borderRadius: 999, background: worst,
          boxShadow: `0 0 10px ${worst}`, animation: 'sgTickerDot 2s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.8)',
          whiteSpace: 'nowrap',
        }}>
          Live Signals
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: DIM, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {suggestions.length} flagged
          {dollarsAtStake > 0 && (
            <>
              {' · '}
              <span style={{ color: GOLD_HI }}>
                {'$' + Math.round(dollarsAtStake).toLocaleString('en-US')}
              </span>
              {' at stake'}
            </>
          )}
        </span>
      </div>

      {/* Scrolling strip — duplicated once for a seamless loop */}
      <div className="sgTickerViewport" style={{ overflow: 'hidden', flex: 1, display: 'flex', alignItems: 'center' }}>
        <div
          className="sgTickerTrack"
          style={{ animation: `sgTickerScroll ${duration}s linear infinite`, padding: '7px 0' }}
        >
          {suggestions.map((s) => <TickerItem key={s.id} s={s} onDismiss={dismiss} onAccept={logAccept} />)}
          <span aria-hidden className="sgTickerDup" style={{ display: 'inline-flex' }}>
            {suggestions.map((s) => <TickerItem key={`dup-${s.id}`} s={s} onDismiss={dismiss} onAccept={logAccept} ghost />)}
          </span>
        </div>
      </div>
    </div>
  );
}
