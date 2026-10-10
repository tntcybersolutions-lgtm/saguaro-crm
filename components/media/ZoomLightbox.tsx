'use client';
/**
 * Full-screen photo + video viewer with real pinch-to-zoom.
 *
 * Photos: two-finger pinch (anchored between the fingers), drag to pan when
 * zoomed, double-tap / double-click to zoom in on a spot and back out,
 * ctrl/⌘ + scroll or plain scroll to zoom on desktop, + / − / 0 keys. At normal
 * size a sideways swipe steps to the next / previous item and a downward swipe
 * closes. Videos: the browser's own player, inline (playsInline) so iOS doesn't
 * hijack it, with the same step / close controls around it.
 *
 * The transform is written straight to the element (not React state) so a
 * pinch tracks the fingers at frame rate on a phone.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X, CaretLeft, CaretRight, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowSquareOut } from '@phosphor-icons/react';

export interface LightboxItem {
  id: string;
  url: string;
  kind: 'image' | 'video';
  title?: string | null;
  poster?: string | null;
}

const MIN = 1;
const MAX = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const CSS = `
.zl { position: fixed; inset: 0; z-index: 10050; background: var(--bg-solid); display: flex; flex-direction: column; color: var(--text-primary); overscroll-behavior: contain; }
.zlBar { display: flex; align-items: center; gap: 8px; padding: max(10px, env(safe-area-inset-top)) 12px 10px; flex: 0 0 auto; }
.zlTitle { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zlTitle small { display: block; font-size: 12px; font-weight: 600; color: var(--text-tertiary); }
.zlBtn { min-width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
.zlBtn:hover { background: rgba(255,255,255,0.12); }
.zlBtn:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.zlBtn[disabled] { opacity: .35; cursor: default; }
.zlStage { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; touch-action: none; user-select: none; -webkit-user-select: none; }
.zlStage[data-video="true"] { touch-action: auto; }
.zlImg { max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: 50% 50%; will-change: transform; -webkit-user-drag: none; pointer-events: none; }
.zlStage[data-zoomed="true"] { cursor: grab; }
.zlStage[data-zoomed="true"]:active { cursor: grabbing; }
.zlVideo { max-width: 100%; max-height: 100%; background: #000; }
.zlSide { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; }
.zlSide[data-side="left"] { left: 10px; }
.zlSide[data-side="right"] { right: 10px; }
.zlFoot { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 12px max(12px, env(safe-area-inset-bottom)); font-size: 12px; color: var(--text-tertiary); }
.zlPct { min-width: 64px; }
.zlMsg { color: var(--text-tertiary); font-size: 14px; text-align: center; padding: 24px; }
@media (pointer: coarse) { .zlSide { display: none; } }
@media (max-width: 520px) { .zlHideSm { display: none; } }
`;

export default function ZoomLightbox({
  items,
  index,
  onIndex,
  onClose,
  onInfo,
  onMediaError,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Show this item's details (date, location, album…). Adds an Info button. */
  onInfo?: (item: LightboxItem) => void;
  /** A signed URL expired or the object is gone — let the page re-sign. */
  onMediaError?: (item: LightboxItem) => void;
}) {
  const item = items[index];
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const t = useRef({ s: 1, x: 0, y: 0 });
  const [pct, setPct] = useState(100);
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: 'none' | 'pan' | 'pinch' | 'swipe';
    sx: number; sy: number; s0: number; x0: number; y0: number;
    d0: number; mx: number; my: number; moved: boolean;
  }>({ kind: 'none', sx: 0, sy: 0, s0: 1, x0: 0, y0: 0, d0: 1, mx: 0, my: 0, moved: false });
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

  const go = useCallback((dir: 1 | -1) => {
    const n = index + dir;
    if (n >= 0 && n < items.length) onIndex(n);
  }, [index, items.length, onIndex]);

  /** Keep a zoomed image from being dragged off the screen. */
  const bounded = useCallback((s: number, x: number, y: number) => {
    const st = stageRef.current, im = imgRef.current;
    if (!st || !im) return { s, x, y };
    const w = im.offsetWidth * s, h = im.offsetHeight * s;
    const mx = Math.max(0, (w - st.clientWidth) / 2);
    const my = Math.max(0, (h - st.clientHeight) / 2);
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  }, []);

  const apply = useCallback((s: number, x: number, y: number, animate = false) => {
    const b = s <= MIN ? { s: MIN, x: 0, y: 0 } : bounded(s, x, y);
    t.current = b;
    const im = imgRef.current;
    if (im) {
      im.style.transition = animate ? 'transform .18s ease-out' : 'none';
      im.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) scale(${b.s})`;
    }
    if (stageRef.current) stageRef.current.dataset.zoomed = b.s > 1.01 ? 'true' : 'false';
    setPct(Math.round(b.s * 100));
  }, [bounded]);

  /** Zoom to `s`, keeping the screen point (px, py) — stage-centre coordinates — still. */
  const zoomAt = useCallback((s: number, px: number, py: number, animate = false) => {
    const { s: s0, x: x0, y: y0 } = t.current;
    const s1 = clamp(s, MIN, MAX);
    const k = s1 / s0;
    apply(s1, px - (px - x0) * k, py - (py - y0) * k, animate);
  }, [apply]);

  const toCentre = (cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  };

  // New item → back to fit.
  useEffect(() => { setFailed(false); apply(1, 0, 0); }, [index, item?.url, apply]);

  // Page behind stays put; keys drive the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(t.current.s * 1.5, 0, 0, true); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(t.current.s / 1.5, 0, 0, true); }
      else if (e.key === '0') { e.preventDefault(); apply(1, 0, 0, true); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [go, onClose, zoomAt, apply]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const st = stageRef.current;
    if (!st || item?.kind !== 'image') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toCentre(e.clientX, e.clientY);
      const dy = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025));
      zoomAt(t.current.s * factor, p.x, p.y);
    };
    st.addEventListener('wheel', onWheel, { passive: false });
    return () => st.removeEventListener('wheel', onWheel);
  }, [item?.kind, zoomAt]);

  // iOS Safari fires its own gesture events for pinch; stop them zooming the page.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    return () => { document.removeEventListener('gesturestart', stop); document.removeEventListener('gesturechange', stop); };
  }, []);

  if (!item || typeof document === 'undefined') return null;
  const isVideo = item.kind === 'video';

  const onDown = (e: React.PointerEvent) => {
    // The prev / next buttons sit on the stage; capturing their pointer would eat the click.
    if (isVideo || (e.target as HTMLElement).closest('button,a')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2) {
      const [a, b] = pts;
      const m = toCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      Object.assign(g, { kind: 'pinch', s0: t.current.s, x0: t.current.x, y0: t.current.y, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: m.x, my: m.y, moved: true });
    } else if (pts.length === 1) {
      Object.assign(g, { kind: t.current.s > 1.01 ? 'pan' : 'swipe', sx: e.clientX, sy: e.clientY, x0: t.current.x, y0: t.current.y, moved: false });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (isVideo || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = toCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s1 = clamp(g.s0 * (d / g.d0), MIN * 0.8, MAX);
      // The content point that was under the fingers stays under the fingers.
      const x = m.x - ((g.mx - g.x0) * s1) / g.s0;
      const y = m.y - ((g.my - g.y0) * s1) / g.s0;
      const im = imgRef.current;
      t.current = s1 < MIN ? { s: s1, x, y } : bounded(s1, x, y);
      if (im) { im.style.transition = 'none'; im.style.transform = `translate3d(${t.current.x}px, ${t.current.y}px, 0) scale(${t.current.s})`; }
      setPct(Math.round(t.current.s * 100));
      return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
    if (g.kind === 'pan') {
      apply(t.current.s, g.x0 + dx, g.y0 + dy);
    } else if (g.kind === 'swipe' && imgRef.current) {
      // Feedback only: the photo follows the finger a little.
      const im = imgRef.current;
      im.style.transition = 'none';
      im.style.transform = Math.abs(dx) > Math.abs(dy)
        ? `translate3d(${dx * 0.6}px, 0, 0)`
        : `translate3d(0, ${Math.max(0, dy) * 0.6}px, 0) scale(${1 - Math.min(0.15, Math.max(0, dy) / 1500)})`;
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (isVideo || !pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      if (pointers.current.size === 1) {
        // One finger left on the glass: carry on as a pan from here.
        const [p] = Array.from(pointers.current.values());
        Object.assign(g, { kind: 'pan', sx: p.x, sy: p.y, x0: t.current.x, y0: t.current.y });
      } else if (pointers.current.size === 0) {
        g.kind = 'none';
        if (t.current.s < 1.02) apply(1, 0, 0, true);
      }
      return;
    }
    if (pointers.current.size > 0) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    const kind = g.kind;
    g.kind = 'none';
    if (kind === 'swipe') {
      if (g.moved && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { apply(1, 0, 0); go(dx < 0 ? 1 : -1); return; }
      if (g.moved && dy > 110 && dy > Math.abs(dx)) { onClose(); return; }
      apply(1, 0, 0, true);
    }
    if (!g.moved) {
      // Double-tap / double-click: zoom into the spot, or back out.
      const now = Date.now();
      const near = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 30;
      if (now - lastTap.current.t < 320 && near) {
        lastTap.current.t = 0;
        const p = toCentre(e.clientX, e.clientY);
        if (t.current.s > 1.01) apply(1, 0, 0, true);
        else zoomAt(2.5, p.x, p.y, true);
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  };

  const onCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) { gesture.current.kind = 'none'; if (t.current.s < 1.02) apply(1, 0, 0, true); }
  };

  return createPortal(
    <div className="zl" role="dialog" aria-modal="true" aria-label={item.title || (isVideo ? 'Video' : 'Photo')}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="zlBar">
        <div className="zlTitle">
          {item.title || (isVideo ? 'Video' : 'Photo')}
          {items.length > 1 && <small>{index + 1} of {items.length}</small>}
        </div>
        {!isVideo && (
          <>
            <button type="button" className="zlBtn zlHideSm" aria-label="Zoom out" onClick={() => zoomAt(t.current.s / 1.5, 0, 0, true)} disabled={pct <= 100}><MagnifyingGlassMinus size={18} /></button>
            <button type="button" className="zlBtn zlPct zlHideSm" aria-label="Fit to screen" onClick={() => apply(1, 0, 0, true)}>{pct}%</button>
            <button type="button" className="zlBtn zlHideSm" aria-label="Zoom in" onClick={() => zoomAt(t.current.s * 1.5, 0, 0, true)} disabled={pct >= MAX * 100}><MagnifyingGlassPlus size={18} /></button>
          </>
        )}
        {onInfo && <button type="button" className="zlBtn" aria-label="Details" title="Details" onClick={() => onInfo(item)}><Info size={19} /></button>}
        <a className="zlBtn" href={item.url} target="_blank" rel="noreferrer" aria-label="Open the original in a new tab" title="Open original"><ArrowSquareOut size={18} /></a>
        <button type="button" className="zlBtn" aria-label="Close" title="Close (Esc)" onClick={onClose}><X size={20} weight="bold" /></button>
      </div>

      <div
        ref={stageRef}
        className="zlStage"
        data-video={isVideo ? 'true' : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        {items.length > 1 && (
          <>
            <div className="zlSide" data-side="left"><button type="button" className="zlBtn" aria-label="Previous" onClick={() => go(-1)} disabled={index <= 0}><CaretLeft size={20} /></button></div>
            <div className="zlSide" data-side="right"><button type="button" className="zlBtn" aria-label="Next" onClick={() => go(1)} disabled={index >= items.length - 1}><CaretRight size={20} /></button></div>
          </>
        )}
        {failed ? (
          <div className="zlMsg">This {isVideo ? 'video' : 'photo'} didn&apos;t load. Close and open it again.</div>
        ) : isVideo ? (
          <video
            key={item.id}
            className="zlVideo"
            src={item.url}
            poster={item.poster || undefined}
            controls
            playsInline
            autoPlay
            preload="metadata"
            onError={() => { setFailed(true); onMediaError?.(item); }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.id}
            ref={imgRef}
            className="zlImg"
            src={item.url}
            alt={item.title || 'Photo'}
            draggable={false}
            onError={() => { setFailed(true); onMediaError?.(item); }}
          />
        )}
      </div>

      <div className="zlFoot">
        {isVideo ? 'Video plays here. Swipe or use ← → for the next one.' : 'Pinch or double-tap to zoom · drag to look around · swipe for the next one'}
      </div>
    </div>,
    document.body,
  );
}
