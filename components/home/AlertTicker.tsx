'use client';
/**
 * Owner Home alert ticker — the portfolio's state in one glance.
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
.atk { display: flex; align-items: stretch; gap: 0; min-width: 0; width: 100%; max-width: 100%; contain: inline-size; border-radius: 16px; border: 1px solid var(--border-subtle); background: linear-gradient(180deg, var(--c-raised), var(--c-card)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 32px -22px rgba(0,0,0,0.9); overflow: hidden; }
.atkSum { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-right: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); }
.atkLive { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 900; letter-spacing: .14em; color: var(--c-text-3); }
.atkLive i { width: 7px; height: 7px; border-radius: 50%; background: var(--c-green); box-shadow: 0 0 0 3px rgba(44,255,122,0.18); }
.atkN { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: var(--c-text-2); white-space: nowrap; }
.atkN b { font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; }
.atkN[data-tone="red"] b, .atkN[data-tone="red"] svg { color: var(--c-red); }
.atkN[data-tone="review"] b, .atkN[data-tone="review"] svg { color: var(--c-orange); }
.atkN[data-tone="yellow"] b, .atkN[data-tone="yellow"] svg { color: var(--c-yellow); }
.atkN[data-tone="green"] b, .atkN[data-tone="green"] svg { color: var(--c-green); }
.atkN[data-zero="true"] { opacity: .45; }
.atkRail { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; align-items: center; -webkit-mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent); }
.atkTrack { display: flex; align-items: center; gap: 10px; padding: 8px 14px; width: max-content; animation: atk-move var(--atk-dur, 40s) linear infinite; }
.atk[data-static="true"] .atkTrack { animation: none; }
.atkRail:hover .atkTrack, .atkRail:focus-within .atkTrack, .atk[data-paused="true"] .atkTrack { animation-play-state: paused; }
@keyframes atk-move { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.atkSet { display: flex; gap: 10px; }
.atkItem { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); color: var(--c-text); font-size: 13.5px; font-weight: 700; text-decoration: none; white-space: nowrap; }
.atkItem:hover { background: rgba(255,255,255,0.07); }
.atkItem:focus-visible { outline: 2px solid var(--c-yellow); outline-offset: 2px; }
.atkItem > svg:first-child { flex: 0 0 auto; }
.atkItem[data-tone="red"] { border-color: rgba(255,59,48,0.45); background: rgba(255,59,48,0.08); }
.atkItem[data-tone="red"] > svg:first-child { color: var(--c-red); }
.atkItem[data-tone="review"] { border-color: rgba(255,138,0,0.45); background: rgba(255,138,0,0.08); }
.atkItem[data-tone="review"] > svg:first-child { color: var(--c-orange); }
.atkItem[data-tone="yellow"] > svg:first-child { color: var(--c-yellow); }
.atkItem[data-tone="green"] > svg:first-child { color: var(--c-green); }
.atkItem .go { color: var(--c-text-3); }
.atkFail { padding: 0 14px; font-size: 12.5px; color: var(--c-text-3); white-space: nowrap; }
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
  .atkN { display: grid; grid-template-columns: auto auto; justify-content: center; align-items: center; column-gap: 5px; row-gap: 2px; font-size: 11px; text-align: center; white-space: normal; line-height: 1.15; }
  .atkN b { font-size: 18px; }
  .atkN > span { grid-column: 1 / -1; }
  .atkItem { min-height: 44px; }
}
`;

export default function AlertTicker({ items, summary, failed }: { items: TickerItem[]; summary: TickerSummary; failed?: boolean }) {
  const railRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [paused, setPaused] = useState(false);
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
  }, [items]);
  useEffect(() => () => window.clearTimeout(resume.current), []);

  // A finger on the strip holds it still long enough to read and tap.
  const hold = () => {
    setPaused(true);
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => setPaused(false), 6000);
  };

  const chars = items.reduce((n, i) => n + i.text.length, 0);
  const duration = Math.max(24, Math.round(chars * 0.32));
  const list = (dup: boolean) => items.map((i) => (
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
        <span className="atkLive"><i aria-hidden /> LIVE</span>
        <span className="atkN" data-tone="red" data-zero={summary.red ? undefined : 'true'}>{ICON.red}<b>{summary.red}</b> <span>urgent</span></span>
        <span className="atkN" data-tone="review" data-zero={summary.review ? undefined : 'true'}>{ICON.review}<b>{summary.review}</b> <span>to review</span></span>
        <span className="atkN" data-tone="yellow" data-zero={summary.yellow ? undefined : 'true'}>{ICON.yellow}<b>{summary.yellow}</b> <span>coming up</span></span>
        <span className="atkN" data-tone="green" data-zero={summary.green ? undefined : 'true'}>{ICON.green}<b>{summary.green}</b> <span>done today</span></span>
      </div>
      <div className="atkRail" ref={railRef} onTouchStart={hold} onPointerDown={hold}>
        <div className="atkTrack" role="list">
          <div ref={firstRef} className="atkSet" role="presentation">{list(false)}</div>
          {!fits && <div className="atkSet atkDup" role="presentation">{list(true)}</div>}
        </div>
        {failed && <span className="atkFail">Some alerts couldn&apos;t load.</span>}
      </div>
    </section>
  );
}
