'use client';
/**
 * Full-screen photo + video viewer, built for a thumb on a jobsite.
 *
 *  • Pinch to zoom (anchored between the fingers, up to 6×), drag to look
 *    around with momentum, double-tap to zoom into a spot and back out.
 *  • Swipe sideways and the next photo slides in with your finger (the ones
 *    either side are already loaded); swipe down to close.
 *  • Opens instantly on the grid's thumbnail and sharpens when the full photo
 *    lands. Tap once to hide the bars; a strip of thumbnails jumps anywhere.
 *  • Save (iPhone share sheet: Save Image / AirDrop / Messages), details,
 *    delete, open the original.
 *  • Desktop: drag, scroll or ⌘-scroll to zoom, double-click, ← → + − 0 Esc
 *    (a mouse click goes through the same tap logic as a finger).
 *
 * Gestures run on touch events, not pointer events: iOS cancels a pointer
 * the moment a second finger lands (it wants the pinch for itself), which is
 * what killed pinch-to-zoom in the old viewer. Calling preventDefault on the
 * touches keeps the gesture ours. Every frame is written straight to the DOM
 * through one requestAnimationFrame — no React render while a finger moves.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Info, X, CaretLeft, CaretRight, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowSquareOut,
  DownloadSimple, Trash, CircleNotch, Play, ImageSquare, PaperPlaneTilt,
} from '@phosphor-icons/react';
import { saveMedia } from '@/lib/media-save';

export interface LightboxItem {
  id: string;
  url: string;
  kind: 'image' | 'video';
  title?: string | null;
  /** Video poster frame. */
  poster?: string | null;
  /** A small copy (the grid's thumbnail) shown the instant the viewer opens. */
  thumb?: string | null;
  /** One line under the title: when, who, album. */
  subtitle?: string | null;
}

const MAX = 6;
const TAP_MS = 280;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const CSS = `
.zl { position: fixed; inset: 0; z-index: 10050; display: flex; flex-direction: column; color: var(--text-primary); overscroll-behavior: contain; touch-action: none; }
.zlBg { position: absolute; inset: 0; background: var(--bg-solid); }
.zlBar { position: relative; z-index: 3; display: flex; align-items: center; gap: 8px; padding: max(10px, env(safe-area-inset-top)) 12px 10px; flex: 0 0 auto; transition: opacity .2s ease; }
.zlTitle { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zlTitle small { display: block; font-size: 12px; font-weight: 600; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; }
.zlBtn { min-width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; flex: 0 0 auto; }
.zlBtn:hover { background: rgba(255,255,255,0.12); }
.zlBtn:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.zlBtn[disabled] { opacity: .35; cursor: default; }
.zlBtn[data-tone="danger"] { color: var(--c-red); }
.zlSpin { animation: zl-spin .8s linear infinite; }
@keyframes zl-spin { to { transform: rotate(360deg); } }
.zlStage { position: relative; z-index: 1; flex: 1 1 auto; min-height: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.zlStage[data-zoomed="true"] { cursor: grab; }
.zlStage[data-video="true"] { touch-action: auto; }
.zlTrack { position: absolute; inset: 0; will-change: transform; }
.zlSlide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.zlZoom { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform; }
.zlImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; -webkit-user-drag: none; pointer-events: none; user-select: none; }
.zlFull { opacity: 0; transition: opacity .2s ease-out; }
.zlFull[data-loaded="true"] { opacity: 1; }
.zlThumbImg[data-hide="true"] { visibility: hidden; }
.zlVideo { max-width: 100%; max-height: 100%; background: black; }
.zlWait { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: var(--text-tertiary); pointer-events: none; }
.zlFail { max-width: 300px; color: var(--text-secondary); font-size: 14px; text-align: center; line-height: 1.45; padding: 24px; }
.zlSide { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; transition: opacity .2s ease; }
.zlSide[data-side="left"] { left: 10px; }
.zlSide[data-side="right"] { right: 10px; }
.zlStrip { position: relative; z-index: 3; flex: 0 0 auto; display: flex; gap: 6px; overflow-x: auto; padding: 8px 12px max(10px, env(safe-area-inset-bottom)); scrollbar-width: none; transition: opacity .2s ease; -webkit-overflow-scrolling: touch; touch-action: pan-x; }
.zlStrip::-webkit-scrollbar { display: none; }
.zlThumb { flex: 0 0 auto; width: 52px; height: 52px; padding: 0; border-radius: 10px; overflow: hidden; border: 2px solid transparent; background: rgba(255,255,255,0.06); opacity: .55; cursor: pointer; position: relative; color: var(--text-secondary); display: inline-flex; align-items: center; justify-content: center; }
.zlThumb[data-current="true"] { border-color: var(--brand-primary); opacity: 1; }
.zlThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.zlThumb .zlThumbPlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: white; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.zlPill { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 4; padding: 10px 16px; border-radius: 999px; background: var(--bg-solid-2); border: 1px solid var(--border-default); font-size: 14px; font-weight: 700; white-space: nowrap; box-shadow: 0 12px 30px -12px rgba(0,0,0,.7); }
.zl[data-chrome="off"] .zlBar, .zl[data-chrome="off"] .zlStrip, .zl[data-chrome="off"] .zlSide { opacity: 0; pointer-events: none; }
@media (pointer: coarse) { .zlSide { display: none; } .zlHideTouch { display: none; } }
@media (max-width: 520px) { .zlHideSm { display: none; } }
@media (prefers-reduced-motion: reduce) { .zlFull, .zlBar, .zlStrip { transition: none; } }
`;

