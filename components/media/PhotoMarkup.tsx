'use client';
/**
 * Draw on a jobsite photo — pen, arrow, box, text in four token colors — and
 * hand back the result as a JPEG. The caller saves it as a NEW photo, so the
 * original is never overwritten.
 *
 * Two stacked canvases: the photo (drawn once) and the marks (redrawn on every
 * stroke), so a finger moving never re-decodes the photo. Marks are kept as
 * shapes in photo pixels; the export draws them onto a full-size copy.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PencilSimple, ArrowUpRight, Square, TextT, ArrowCounterClockwise, Trash, X, FloppyDisk, CircleNotch,
} from '@phosphor-icons/react';
import { confirmDialog } from '@/lib/ui/async-dialog';

type Tool = 'pen' | 'arrow' | 'rect' | 'text';
type Pt = { x: number; y: number };
type Shape =
  | { t: 'pen'; c: string; w: number; pts: Pt[] }
  | { t: 'arrow' | 'rect'; c: string; w: number; a: Pt; b: Pt }
  | { t: 'text'; c: string; w: number; a: Pt; text: string };

/** Ink colors — design tokens, resolved to real colors at runtime. */
const INKS: { token: string; label: string }[] = [
  { token: '--danger', label: 'Red' },
  { token: '--warning', label: 'Amber' },
  { token: '--success', label: 'Green' },
  { token: '--text-primary', label: 'White' },
];
const MAX_SIDE = 3000;

const CSS = `
.pmk { position: fixed; inset: 0; z-index: 10060; display: flex; flex-direction: column; background: var(--bg-solid); color: var(--text-primary); }
.pmkBar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: max(10px, env(safe-area-inset-top)) 12px 10px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
.pmkTitle { flex: 1 1 160px; min-width: 0; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmkGroup { display: inline-flex; align-items: center; gap: 4px; }
.pmkBtn { min-width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.pmkBtn[aria-pressed="true"] { border-color: var(--brand-primary); box-shadow: inset 0 0 0 1px var(--brand-primary); }
.pmkBtn:disabled { opacity: .4; cursor: default; }
.pmkBtn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.pmkSave { background: var(--brand-primary); color: var(--on-brand); border-color: var(--brand-primary); }
.pmkInk { width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--border-default); cursor: pointer; padding: 0; }
.pmkInk[aria-pressed="true"] { border-color: var(--text-primary); box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--brand-primary); }
.pmkStage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 12px; overflow: hidden; }
.pmkFrame { position: relative; }
.pmkFrame canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.pmkFrame canvas + canvas { touch-action: none; cursor: crosshair; }
.pmkText { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
.pmkText input { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); font: inherit; font-size: 16px; }
.pmkMsg { color: var(--text-secondary); font-size: 14px; text-align: center; padding: 24px; max-width: 360px; }
@media (max-width: 640px) { .pmkHideSm { display: none; } }
`;

