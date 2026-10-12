'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RevisionCompare — Bluebeam-style slip-sheet revision overlay.
 *
 * Renders two drawing revisions (PDF pages via pdf.js, or PNG/JPG/WebP images)
 * to offscreen canvases at a MATCHED pixel scale, then composites both onto one
 * view canvas. Tinting is a per-pixel channel map over each rasterized sheet:
 * every pixel's luminance L becomes (255, L, L) for rev A and (L, L, 255) for
 * rev B — so white paper stays white and dark ink becomes pure red (A) or pure
 * blue (B). The two tinted layers merge with globalCompositeOperation
 * = 'multiply': unchanged linework overlaps to near-black, deletions pop red,
 * additions pop blue. Crisp on white-background plan sheets, and cheap to
 * repaint — the per-pixel pass runs once per raster, pan/zoom just re-draws
 * the cached tinted canvases.
 *
 * Controls: A/B/Both toggle, per-layer opacity sliders, per-side page pickers
 * (multi-page PDFs), alignment nudge of B in image pixels (arrow keys — Shift
 * for ×10 — plus buttons), and the house {scale,tx,ty} pan/zoom transform with
 * focal wheel zoom and Fit.
 *
 * Vector assist (honest stretch): when BOTH sides are vector PDFs that
 * lib/heatmap/vector-pdf can parse, their extracted line segments are diffed by
 * quantized endpoints (0.5 pt snap) and a "N added · M removed" chip appears
 * with a toggle that highlights only the added (blue) / removed (red) geometry
 * as an SVG overlay. If either side fails to parse — scanned raster PDF, no
 * geometry — nothing vector-related is shown; the raster compare stands alone.
 * Known limits: text set with fonts isn't path geometry, so pure text edits
 * won't count; curves are chord-approximated; endpoint matching is exact-
 * within-0.5pt, so a re-export with global coordinate jitter can over-count.
 *
 * Fully client-side — no new APIs. House pdf.js pattern (dynamic import,
 * GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs').
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { VectorSegment } from '@/lib/heatmap/vector-pdf';

/* ── palette (machined dark; accent rides the white-label token) ─────────── */
const RAISED = 'var(--bg-surface)';
const PANEL = 'var(--bg-surface-2)';
const BORDER = 'rgba(255,255,255,0.12)';
const TEXT = '#FFFFFF';
const DIM = '#8094B0';
const CANVAS_BG = '#0b0e13';
const ACCENT = 'var(--brand-primary)';
const ACCENT_12 = 'var(--brand-primary-12, var(--brand-primary-12))';
const A_RED = '#F87171';
const B_BLUE = '#FBBF24';

const LONG_EDGE = 2200;              // raster long edge for the compare (crisp, fast to tint)
const MAX_HIGHLIGHT_LINES = 4000;    // SVG line cap per side for the vector highlight
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ── public helpers ──────────────────────────────────────────────────────── */
export interface CompareSource {
  url: string;
  fileName: string;
  fileType?: string | null;
  label: string;
}

/** File types the visual overlay can actually render. */
export function overlaySupported(fileName: string, fileType?: string | null): boolean {
  if (/\.(pdf|png|jpe?g|webp)$/i.test(fileName)) return true;
  return ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(fileType || '');
}

type Kind = 'pdf' | 'image';
function kindOf(s: CompareSource): Kind {
  return /\.pdf$/i.test(s.fileName) || s.fileType === 'application/pdf' ? 'pdf' : 'image';
}

/* ── source loading (bytes kept for the vector pass) ─────────────────────── */
interface SideDoc {
  kind: Kind;
  bytes: ArrayBuffer;
  pdf: any | null;
  pageCount: number;
  image: HTMLImageElement | null;
}

async function loadSide(src: CompareSource): Promise<SideDoc> {
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`Could not fetch ${src.label} (HTTP ${res.status})`);
  const bytes = await res.arrayBuffer();
  if (kindOf(src) === 'pdf') {
    const pdfjs: any = await import('pdfjs-dist');
    // static worker path — house pattern (never new URL(..., import.meta.url))
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // pdfjs detaches the buffer it's given — hand it a copy, keep ours
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    return { kind: 'pdf', bytes, pdf, pageCount: pdf.numPages || 1, image: null };
  }
  const blobUrl = URL.createObjectURL(new Blob([bytes]));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(`Could not decode ${src.label} as an image`));
      im.src = blobUrl;
    });
    return { kind: 'image', bytes, pdf: null, pageCount: 1, image };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function baseDims(doc: SideDoc, page: number): Promise<{ w: number; h: number }> {
  if (doc.kind === 'pdf') {
    const pg = await doc.pdf.getPage(page);
    const vp = pg.getViewport({ scale: 1 });
    return { w: vp.width, h: vp.height };
  }
  return { w: doc.image!.naturalWidth, h: doc.image!.naturalHeight };
}

