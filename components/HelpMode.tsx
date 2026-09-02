'use client';

/**
 * Help Mode — the arrow that points at the button you need next.
 *
 * Turn it on, pick a question, and an arrow lands on the real control with one
 * line telling you what it does. Do the thing and the arrow moves to the next
 * one. It follows you across pages, so "how do I create a project?" runs from
 * the sidebar, through the form, into uploading the drawings and out the far
 * side with a priced takeoff.
 *
 * Three things this does that a tooltip library does not:
 *
 *   It anchors to the live element, re-measured every frame, so the arrow stays
 *   correct when the page scrolls, the sidebar collapses or a card reflows.
 *
 *   It survives navigation. The active tour and step live in sessionStorage,
 *   so a full page load in the middle of a flow picks up where it left off.
 *
 *   It never blocks the click. The overlay is pointer-events:none and the
 *   spotlight is a hole in a mask, so the button under the arrow is the actual
 *   button — you are using the product, not a simulation of it.
 *
 * Mounted once in app/app/layout.tsx. The top bar toggles it by dispatching
 * 'saguaro-help-mode', matching the existing 'open-command-palette' convention.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Lifebuoy, X, CaretRight, MagicWand } from '@phosphor-icons/react';
import { TOURS, CATEGORY_ORDER, tourById, routeMatches, type Tour, type TourStep } from '@/lib/help-tours';

const GOLD = '#F59E0B';
const GOLD_HI = '#FBBF24';
const TEXT = '#F0F4FF';
const DIM = '#8BAAC8';
const BORDER = '#1E3A5F';
const CARD = '#0D1D2E';

/**
 * Above everything, and not by a margin that another component can close.
 *
 * 400 cleared the modal (200) and toast (300) layers but left the scrim under
 * the top bar on some screens, which reads as the page going dark while the
 * header stays lit and nothing explains why. This is a full-screen overlay
 * that is only ever up deliberately; there is nothing it should sit beneath.
 */
const Z = 2147483000;

const SS_TOUR = 'sag_help_tour';
const SS_ON = 'sag_help_on';
/* localStorage, not session: the first-run offer happens once ever, not once
   per tab. */
const LS_AUTOSTART = 'sag_help_autostart_v1';

const CALLOUT_W = 336;
/**
 * Room between the callout and the target.
 *
 * At 92 the callout landed on top of the project sub-nav and the arrowhead
 * stopped 22px past the sidebar's right edge — directly on the "Estimate" row.
 * The ring was correctly around Projects and the arrow still read as pointing
 * at Estimate, because an arrowhead sitting on a different clickable row is
 * what the eye follows. Wider gap, and the head now stops against the ring.
 */
const ARROW_GAP = 132;
/** How far past the ring the arrowhead sits. The ring is drawn at rect+8. */
const HEAD_OFFSET = 15;

type Side = 'right' | 'left' | 'below' | 'above';

interface Rect { x: number; y: number; w: number; h: number }

/* ── anchor resolution ─────────────────────────────────────────────────── */

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = window.getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
}

function visibleText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Find what a step points at.
 *
 * Selectors first — data-tour is put on controls deliberately and survives
 * restyling. Text second, because button wording drifts and a tour whose arrow
 * silently vanishes is worse than one that lands slightly wide.
 */
function findAnchor(step: TourStep): HTMLElement | null {
  for (const sel of step.anchor ?? []) {
    let found: Element | null = null;
    try { found = document.querySelector(sel); } catch { found = null; }
    if (found && isVisible(found)) return found as HTMLElement;
  }
  if (step.anchorText?.length) {
    /* Controls first. Then anything clickable, because plenty of real targets
       are not buttons: the Takeoff Studio drop zone is a <div> with an onClick,
       and searching only buttons meant "Drop blueprints here" matched nothing
       while sitting in plain view on the screen. */
    const scopes = step.anchorTag
      ? [step.anchorTag]
      : ['button, a, [role="button"], summary, label',
         'div, section, li, td, span, p, h1, h2, h3, h4'];

    for (const scope of scopes) {
      const nodes = Array.from(document.querySelectorAll(scope)).filter(isVisible);
      for (const want of step.anchorText) {
        const exact = nodes.filter((n) => visibleText(n) === want);
        /* Smallest wins — an exact text match on <body> is not the target. */
        if (exact.length) return smallest(exact);
      }
      for (const want of step.anchorText) {
        const partial = nodes.filter((n) => {
          const t = visibleText(n);
          return t.length < 120 && t.toLowerCase().includes(want.toLowerCase());
        });
        if (partial.length) return smallest(partial);
      }
    }
  }
  return null;
}

