'use client';
/**
 * Home alert line — the day's state in one glance, flat on the page (a
 * hairline above and below, no box).
 *
 * Left: counts by colour — red late · yellow due today · waiting on others ·
 * orange to review · green done today. Late, today and waiting are My Day's
 * own numbers (lib/home/day-ticker), so Home and My Day always agree. On a
 * phone the counts are five equal columns, the number over a one-word label.
 * Right (under, on a phone): the alerts, each a link to the page that clears
 * it. When they all fit they sit still in one row; when they don't, one shows
 * at a time, whole, and the next fades in after a few seconds (held while
 * hovered, focused or touched; never on its own with reduced motion). The
 * pager steps through by hand.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WarningCircle, Camera, Clock, CheckCircle, CaretRight, Hourglass } from '@phosphor-icons/react';
import type { TickerItem, TickerSummary, TickerTone } from '@/lib/home/ticker';

const ICON: Record<TickerTone, React.ReactNode> = {
  red: <WarningCircle size={15} weight="fill" />,
  review: <Camera size={15} weight="fill" />,
  yellow: <Clock size={15} weight="fill" />,
  waiting: <Hourglass size={15} weight="fill" />,
  green: <CheckCircle size={15} weight="fill" />,
};

const CSS = `
.atk { display: flex; align-items: stretch; gap: 0; min-width: 0; width: 100%; max-width: 100%; contain: inline-size; border-radius: 0; border: 0; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); background: none; overflow: hidden; }
.atkSum { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; padding: 8px 16px 8px 0; border-right: 1px solid var(--border-subtle); }
.atkLive { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--c-text-2); }
.atkLive i { width: 7px; height: 7px; border-radius: 50%; background: var(--c-green); }
/* A count: icon + number on one line, the word beside it (under it on a phone). */
.atkN { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; line-height: 1; color: var(--c-text-2); white-space: nowrap; }
.atkTop { display: inline-flex; align-items: center; gap: 5px; line-height: 1; }
.atkTop svg { flex: none; display: block; }
.atkN b { font-size: 17px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.atkW { white-space: nowrap; }
.atkWs { display: none; white-space: nowrap; }
.atkN[data-tone="red"] b, .atkN[data-tone="red"] svg { color: var(--c-red); }
.atkN[data-tone="review"] b, .atkN[data-tone="review"] svg { color: var(--c-orange); }
.atkN[data-tone="yellow"] b, .atkN[data-tone="yellow"] svg { color: var(--warning); }
.atkN[data-tone="green"] b, .atkN[data-tone="green"] svg { color: var(--c-green); }
.atkN[data-tone="waiting"] b, .atkN[data-tone="waiting"] svg { color: var(--text-primary); }
.atkN[data-zero="true"] { opacity: .45; }
button.atkN { min-height: 44px; padding: 0 6px; margin: 0 -6px; background: none; border: 0; border-radius: 10px; font: inherit; font-size: 13px; font-weight: 800; line-height: 1; cursor: pointer; }
button.atkN:disabled { cursor: default; }
button.atkN:not(:disabled):hover { background: var(--bg-hover); }
button.atkN:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
button.atkN[aria-pressed="true"] { background: var(--bg-surface-2); box-shadow: inset 0 -2px 0 currentColor; }
.atkShowAll { flex: 0 0 auto; align-self: center; min-height: 44px; margin: 0 12px 0 4px; padding: 0 14px; border-radius: 999px; border: 1px dashed var(--border-subtle); background: none; color: var(--c-text-2); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
/* The alerts. When they all fit they sit still in one row. When they don't,
   ONE alert shows at a time, whole (it wraps rather than being cut), and the
   next one fades in every few seconds; the pager steps through by hand. No
   marquee: a moving strip always showed words cut at both edges. */
.atkRail { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 6px 0 6px 14px; }
.atkSet { display: flex; align-items: center; gap: 10px; min-width: 0; }
.atkOne { flex: 1 1 auto; min-width: 0; display: flex; }
.atkMeasure { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; display: flex; gap: 10px; width: max-content; }
/* An alert sits on the page: a coloured status icon and the words — no pill,
   no fill, no border box. Several in a row are split by a hairline. */
.atkItem { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; border-radius: 0; border: 0; background: none; color: var(--c-text); font-size: 14px; font-weight: 650; text-decoration: none; white-space: nowrap; }
.atkSet > :first-child > .atkItem { padding-left: 0; }
.atkSet > * + * > .atkItem { border-left: 1px solid var(--border-subtle); }
.atkOne .atkItem { white-space: normal; max-width: 100%; min-width: 0; padding: 7px 0; line-height: 1.35; animation: atk-in .35s ease both; }
.atkOne .atkItem > span { min-width: 0; overflow-wrap: break-word; }
@keyframes atk-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.atkItem:hover > span { text-decoration: underline; text-underline-offset: 3px; }
.atkItem:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.atkItem > svg { flex: 0 0 auto; }
.atkItem[data-tone="red"] > svg:first-child { color: var(--c-red); }
.atkItem[data-tone="review"] > svg:first-child { color: var(--c-orange); }
.atkItem[data-tone="yellow"] > svg:first-child { color: var(--warning); }
.atkItem[data-tone="green"] > svg:first-child { color: var(--c-green); }
.atkItem[data-tone="waiting"] > svg:first-child { color: var(--text-secondary); }
.atkItem .go { color: var(--c-text-3); }
.atkPager { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 44px; min-height: 44px; padding: 0 8px; border: 0; border-radius: 10px; background: none; color: var(--text-tertiary); font: inherit; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; }
.atkPager:hover { background: var(--bg-hover); color: var(--text-primary); }
.atkPager:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.atkFail { padding: 0 14px; font-size: 13px; color: var(--c-text-3); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .atkOne .atkItem { animation: none; }
}
@media (max-width: 767px) {
  .atk { flex-direction: column; }
  /* Five equal columns: the number big on one baseline, a short word under it. */
  .atkSum { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: stretch; border-right: 0; border-bottom: 1px solid var(--border-subtle); gap: 0; padding: 4px 0; }
  .atkLive { display: none; }
  button.atkN { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-width: 0; min-height: 56px; margin: 0; padding: 6px 2px; font-size: 12px; font-weight: 700; text-align: center; }
  .atkN b { font-size: 20px; }
  .atkW { display: none; }
  .atkWs { display: block; max-width: 100%; overflow: hidden; color: var(--text-secondary); letter-spacing: .01em; }
  .atkRail { padding: 6px 0; }
  .atkItem { min-height: 44px; }
  .atkShowAll { align-self: stretch; margin: 0 10px 10px; }
}
`;

/* The words My Day uses, so the two screens read the same. */
const COUNTS: Array<[TickerTone, string, string]> = [['red', 'late', 'late'], ['yellow', 'due today', 'today'], ['waiting', 'waiting', 'waiting'], ['review', 'to review', 'review'], ['green', 'done today', 'done']];

export default function AlertTicker({ items, summary, failed }: { items: TickerItem[]; summary: TickerSummary; failed?: boolean }) {
  const railRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [idx, setIdx] = useState(0);
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [still, setStill] = useState(false);
  // A count is a button: it shows only that colour's alerts (tap again for all).
  const [only, setOnly] = useState<TickerTone | null>(null);
  const shown = only ? items.filter((i) => i.tone === only) : items;
  const resume = useRef<number | undefined>(undefined);

  // All in one row when they fit; otherwise one at a time.
  useLayoutEffect(() => {
    const rail = railRef.current, m = measureRef.current;
    if (!rail || !m) return;
    const measure = () => setFits(m.scrollWidth <= rail.clientWidth - 14);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(rail);
    return () => ro?.disconnect();
  }, [items, only]);
  useEffect(() => { setIdx(0); }, [only, items.length]);
  useEffect(() => () => window.clearTimeout(resume.current), []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setStill(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const n = shown.length;
  const at = n ? idx % n : 0;
  const current = n ? shown[at] : null;
  const rotating = !fits && n > 1;
  const paused = held || hover || focused || still;

  // Next alert after long enough to read this one; never while held, hovered or focused.
  const curId = current?.id;
  const curLen = current?.text.length ?? 0;
  useEffect(() => {
    if (!rotating || paused || !curId) return;
    const ms = Math.min(9000, Math.max(4500, curLen * 70));
    const t = window.setTimeout(() => setIdx((i) => i + 1), ms);
    return () => window.clearTimeout(t);
  }, [rotating, paused, curId, curLen, at]);

  // A finger on the alert holds it still long enough to read and tap.
  const hold = () => {
    setHeld(true);
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => setHeld(false), 6000);
  };

  const pill = (i: TickerItem, k: string) => (
    <Link key={k} href={i.href} className="atkItem" data-tone={i.tone}>
      {ICON[i.tone]}<span>{i.text}</span><CaretRight size={12} className="go" aria-hidden />
    </Link>
  );

  return (
    <section className="atk" aria-label="Alerts">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="atkSum">
        <span className="atkLive"><i aria-hidden /> Live</span>
        {COUNTS.map(([tone, word, short]) => {
          const c = summary[tone] ?? 0;
          const any = items.some((i) => i.tone === tone);
          return (
            <button key={tone} type="button" className="atkN" data-tone={tone} data-zero={c ? undefined : 'true'}
              disabled={!any} aria-pressed={only === tone}
              aria-label={`${c} ${word}${any ? (only === tone ? ' — showing only these; tap for all alerts' : ' — show only these') : ''}`}
              onClick={() => setOnly((o) => (o === tone ? null : tone))}>
              <span className="atkTop" aria-hidden>{ICON[tone]}<b>{c}</b></span>
              <span className="atkW" aria-hidden>{word}</span>
              <span className="atkWs" aria-hidden>{short}</span>
            </button>
          );
        })}
      </div>
      <div className="atkRail" ref={railRef}
        onTouchStart={hold} onPointerDown={hold}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}>
        {/* Measures the whole row, unseen, to decide between "all" and "one at a time". */}
        <div className="atkMeasure" ref={measureRef} aria-hidden>
          {shown.map((i) => <span key={i.id} className="atkItem">{ICON[i.tone]}<span>{i.text}</span><CaretRight size={12} /></span>)}
        </div>
        {rotating && current ? (
          <>
            <div className="atkOne" role="group" aria-roledescription="alert" aria-label={`${at + 1} of ${n}`}>
              {pill(current, `${at}:${current.id}`)}
            </div>
            <button type="button" className="atkPager" aria-label={`Next alert (${at + 1} of ${n})`} onClick={() => { setIdx((i) => i + 1); hold(); }}>
              {at + 1}/{n}<CaretRight size={12} weight="bold" aria-hidden />
            </button>
          </>
        ) : (
          <div className="atkSet" role="list">
            {shown.map((i) => <span key={i.id} role="listitem" style={{ display: 'contents' }}>{pill(i, i.id)}</span>)}
          </div>
        )}
        {failed && <span className="atkFail">Some alerts couldn&apos;t load.</span>}
      </div>
      {/* Outside the alert row: inside it, the row's clipping left this button
          visible but untappable (the iPhone probe could not click it). */}
      {only && <button type="button" className="atkShowAll" onClick={() => setOnly(null)}>Show all alerts</button>}
    </section>
  );
}
