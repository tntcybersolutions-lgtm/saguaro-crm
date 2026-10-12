'use client';
/**
 * Owner Home alert ticker — the portfolio's state in one glance (the stop-light
 * bar: red urgent · orange to review · yellow coming up · green done today).
 * Back on the flat Home at Chad's request, 2026-10-11.
 *
 * Left: counts by colour (red urgent · orange to review · yellow coming up ·
 * green done today). Right: a slow-moving strip of one-line alerts, each a
 * link to the page that clears it. It pauses while hovered, focused or
 * touched; when everything fits it simply sits still; with reduced motion on
 * it never moves and scrolls sideways by hand instead.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WarningCircle, Camera, Clock, CheckCircle, CaretRight } from '@phosphor-icons/react';
import type { TickerItem, TickerSummary, TickerTone } from '@/lib/home/ticker';

const ICON: Record<TickerTone, React.ReactNode> = {
  red: <WarningCircle size={15} weight="fill" />,
  review: <Camera size={15} weight="fill" />,
  yellow: <Clock size={15} weight="fill" />,
  green: <CheckCircle size={15} weight="fill" />,
};

const CSS = `
.atk { display: flex; align-items: stretch; gap: 0; min-width: 0; width: 100%; max-width: 100%; contain: inline-size; border-radius: 12px; border: 1px solid var(--border-default); background: var(--bg-surface); overflow: hidden; }
.atkSum { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-right: 1px solid var(--border-subtle); }
.atkLive { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--c-text-2); }
.atkLive i { width: 7px; height: 7px; border-radius: 50%; background: var(--c-green); }
.atkN { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: var(--c-text-2); white-space: nowrap; }
.atkN b { font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; }
.atkN[data-tone="red"] b, .atkN[data-tone="red"] svg { color: var(--c-red); }
.atkN[data-tone="review"] b, .atkN[data-tone="review"] svg { color: var(--c-orange); }
.atkN[data-tone="yellow"] b, .atkN[data-tone="yellow"] svg { color: var(--warning); }
.atkN[data-tone="green"] b, .atkN[data-tone="green"] svg { color: var(--c-green); }
.atkN[data-zero="true"] { opacity: .45; }
button.atkN { min-height: 44px; padding: 0 6px; margin: 0 -6px; background: none; border: 0; border-radius: 10px; font: inherit; cursor: pointer; }
button.atkN:disabled { cursor: default; }
button.atkN:not(:disabled):hover { background: var(--bg-hover); }
button.atkN:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
button.atkN[aria-pressed="true"] { background: var(--bg-surface-2); box-shadow: inset 0 -2px 0 currentColor; }
.atkShowAll { flex: 0 0 auto; align-self: center; min-height: 44px; margin: 0 12px 0 4px; padding: 0 14px; border-radius: 999px; border: 1px dashed var(--border-subtle); background: none; color: var(--c-text-2); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.atkRail { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; align-items: center; -webkit-mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent); }
.atkTrack { display: flex; align-items: center; gap: 10px; padding: 8px 14px; width: max-content; animation: atk-move var(--atk-dur, 40s) linear infinite; }
.atk[data-static="true"] .atkTrack { animation: none; }
.atkRail:hover .atkTrack, .atkRail:focus-within .atkTrack, .atk[data-paused="true"] .atkTrack { animation-play-state: paused; }
@keyframes atk-move { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.atkSet { display: flex; gap: 10px; }
.atkItem { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--c-text); font-size: 14px; font-weight: 700; text-decoration: none; white-space: nowrap; }
.atkItem:hover { background: var(--bg-hover); }
.atkItem:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
.atkItem > svg:first-child { flex: 0 0 auto; }
.atkItem[data-tone="red"] { border-color: rgba(248,113,113,0.45); background: rgba(248,113,113,0.08); }
.atkItem[data-tone="red"] > svg:first-child { color: var(--c-red); }
.atkItem[data-tone="review"] { border-color: rgba(251,191,36,0.45); background: rgba(251,191,36,0.08); }
.atkItem[data-tone="review"] > svg:first-child { color: var(--c-orange); }
.atkItem[data-tone="yellow"] > svg:first-child { color: var(--warning); }
.atkItem[data-tone="green"] > svg:first-child { color: var(--c-green); }
.atkItem .go { color: var(--c-text-3); }
.atkFail { padding: 0 14px; font-size: 13px; color: var(--c-text-3); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .atkTrack { animation: none; }
  .atkRail { overflow-x: auto; -webkit-mask-image: none; mask-image: none; scroll-snap-type: x proximity; }
  .atkItem { scroll-snap-align: start; }
  .atkDup { display: none; }
}
@media (max-width: 767px) {
  .atk { flex-direction: column; }
  .atkSum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-right: 0; border-bottom: 1px solid var(--border-subtle); gap: 4px; padding: 10px 8px; }
  .atkLive { display: none; }
  .atkN { display: grid; grid-template-columns: auto auto; justify-content: center; align-items: center; column-gap: 5px; row-gap: 2px; font-size: 12px; text-align: center; white-space: normal; line-height: 1.15; }
  .atkN b { font-size: 18px; }
  .atkN > span { grid-column: 1 / -1; }
  .atkItem { min-height: 44px; }
  .atkShowAll { align-self: stretch; margin: 0 10px 10px; }
}
`;

const COUNTS: Array<[TickerTone, string]> = [['red', 'urgent'], ['review', 'to review'], ['yellow', 'coming up'], ['green', 'done today']];

export default function AlertTicker({ items, summary, failed }: { items: TickerItem[]; summary: TickerSummary; failed?: boolean }) {
  const railRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [paused, setPaused] = useState(false);
  // A count is a button: it shows only that colour's alerts (tap again for all).
  const [only, setOnly] = useState<TickerTone | null>(null);
  const shown = only ? items.filter((i) => i.tone === only) : items;
  const resume = useRef<number | undefined>(undefined);

  // Only move when the alerts don't fit; a short list just sits still.
  useLayoutEffect(() => {
    const rail = railRef.current, first = firstRef.current;
    if (!rail || !first) return;
    const measure = () => setFits(first.scrollWidth <= rail.clientWidth);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(rail);
    return () => ro?.disconnect();
  }, [items, only]);
  useEffect(() => () => window.clearTimeout(resume.current), []);

  // A finger on the strip holds it still long enough to read and tap.
  const hold = () => {
    setPaused(true);
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => setPaused(false), 6000);
  };

  const chars = shown.reduce((n, i) => n + i.text.length, 0);
  const duration = Math.max(24, Math.round(chars * 0.32));
  const list = (dup: boolean) => shown.map((i) => (
    <Link key={`${dup ? 'd' : 'a'}:${i.id}`} href={i.href} className="atkItem" data-tone={i.tone}
      tabIndex={dup ? -1 : undefined} aria-hidden={dup || undefined}>
      {ICON[i.tone]}<span>{i.text}</span><CaretRight size={12} className="go" />
    </Link>
  ));

  return (
    <section className="atk" aria-label="Alerts" data-static={fits ? 'true' : undefined} data-paused={paused ? 'true' : undefined}
      style={{ ['--atk-dur' as string]: `${duration}s` } as React.CSSProperties}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="atkSum">
        <span className="atkLive"><i aria-hidden /> Live</span>
        {COUNTS.map(([tone, word]) => {
          const n = summary[tone];
          const any = items.some((i) => i.tone === tone);
          return (
            <button key={tone} type="button" className="atkN" data-tone={tone} data-zero={n ? undefined : 'true'}
              disabled={!any} aria-pressed={only === tone}
              aria-label={`${n} ${word}${any ? (only === tone ? ' — showing only these; tap for all alerts' : ' — show only these') : ''}`}
              onClick={() => setOnly((o) => (o === tone ? null : tone))}>
              {ICON[tone]}<b>{n}</b> <span>{word}</span>
            </button>
          );
        })}
      </div>
      <div className="atkRail" ref={railRef} onTouchStart={hold} onPointerDown={hold}>
        <div className="atkTrack" role="list">
          <div ref={firstRef} className="atkSet" role="presentation">{list(false)}</div>
          {!fits && <div className="atkSet atkDup" role="presentation">{list(true)}</div>}
        </div>
        {failed && <span className="atkFail">Some alerts couldn&apos;t load.</span>}
      </div>
      {/* Outside the moving strip: inside it, the strip's clipping and mask left
          this button visible but untappable (the iPhone probe could not click it). */}
      {only && <button type="button" className="atkShowAll" onClick={() => setOnly(null)}>Show all alerts</button>}
    </section>
  );
}