function resolveInks(): string[] {
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const out = INKS.map(({ token }) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color || 'currentColor';
  });
  probe.remove();
  return out;
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save();
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.t === 'pen') {
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + 0.1, s.pts[0].y);
    ctx.stroke();
  } else if (s.t === 'rect') {
    ctx.strokeRect(Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y));
  } else if (s.t === 'arrow') {
    const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
    const head = s.w * 4.5;
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.b.x, s.b.y);
    ctx.lineTo(s.b.x - head * Math.cos(ang - Math.PI / 7), s.b.y - head * Math.sin(ang - Math.PI / 7));
    ctx.lineTo(s.b.x - head * Math.cos(ang + Math.PI / 7), s.b.y - head * Math.sin(ang + Math.PI / 7));
    ctx.closePath(); ctx.fill();
  } else if (s.t === 'text') {
    const size = Math.round(s.w * 7);
    ctx.font = `700 ${size}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'top';
    // A dark outline keeps the words readable on any part of the photo.
    ctx.lineWidth = Math.max(2, size / 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(s.text, s.a.x, s.a.y);
    ctx.fillText(s.text, s.a.x, s.a.y);
  }
  ctx.restore();
}

export default function PhotoMarkup({ src, title, onClose, onSave }: {
  src: string;
  title: string;
  onClose: () => void;
  /** Save the marked-up JPEG. Resolve true once it is stored. */
  onSave: (blob: Blob) => Promise<boolean>;
}) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [err, setErr] = useState('');
  const [tool, setTool] = useState<Tool>('arrow');
  const [inks, setInks] = useState<string[]>([]);
  const [ink, setInk] = useState(0);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const drawing = useRef<Shape | null>(null);

  useEffect(() => { setInks(resolveInks()); }, []);

  /* Load the photo CORS-clean so the canvas can be exported: fetched fresh
     (the viewer's cached non-CORS copy would taint the canvas) into a
     same-origin blob URL; a CORS image request is the fallback. */
  useEffect(() => {
    let alive = true;
    let blobUrl = '';
    const show = (url: string, cors: boolean) => new Promise<void>((resolve, reject) => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      im.decoding = 'async';
      im.onload = () => {
        if (alive) {
          const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
          imgRef.current = im;
          setDims({ w: Math.round(im.naturalWidth * k), h: Math.round(im.naturalHeight * k) });
        }
        resolve();
      };
      im.onerror = () => reject(new Error('image load failed'));
      im.src = url;
    });
    (async () => {
      try {
        const r = await fetch(src, { cache: 'no-store' });
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        blobUrl = URL.createObjectURL(await r.blob());
        await show(blobUrl, false);
      } catch (e) {
        console.warn('[PhotoMarkup] blob load failed, trying CORS image', e);
        try { await show(src, true); }
        catch (e2) { console.error('[PhotoMarkup] load', e2); if (alive) setErr("This photo didn't load for markup. Close and try again."); }
      }
    })();
    return () => { alive = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [src]);

  // Fit the drawing frame to the stage, whole photo visible.
  useLayoutEffect(() => {
    const st = stageRef.current;
    if (!st || !dims) return;
    const fit = () => {
      const W = Math.max(1, st.clientWidth - 24), H = Math.max(1, st.clientHeight - 24);
      const k = Math.min(W / dims.w, H / dims.h);
      setBox({ w: Math.floor(dims.w * k), h: Math.floor(dims.h * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(st);
    return () => ro.disconnect();
  }, [dims]);

  // The photo layer, once.
  useEffect(() => {
    const c = baseRef.current, im = imgRef.current;
    if (!c || !im || !dims) return;
    c.width = dims.w; c.height = dims.h;
    c.getContext('2d')?.drawImage(im, 0, 0, dims.w, dims.h);
  }, [dims]);

  const lw = dims ? Math.max(3, Math.round(Math.max(dims.w, dims.h) / 280)) : 4;

  const redraw = useCallback(() => {
    const c = inkRef.current;
    if (!c || !dims) return;
    if (c.width !== dims.w) { c.width = dims.w; c.height = dims.h; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of shapes) drawShape(ctx, s);
    if (drawing.current) drawShape(ctx, drawing.current);
  }, [dims, shapes]);
  useEffect(() => { redraw(); }, [redraw]);

  const toImage = (e: React.PointerEvent): Pt => {
    const r = inkRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (dims?.w || 1), y: ((e.clientY - r.top) / r.height) * (dims?.h || 1) };
  };
  const color = inks[ink] || 'currentColor';

  const down = (e: React.PointerEvent) => {
    if (!dims || busy) return;
    e.preventDefault();
    const p = toImage(e);
    if (tool === 'text') { setTextAt(p); setText(''); return; }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawing.current = tool === 'pen' ? { t: 'pen', c: color, w: lw, pts: [p] } : { t: tool, c: color, w: lw, a: p, b: p };
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d) return;
    e.preventDefault();
    const p = toImage(e);
    if (d.t === 'pen') d.pts.push(p);
    else if (d.t === 'arrow' || d.t === 'rect') d.b = p;
    redraw();
  };
  const up = () => {
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;
    const tiny = (d.t === 'arrow' || d.t === 'rect') && Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) < lw * 2;
    if (!tiny) setShapes((s) => [...s, d]); else redraw();
  };
  const placeText = () => {
    const t = text.trim();
    if (textAt && t) setShapes((s) => [...s, { t: 'text', c: color, w: lw, a: textAt, text: t.slice(0, 120) }]);
    setTextAt(null); setText('');
  };

  const leave = useCallback(async () => {
    if (busy) return;
    if (shapes.length && !(await confirmDialog({ title: 'Discard markup?', message: 'Your marks on this photo will be lost.', danger: true }))) return;
    onClose();
  }, [busy, shapes.length, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'INPUT') return;
      if (e.key === 'Escape') { e.preventDefault(); leave(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); setShapes((s) => s.slice(0, -1)); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [leave]);

  const save = async () => {
    const im = imgRef.current;
    if (!im || !dims || !shapes.length || busy) return;
    setBusy(true);
    try {
      const out = document.createElement('canvas');
      out.width = dims.w; out.height = dims.h;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.drawImage(im, 0, 0, dims.w, dims.h);
      for (const s of shapes) drawShape(ctx, s);
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('export failed');
      if (await onSave(blob)) onClose();
    } catch (e) {
      console.error('[PhotoMarkup] export', e);
      setErr("This photo can't be exported from the browser. Try again after reloading the page.");
    } finally { setBusy(false); }
  };

  if (typeof document === 'undefined') return null;
  const tools: { k: Tool; label: string; icon: React.ReactNode }[] = [
    { k: 'pen', label: 'Pen', icon: <PencilSimple size={18} /> },
    { k: 'arrow', label: 'Arrow', icon: <ArrowUpRight size={18} /> },
    { k: 'rect', label: 'Box', icon: <Square size={18} /> },
    { k: 'text', label: 'Text', icon: <TextT size={18} /> },
  ];

  return createPortal(
    <div className="pmk" role="dialog" aria-modal="true" aria-label={`Mark up ${title}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pmkBar">
        <div className="pmkTitle">{title}</div>
        <div className="pmkGroup" role="group" aria-label="Tool">
          {tools.map((t) => (
            <button key={t.k} type="button" className="pmkBtn" aria-pressed={tool === t.k} aria-label={t.label} title={t.label}
              onClick={() => { setTool(t.k); if (t.k !== 'text') setTextAt(null); }}>
              {t.icon}<span className="pmkHideSm">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="pmkGroup" role="group" aria-label="Color">
          {INKS.map((c, i) => (
            <button key={c.token} type="button" className="pmkInk" aria-pressed={ink === i} aria-label={c.label} title={c.label}
              style={{ background: `var(${c.token})` }} onClick={() => setInk(i)} />
          ))}
        </div>
        <div className="pmkGroup">
          <button type="button" className="pmkBtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!shapes.length || busy} onClick={() => setShapes((s) => s.slice(0, -1))}><ArrowCounterClockwise size={18} /></button>
          <button type="button" className="pmkBtn" aria-label="Clear all marks" title="Clear" disabled={!shapes.length || busy} onClick={() => setShapes([])}><Trash size={18} /></button>
        </div>
        <div className="pmkGroup">
          <button type="button" className="pmkBtn pmkSave" disabled={!shapes.length || busy || !!err} onClick={save}>
            {busy ? <CircleNotch size={18} /> : <FloppyDisk size={18} />} Save as New Photo
          </button>
          <button type="button" className="pmkBtn" aria-label="Close" title="Close (Esc)" onClick={leave} disabled={busy}><X size={18} weight="bold" /></button>
        </div>
      </div>
      {textAt && (
        <form method="post" className="pmkText" onSubmit={(e) => { e.preventDefault(); placeText(); }}>
          <input autoFocus value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="Label" aria-label="Label text"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setTextAt(null); } }} />
          <button type="submit" className="pmkBtn" disabled={!text.trim()}>Place</button>
          <button type="button" className="pmkBtn" onClick={() => setTextAt(null)}>Cancel</button>
        </form>
      )}
      <div ref={stageRef} className="pmkStage">
        {err ? <div className="pmkMsg" role="alert">{err}</div> : !dims ? <CircleNotch size={28} /> : (
          <div className="pmkFrame" style={{ width: box.w, height: box.h }}>
            <canvas ref={baseRef} aria-hidden />
            <canvas ref={inkRef} aria-label="Drawing area" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
