'use client';

/**
 * NudgeRing — the visual nudge half of the suggestion system.
 *
 * Wraps a module section in a pulsing accent ring + "flagged" badge whenever
 * the live /api/suggestions feed (same SWR key the SuggestionTicker rides —
 * one request per page) contains suggestions whose anchorId matches this
 * ring's. Ticker items link to `/module#<anchorId>`, this component carries
 * that DOM id, so clicking a ticker item lands here: the section scrolls into
 * view and the ring pulses harder for a few seconds.
 *
 * Honest by construction: no matching suggestions → the children render
 * completely unchanged (just carrying the anchor id). The badge's dollar
 * figure is the sum of the matched suggestions' engine-computed dollars —
 * never invented. All motion dies under prefers-reduced-motion.
 *
 * Dismissed suggestions never light the ring: exclusion lives server-side in
 * the feed (30-day suppression on recompute) and dismissals drop items from
 * the shared SWR cache optimistically, so ticker and ring stay ONE system.
 * On project-scoped pages pass `projectId` so the ring only counts the rows
 * that actually live on the page it wraps.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSuggestionFeed, sevColor } from '@/components/intelligence/SuggestionTicker';
import type { SuggestionSeverity } from '@/lib/suggestions';

const SEV_RANK: Record<SuggestionSeverity, number> = { red: 0, amber: 1, info: 2 };

const NUDGE_FX = `
@keyframes sgNudgePulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes sgNudgeBoost{0%{box-shadow:0 0 0 0 var(--sg-nudge-glow)}70%{box-shadow:0 0 0 14px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion: reduce){
  .sgNudgeRing,.sgNudgeRingBoost{animation:none!important}
}
`;

export default function NudgeRing({
  anchorId,
  projectId,
  children,
  style,
  radius = 18,
}: {
  /** Matches Suggestion.anchorId from lib/suggestions.ts — the sync contract. */
  anchorId: string;
  /** On project-scoped pages: only count suggestions for THIS project. */
  projectId?: string | null;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Border radius of the ring — match the wrapped surface. */
  radius?: number;
}) {
  const { suggestions } = useSuggestionFeed();
  const [boost, setBoost] = useState(false);

  const matched = useMemo(
    () => suggestions.filter(
      (s) => s.anchorId === anchorId && (!projectId || s.projectId === projectId),
    ),
    [suggestions, anchorId, projectId],
  );
  const active = matched.length > 0;

  const { color, dollars } = useMemo(() => {
    let worst: SuggestionSeverity = 'info';
    let d = 0;
    for (const s of matched) {
      if (SEV_RANK[s.severity] < SEV_RANK[worst]) worst = s.severity;
      if (s.dollars != null) d += s.dollars;
    }
    return { color: sevColor(worst), dollars: d };
  }, [matched]);

  // Deep-link landing: ticker links carry #anchorId — scroll here and pulse
  // harder for a few seconds so the eye lands on the flagged section.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onHash = () => {
      if (typeof window === 'undefined') return;
      if (window.location.hash !== `#${anchorId}`) return;
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setBoost(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setBoost(false), 5000);
    };
    onHash(); // handle arriving with the hash already set
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      if (timer) clearTimeout(timer);
    };
  }, [anchorId]);

  return (
    <div id={anchorId} style={{
      position: 'relative', scrollMarginTop: 96,
      /* Room above for the badge, so it never lands on the row above or on
         the section's own first row (it touched the Daily Logs sort bar). */
      ...(active ? { marginTop: 14 } : null),
      ...style,
    }}>
      {active && (
        <>
          <style>{NUDGE_FX}</style>
          {/* Pulsing accent ring — decorative, never intercepts clicks */}
          <div
            aria-hidden
            className={boost ? 'sgNudgeRingBoost' : 'sgNudgeRing'}
            style={{
              position: 'absolute', inset: -6, borderRadius: radius + 6,
              border: `1.5px solid ${color}`, pointerEvents: 'none', zIndex: 2,
              boxShadow: `0 0 26px -6px ${color}, inset 0 0 22px -14px ${color}`,
              // CSS custom property feeds the sgNudgeBoost keyframe glow.
              ...({ '--sg-nudge-glow': `color-mix(in srgb, ${color} 40%, transparent)` } as React.CSSProperties),
              animation: boost
                ? 'sgNudgeBoost 1.1s ease-out 3, sgNudgePulse 1.1s ease-in-out infinite'
                : 'sgNudgePulse 2.4s ease-in-out infinite',
            }}
          />
          {/* Flagged badge — counts + the engine's honest dollar total */}
          <div
            aria-hidden
            title={matched.map((s) => s.finding).join('\n')}
            style={{
              position: 'absolute', top: -17, right: 16, zIndex: 3, /* straddles the ring line, clear of the content */
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 11px', borderRadius: 999, pointerEvents: 'none',
              background: 'var(--bg-solid-2)', border: `1px solid ${color}`,
              boxShadow: `0 0 14px -4px ${color}`,
              fontSize: 10, fontWeight: 900,
              color, whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden style={{
              width: 6, height: 6, borderRadius: 999, background: color,
              boxShadow: `0 0 6px ${color}`,
            }} />
            {matched.length} flagged
            {dollars > 0 && (
              <span style={{ color: 'var(--brand-primary-strong)' }}>
                {'$' + Math.round(dollars).toLocaleString('en-US')}
              </span>
            )}
          </div>
        </>
      )}
      {children}
    </div>
  );
}