async function rasterSide(doc: SideDoc, page: number, scale: number): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas');
  const ctx2 = (c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    return ctx;
  };
  if (doc.kind === 'pdf') {
    const pg = await doc.pdf.getPage(page);
    const vp = pg.getViewport({ scale });
    cv.width = Math.max(1, Math.round(vp.width));
    cv.height = Math.max(1, Math.round(vp.height));
    const ctx = ctx2(cv);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  }
  const im = doc.image!;
  cv.width = Math.max(1, Math.round(im.naturalWidth * scale));
  cv.height = Math.max(1, Math.round(im.naturalHeight * scale));
  const ctx = ctx2(cv);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, 0, 0, cv.width, cv.height);
  return cv;
}

/** Per-pixel channel map: luminance L → (255,L,L) red-tint or (L,L,255) blue-tint. */
function tintChannel(src: HTMLCanvasElement, channel: 'red' | 'blue'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  if (!ctx) return src;
  // flatten any transparency onto white paper first
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  if (channel === 'red') {
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = 255; d[i + 1] = lum; d[i + 2] = lum; d[i + 3] = 255;
    }
  } else {
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = lum; d[i + 1] = lum; d[i + 2] = 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

/* ── component ───────────────────────────────────────────────────────────── */
interface Layers {
  tintA: HTMLCanvasElement;
  tintB: HTMLCanvasElement;
  W: number;
  H: number;
  /** image px per source base unit (PDF points for PDFs) — vector overlay mapping */
  rsA: number;
  rsB: number;
}
interface SegPx { x1: number; y1: number; x2: number; y2: number }
interface VecDiff { added: SegPx[]; removed: SegPx[] }

interface Props {
  a: CompareSource;
  b: CompareSource;
}

export default function RevisionCompare({ a, b }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [docA, setDocA] = useState<SideDoc | null>(null);
  const [docB, setDocB] = useState<SideDoc | null>(null);
  const [pageA, setPageA] = useState(1);
  const [pageB, setPageB] = useState(1);
  const [layers, setLayers] = useState<Layers | null>(null);
  const [busy, setBusy] = useState('Loading revisions…');
  const [error, setError] = useState('');

  const [mode, setMode] = useState<'A' | 'both' | 'B'>('both');
  const [alphaA, setAlphaA] = useState(1);
  const [alphaB, setAlphaB] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });

  const [vec, setVec] = useState<VecDiff | null>(null);
  const [vecBusy, setVecBusy] = useState(false);
  const [showVec, setShowVec] = useState(false);

  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });

  /* view transform {scale, tx, ty} — display only (house pattern) */
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const applyView = useCallback((u: typeof view | ((v: typeof view) => typeof view)) => {
    const nv = typeof u === 'function' ? (u as (v: typeof view) => typeof view)(viewRef.current) : u;
    viewRef.current = nv;
    setView(nv);
  }, []);

  /* ── container size ────────────────────────────────────────────────────── */
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setCssSize({ w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box);
    setCssSize({ w: box.clientWidth, h: box.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ── load both sources ─────────────────────────────────────────────────── */
  useEffect(() => {
    let dead = false;
    let da: SideDoc | null = null;
    let db: SideDoc | null = null;
    setDocA(null); setDocB(null); setLayers(null); setVec(null); setShowVec(false);
    setError(''); setBusy('Loading revisions…');
    setPageA(1); setPageB(1); setOff({ x: 0, y: 0 });
    (async () => {
      try {
        [da, db] = await Promise.all([loadSide(a), loadSide(b)]);
        if (dead) return;
        setDocA(da); setDocB(db);
      } catch (e: any) {
        if (!dead) {
          setError(e?.message || 'Could not load the two revisions.');
          setBusy('');
        }
      }
    })();
    return () => {
      dead = true;
      try { da?.pdf?.destroy?.(); } catch { /* already gone */ }
      try { db?.pdf?.destroy?.(); } catch { /* already gone */ }
    };
    // keyed on the URLs only — the parent recreates the prop objects every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.url, b.url]);

  /* ── rasterize + tint at matched pixel scale ───────────────────────────── */
  useEffect(() => {
    if (!docA || !docB) return;
    let dead = false;
    setBusy('Rendering overlay…');
    (async () => {
      try {
        const aBase = await baseDims(docA, pageA);
        const sA = docA.kind === 'pdf'
          ? clamp(LONG_EDGE / Math.max(aBase.w, aBase.h), 0.5, 4)
          : Math.min(1, LONG_EDGE / Math.max(aBase.w, aBase.h));
        const bBase = await baseDims(docB, pageB);
        // matched pixel scale: B renders so its sheet width equals A's in pixels
        const sB = clamp((aBase.w * sA) / bBase.w, 0.02, 16);
        const [rawA, rawB] = await Promise.all([
          rasterSide(docA, pageA, sA),
          rasterSide(docB, pageB, sB),
        ]);
        if (dead) return;
        const tintA = tintChannel(rawA, 'red');
        const tintB = tintChannel(rawB, 'blue');
        if (dead) return;
        setLayers({
          tintA, tintB,
          W: Math.max(tintA.width, tintB.width),
          H: Math.max(tintA.height, tintB.height),
          rsA: sA, rsB: sB,
        });
        setBusy('');
      } catch (e: any) {
        if (!dead) {
          setError(e?.message || 'Could not render the overlay.');
          setBusy('');
        }
      }
    })();
    return () => { dead = true; };
  }, [docA, docB, pageA, pageB]);

  /* ── fit on fresh raster ───────────────────────────────────────────────── */
  const fitView = useCallback(() => {
    const box = containerRef.current;
    if (!box || !layers) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    const s = Math.min(w / layers.W, h / layers.H) * 0.94;
    applyView({ scale: s, tx: (w - layers.W * s) / 2, ty: (h - layers.H * s) / 2 });
  }, [layers, applyView]);
  useEffect(() => { fitView(); }, [fitView]);

  /* ── vector assist: only when both sides parse as vector PDFs ──────────── */
  useEffect(() => {
    setVec(null); setShowVec(false);
    if (!layers || !docA || !docB || docA.kind !== 'pdf' || docB.kind !== 'pdf') return;
    let dead = false;
    setVecBusy(true);
    (async () => {
      try {
        // vector-pdf hard-imports the legacy pdfjs build; give that build a real
        // browser worker before it runs (it only sets '' when unset).
        const legacy: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (legacy?.GlobalWorkerOptions && !legacy.GlobalWorkerOptions.workerSrc) {
          legacy.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        const { parseVectorPdf } = await import('@/lib/heatmap/vector-pdf');
        const [ra, rb] = await Promise.all([
          parseVectorPdf(docA.bytes, { page: pageA }),
          parseVectorPdf(docB.bytes, { page: pageB }),
        ]);
        if (dead) return;
        if (!ra.ok || !rb.ok || !ra.segments.length || !rb.segments.length) {
          setVec(null); // scanned/raster PDF or parse failure — show nothing vector-related
          return;
        }
        const q = (v: number) => Math.round(v * 2) / 2; // 0.5 pt endpoint snap
        const keyOf = (s: VectorSegment) => `${q(s.x1)},${q(s.y1)},${q(s.x2)},${q(s.y2)}`;
        const inA = new Set(ra.segments.map(keyOf));
        const inB = new Set(rb.segments.map(keyOf));
        const { rsA, rsB } = layers;
        const removed: SegPx[] = [];
        for (const s of ra.segments) {
          if (!inB.has(keyOf(s))) removed.push({ x1: s.x1 * rsA, y1: s.y1 * rsA, x2: s.x2 * rsA, y2: s.y2 * rsA });
        }
        const added: SegPx[] = [];
        for (const s of rb.segments) {
          if (!inA.has(keyOf(s))) added.push({ x1: s.x1 * rsB, y1: s.y1 * rsB, x2: s.x2 * rsB, y2: s.y2 * rsB });
        }
        setVec({ added, removed });
      } catch {
        if (!dead) setVec(null); // honest: no counts unless both sides truly parsed
      } finally {
        if (!dead) setVecBusy(false);
      }
    })();
    return () => { dead = true; };
  }, [layers, docA, docB, pageA, pageB]);

  /* ── paint ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, cssSize.w), h = Math.max(1, cssSize.h);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, w, h);
    if (!layers) return;
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, layers.W, layers.H);
    if (mode !== 'B') {
      ctx.globalAlpha = alphaA;
      ctx.drawImage(layers.tintA, 0, 0);
    }
    if (mode !== 'A') {
      ctx.globalCompositeOperation = mode === 'both' ? 'multiply' : 'source-over';
      ctx.globalAlpha = alphaB;
      ctx.drawImage(layers.tintB, off.x, off.y);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }, [layers, view, mode, alphaA, alphaB, off, cssSize]);

  /* ── focal wheel zoom + pan ────────────────────────────────────────────── */
  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const box = containerRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const { scale, tx, ty } = viewRef.current;
    const ns = clamp(scale * factor, 0.02, 40);
    const ix = (sx - tx) / scale, iy = (sy - ty) / scale;
    applyView({ scale: ns, tx: sx - ix * ns, ty: sy - iy * ns });
  }, [applyView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const zoomCenter = useCallback((factor: number) => {
    const box = containerRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }, [zoomAt]);

  const dragRef = useRef<{ on: boolean; sx: number; sy: number; tx: number; ty: number }>({ on: false, sx: 0, sy: 0, tx: 0, ty: 0 });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { on: true, sx: e.clientX, sy: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.on) return;
    applyView((v) => ({ ...v, tx: d.tx + (e.clientX - d.sx), ty: d.ty + (e.clientY - d.sy) }));
  }, [applyView]);
  const onPointerUp = useCallback(() => { dragRef.current.on = false; }, []);

  /* ── arrow-key alignment nudge (Shift = ×10) ───────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      if (dx || dy) {
        e.preventDefault();
        setOff((o) => ({ x: o.x + dx, y: o.y + dy }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nudge = useCallback((dx: number, dy: number) => setOff((o) => ({ x: o.x + dx, y: o.y + dy })), []);

  /* ── chrome styles ─────────────────────────────────────────────────────── */
  const ghost = (active?: boolean, color?: string): React.CSSProperties => ({
    background: active ? ACCENT_12 : PANEL,
    border: `1px solid ${active ? ACCENT : BORDER}`,
    color: active ? (`${ACCENT}` as string) : (color || TEXT),
    borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
  });
  const grp: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 };
  const lbl: React.CSSProperties = { fontSize: 11, color: DIM, fontWeight: 600 };
  const sep: React.CSSProperties = { width: 1, alignSelf: 'stretch', background: BORDER, margin: '2px 2px' };

  const vecTotal = vec ? vec.added.length + vec.removed.length : 0;
  const highlightCapped = vec ? (vec.added.length > MAX_HIGHLIGHT_LINES || vec.removed.length > MAX_HIGHLIGHT_LINES) : false;

  const pagePicker = (side: 'A' | 'B') => {
    const doc = side === 'A' ? docA : docB;
    const page = side === 'A' ? pageA : pageB;
    const setPage = side === 'A' ? setPageA : setPageB;
    if (!doc || doc.kind !== 'pdf' || doc.pageCount <= 1) return null;
    return (
      <span style={grp}>
        <span style={{ ...lbl, color: side === 'A' ? A_RED : B_BLUE }}>{side} pg</span>
        <button style={ghost()} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label={`${side}: previous page`}>‹</button>
        <span style={{ fontSize: 12, color: TEXT, fontFamily: 'monospace' }}>{page}/{doc.pageCount}</span>
        <button style={ghost()} onClick={() => setPage((p) => Math.min(doc.pageCount, p + 1))} disabled={page >= doc.pageCount} aria-label={`${side}: next page`}>›</button>
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, background: CANVAS_BG }}>
      {/* ── toolbar ── */}
      <div style={{ background: RAISED, borderBottom: `1px solid ${BORDER}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 'none' }}>
        {/* layer toggle */}
        <span style={grp}>
          <button style={ghost(mode === 'A', A_RED)} onClick={() => setMode('A')}>A Only</button>
          <button style={ghost(mode === 'both')} onClick={() => setMode('both')}>Overlay</button>
          <button style={ghost(mode === 'B', B_BLUE)} onClick={() => setMode('B')}>B Only</button>
        </span>
        <span style={sep} />
        {/* opacity */}
        <span style={grp}>
          <span style={{ ...lbl, color: A_RED }}>A</span>
          <input type="range" min={0} max={100} value={Math.round(alphaA * 100)}
            onChange={(e) => setAlphaA(Number(e.target.value) / 100)}
            style={{ width: 84, accentColor: A_RED }} aria-label="Rev A opacity" />
          <span style={{ ...lbl, color: B_BLUE }}>B</span>
          <input type="range" min={0} max={100} value={Math.round(alphaB * 100)}
            onChange={(e) => setAlphaB(Number(e.target.value) / 100)}
            style={{ width: 84, accentColor: B_BLUE }} aria-label="Rev B opacity" />
        </span>
        {(pagePicker('A') || pagePicker('B')) && <span style={sep} />}
        {pagePicker('A')}
        {pagePicker('B')}
        <span style={sep} />
        {/* alignment nudge */}
        <span style={grp} title="Nudge rev B to align a slightly-off scan. Arrow keys work too — hold Shift for 10 px.">
          <span style={lbl}>Align B</span>
          <button style={ghost()} onClick={() => nudge(-1, 0)} aria-label="Nudge B left">←</button>
          <button style={ghost()} onClick={() => nudge(0, -1)} aria-label="Nudge B up">↑</button>
          <button style={ghost()} onClick={() => nudge(0, 1)} aria-label="Nudge B down">↓</button>
          <button style={ghost()} onClick={() => nudge(1, 0)} aria-label="Nudge B right">→</button>
          <span style={{ fontSize: 11, color: DIM, fontFamily: 'monospace', minWidth: 64, textAlign: 'center' }}>Δ {off.x},{off.y}px</span>
          {(off.x !== 0 || off.y !== 0) && <button style={ghost()} onClick={() => setOff({ x: 0, y: 0 })}>Reset</button>}
        </span>
        <span style={sep} />
        {/* zoom */}
        <span style={grp}>
          <button style={ghost()} onClick={() => zoomCenter(1 / 1.25)} aria-label="Zoom out">−</button>
          <span style={{ fontSize: 11, color: DIM, fontFamily: 'monospace', minWidth: 44, textAlign: 'center' }}>{Math.round(view.scale * 100)}%</span>
          <button style={ghost()} onClick={() => zoomCenter(1.25)} aria-label="Zoom in">+</button>
          <button style={ghost()} onClick={fitView}>Fit</button>
        </span>
        {/* vector assist — only ever shown when BOTH sides truly parsed */}
        {vecBusy && <span style={{ fontSize: 11, color: DIM }}>Analyzing linework…</span>}
        {vec && (
          <span style={grp}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: TEXT, background: PANEL,
              border: `1px solid ${BORDER}`, borderRadius: 999, padding: '4px 10px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: B_BLUE }}>{vec.added.length} segment{vec.added.length === 1 ? '' : 's'} added</span>
              <span style={{ color: DIM }}>·</span>
              <span style={{ color: A_RED }}>{vec.removed.length} removed</span>
            </span>
            {vecTotal > 0 && (
              <button style={ghost(showVec)} onClick={() => setShowVec((s) => !s)}>
                {showVec ? 'Hide Highlight' : 'Highlight'}
              </button>
            )}
            {showVec && highlightCapped && (
              <span style={{ fontSize: 10.5, color: DIM }}>Highlight capped at {MAX_HIGHLIGHT_LINES} lines/side</span>
            )}
          </span>
        )}
      </div>

      {/* ── stage ── */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

        {/* vector highlight overlay (added blue from B + its nudge, removed red from A) */}
        {showVec && vec && layers && (
          <svg
            width={Math.max(1, cssSize.w)} height={Math.max(1, cssSize.h)}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            aria-hidden="true"
          >
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
              {vec.removed.slice(0, MAX_HIGHLIGHT_LINES).map((s, i) => (
                <line key={`r${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                  stroke={A_RED} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              ))}
              <g transform={`translate(${off.x} ${off.y})`}>
                {vec.added.slice(0, MAX_HIGHLIGHT_LINES).map((s, i) => (
                  <line key={`a${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                    stroke={B_BLUE} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                ))}
              </g>
            </g>
          </svg>
        )}

        {/* legend */}
        {layers && !busy && !error && (
          <div style={{
            position: 'absolute', left: 12, bottom: 12, background: RAISED, border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: '7px 12px', fontSize: 11.5, color: DIM,
            display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'none',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: A_RED, display: 'inline-block' }} />
              <span><strong style={{ color: TEXT }}>A</strong> only — removed</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: B_BLUE, display: 'inline-block' }} />
              <span><strong style={{ color: TEXT }}>B</strong> only — added</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#26262a', border: `1px solid ${BORDER}`, display: 'inline-block' }} />
              <span>Dark — unchanged</span>
            </span>
          </div>
        )}

        {/* busy / error */}
        {(busy || error) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ background: RAISED, border: `1px solid ${error ? A_RED : BORDER}`, borderRadius: 10, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 420 }}>
              {!error && (
                <>
                  <div style={{ width: 18, height: 18, border: `2px solid ${BORDER}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'rvc-spin 1s linear infinite', flexShrink: 0 }} />
                  <style>{`@keyframes rvc-spin { to { transform: rotate(360deg); } }`}</style>
                </>
              )}
              <span style={{ fontSize: 13, color: error ? TEXT : DIM }}>{error || busy}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