/** The tightest element of a set — the one that actually wraps the label. */
function smallest(els: Element[]): HTMLElement {
  let best = els[0];
  let bestArea = Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > 0 && area < bestArea) { bestArea = area; best = el; }
  }
  return best as HTMLElement;
}

/** Which side of the target has room for the callout. */
function chooseSide(r: Rect, vw: number, vh: number): Side {
  if (r.x + r.w + ARROW_GAP + CALLOUT_W < vw - 16) return 'right';
  if (r.x - ARROW_GAP - CALLOUT_W > 16) return 'left';
  if (r.y + r.h + ARROW_GAP + 150 < vh - 16) return 'below';
  return 'above';
}

/* ── component ─────────────────────────────────────────────────────────── */

export default function HelpMode() {
  const pathname = usePathname();
  const router = useRouter();

  const [on, setOn] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  const anchorRef = useRef<HTMLElement | null>(null);
  const calloutRef = useRef<HTMLDivElement | null>(null);
  const [calloutH, setCalloutH] = useState(150);
  const searchedSince = useRef<number>(0);

  const step: TourStep | null = tour ? tour.steps[stepIdx] ?? null : null;
  /* A step pinned to a route waits until the reader is actually on it. */
  const onRoute = routeMatches(step?.route, pathname ?? '');

  /* ── restore across navigation ──────────────────────────────────────── */
  useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try {
      if (sessionStorage.getItem(SS_ON) === '1') setOn(true);
      const raw = sessionStorage.getItem(SS_TOUR);
      if (raw) {
        const saved = JSON.parse(raw) as { id: string; step: number };
        const t = tourById(saved.id);
        if (t) { setTour(t); setStepIdx(Math.min(saved.step, t.steps.length - 1)); }
      }
    } catch { /* private mode, cleared storage — start fresh, no harm */ }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_ON, on ? '1' : '0');
      if (tour) sessionStorage.setItem(SS_TOUR, JSON.stringify({ id: tour.id, step: stepIdx }));
      else sessionStorage.removeItem(SS_TOUR);
    } catch { /* nothing to do — the tour still works for this page */ }
  }, [on, tour, stepIdx]);

  /* ── first sign-in: offer the walkthrough without being asked ───────── */
  useEffect(() => {
    if (on || tour) return;
    if ((pathname ?? '') !== '/app') return;
    try { if (localStorage.getItem(LS_AUTOSTART) === '1') return; } catch { return; }

    /* "New" means the getting-started rail is on screen — it renders only while
       the nine-step journey is unfinished, so it is a real signal of a fresh
       account rather than a guess. A GC three jobs deep never sees this.
       The rail arrives with its data, so wait for it briefly. */
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      const rail = document.querySelector('[data-tour="getting-started"]');
      if (rail) {
        window.clearInterval(timer);
        try { localStorage.setItem(LS_AUTOSTART, '1'); } catch { /* fine */ }
        const t = tourById('first-day');
        if (t) { setOn(true); setTour(t); setStepIdx(0); }
      } else if (tries > 20) {
        /* No rail after 4s — established account. Don't ask again. */
        window.clearInterval(timer);
        try { localStorage.setItem(LS_AUTOSTART, '1'); } catch { /* fine */ }
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [pathname, on, tour]);

  /* ── the top bar toggles us ─────────────────────────────────────────── */
  useEffect(() => {
    const toggle = () => setOn((v) => !v);
    window.addEventListener('saguaro-help-mode', toggle);
    return () => window.removeEventListener('saguaro-help-mode', toggle);
  }, []);

  const exit = useCallback(() => {
    setTour(null); setStepIdx(0); setRect(null); anchorRef.current = null;
  }, []);

  const advance = useCallback(() => {
    if (!tour) return;
    /* Computed here rather than inside a setStepIdx updater. An updater must be
       pure — React may call it twice in development, and setTour/setRect inside
       it fired twice, which ended the tour early on the last step. */
    const last = stepIdx + 1 >= tour.steps.length;
    anchorRef.current = null;
    searchedSince.current = 0;
    setMissing(false);
    setRect(null);
    if (last) { setTour(null); setStepIdx(0); }
    else setStepIdx(stepIdx + 1);
  }, [tour, stepIdx]);

  /* ── track the anchor every frame ───────────────────────────────────── */
  useEffect(() => {
    if (!on || !step || !onRoute) { setRect(null); anchorRef.current = null; return; }
    let raf = 0;
    searchedSince.current = performance.now();

    const tick = () => {
      const el = anchorRef.current && document.contains(anchorRef.current)
        ? anchorRef.current
        : findAnchor(step);

      if (el) {
        anchorRef.current = el;
        setMissing(false);
        const r = el.getBoundingClientRect();
        setRect((prev) => {
          /* Whole pixels. Sub-pixel layout means getBoundingClientRect returns
             values that wobble in the third decimal every frame, and each
             wobble was a state update and a re-render — the arrow and callout
             twitching in place with nothing actually moving. */
          const next = {
            x: Math.round(r.left), y: Math.round(r.top),
            w: Math.round(r.width), h: Math.round(r.height),
          };
          if (prev && prev.x === next.x && prev.y === next.y
            && prev.w === next.w && prev.h === next.h) return prev;
          return next;
        });
      } else {
        anchorRef.current = null;
        setRect(null);
        /* Give the page a second to finish rendering before admitting defeat —
           a route change and a data fetch both land after the step begins. */
        if (performance.now() - searchedSince.current > 1500) setMissing(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, step, onRoute, pathname]);

  /* Scroll the target into view when a step begins. */
  useEffect(() => {
    if (!rect || !anchorRef.current) return;
    const el = anchorRef.current;

    /* Nothing to scroll to if the target is pinned to the viewport. Most nav
       steps point at the sidebar or the top bar, and scrolling the page for
       those moves the content the reader is looking at while leaving the
       target exactly where it was. */
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const pos = window.getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return;
    }

    const r = rect;
    if (r.y < 60 || r.y + r.h > window.innerHeight - 60) {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
    // Only when the step changes, not on every reflow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, tour?.id, Boolean(rect)]);

  /* ── advancing ──────────────────────────────────────────────────────── */

  /* click: the reader pressed the thing the arrow points at */
  useEffect(() => {
    if (!on || !step || step.advance !== 'click') return;
    const onClick = (e: MouseEvent) => {
      const el = anchorRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) {
        /* Let the app handle the click first, then move on. */
        window.setTimeout(advance, 120);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [on, step, advance]);

  /* input: they filled the field in */
  useEffect(() => {
    if (!on || !step || step.advance !== 'input') return;
    const done = (e: Event) => {
      const el = anchorRef.current;
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      const v = (el as HTMLInputElement).value ?? '';
      if (v.trim().length >= 2) advance();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') done(e as unknown as Event);
    };
    document.addEventListener('focusout', done, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusout', done, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [on, step, advance]);

  /* route: they got to the page this step was waiting for */
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (!on || !step || step.advance !== 'route' || !step.nextRoute) return;
    const p = pathname ?? '';
    const changed = lastPath.current !== pathname;
    lastPath.current = pathname;
    /* Already standing on the destination when the step begins. Nothing will
       ever change the route, so the step would sit there telling you to click
       a link to where you are. Exact match only — being inside
       /app/projects/<id>/overview is NOT being on the project list, and that
       step really does still need the sidebar click. */
    if (routeMatches(step.nextRoute, p)) { advance(); return; }
    /* Landed somewhere under the destination — good enough for a nav step. */
    if (changed && p.startsWith(step.nextRoute + '/')) advance();
  }, [pathname, on, step, advance]);

  /* Esc leaves */
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (tour) exit(); else setOn(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, tour, exit]);

  useLayoutEffect(() => {
    if (calloutRef.current) setCalloutH(calloutRef.current.offsetHeight);
  }, [stepIdx, tour?.id, rect, missing, onRoute]);

  if (!on) return null;
  /**
   * Portals need a mounted flag, not a `typeof document` check.
   *
   * The server renders nothing and the client renders a portal, so testing
   * `document` directly means the two passes disagree on the very first render
   * whenever help mode was already on from a previous page — a hydration
   * mismatch, which React resolves by throwing away and re-rendering the tree.
   * `mounted` is false on both passes and flips in an effect, so the two agree.
   */
  if (!mounted) return null;

  /**
   * Everything renders into document.body.
   *
   * `position: fixed` is only fixed to the viewport while no ancestor has a
   * transform, filter, backdrop-filter or perspective — any of those makes it
   * the containing block instead, and the overlay silently scopes itself to a
   * sub-rectangle of the page. This shell has an animated PageTransition and a
   * backdrop-filtered top bar, so the scrim covered the content column while
   * leaving the header bright and the callout could land outside the visible
   * area entirely: a page that just goes dark with nothing on it. A portal to
   * body cannot be captured that way.
   */

  /* ── the menu ───────────────────────────────────────────────────────── */
  if (!tour) {
    return createPortal(
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: Z,
          background: 'rgba(3,6,12,0.72)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '76px 20px 32px', overflowY: 'auto',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setOn(false); }}
      >
        <div style={{ width: 'min(720px, 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
            <Lifebuoy size={22} weight="duotone" color={GOLD} />
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: TEXT, letterSpacing: '-0.01em' }}>
              Show me how
            </h2>
            <button
              onClick={() => setOn(false)}
              aria-label="Close help"
              style={{
                marginLeft: 'auto', width: 34, height: 34, borderRadius: 9, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: DIM,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={15} weight="bold" />
            </button>
          </div>
          <p style={{ margin: '0 0 22px', color: DIM, fontSize: 13.5, lineHeight: 1.55, maxWidth: 560 }}>
            Pick a question. An arrow will point at the button you need, one step at a time,
            all the way through — including across pages.
          </p>

          {CATEGORY_ORDER.map((cat) => {
            const inCat = TOURS.filter((t) => t.category === cat);
            if (!inCat.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 9 }}>
                  {cat}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {inCat.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTour(t); setStepIdx(0); setRect(null); setMissing(false);
                        anchorRef.current = null;
                        if (!(pathname ?? '').startsWith(t.startRoute)) router.push(t.startRoute);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                        minHeight: 56, padding: '11px 15px', borderRadius: 11, cursor: 'pointer',
                        background: CARD, border: `1px solid ${BORDER}`, color: TEXT,
                        transition: 'border-color .15s, background .15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.background = 'rgba(245,158,11,0.07)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = CARD; }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 2 }}>{t.question}</div>
                        <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.45 }}>{t.blurb}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: DIM, flexShrink: 0 }}>
                        {t.steps.length} steps
                      </span>
                      <CaretRight size={15} weight="bold" color={GOLD} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>,
      document.body,
    );
  }

  /* ── a running tour ─────────────────────────────────────────────────── */

  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const stepNo = stepIdx + 1;
  const total = tour.steps.length;
  const anchored = Boolean(rect) && onRoute;

  /* Callout placement. Anchored: beside the target with room for the arrow.
     Not anchored: centred, because there is nothing to point at yet. */
  let side: Side = 'right';
  let cx = vw / 2 - CALLOUT_W / 2;
  let cy = vh / 2 - calloutH / 2;

  if (rect && onRoute) {
    side = chooseSide(rect, vw, vh);
    if (side === 'right') { cx = rect.x + rect.w + ARROW_GAP; cy = rect.y + rect.h / 2 - calloutH / 2; }
    else if (side === 'left') { cx = rect.x - ARROW_GAP - CALLOUT_W; cy = rect.y + rect.h / 2 - calloutH / 2; }
    else if (side === 'below') { cx = rect.x + rect.w / 2 - CALLOUT_W / 2; cy = rect.y + rect.h + ARROW_GAP; }
    else { cx = rect.x + rect.w / 2 - CALLOUT_W / 2; cy = rect.y - ARROW_GAP - calloutH; }
  }

  /* Clamp on every path, not just the anchored one.
     The unanchored branch centred the callout using a calloutH that starts at
     a guess of 150 and is corrected after the first paint — on a short
     viewport that put its top above the fold, and a NaN anywhere in a rect
     dropped the whole `left`/`top` declaration, leaving the scrim up with
     nothing visible on it. Guard the arithmetic, then clamp. */
  if (!Number.isFinite(cx)) cx = Math.max(14, vw / 2 - CALLOUT_W / 2);
  if (!Number.isFinite(cy)) cy = Math.max(70, vh / 2 - calloutH / 2);
  cx = Math.max(14, Math.min(cx, Math.max(14, vw - CALLOUT_W - 14)));
  cy = Math.max(70, Math.min(cy, Math.max(70, vh - calloutH - 14)));

  /* Arrow: from the callout edge to just outside the ring, head at the target. */
  let arrow: { d: string; hx: number; hy: number; rot: number } | null = null;
  if (rect && onRoute) {
    const tcx = rect.x + rect.w / 2;
    const tcy = rect.y + rect.h / 2;
    let sx: number, sy: number, ex: number, ey: number, rot: number;
    if (side === 'right') {
      sx = cx - 14; sy = cy + calloutH / 2;
      ex = rect.x + rect.w + HEAD_OFFSET; ey = tcy; rot = 0;
    } else if (side === 'left') {
      sx = cx + CALLOUT_W + 14; sy = cy + calloutH / 2;
      ex = rect.x - HEAD_OFFSET; ey = tcy; rot = 180;
    } else if (side === 'below') {
      sx = tcx; sy = cy - 14;
      ex = tcx; ey = rect.y + rect.h + HEAD_OFFSET; rot = 90;
    } else {
      sx = tcx; sy = cy + calloutH + 14;
      ex = tcx; ey = rect.y - HEAD_OFFSET; rot = 270;
    }
    /* A gentle curve reads as a pointing gesture; a straight line reads as a
       border. Control point pushed perpendicular to the run. */
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const horizontal = side === 'right' || side === 'left';
    const bow = Math.min(46, Math.max(18, (horizontal ? Math.abs(sy - ey) : Math.abs(sx - ex)) * 0.35 + 20));
    const qx = horizontal ? mx : mx + bow;
    const qy = horizontal ? my - bow : my;
    arrow = { d: `M ${sx} ${sy} Q ${qx} ${qy} ${ex} ${ey}`, hx: ex, hy: ey, rot };
  }

  const bob = reduced ? 'none' : 'sagHelpBob 1.15s ease-in-out infinite';

  return createPortal(
    <>
      <style>{`
        @keyframes sagHelpBob {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(var(--bx, -7px), var(--by, 0px)); }
        }
        @keyframes sagHelpPulse {
          0%, 100% { opacity: .95; }
          50%      { opacity: .40; }
        }
      `}</style>

      {/* Overlay. pointer-events:none throughout — the button under the arrow
          is the real button, and it must stay clickable. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: Z, pointerEvents: 'none' }}>
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <mask id="sagHelpHole">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && onRoute && (
                <rect
                  x={rect.x - 8} y={rect.y - 8}
                  width={rect.w + 16} height={rect.h + 16}
                  rx={12} fill="black"
                />
              )}
            </mask>
            <linearGradient id="sagHelpArrow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={GOLD} stopOpacity="0.35" />
              <stop offset="100%" stopColor={GOLD_HI} stopOpacity="1" />
            </linearGradient>
            {/* The arrow crosses whatever the page happens to be — a white
                table, a dark chart, a photo. Without its own shadow it
                disappears over the light ones. */}
            <filter id="sagHelpGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={GOLD} floodOpacity="0.65" />
              <feDropShadow dx="0" dy="2" stdDeviation="9" floodColor="#000" floodOpacity="0.55" />
            </filter>
          </defs>

          {/* Dim everything except the target. Heavier than it looks like it
              needs to be: the app's own ground is #0d1117, so a light scrim
              over a dark page is nearly invisible and the spotlight reads as
              no spotlight at all. */}
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(2,4,9,0.82)"
            mask="url(#sagHelpHole)"
          />

          {/* Ring around the target. */}
          {rect && onRoute && (
            <>
              <rect
                x={rect.x - 8} y={rect.y - 8}
                width={rect.w + 16} height={rect.h + 16}
                rx={12} fill="none" stroke={GOLD} strokeWidth={3}
                filter="url(#sagHelpGlow)"
                style={{ animation: reduced ? 'none' : 'sagHelpPulse 1.6s ease-in-out infinite' }}
              />
              <rect
                x={rect.x - 15} y={rect.y - 15}
                width={rect.w + 30} height={rect.h + 30}
                rx={17} fill="none" stroke={GOLD} strokeWidth={1.5} opacity={0.35}
              />
            </>
          )}

          {/* The arrow. Sized to be found across a room on a jobsite laptop:
              heavy stroke, big head, its own glow, a wider bob. */}
          {arrow && (
            <g
              filter="url(#sagHelpGlow)"
              style={{
                animation: bob,
                ['--bx' as string]: side === 'right' ? '-12px' : side === 'left' ? '12px' : '0px',
                ['--by' as string]: side === 'below' ? '-12px' : side === 'above' ? '12px' : '0px',
              }}
            >
              {/* Dark casing under the gold, so the arrow reads as one object
                  floating above the page rather than dissolving into whatever
                  rows and borders it happens to cross. */}
              <path d={arrow.d} fill="none" stroke="rgba(2,4,9,0.9)" strokeWidth={11} strokeLinecap="round" />
              <path d={arrow.d} fill="none" stroke="url(#sagHelpArrow)" strokeWidth={6} strokeLinecap="round" />
              <path
                d="M 0 0 L -26 -14 L -19 0 L -26 14 Z"
                fill={GOLD_HI}
                stroke="rgba(2,4,9,0.9)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                transform={`translate(${arrow.hx} ${arrow.hy}) rotate(${arrow.rot})`}
              />
            </g>
          )}
        </svg>

        {/* Callout. The one thing that takes clicks. */}
        <div
          ref={calloutRef}
          style={{
            position: 'absolute', left: cx, top: cy, width: CALLOUT_W,
            pointerEvents: 'auto',
            background: `linear-gradient(165deg, #12263C, ${CARD} 60%, #0A1524)`,
            border: `1px solid ${GOLD}`,
            borderRadius: 14,
            padding: '15px 17px 14px',
            boxShadow: '0 26px 60px -22px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.07)',
            /* No transition on left/top.
               The anchor rect is re-measured every animation frame, so a
               0.22s ease on position meant the card was always animating
               toward a target that had already moved — it visibly shook, and
               worse while the page was smooth-scrolling the anchor into view.
               Sixty updates a second is already smooth; easing on top of it is
               what made it judder. */
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', color: GOLD }}>
              Step {stepNo} of {total}
            </span>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${(stepNo / total) * 100}%`, height: '100%', background: GOLD, borderRadius: 2, transition: 'width .25s ease' }} />
            </div>
            <button
              onClick={exit}
              aria-label="End walkthrough"
              style={{ width: 24, height: 24, borderRadius: 7, cursor: 'pointer', background: 'transparent', border: 'none', color: DIM, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={13} weight="bold" />
            </button>
          </div>

          <div style={{ fontSize: 15, fontWeight: 900, color: TEXT, marginBottom: 5, letterSpacing: '-0.01em' }}>
            {step?.title}
          </div>
          <div style={{ fontSize: 13, color: '#C6D6E8', lineHeight: 1.52 }}>
            {step?.body}
          </div>

          {/* Not on the right page yet. */}
          {!onRoute && step?.route && (
            <button
              /* A route ending in '/' means "inside one of these" — the step
                 lives at /app/projects/<id>/budget and there is no single URL
                 to send you to. Drop you at the list so you can pick the job. */
              onClick={() => router.push((step.route as string).replace(/\/$/, ''))}
              style={{
                marginTop: 12, minHeight: 38, width: '100%', borderRadius: 9, cursor: 'pointer',
                background: GOLD, border: 'none', color: '#241500', fontSize: 13, fontWeight: 800,
              }}
            >
              {step.route.endsWith('/') ? 'Open a project first' : 'Take me to that screen'}
            </button>
          )}

          {/* On the page, but the control is not on screen. */}
          {/* Say which of the two things actually happened. "I can't find that
              control" was shown for both a genuinely absent control and a
              module the tenant is not entitled to — and, until the route
              matcher was fixed, for simply being on the wrong page. A GC whose
              plan has no Fleet should be told that, not told the product is
              broken. */}
          {/* Only for a step you actually have to DO something on.
              A 'read' step has nothing to click — it explains. Announcing that
              a control cannot be found on a step that never wanted one reads
              as a broken product at the exact moment the reader is trusting
              the help, which is the worst possible place to be wrong. */}
          {onRoute && missing && step?.advance !== 'read' && (step?.anchor?.length || step?.anchorText?.length) && (
            <div style={{ marginTop: 11, fontSize: 12, color: '#F6C177', lineHeight: 1.5 }}>
              {step?.anchor?.some((s) => s.startsWith('aside a[href='))
                ? 'That section isn’t switched on for your account — ask whoever manages your plan, or press Next to read the rest.'
                : 'That control isn’t on screen right now — it may sit behind a tab, or appear once there’s data here. Press Next to carry on.'}
            </div>
          )}

          {/* Every step gets a way forward. Doing the real thing is still the
              intended path — the hint says so — but a reader who cannot find
              the control, or who just wants to read the flow through, is never
              trapped on a step. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button
              onClick={advance}
              style={{
                minHeight: 38, padding: '0 18px', borderRadius: 9, cursor: 'pointer',
                background: GOLD, border: 'none', color: '#241500', fontSize: 13, fontWeight: 800,
              }}
            >
              {stepNo === total ? 'Done' : step?.advance === 'read' ? 'Got it' : 'Next'}
            </button>
            {step?.advance !== 'read' && (
              <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600, lineHeight: 1.35 }}>
                {step?.advance === 'input' ? 'or fill it in' : 'or click it'}
              </span>
            )}
            <button
              onClick={exit}
              style={{
                marginLeft: 'auto', minHeight: 34, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontWeight: 700,
              }}
            >
              End
            </button>
          </div>
        </div>

        {/* Always-visible escape.
            If the callout is ever mispositioned or the anchor cannot be found,
            this is still on screen — so a walkthrough can never leave you on a
            dimmed page with no way out but a reload. */}
        <button
          onClick={() => { exit(); setOn(false); }}
          style={{
            position: 'absolute', right: 16, bottom: 16, pointerEvents: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
            background: 'rgba(13,29,46,0.95)', border: `1px solid ${GOLD}`,
            color: GOLD_HI, fontSize: 12.5, fontWeight: 800,
            boxShadow: '0 10px 30px -12px rgba(0,0,0,0.9)',
          }}
        >
          <X size={13} weight="bold" /> Turn help off
        </button>
      </div>
    </>,
    document.body,
  );
}

/**
 * The top bar control. Kept beside the engine so the label, the icon and the
 * event name cannot drift apart.
 */
export function HelpModeButton() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => {
      try { setOn(sessionStorage.getItem(SS_ON) === '1'); } catch { /* fine */ }
    };
    read();
    /* Named, so the cleanup actually removes what was added. The first version
       added an inline arrow and removed a different function, leaving a live
       listener on every remount. The timeout lets HelpMode write the new value
       before this reads it back. */
    const onToggle = () => window.setTimeout(read, 0);
    window.addEventListener('saguaro-help-mode', onToggle);
    return () => window.removeEventListener('saguaro-help-mode', onToggle);
  }, []);

  return (
    <button
      data-tour="help-mode"
      onClick={() => window.dispatchEvent(new Event('saguaro-help-mode'))}
      title="Show me how — arrows that point at the next button"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px',
        background: on ? GOLD : 'rgba(245,158,11,0.10)',
        border: `1px solid ${on ? GOLD : 'rgba(245,158,11,0.38)'}`,
        borderRadius: 999,
        color: on ? '#241500' : GOLD_HI,
        fontSize: 13, fontWeight: 800, letterSpacing: '0.01em', cursor: 'pointer',
        transition: 'background .15s, color .15s, border-color .15s',
        whiteSpace: 'nowrap',
      }}
    >
      <MagicWand size={15} weight={on ? 'fill' : 'duotone'} />
      Help me
    </button>
  );
}