type View = { s: number; x: number; y: number };
type Pt = { x: number; y: number };

export default function ZoomLightbox({
  items,
  index,
  onIndex,
  onClose,
  onInfo,
  onMediaError,
  onDelete,
  onSend,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Show this item's details (date, location, album…). Adds an Info button. */
  onInfo?: (item: LightboxItem) => void;
  /** A signed URL expired or the object is gone — let the page re-sign. */
  onMediaError?: (item: LightboxItem) => void;
  /** Delete this item. The caller confirms; resolve true once it's gone. */
  onDelete?: (item: LightboxItem) => Promise<boolean> | boolean;
  /** Send this item to another job (the page opens its job picker). */
  onSend?: (item: LightboxItem) => void;
}) {
  const item = items[index];
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const [chrome, setChrome] = useState(true);
  const [pct, setPct] = useState(100);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'' | 'save' | 'delete'>('');
  const [pill, setPill] = useState('');

  // Everything a gesture reads, kept current without re-binding listeners.
  const live = useRef({ items, index, onIndex, onClose, onMediaError });
  live.current = { items, index, onIndex, onClose, onMediaError };
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const trackX = useRef(0);
  const closeY = useRef(0);
  const size = useRef({ W: 1, H: 1 });
  const aspect = useRef<Record<string, number>>({});
  const frame = useRef(0);
  const anim = useRef<{ stop: () => void } | null>(null);
  const reduced = useRef(false);

  const isVideo = item?.kind === 'video';

  // ── drawing ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    frame.current = 0;
    const { s, x, y } = view.current;
    const { H } = size.current;
    const cy = closeY.current;
    const z = zoomRef.current;
    if (z) {
      const shrink = cy > 0 ? 1 - Math.min(0.25, cy / (H * 2)) : 1;
      z.style.transform = `translate3d(${x}px, ${y + cy}px, 0) scale(${s * shrink})`;
    }
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${trackX.current}px, 0, 0)`;
    if (bgRef.current) bgRef.current.style.opacity = String(cy > 0 ? Math.max(0.15, 1 - cy / (H * 0.7)) : 1);
    if (stageRef.current) stageRef.current.dataset.zoomed = s > 1.01 ? 'true' : 'false';
  }, []);
  const requestDraw = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(draw); }, [draw]);

  const stopAnim = useCallback(() => { anim.current?.stop(); anim.current = null; }, []);

  /** Ease the view / track / close offset to a target, then call done. */
  const animateTo = useCallback((to: Partial<View & { trackX: number; closeY: number }>, ms: number, done?: () => void) => {
    stopAnim();
    const from = { ...view.current, trackX: trackX.current, closeY: closeY.current };
    const target = { ...from, ...to };
    const dur = reduced.current ? 0 : ms;
    const t0 = performance.now();
    let raf = 0;
    let stopped = false;
    const step = (now: number) => {
      if (stopped) return;
      const k = dur <= 0 ? 1 : easeOut(Math.min(1, (now - t0) / dur));
      view.current = { s: from.s + (target.s - from.s) * k, x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k };
      trackX.current = from.trackX + (target.trackX - from.trackX) * k;
      closeY.current = from.closeY + (target.closeY - from.closeY) * k;
      draw();
      if (k < 1) raf = requestAnimationFrame(step);
      else { anim.current = null; done?.(); }
    };
    raf = requestAnimationFrame(step);
    anim.current = { stop: () => { stopped = true; cancelAnimationFrame(raf); } };
  }, [draw, stopAnim]);

  // ── geometry ─────────────────────────────────────────────────────────────
  /** The photo's on-screen size at 1×, from its real shape. */
  const fitted = useCallback(() => {
    const { W, H } = size.current;
    const it = live.current.items[live.current.index];
    const ar = (it && aspect.current[it.id]) || W / H;
    return ar > W / H ? { fw: W, fh: W / ar } : { fw: H * ar, fh: H };
  }, []);
  /** Keep a zoomed photo from being dragged off the screen. */
  const bound = useCallback((v: View): View => {
    if (v.s <= 1) return { s: 1, x: 0, y: 0 };
    const { W, H } = size.current;
    const { fw, fh } = fitted();
    const mx = Math.max(0, (fw * v.s - W) / 2), my = Math.max(0, (fh * v.s - H) / 2);
    return { s: v.s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
  }, [fitted]);
  /** Zoom to s keeping the stage point p (centre-relative) still. */
  const zoomAround = useCallback((s: number, p: Pt): View => {
    const { s: s0, x: x0, y: y0 } = view.current;
    const k = s / s0;
    return bound({ s, x: p.x - (p.x - x0) * k, y: p.y - (p.y - y0) * k });
  }, [bound]);
  const toStage = useCallback((cx: number, cy: number): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const s = clamp(view.current.s * factor, 1, MAX);
    animateTo(zoomAround(s, { x: 0, y: 0 }), 200, () => setPct(Math.round(view.current.s * 100)));
  }, [animateTo, zoomAround]);
  const fit = useCallback(() => animateTo({ s: 1, x: 0, y: 0 }, 200, () => setPct(100)), [animateTo]);

  /** Step to the neighbour: slide the track a full width, then hand over. */
  const step = useCallback((dir: 1 | -1) => {
    const { items: list, index: i } = live.current;
    const n = i + dir;
    if (n < 0 || n >= list.length) { animateTo({ trackX: 0 }, 160); return; }
    const W = size.current.W;
    const remaining = Math.abs(-dir * W - trackX.current);
    animateTo({ trackX: -dir * W }, clamp(remaining / 3, 110, 240), () => live.current.onIndex(n));
  }, [animateTo]);

  // New current item: re-centre the track (no visible jump: the slide that
  // was beside us is now drawn in the middle) and start at fit.
  useLayoutEffect(() => {
    stopAnim();
    trackX.current = 0;
    closeY.current = 0;
    view.current = { s: 1, x: 0, y: 0 };
    trackRef.current?.querySelectorAll<HTMLElement>('.zlZoom').forEach((z) => { z.style.transform = ''; });
    draw();
    setPct(100);
    // Neighbour videos stop; the current one is ready to play.
    trackRef.current?.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
      if (v.dataset.id !== item?.id) v.pause();
    });
  }, [index, item?.id, draw, stopAnim]);

  // Keep the current thumbnail in view in the strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced.current ? 'auto' : 'smooth' });
  }, [index]);

  // Stage size, reduced motion, page scroll lock, keys.
  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st = stageRef.current;
    const measure = () => { if (st) size.current = { W: st.clientWidth || 1, H: st.clientHeight || 1 }; view.current = bound(view.current); requestDraw(); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (st && ro) ro.observe(st);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); live.current.onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.5); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.5); }
      else if (e.key === '0') { e.preventDefault(); fit(); }
    };
    window.addEventListener('keydown', onKey);
    // iOS Safari's own pinch gesture must not zoom the page under the viewer.
    const stopGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stopGesture);
    document.addEventListener('gesturechange', stopGesture);
    return () => {
      ro?.disconnect();
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('gesturestart', stopGesture);
      document.removeEventListener('gesturechange', stopGesture);
      if (frame.current) cancelAnimationFrame(frame.current);
      anim.current?.stop();
    };
  }, [bound, requestDraw, step, zoomBy, fit]);

  // ── gestures ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    type Mode = 'none' | 'pending' | 'pan' | 'pinch' | 'swipeX' | 'swipeY';
    let mode: Mode = 'none';
    let start = { x: 0, y: 0, t: 0 };
    let base: View = { s: 1, x: 0, y: 0 };
    let samples: { x: number; y: number; t: number }[] = [];
    let pinch0 = { d: 1, mid: { x: 0, y: 0 }, view: { s: 1, x: 0, y: 0 } as View };
    let lastMid: Pt = { x: 0, y: 0 };
    let onVideo = false;
    let lastTap = { t: 0, x: 0, y: 0 };
    let tapTimer = 0;
    let mouseDown = false;

    const curIsVideo = () => live.current.items[live.current.index]?.kind === 'video';
    const velocity = () => {
      const now = performance.now();
      const recent = samples.filter((s) => now - s.t < 100);
      if (recent.length < 2) return { vx: 0, vy: 0 };
      const a = recent[0], b = recent[recent.length - 1];
      const dt = Math.max(1, b.t - a.t);
      return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
    };
    const beginPinch = (a: Pt, b: Pt) => {
      window.clearTimeout(tapTimer);
      mode = 'pinch';
      const mid = toStage((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid, view: { ...view.current } };
      lastMid = mid;
    };
    const beginOne = (p: Pt) => {
      mode = 'pending';
      start = { x: p.x, y: p.y, t: performance.now() };
      base = { ...view.current };
      samples = [{ ...start }];
    };

    const onStart = (pts: Pt[], target: EventTarget | null, prevent: () => void) => {
      const el = target as HTMLElement | null;
      if (el?.closest('button, a, .zlStrip, .zlBar')) return false;
      const vid = el?.closest('video');
      onVideo = !!vid;
      if (vid) {
        // Leave the player's own control bar (scrubbing, volume) alone.
        const r = vid.getBoundingClientRect();
        if (pts[0] && pts[0].y > r.bottom - 64) return false;
      } else prevent();
      stopAnim();
      if (pts.length >= 2 && !curIsVideo()) beginPinch(pts[0], pts[1]);
      else if (pts.length === 1) beginOne(pts[0]);
      return true;
    };

    const onMove = (pts: Pt[], prevent: () => void) => {
      if (mode === 'none') return;
      if (mode === 'pinch') {
        if (pts.length < 2) return;
        prevent();
        const [a, b] = pts;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = toStage((a.x + b.x) / 2, (a.y + b.y) / 2);
        lastMid = mid;
        let s = pinch0.view.s * (d / pinch0.d);
        // Rubber band past the limits so it feels elastic, not stuck.
        if (s < 1) s = 1 - (1 - s) * 0.45;
        if (s > MAX) s = MAX + (s - MAX) * 0.3;
        s = Math.max(0.5, s);
        const k = s / pinch0.view.s;
        view.current = { s, x: mid.x - (pinch0.mid.x - pinch0.view.x) * k, y: mid.y - (pinch0.mid.y - pinch0.view.y) * k };
        requestDraw();
        return;
      }
      const p = pts[0];
      if (!p) return;
      const dx = p.x - start.x, dy = p.y - start.y;
      samples.push({ x: p.x, y: p.y, t: performance.now() });
      if (samples.length > 8) samples.shift();
      if (mode === 'pending') {
        if (Math.hypot(dx, dy) < 8) return;
        window.clearTimeout(tapTimer);
        if (view.current.s > 1.01 && !onVideo) mode = 'pan';
        else if (Math.abs(dx) > Math.abs(dy)) mode = 'swipeX';
        else if (dy > 0) mode = 'swipeY';
        else { mode = 'none'; return; }
      }
      prevent();
      if (mode === 'pan') {
        const want = { s: base.s, x: base.x + dx, y: base.y + dy };
        const b = bound(want);
        // Past an edge the photo gives a little, then springs back on release.
        view.current = { s: want.s, x: b.x + (want.x - b.x) * 0.35, y: b.y + (want.y - b.y) * 0.35 };
      } else if (mode === 'swipeX') {
        const { index: i, items: list } = live.current;
        const edge = (i === 0 && dx > 0) || (i === list.length - 1 && dx < 0);
        trackX.current = edge ? dx * 0.3 : dx;
      } else if (mode === 'swipeY') {
        closeY.current = Math.max(0, dy);
      }
      requestDraw();
    };

    const onEnd = (remaining: Pt[], last: Pt | null) => {
      if (mode === 'pinch') {
        if (remaining.length === 1) { beginOne(remaining[0]); mode = 'pan'; return; }
        if (remaining.length === 0) {
          mode = 'none';
          const v = view.current;
          if (v.s <= 1.02) { animateTo({ s: 1, x: 0, y: 0 }, 220, () => setPct(100)); return; }
          // Over the top: back to MAX around the fingers, then inside the edges.
          const s = Math.min(v.s, MAX), k = s / v.s;
          const target = bound({ s, x: lastMid.x - (lastMid.x - v.x) * k, y: lastMid.y - (lastMid.y - v.y) * k });
          animateTo(target, 220, () => setPct(Math.round(view.current.s * 100)));
        }
        return;
      }
      if (remaining.length > 0) return;
      const m = mode;
      mode = 'none';
      const { vx, vy } = velocity();
      if (m === 'pending' && last) {
        // A tap. Two quick taps zoom; one tap shows / hides the bars.
        const now = performance.now();
        if (now - lastTap.t < TAP_MS && Math.hypot(last.x - lastTap.x, last.y - lastTap.y) < 40 && !onVideo) {
          window.clearTimeout(tapTimer);
          lastTap.t = 0;
          if (view.current.s > 1.01) animateTo({ s: 1, x: 0, y: 0 }, 240, () => setPct(100));
          else animateTo(zoomAround(2.5, toStage(last.x, last.y)), 240, () => setPct(Math.round(view.current.s * 100)));
        } else {
          lastTap = { t: now, x: last.x, y: last.y };
          if (!onVideo) tapTimer = window.setTimeout(() => setChrome((c) => !c), TAP_MS);
        }
        return;
      }
      if (m === 'pan') {
        // Momentum: carry on in the flick's direction, then rest inside the edges.
        const target = bound({ s: view.current.s, x: view.current.x + vx * 220, y: view.current.y + vy * 220 });
        animateTo(target, Math.hypot(vx, vy) > 0.15 ? 380 : 180);
      } else if (m === 'swipeX') {
        const W = size.current.W, dx = trackX.current;
        if ((dx < -W * 0.2 || (vx < -0.35 && dx < -20))) step(1);
        else if ((dx > W * 0.2 || (vx > 0.35 && dx > 20))) step(-1);
        else animateTo({ trackX: 0 }, 180);
      } else if (m === 'swipeY') {
        const H = size.current.H;
        if (closeY.current > H * 0.18 || vy > 0.45) animateTo({ closeY: H }, 180, () => live.current.onClose());
        else animateTo({ closeY: 0 }, 200);
      }
    };

    const list = (t: TouchList): Pt[] => Array.from(t).map((x) => ({ x: x.clientX, y: x.clientY }));
    const ts = (e: TouchEvent) => { onStart(list(e.touches), e.target, () => { if (e.cancelable) e.preventDefault(); }); };
    const tm = (e: TouchEvent) => { onMove(list(e.touches), () => { if (e.cancelable) e.preventDefault(); }); };
    const te = (e: TouchEvent) => {
      const ch = e.changedTouches[0];
      onEnd(list(e.touches), ch ? { x: ch.clientX, y: ch.clientY } : null);
    };
    // Mouse: drag to pan (zoomed) or to step (not zoomed). Touch pointers are
    // handled above; pointer events for them are ignored.
    const pd = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (onStart([{ x: e.clientX, y: e.clientY }], e.target, () => e.preventDefault())) mouseDown = true;
    };
    const pm = (e: PointerEvent) => { if (e.pointerType === 'mouse' && mouseDown) onMove([{ x: e.clientX, y: e.clientY }], () => e.preventDefault()); };
    const pu = (e: PointerEvent) => { if (e.pointerType === 'mouse' && mouseDown) { mouseDown = false; onEnd([], { x: e.clientX, y: e.clientY }); } };
    const wheel = (e: WheelEvent) => {
      if (curIsVideo()) return;
      e.preventDefault();
      const dy = clamp(e.deltaY, -120, 120);
      const s = clamp(view.current.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025)), 1, MAX);
      view.current = zoomAround(s, toStage(e.clientX, e.clientY));
      requestDraw();
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => setPct(Math.round(view.current.s * 100)), 120);
    };
    st.addEventListener('touchstart', ts, { passive: false });
    st.addEventListener('touchmove', tm, { passive: false });
    st.addEventListener('touchend', te);
    st.addEventListener('touchcancel', te);
    st.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    st.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.clearTimeout(tapTimer);
      st.removeEventListener('touchstart', ts);
      st.removeEventListener('touchmove', tm);
      st.removeEventListener('touchend', te);
      st.removeEventListener('touchcancel', te);
      st.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      st.removeEventListener('wheel', wheel);
    };
  }, [animateTo, bound, requestDraw, step, stopAnim, toStage, zoomAround]);

  // Preload the full photos either side (the strip only has thumbnails).
  useEffect(() => {
    for (const k of [1, -1, 2]) {
      const it = items[index + k];
      if (it?.kind === 'image' && it.url) { const im = new Image(); im.decoding = 'async'; im.src = it.url; }
    }
  }, [index, items]);

  const flash = (msg: string) => { setPill(msg); window.setTimeout(() => setPill((p) => (p === msg ? '' : p)), 2400); };

  const save = async () => {
    if (!item || busy) return;
    setBusy('save');
    try {
      const r = await saveMedia(item);
      if (r === 'downloaded') flash('Downloaded');
      else if (r === 'shared') flash('Done');
    } catch {
      flash(`Couldn't save this ${isVideo ? 'video' : 'photo'} — check your connection.`);
    } finally { setBusy(''); }
  };
  const remove = async () => {
    if (!item || !onDelete || busy) return;
    setBusy('delete');
    try { if (await onDelete(item)) flash(isVideo ? 'Video deleted' : 'Photo deleted'); }
    finally { setBusy(''); }
  };

  if (!item || typeof document === 'undefined') return null;

  const slide = (k: -1 | 0 | 1) => {
    const it = items[index + k];
    if (!it) return null;
    const small = it.thumb || it.poster || null;
    const isLoaded = !!loaded[it.id];
    const isFailed = !!failed[it.id];
    const noteAspect = (img: HTMLImageElement) => { if (img.naturalWidth && img.naturalHeight && !aspect.current[it.id]) aspect.current[it.id] = img.naturalWidth / img.naturalHeight; };
    return (
      <div key={it.id} className="zlSlide" style={{ transform: `translate3d(${k * 100}%, 0, 0)` }} aria-hidden={k !== 0}>
        {it.kind === 'video' ? (
          isFailed ? <div className="zlFail">This video didn&apos;t load. Close and open it again.</div> : (
            <video
              data-id={it.id}
              className="zlVideo"
              src={it.url}
              poster={it.poster || undefined}
              controls
              playsInline
              preload={k === 0 ? 'metadata' : 'none'}
              onError={() => { setFailed((f) => ({ ...f, [it.id]: true })); live.current.onMediaError?.(it); }}
            />
          )
        ) : (
          <div className="zlZoom" ref={k === 0 ? zoomRef : undefined}>
            {small && !isFailed && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="zlImg zlThumbImg" src={small} alt="" draggable={false} data-hide={isLoaded ? 'true' : undefined}
                onLoad={(e) => noteAspect(e.currentTarget)} />
            )}
            {isFailed ? (
              <div className="zlSlide"><div className="zlFail">This photo didn&apos;t load. Close and open it again.</div></div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="zlImg zlFull"
                src={it.url}
                alt={it.title || 'Photo'}
                draggable={false}
                decoding="async"
                data-loaded={isLoaded ? 'true' : undefined}
                onLoad={(e) => { aspect.current[it.id] = e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight); setLoaded((l) => ({ ...l, [it.id]: true })); }}
                onError={() => { setFailed((f) => ({ ...f, [it.id]: true })); live.current.onMediaError?.(it); }}
              />
            )}
            {!isLoaded && !isFailed && !small && <CircleNotch size={28} className="zlWait zlSpin" />}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div ref={rootRef} className="zl" role="dialog" aria-modal="true" aria-label={item.title || (isVideo ? 'Video' : 'Photo')} data-chrome={chrome ? 'on' : 'off'}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={bgRef} className="zlBg" />
      <div className="zlBar">
        <div className="zlTitle">
          {item.title || (isVideo ? 'Video' : 'Photo')}
          <small>{[items.length > 1 ? `${index + 1} of ${items.length}` : '', item.subtitle || ''].filter(Boolean).join(' · ')}</small>
        </div>
        {!isVideo && (
          <>
            <button type="button" className="zlBtn zlHideSm zlHideTouch" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)} disabled={pct <= 100}><MagnifyingGlassMinus size={18} /></button>
            <button type="button" className="zlBtn zlHideSm zlHideTouch" aria-label="Fit to screen" onClick={fit}>{pct}%</button>
            <button type="button" className="zlBtn zlHideSm zlHideTouch" aria-label="Zoom in" onClick={() => zoomBy(1.5)} disabled={pct >= MAX * 100}><MagnifyingGlassPlus size={18} /></button>
          </>
        )}
        {onInfo && <button type="button" className="zlBtn" aria-label="Details" title="Details" onClick={() => onInfo(item)}><Info size={19} /></button>}
        <button type="button" className="zlBtn" aria-label={`Save ${isVideo ? 'video' : 'photo'}`} title="Save / share" onClick={save} disabled={!!busy}>
          {busy === 'save' ? <CircleNotch size={18} className="zlSpin" /> : <DownloadSimple size={19} />}
        </button>
        {onSend && (
          <button type="button" className="zlBtn" aria-label="Send to another job" title="Send to another job" onClick={() => onSend(item)} disabled={!!busy}>
            <PaperPlaneTilt size={19} />
          </button>
        )}
        {onDelete && (
          <button type="button" className="zlBtn" data-tone="danger" aria-label={`Delete ${isVideo ? 'video' : 'photo'}`} title="Delete" onClick={remove} disabled={!!busy}>
            {busy === 'delete' ? <CircleNotch size={18} className="zlSpin" /> : <Trash size={18} />}
          </button>
        )}
        <a className="zlBtn zlHideTouch" href={item.url} target="_blank" rel="noreferrer" aria-label="Open the original in a new tab" title="Open original"><ArrowSquareOut size={18} /></a>
        <button type="button" className="zlBtn" aria-label="Close" title="Close (Esc)" onClick={onClose}><X size={20} weight="bold" /></button>
      </div>

      <div ref={stageRef} className="zlStage" data-video={isVideo ? 'true' : undefined}>
        <div ref={trackRef} className="zlTrack">
          {slide(-1)}
          {slide(0)}
          {slide(1)}
        </div>
        {items.length > 1 && (
          <>
            <div className="zlSide" data-side="left"><button type="button" className="zlBtn" aria-label="Previous" onClick={() => step(-1)} disabled={index <= 0}><CaretLeft size={20} /></button></div>
            <div className="zlSide" data-side="right"><button type="button" className="zlBtn" aria-label="Next" onClick={() => step(1)} disabled={index >= items.length - 1}><CaretRight size={20} /></button></div>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div ref={stripRef} className="zlStrip" role="listbox" aria-label="All photos and videos">
          {items.map((it, i) => {
            const src = it.thumb || it.poster || null;
            return (
              <button key={it.id} type="button" role="option" aria-selected={i === index} data-i={i} data-current={i === index ? 'true' : undefined}
                className="zlThumb" aria-label={`${it.kind === 'video' ? 'Video' : 'Photo'} ${i + 1} of ${items.length}${it.title ? `: ${it.title}` : ''}`}
                onClick={() => { if (i !== index) onIndex(i); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : it.kind === 'video' ? <Play size={18} weight="fill" /> : <ImageSquare size={18} />}
                {it.kind === 'video' && src && <span className="zlThumbPlay"><Play size={16} weight="fill" /></span>}
              </button>
            );
          })}
        </div>
      )}
      {pill && <div className="zlPill" role="status">{pill}</div>}
    </div>,
    document.body,
  );
}
