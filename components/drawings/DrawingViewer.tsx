'use client';
/**
 * DrawingViewer — the flagship web drawing viewer + markup editor (Procore/Bluebeam grade).
 *
 * House pattern (from PlanTracer): pdf.js dynamic import with
 * GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs', page→canvas raster,
 * a {scale, tx, ty} view transform with focal zoomAt + hold-space pan, and
 * inverse-transformed pointer input. ALL markup geometry is stored in
 * IMAGE-PIXEL coordinates of the source page render (B1 contract); the view
 * transform is display-only, so markups never drift with zoom/pan.
 *
 * Persistence: one row per markup via the canonical API
 * (/api/projects/[projectId]/drawings/markups) — saved on tool completion,
 * optimistic render, offline enqueue via @/lib/field-db. Legacy consolidated
 * freehand rows render read-only, best-effort, never crash.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGuardedRouter } from '@/lib/navGuard';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { enqueue } from '@/lib/field-db';
import { HAS_SUPABASE, getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import {
  STAMPS, type StampName, type MarkupRow, type MarkupComment, type ParsedMarkup, type Pt,
  type MeasureMarkupKind,
  parseMarkup, geomPoints, geomRect, geomLine, geomEllipse, geomPoint,
  drawArrowHead, drawCloudRect, hitTestMarkup, measureLabel, relTime,
  measureKindOf, measureGeomPoints, traceMeasurePath, traceCountTick,
  polylineMeasureLabel, areaMeasureLabel, countMeasureLabel,
} from './markup-model';
// Canonical takeoff engine — READ-ONLY imports (web mirror == mobile canonical; never edited here).
import { measureCondition } from '@/lib/takeoff/measure';
import { ASSEMBLY_MENU } from '@/lib/takeoff/assemblies';

/* ── palette (machined dark; brand accent rides the white-label token) ──── */
const RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)', TEXT = '#FFFFFF', DIM = '#D4D4D8';
const CANVAS_BG = '#0b0e13';
const ACCENT = 'var(--brand-primary)';
const ACCENT_12 = 'var(--brand-primary-12, var(--brand-primary-12))';
const ACCENT_25 = 'var(--brand-primary-25, var(--brand-primary-25))';
const RED = '#FF3B30', GREEN = '#2CFF7A', AMBER = 'var(--warning)';
const INK_COLORS = ['#FF3B30', '#FF8A00', '#FFE600', '#2CFF7A', '#FF8A00', '#FF8A00', '#FF8A00', '#FFFFFF'];
const CATEGORY_COLORS: Record<string, string> = { RFI: '#FF8A00', Punch: '#FF3B30', Safety: '#FFE600', Other: '#D4D4D8' };

const PDF_LONG_EDGE = 2600;   // crisp raster for plan sheets
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const uid = () => 'local-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Resolve the live brand accent for canvas painting (canvas can't read CSS vars). */
function brandHex(): string {
  if (typeof window === 'undefined') return '#FF8A00';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim();
  return v || '#FF8A00';
}

/* ── thin-line CAD glyphs (crisp vector, never emoji) ───────────────────── */
const GLYPHS = {
  select: 'M6 4l0 15 4-4 2.6 5 2-0.9-2.5-4.9 5.5 0z',
  pen: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1zM14.5 6.5l3 3',
  cloud: 'M6 9a3 3 0 0 1 0-6h12a3 3 0 0 1 0 6M6 9a3 3 0 1 0 0 6M6 15a3 3 0 1 0 0 6h12a3 3 0 1 0 0-6M18 15a3 3 0 1 0 0-6',
  arrow: 'M5 19L19 5M19 5h-7M19 5v7',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  callout: 'M9 4h11v9H12l-3 3v-3H9zM4 20l4-4',
  rect: 'M4 5h16v14H4z',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  measure: 'M3 17L17 3l4 4L7 21zM7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2',
  eraser: 'M4 16L13 7l6 6-6 6H8zM8 19h12',
  stamp: 'M7 20h10M9 12h6l1 4H8zM10 12V6a2 2 0 0 1 4 0v6',
  pin: 'M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10zM12 8.5v0',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM11 8v6M8 11h6M16.5 16.5L21 21',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM8 11h6M16.5 16.5L21 21',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  trash: 'M5 7h14M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  close: 'M6 6l12 12M18 6L6 18',
  calib: 'M3 8h18v8H3zM6.5 8v4M9.5 8v3M12.5 8v4M15.5 8v3M18 8v4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  send: 'M3 11.5L21 3l-6.5 18-3.2-7.3zM21 3L11.3 13.7',
  eyeOff: 'M4 4l16 16M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  share: 'M9.5 13.5a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6M14.5 10.5a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6',
} as const;
type Glyph = keyof typeof GLYPHS;
function G({ g, s = 18, w = 1.7 }: { g: Glyph; s?: number; w?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d={GLYPHS[g]} />
    </svg>
  );
}

/* ── types ──────────────────────────────────────────────────────────────── */
export interface DrawingDoc { id: string; sheet: string; name: string; description: string; fileUrl: string }
export interface DrawingPin {
  id: string; drawing_id: string; x_pct: number; y_pct: number;
  title: string; note?: string; notes?: string; category?: string; pin_type?: string;
  entity_type?: string | null; entity_id?: string | null; page_number?: number | null;
  created_at: string;
}
interface Props {
  projectId: string;
  drawing: DrawingDoc;
  me: { id: string; name: string };
  online: boolean;
  initialPin?: DrawingPin | null;
}

type Tool = 'select' | 'pen' | 'cloud' | 'arrow' | 'text' | 'callout' | 'rect' | 'circle' | 'measure' | 'eraser' | 'stamp' | 'pin' | 'calibrate';

/* ── SEND TO TAKEOFF (B2 contract) ──────────────────────────────────────── */

/** Rides POST /api/takeoff/measured verbatim in conditions jsonb. NEVER carries waste_factor_pct. */
interface PromotedCondition {
  id: string;
  name: string;
  kind: MeasureMarkupKind;
  value: number;
  assemblyId: string;
  measured: 'traced';
  points: Pt[];
  ppf: number;
  sheetId: string;
  sheet: string;
  note: string;
}

const PROMOTE_KEY = 'saguaro_promote_takeoff_v1';

/** One measure markup on the current sheet, resolved for the promote modal. */
interface PromotableMeasure {
  markupId: string;
  kind: MeasureMarkupKind;
  points: Pt[];
  /** effective px/ft (row's own ppf, else the sheet calibration); null = uncalibrated */
  ppf: number | null;
  value: number;
  unit: string;
  label: string;
}
interface PromoteRow extends PromotableMeasure {
  include: boolean;
  name: string;
  assemblyId: string;
}

const MEASURE_MODES: { m: MeasureMarkupKind; label: string; hint: string }[] = [
  { m: 'linear', label: 'Linear', hint: 'Click points along the run (drag for a quick two-point). Double-click or Enter finishes.' },
  { m: 'area',   label: 'Area',   hint: 'Click the polygon corners — live SF as you go. Click the first corner or press Enter to close.' },
  { m: 'count',  label: 'Count',  hint: 'Each click drops a tick. Enter or Esc commits the cluster as one count.' },
];

const TOOLS: { t: Tool; g: Glyph; label: string; key?: string; hint: string }[] = [
  { t: 'select',  g: 'select',  label: 'Select', key: 'V', hint: 'Click a markup to inspect it. Drag empty plan to pan; hold Space with any tool to pan.' },
  { t: 'pen',     g: 'pen',     label: 'Pen',    key: 'P', hint: 'Draw freehand. Saves when you lift the pen.' },
  { t: 'cloud',   g: 'cloud',   label: 'Cloud',  key: 'C', hint: 'Drag a box — it becomes a revision cloud.' },
  { t: 'arrow',   g: 'arrow',   label: 'Arrow',  key: 'A', hint: 'Drag from tail to head.' },
  { t: 'text',    g: 'text',    label: 'Text',   key: 'T', hint: 'Click where the note goes, then type.' },
  { t: 'callout', g: 'callout', label: 'Callout', hint: 'Drag from the thing you’re calling out to where the text sits.' },
  { t: 'rect',    g: 'rect',    label: 'Rect',   key: 'R', hint: 'Drag a rectangle.' },
  { t: 'circle',  g: 'circle',  label: 'Circle', hint: 'Drag an ellipse.' },
  { t: 'measure', g: 'measure', label: 'Measure', key: 'M', hint: 'Pick Linear, Area, or Count, then click points. Calibrate the sheet for real feet.' },
  { t: 'stamp',   g: 'stamp',   label: 'Stamp',  hint: 'Pick a stamp, then click to place it. PUNCH creates a punch item + pin.' },
  { t: 'pin',     g: 'pin',     label: 'Pin',    hint: 'Click to drop a categorized field pin.' },
  { t: 'eraser',  g: 'eraser',  label: 'Erase',  hint: 'Click one of your markups to delete it.' },
];

type UndoAction = {
  t: 'add' | 'del';
  localId: string;
  payload: { markup_type: string; data: Record<string, unknown>; color: string; page_number: number | null };
  row?: MarkupRow;
};

const inp: React.CSSProperties = { width: '100%', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px', color: TEXT, fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const panelStyle: React.CSSProperties = { background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginTop: 10 };

export default function DrawingViewer({ projectId, drawing, me, online, initialPin }: Props) {
  const router = useGuardedRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ── page raster ─────────────────────────────────────────────────────── */
  const sourceRef = useRef<CanvasImageSource | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [imgReady, setImgReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('Loading sheet…');
  const pdfDocRef = useRef<unknown>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const pageCacheRef = useRef<Map<number, { src: HTMLCanvasElement; w: number; h: number }>>(new Map());

  /* ── view transform {scale, tx, ty} (display only) ───────────────────── */
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const applyView = useCallback((u: typeof view | ((v: typeof view) => typeof view)) => {
    const nv = typeof u === 'function' ? (u as (v: typeof view) => typeof view)(viewRef.current) : u;
    viewRef.current = nv; setView(nv);
  }, []);
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });

  /* ── tool + ink state ────────────────────────────────────────────────── */
  const [tool, setTool] = useState<Tool>('select');
  const [ink, setInk] = useState(INK_COLORS[0]);
  const [inkWidth, setInkWidth] = useState(3);
  const [stampChoice, setStampChoice] = useState<StampName>('APPROVED');
  const [msg, setMsg] = useState('');

  /* ── markups ─────────────────────────────────────────────────────────── */
  const [markups, setMarkups] = useState<MarkupRow[]>([]);
  const markupsRef = useRef<MarkupRow[]>([]);
  useEffect(() => { markupsRef.current = markups; }, [markups]);
  const [hiddenAuthors, setHiddenAuthors] = useState<Set<string>>(new Set());
  const [selId, setSelId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; sx: number; sy: number } | null>(null);
  const parsedCacheRef = useRef<Map<string, ParsedMarkup>>(new Map());
  const idMapRef = useRef<Map<string, string>>(new Map());      // localId → serverId
  const cancelledRef = useRef<Set<string>>(new Set());          // localIds undone before POST resolved

  /* ── drafts ──────────────────────────────────────────────────────────── */
  const penRef = useRef<Pt[]>([]);
  const [penTick, setPenTick] = useState(0);                    // repaint pulse while inking
  const dragShapeRef = useRef<{ a: Pt; b: Pt } | null>(null);
  const [dragShape, setDragShape] = useState<{ a: Pt; b: Pt } | null>(null);
  const [measureMode, setMeasureMode] = useState<MeasureMarkupKind>('linear');
  const [measurePts, setMeasurePts] = useState<Pt[]>([]);   // vertices being collected (polyline/area/count)
  const measurePtsRef = useRef<Pt[]>([]);
  useEffect(() => { measurePtsRef.current = measurePts; }, [measurePts]);
  const lastMeasureTapRef = useRef(0);                     // pinch guard: pops a vertex the first pinch finger just dropped
  const measureCommitAtRef = useRef(0);                    // dbl-click guard: ignore the stray press right after a commit
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);

  /* ── modals ──────────────────────────────────────────────────────────── */
  const [textModal, setTextModal] = useState<{ at: Pt; from?: Pt; value: string } | null>(null);
  const [punchModal, setPunchModal] = useState<{ at: Pt; title: string; saving: boolean } | null>(null);
  const [calibModal, setCalibModal] = useState<{ a: Pt; b: Pt; ft: string } | null>(null);
  const [promoteModal, setPromoteModal] = useState<PromoteRow[] | null>(null);
  const [toast, setToast] = useState<{ text: string; href?: string; label?: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, href?: string, label?: string) => {
    setToast({ text, href, label });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ── undo/redo (session) — stacks live in refs so history mutations never
     run side effects inside React state updaters (StrictMode-safe) ────────── */
  const pastRef = useRef<UndoAction[]>([]);
  const futureRef = useRef<UndoAction[]>([]);
  const [histLen, setHistLen] = useState({ p: 0, f: 0 });
  const syncHist = useCallback(() => setHistLen({ p: pastRef.current.length, f: futureRef.current.length }), []);

  /* ── pins ────────────────────────────────────────────────────────────── */
  const [pins, setPins] = useState<DrawingPin[]>([]);
  const [pendingPin, setPendingPin] = useState<Pt | null>(null); // image px
  const [pinTitle, setPinTitle] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [pinCategory, setPinCategory] = useState('Other');
  const [savingPin, setSavingPin] = useState(false);
  const [selectedPin, setSelectedPin] = useState<DrawingPin | null>(null);

  /* ── per-sheet measure calibration (lives in measure markup row data) ── */
  const [ppfBySheet, setPpfBySheet] = useState<Record<string, number>>({});
  const sheetKey = `${drawing.id}:${page}`;
  const ppf = ppfBySheet[sheetKey] || 0;

  /* ── comments ────────────────────────────────────────────────────────── */
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  /* transient key state */
  const spaceRef = useRef(false);
  const dragRef = useRef<{ mode: 'none' | 'pan' | 'draw'; sx: number; sy: number; tx: number; ty: number }>({ mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ d0: number; scale0: number; cx: number; cy: number; ix: number; iy: number } | null>(null);

  const apiBase = `/api/projects/${projectId}/drawings/markups`;
  const isMultiPage = pageCount > 1;
  const currentPageNumber = isMultiPage ? page : null;

  /* ── rAF-coalesced repaint ───────────────────────────────────────────── */
  const drawRef = useRef<() => void>(() => {});
  const rafRef = useRef<number | null>(null);
  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; drawRef.current(); });
  }, []);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  /* ── container size ──────────────────────────────────────────────────── */
  useEffect(() => {
    const box = containerRef.current; if (!box) return;
    const ro = new ResizeObserver(() => setCssSize({ w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box); setCssSize({ w: box.clientWidth, h: box.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ── coordinate transforms ───────────────────────────────────────────── */
  const toImg = useCallback((clientX: number, clientY: number): Pt => {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); const { scale, tx, ty } = viewRef.current;
    return { x: (clientX - r.left - tx) / scale, y: (clientY - r.top - ty) / scale };
  }, []);
  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const cv = canvasRef.current; if (!cv) return; const r = cv.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top; const { scale, tx, ty } = viewRef.current;
    const ns = clamp(scale * factor, 0.02, 40); const ix = (sx - tx) / scale, iy = (sy - ty) / scale;
    applyView({ scale: ns, tx: sx - ix * ns, ty: sy - iy * ns });
  }, [applyView]);
  const fit = useCallback(() => {
    const box = containerRef.current; if (!box || !dims.w) return;
    const w = box.clientWidth, h = box.clientHeight;
    const s = Math.min(w / dims.w, h / dims.h) * 0.96;
    applyView({ scale: s, tx: (w - dims.w * s) / 2, ty: (h - dims.h * s) / 2 });
  }, [dims, applyView]);
  useEffect(() => { if (imgReady && cssSize.w) fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [imgReady, cssSize.w > 0, dims.w, page]);

  /* ── sheet loading: pdf.js for PDFs, <img> raster for images ─────────── */
  const renderPdfPage = useCallback(async (n: number): Promise<{ src: HTMLCanvasElement; w: number; h: number } | null> => {
    const cached = pageCacheRef.current.get(n);
    if (cached) return cached;
    const pdf = pdfDocRef.current as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!pdf) return null;
    const pg = await pdf.getPage(n);
    const base = pg.getViewport({ scale: 1 });
    const s = Math.min(4, Math.max(1, PDF_LONG_EDGE / Math.max(base.width, base.height)));
    const vp = pg.getViewport({ scale: s });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await pg.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
    const out = { src: cv, w: cv.width, h: cv.height };
    pageCacheRef.current.set(n, out);
    return out;
  }, []);

  const goPage = useCallback(async (n: number) => {
    if (n < 1 || n > pageCount) return;
    setSelId(null); setHover(null); setMeasurePts([]); setCalibPts([]); setPendingPin(null); setSelectedPin(null); setPromoteModal(null);
    penRef.current = []; dragShapeRef.current = null; setDragShape(null);
    setImgReady(false); setBusy('Rendering page…');
    try {
      const r = await renderPdfPage(n);
      if (!r) { setBusy(''); return; }
      sourceRef.current = r.src; setDims({ w: r.w, h: r.h });
      setPage(n); setImgReady(true);
    } catch (e) {
      console.error(e);
      setMsg("Couldn't render that page. Re-export a flattened PDF and re-upload.");
    }
    setBusy('');
  }, [pageCount, renderPdfPage]);

  const openPdf = useCallback(async (url: string): Promise<boolean> => {
    try {
      const pdfjs = await import('pdfjs-dist');
      // static worker path — house pattern; do NOT use new URL(...,import.meta.url) (breaks next build)
      (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; // eslint-disable-line @typescript-eslint/no-explicit-any
      const doc = await (pdfjs as any).getDocument({ url }).promise; // eslint-disable-line @typescript-eslint/no-explicit-any
      pdfDocRef.current = doc;
      setPageCount(doc.numPages);
      const r = await (async () => {
        const pg = await doc.getPage(1);
        const base = pg.getViewport({ scale: 1 });
        const s = Math.min(4, Math.max(1, PDF_LONG_EDGE / Math.max(base.width, base.height)));
        const vp = pg.getViewport({ scale: s });
        const cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        await pg.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
        return { src: cv, w: cv.width, h: cv.height };
      })();
      pageCacheRef.current.set(1, r);
      sourceRef.current = r.src; setDims({ w: r.w, h: r.h });
      setPage(1); setImgReady(true);
      return true;
    } catch (e) {
      console.error('[DrawingViewer] pdf load failed:', e);
      return false;
    }
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      setImgReady(false); setLoadError(''); setBusy('Loading sheet…');
      pdfDocRef.current = null; pageCacheRef.current.clear(); setPageCount(1); setPage(1);
      const url = drawing.fileUrl;
      if (!url) { setLoadError('This drawing has no file attached.'); setBusy(''); return; }
      let path = url;
      try { path = new URL(url, window.location.origin).pathname; } catch { /* keep raw */ }
      const looksPdf = /\.pdf$/i.test(path);
      if (looksPdf) {
        const ok = await openPdf(url);
        if (dead) return;
        if (!ok) setLoadError("Couldn't open this PDF. Re-export a flattened PDF or upload a PNG.");
        setBusy('');
        return;
      }
      // raster image, with a PDF fallback for extension-less storage URLs
      const im = new Image();
      im.onload = () => {
        if (dead) return;
        sourceRef.current = im; setDims({ w: im.naturalWidth, h: im.naturalHeight });
        setPageCount(1); setPage(1); setImgReady(true); setBusy('');
      };
      im.onerror = async () => {
        if (dead) return;
        const ok = await openPdf(url);
        if (dead) return;
        if (!ok) setLoadError("Couldn't load this drawing file.");
        setBusy('');
      };
      im.src = url;
    })();
    return () => { dead = true; };
  }, [drawing.id, drawing.fileUrl, openPdf]);

  /* ── load markups + pins ─────────────────────────────────────────────── */
  const loadMarkups = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}?drawing_id=${drawing.id}`);
      const d = await r.json().catch(() => ({}));
      const rows: MarkupRow[] = Array.isArray(d.markups) ? d.markups : [];
      setMarkups(rows.map((m) => ({ ...m, comments: Array.isArray(m.comments) ? m.comments : [] })));
      // seed per-sheet measure calibration from the latest measure row that carries one
      const seed: Record<string, number> = {};
      for (const m of rows) {
        if (m.markup_type !== 'measure') continue;
        const p = parseMarkup(m);
        if (p.mode === 'canonical' && p.data.ppf && p.data.ppf > 0) {
          seed[`${drawing.id}:${m.page_number || 1}`] = p.data.ppf;
        }
      }
      if (Object.keys(seed).length) setPpfBySheet((prev) => ({ ...seed, ...prev }));
    } catch { /* offline — markups stay as-is */ }
  }, [apiBase, drawing.id]);

  const loadPins = useCallback(async () => {
    try {
      const r = await fetch(`/api/drawings/pins?drawingId=${drawing.id}`);
      const d = await r.json().catch(() => ({}));
      setPins(Array.isArray(d.pins) ? d.pins : []);
    } catch { /* offline */ }
  }, [drawing.id]);

  useEffect(() => { loadMarkups(); loadPins(); }, [loadMarkups, loadPins]);

  /* ── deep link: ?pin=<id> → right page, zoomed so the pin area ≈ 1/3 viewport ── */
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (!initialPin || deepLinkDoneRef.current || !imgReady || !cssSize.w) return;
    const wantPage = initialPin.page_number && isMultiPage ? initialPin.page_number : 1;
    if (isMultiPage && page !== wantPage) { goPage(wantPage); return; }
    deepLinkDoneRef.current = true;
    const fitScale = Math.min(cssSize.w / dims.w, cssSize.h / dims.h) * 0.96;
    const s = clamp(fitScale * 3, fitScale, 12);
    const px = initialPin.x_pct * dims.w, py = initialPin.y_pct * dims.h;
    applyView({ scale: s, tx: cssSize.w / 2 - px * s, ty: cssSize.h / 2 - py * s });
    setSelectedPin(initialPin);
  }, [initialPin, imgReady, cssSize, dims, page, isMultiPage, goPage, applyView]);

  /* ── B4 LIVE: realtime markup sync (radio pattern — LED, no toasts) ──── */
  /* drawing_markups is in the supabase_realtime publication; the browser anon
   * client is hydrated from the server's httpOnly cookies so RLS sees the
   * caller. While the socket reports SUBSCRIBED, remote inserts/deletes land
   * instantly; any other state falls back to a quiet 15s re-fetch. */
  const [rtLive, setRtLive] = useState(false);
  const loadMarkupsRef = useRef(loadMarkups);
  useEffect(() => { loadMarkupsRef.current = loadMarkups; }, [loadMarkups]);

  /** Merge one remote INSERT row: tolerant parse, dedupe by server id, never crash. */
  const mergeRemoteInsert = useCallback((raw: unknown) => {
    try {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Record<string, unknown>;
      if (typeof row.id !== 'string' || row.drawing_id !== drawing.id) return;
      const m: MarkupRow = { ...(row as unknown as MarkupRow), comments: [] };
      parseMarkup(m); // foreign shapes go through the tolerant parser — throw = drop, never crash
      setMarkups((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
      // a teammate's fresh calibration takes effect live on this sheet
      if (m.markup_type === 'measure') {
        const p = parseMarkup(m);
        if (p.mode === 'canonical' && p.data.ppf && p.data.ppf > 0) {
          const v = p.data.ppf;
          setPpfBySheet((prev) => ({ ...prev, [`${drawing.id}:${m.page_number || 1}`]: v }));
        }
      }
    } catch { /* foreign shape — ignore */ }
  }, [drawing.id]);

  /** Remove one remote DELETE row by id (removing an unknown id is a no-op). */
  const removeRemote = useCallback((id: unknown) => {
    if (typeof id !== 'string' || !id) return;
    setMarkups((ms) => (ms.some((m) => m.id === id) ? ms.filter((m) => m.id !== id) : ms));
    setSelId((s) => (s === id ? null : s));
  }, []);

  useEffect(() => {
    if (!HAS_SUPABASE) { setRtLive(false); return; }
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    (async () => {
      await ensureBrowserSession(); // best-effort auth so RLS lets rows through
      if (cancelled) return;
      const sb = getSupabaseBrowser();
      channel = sb
        .channel(`drawings:markups:${drawing.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'drawing_markups', filter: `drawing_id=eq.${drawing.id}` },
          (payload: { new?: unknown }) => { mergeRemoteInsert(payload.new); },
        )
        .on(
          // DELETE payloads only carry the old PK (default replica identity), so a
          // drawing_id filter would silently drop every event — filter client-side by id.
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'drawing_markups' },
          (payload: { old?: { id?: unknown } }) => { removeRemote(payload.old?.id); },
        )
        .subscribe((status) => { if (!cancelled) setRtLive(status === 'SUBSCRIBED'); });
    })();
    return () => {
      cancelled = true;
      setRtLive(false);
      if (channel) { try { getSupabaseBrowser().removeChannel(channel); } catch { /* socket already gone */ } }
    };
  }, [drawing.id, mergeRemoteInsert, removeRemote]);

  /* dropped socket → quiet 15s re-fetch until resubscribed */
  useEffect(() => {
    if (rtLive) return;
    const t = setInterval(() => { loadMarkupsRef.current(); }, 15_000);
    return () => clearInterval(t);
  }, [rtLive]);

  /* ── B4 PRESENCE: who's on this sheet (channel presence — no tables) ─── */
  const [viewers, setViewers] = useState<string[]>([]);
  useEffect(() => {
    if (!HAS_SUPABASE) { setViewers([]); return; }
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    (async () => {
      await ensureBrowserSession();
      if (cancelled) return;
      const sb = getSupabaseBrowser();
      channel = sb.channel(`sheet:${drawing.id}:${page}`, { config: { presence: { key: me.id } } });
      channel
        .on('presence', { event: 'sync' }, () => {
          if (cancelled || !channel) return;
          const state = channel.presenceState<{ name?: string }>();
          const names: string[] = [];
          for (const key of Object.keys(state)) {
            if (key === me.id) continue; // own chip excluded
            const meta = state[key]?.[0];
            const nm = typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : 'Someone';
            names.push(nm);
          }
          setViewers(names);
        })
        .subscribe((status) => {
          if (cancelled || !channel) return;
          if (status === 'SUBSCRIBED') { void channel.track({ name: me.name }).catch(() => { /* presence is best-effort */ }); }
        });
    })();
    return () => {
      cancelled = true;
      setViewers([]);
      if (channel) { try { getSupabaseBrowser().removeChannel(channel); } catch { /* socket already gone */ } }
    };
  }, [drawing.id, page, me.id, me.name]);

  const initialsOf = (n: string) =>
    n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

  /* ── B4 SHARE FOR REVIEW: tenant-scoped read-only guest links ────────── */
  interface ReviewLink {
    id: string;
    label?: string | null;
    token?: string;
    url?: string;
    created_at?: string;
    expires_at?: string | null;
  }
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<ReviewLink[]>([]);
  const [shareCreated, setShareCreated] = useState<{ url: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /** Public URL for a listed link row (POST returns url; list rows may carry token only). */
  const reviewUrl = (l: ReviewLink) =>
    l.url || (l.token ? `${window.location.origin}/api/portal/drawing-review?token=${l.token}` : '');

  const loadShareLinks = useCallback(async () => {
    try {
      const r = await fetch(`/api/drawings/review-link?drawingId=${encodeURIComponent(drawing.id)}`);
      const d = await r.json().catch(() => ({}));
      const rows: unknown[] = Array.isArray(d?.links) ? d.links : [];
      setShareLinks(rows.filter((l): l is ReviewLink => !!l && typeof l === 'object' && typeof (l as ReviewLink).id === 'string'));
    } catch { /* offline — list stays as-is */ }
  }, [drawing.id]);

  const openShare = useCallback(() => {
    if (!online) return; // honest offline disable — the button is already disabled
    setShareOpen(true); setShareCreated(null); setShareLabel(''); setCopiedKey(null);
    loadShareLinks();
  }, [online, loadShareLinks]);

  const createShareLink = useCallback(async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const r = await fetch('/api/drawings/review-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawingId: drawing.id, ...(shareLabel.trim() ? { label: shareLabel.trim() } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok || typeof d?.url !== 'string') throw new Error(d?.error || 'link failed');
      setShareCreated({ url: d.url });
      setShareLabel('');
      await loadShareLinks();
    } catch {
      showToast('Could not create the review link — check your connection and try again.');
    }
    setShareBusy(false);
  }, [shareBusy, drawing.id, shareLabel, loadShareLinks, showToast]);

  const revokeShareLink = useCallback(async (id: string) => {
    if (revokingId) return;
    setRevokingId(id);
    try {
      const r = await fetch(`/api/drawings/review-link?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('revoke failed');
      setShareLinks((ls) => ls.filter((l) => l.id !== id));
    } catch {
      showToast('Could not revoke that link — check your connection and try again.');
    }
    setRevokingId(null);
  }, [revokingId, showToast]);

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 2000);
    } catch {
      showToast('Copy failed — select the URL and copy it manually.');
    }
  }, [showToast]);

  /* ── markup helpers ──────────────────────────────────────────────────── */
  const parsed = useCallback((m: MarkupRow): ParsedMarkup => {
    const key = `${m.id}:${m.updated_at || ''}`;
    const hit = parsedCacheRef.current.get(key);
    if (hit) return hit;
    const p = parseMarkup(m);
    parsedCacheRef.current.set(key, p);
    return p;
  }, []);

  const authorOf = (m: MarkupRow) => m.created_by_name || 'Unknown';

  const pageMarkups = useMemo(
    () => markups.filter((m) => {
      if (m.markup_type === 'link') return false;
      if (hiddenAuthors.has(authorOf(m))) return false;
      if (!isMultiPage) return true;
      const p = m.page_number || 1;
      return p === page;
    }),
    [markups, hiddenAuthors, isMultiPage, page],
  );

  const authors = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of markups) { if (m.markup_type === 'link') continue; const a = authorOf(m); map.set(a, (map.get(a) || 0) + 1); }
    return Array.from(map.entries());
  }, [markups]);

  /* ── persistence (optimistic + offline enqueue) ──────────────────────── */
  const resolveId = useCallback((localId: string) => idMapRef.current.get(localId) || localId, []);

  const persistCreate = useCallback(async (localId: string, payload: Record<string, unknown>) => {
    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch(apiBase, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      const d = await res.json();
      const saved: MarkupRow = { ...d.markup, comments: [] };
      idMapRef.current.set(localId, saved.id);
      if (cancelledRef.current.has(localId)) {
        // undone before the POST resolved — delete the row the server just made
        cancelledRef.current.delete(localId);
        fetch(`${apiBase}/${saved.id}`, { method: 'DELETE' }).catch(() => {});
        return;
      }
      setMarkups((ms) => {
        // the realtime INSERT may have merged the server row already — never leave two copies
        if (ms.some((m) => m.id === saved.id)) return ms.filter((m) => m.id !== localId);
        return ms.map((m) => (m.id === localId ? { ...saved } : m));
      });
      setSelId((s) => (s === localId ? saved.id : s));
    } catch {
      // offline (or the server rejected) → queue for replay; row stays optimistic
      await enqueue({ url: apiBase, method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setMarkups((ms) => ms.map((m) => (m.id === localId ? { ...m, _queued: true } : m)));
    }
  }, [apiBase]);

  /** Create a markup row (optimistic render, save on completion, undo-able). */
  const createMarkup = useCallback((markupType: string, data: Record<string, unknown>, color: string) => {
    const localId = uid();
    const payload = {
      drawing_id: drawing.id,
      markup_type: markupType,
      data,
      color,
      page_number: currentPageNumber,
      created_by_name: me.name,
    };
    const row: MarkupRow = {
      id: localId, project_id: projectId, drawing_id: drawing.id, drawing_sheet_id: null,
      markup_type: markupType, data, page_number: currentPageNumber, color,
      created_by: me.id, created_by_name: me.name,
      created_at: new Date().toISOString(), updated_at: null,
      entity_type: null, entity_id: null, comments: [], _local: true,
    };
    setMarkups((ms) => [...ms, row]);
    pastRef.current = [...pastRef.current.slice(-49), { t: 'add', localId, payload: { markup_type: markupType, data, color, page_number: currentPageNumber } }];
    futureRef.current = [];
    syncHist();
    persistCreate(localId, payload);
    return localId;
  }, [drawing.id, projectId, me.id, me.name, currentPageNumber, persistCreate, syncHist]);

  const persistDelete = useCallback(async (id: string) => {
    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error('delete failed');
    } catch {
      await enqueue({ url: `${apiBase}/${id}`, method: 'DELETE', body: null, contentType: 'application/json', isFormData: false });
    }
  }, [apiBase]);

  /** Optimistically remove a row and reconcile with the server (delete or cancel the in-flight POST). */
  const removeRow = useCallback((localId: string) => {
    const currentId = resolveId(localId);
    const row = markupsRef.current.find((m) => m.id === localId || m.id === currentId);
    setMarkups((ms) => ms.filter((m) => m.id !== localId && m.id !== currentId));
    setSelId((s) => (s === localId || s === currentId ? null : s));
    if (row) {
      if (row._local && !idMapRef.current.get(localId)) {
        cancelledRef.current.add(localId); // POST still in flight — kill it on resolution
      } else {
        persistDelete(currentId);
      }
    }
  }, [resolveId, persistDelete]);

  /** Delete a markup row (optimistic, offline-queued, undo-able when recordUndo). */
  const deleteMarkup = useCallback((row: MarkupRow, recordUndo: boolean) => {
    removeRow(row.id);
    if (recordUndo) {
      const p = parseMarkup(row);
      const data = (row.data && typeof row.data === 'object') ? (row.data as Record<string, unknown>) : {};
      pastRef.current = [...pastRef.current.slice(-49), {
        t: 'del', localId: row.id,
        payload: { markup_type: row.markup_type, data, color: row.color || (p.mode === 'canonical' ? p.data.style.color : '#FF3B30'), page_number: row.page_number },
        row,
      }];
      futureRef.current = [];
      syncHist();
    }
  }, [removeRow, syncHist]);

  /* recreate from an undo-action payload (used by undo-of-delete and redo-of-add) */
  const recreateFromPayload = useCallback((a: UndoAction): string => {
    const localId = uid();
    const payload = {
      drawing_id: drawing.id, markup_type: a.payload.markup_type, data: a.payload.data,
      color: a.payload.color, page_number: a.payload.page_number, created_by_name: me.name,
    };
    const row: MarkupRow = {
      id: localId, project_id: projectId, drawing_id: drawing.id, drawing_sheet_id: null,
      markup_type: a.payload.markup_type, data: a.payload.data, page_number: a.payload.page_number,
      color: a.payload.color, created_by: me.id, created_by_name: me.name,
      created_at: new Date().toISOString(), updated_at: null, entity_type: null, entity_id: null,
      comments: [], _local: true,
    };
    setMarkups((ms) => [...ms, row]);
    persistCreate(localId, payload);
    return localId;
  }, [drawing.id, projectId, me.id, me.name, persistCreate]);

  const undo = useCallback(() => {
    const a = pastRef.current[pastRef.current.length - 1];
    if (!a) return;
    pastRef.current = pastRef.current.slice(0, -1);
    if (a.t === 'add') {
      removeRow(a.localId);
      futureRef.current = [a, ...futureRef.current].slice(0, 50);
    } else {
      const newId = recreateFromPayload(a);
      futureRef.current = [{ ...a, localId: newId }, ...futureRef.current].slice(0, 50);
    }
    syncHist();
  }, [removeRow, recreateFromPayload, syncHist]);

  const redo = useCallback(() => {
    const a = futureRef.current[0];
    if (!a) return;
    futureRef.current = futureRef.current.slice(1);
    if (a.t === 'add') {
      const newId = recreateFromPayload(a);
      pastRef.current = [...pastRef.current, { ...a, localId: newId }].slice(-50);
    } else {
      removeRow(a.localId);
      pastRef.current = [...pastRef.current, a].slice(-50);
    }
    syncHist();
  }, [removeRow, recreateFromPayload, syncHist]);

  /* ── canonical data builder ──────────────────────────────────────────── */
  const buildData = useCallback((geometry: Record<string, unknown>, extras?: Record<string, unknown>): Record<string, unknown> => ({
    space: 'image', w: dims.w, h: dims.h,
    geometry,
    style: { color: ink, width: Math.max(0.75, (inkWidth * dims.w) / 1200) },
    ...(extras || {}),
  }), [dims, ink, inkWidth]);

  /* ── tool completion handlers ────────────────────────────────────────── */
  const finishPen = useCallback(() => {
    const pts = penRef.current;
    penRef.current = [];
    setPenTick((t) => t + 1);
    if (pts.length < 2) return;
    // thin dense strokes: keep every point (image-px fidelity), cap pathological sizes
    const trimmed = pts.length > 2000 ? pts.filter((_, i) => i % 2 === 0) : pts;
    createMarkup('freehand', buildData({ points: trimmed.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })) }), ink);
  }, [createMarkup, buildData, ink]);

  const finishShape = useCallback((a: Pt, b: Pt) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) * viewRef.current.scale < 6) return; // too small to mean anything
    if (tool === 'rect' || tool === 'cloud') {
      createMarkup(tool, buildData({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }), ink);
    } else if (tool === 'circle') {
      createMarkup('circle', buildData({ cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 }), ink);
    } else if (tool === 'arrow') {
      createMarkup('arrow', buildData({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }), ink);
    } else if (tool === 'measure') {
      createMarkup('measure', buildData({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, { ppf: ppf > 0 ? ppf : null, mkind: 'linear' }), ink);
    } else if (tool === 'callout') {
      setTextModal({ at: b, from: a, value: '' });
    }
  }, [tool, createMarkup, buildData, ink, ppf]);

  /* ── multi-point measure commits (B2: polyline / area / count) ───────── */
  const rp = (p: Pt) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });

  /** Commit the in-progress vertex cluster as ONE measure markup per the contract geometry. */
  const commitMeasurePts = useCallback(() => {
    const pts = measurePtsRef.current;
    if (!pts.length) return;
    measureCommitAtRef.current = Date.now();
    const extras = { ppf: ppf > 0 ? ppf : null, mkind: measureMode };
    if (measureMode === 'linear') {
      // drop double-click duplicate vertices
      const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1);
      if (clean.length < 2) { setMeasurePts([]); setMsg('A linear measure needs at least two points.'); return; }
      setMeasurePts([]);
      if (clean.length === 2) {
        createMarkup('measure', buildData({ x1: clean[0].x, y1: clean[0].y, x2: clean[1].x, y2: clean[1].y }, extras), ink);
      } else {
        createMarkup('measure', buildData({ points: clean.map(rp) }, extras), ink);
      }
    } else if (measureMode === 'area') {
      if (pts.length < 3) { setMsg('An area needs at least three corners.'); return; }
      setMeasurePts([]);
      createMarkup('measure', buildData({ points: pts.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]), closed: true }, extras), ink);
    } else {
      setMeasurePts([]);
      createMarkup('measure', buildData({ points: pts.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]) }, extras), ink);
    }
  }, [measureMode, ppf, createMarkup, buildData, ink]);

  const confirmText = useCallback(() => {
    if (!textModal) return;
    const text = textModal.value.trim();
    if (!text) { setTextModal(null); return; }
    const fontSize = clamp(Math.round(dims.w / 55), 14, 64);
    if (textModal.from) {
      createMarkup('callout', buildData(
        { x1: textModal.from.x, y1: textModal.from.y, x2: textModal.at.x, y2: textModal.at.y },
        { text, fontSize },
      ), ink);
    } else {
      createMarkup('text', buildData({ x: textModal.at.x, y: textModal.at.y }, { text, fontSize }), ink);
    }
    setTextModal(null);
  }, [textModal, dims.w, createMarkup, buildData, ink]);

  const placeStamp = useCallback((at: Pt, stamp: StampName) => {
    const def = STAMPS.find((s) => s.name === stamp)!;
    // stamps ink in their own semantic color, not the pen color
    createMarkup('stamp', buildData({ x: at.x, y: at.y }, { stamp, style: { color: def.color, width: 2 } }), def.color);
  }, [createMarkup, buildData]);

  /* ── PUNCH-FROM-DRAWING: the contract trio (punch item → pin → markup) ── */
  const confirmPunch = useCallback(async () => {
    if (!punchModal || punchModal.saving) return;
    const title = punchModal.title.trim();
    if (!title) return;
    if (!navigator.onLine) {
      showToast('Creating a punch from the drawing needs a connection — reconnect and try again.');
      return;
    }
    setPunchModal((m) => (m ? { ...m, saving: true } : m));
    const at = punchModal.at;
    try {
      // (a) punch item — title NOT NULL, lowercase priority, status open, location from sheet
      const pr = await fetch('/api/punch-list/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, title, priority: 'medium', status: 'open',
          location: [drawing.sheet, drawing.name].filter(Boolean).join(' — '),
        }),
      });
      const pd = await pr.json().catch(() => ({}));
      const punchId: string | undefined = pd?.item?.id;
      if (!pr.ok || !punchId) throw new Error(pd?.error || 'punch create failed');

      // (b) drawing pin — entity_type 'punch_item' (canonical vocabulary), pin_type 'punch'
      const pinRes = await fetch('/api/drawings/pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, drawing_id: drawing.id,
          x_pct: at.x / dims.w, y_pct: at.y / dims.h,
          page_number: currentPageNumber,
          title, note: '', category: 'punch',
          entity_type: 'punch_item', entity_id: punchId,
        }),
      });
      const pind = await pinRes.json().catch(() => ({}));
      const pin: DrawingPin | undefined = pind?.pin;
      if (pin) setPins((prev) => [...prev, pin]);

      // (c) the stamp markup row, carrying the link for tooltips
      const punchColor = STAMPS.find((s) => s.name === 'PUNCH')!.color;
      createMarkup('stamp', buildData({ x: at.x, y: at.y }, {
        stamp: 'PUNCH', punch_item_id: punchId, ...(pin ? { pin_id: pin.id } : {}),
        style: { color: punchColor, width: 2 },
      }), punchColor);

      setPunchModal(null);
      showToast(`Punch created — "${title}"`, `/app/projects/${projectId}/punch-list`, 'Open Punch List');
    } catch (e) {
      console.error('[DrawingViewer] punch trio failed:', e);
      setPunchModal((m) => (m ? { ...m, saving: false } : m));
      showToast('Could not create the punch item — check your connection and try again.');
    }
  }, [punchModal, projectId, drawing.sheet, drawing.name, drawing.id, dims, currentPageNumber, createMarkup, buildData, showToast]);

  /* ── measure calibration (two taps + known distance) ─────────────────── */
  const confirmCalibration = useCallback(() => {
    if (!calibModal) return;
    const ft = parseFloat(calibModal.ft);
    if (!(ft > 0)) return;
    const px = Math.hypot(calibModal.b.x - calibModal.a.x, calibModal.b.y - calibModal.a.y);
    const newPpf = px / ft;
    setPpfBySheet((prev) => ({ ...prev, [sheetKey]: newPpf }));
    // the calibration is STORED per sheet in a measure markup row's data (B1 contract)
    createMarkup('measure', buildData(
      { x1: calibModal.a.x, y1: calibModal.a.y, x2: calibModal.b.x, y2: calibModal.b.y },
      { ppf: newPpf, calibration: true },
    ), ink);
    setCalibModal(null); setCalibPts([]); setTool('measure');
    setMsg(`Scale set — ${newPpf.toFixed(2)} px/ft on this sheet. Measurements now read in feet.`);
  }, [calibModal, sheetKey, createMarkup, buildData, ink]);

  /* ── SEND TO TAKEOFF (B2): promote measure markups → measured takeoff ── */
  const sheetLabel = useMemo(() => {
    const base = drawing.sheet || drawing.name || 'Sheet';
    return isMultiPage ? `${base} p${page}` : base;
  }, [drawing.sheet, drawing.name, isMultiPage, page]);

  /** Every non-calibration measure markup on the current sheet, valued by the canonical engine. */
  const promotables = useMemo<PromotableMeasure[]>(() => {
    const out: PromotableMeasure[] = [];
    for (const m of pageMarkups) {
      if (m.markup_type !== 'measure') continue;
      const p = parsed(m);
      if (p.mode !== 'canonical' || p.data.calibration) continue;
      const kind = measureKindOf(p.data);
      const points = measureGeomPoints(p.data.geometry);
      if (!points.length) continue;
      if (kind === 'linear' && points.length < 2) continue;
      if (kind === 'area' && points.length < 3) continue;
      // effective per-sheet calibration: the row's own ppf, else the sheet's current one
      const effPpf = p.data.ppf && p.data.ppf > 0 ? p.data.ppf : (ppf > 0 ? ppf : null);
      const mc = measureCondition(kind, { points, ppf: effPpf || 0, count: points.length });
      const label = effPpf
        ? `${mc.value.toLocaleString('en-US')} ${mc.unit}`
        : kind === 'area' ? areaMeasureLabel(points, null)
        : kind === 'count' ? countMeasureLabel(points.length)
        : polylineMeasureLabel(points, null);
      out.push({ markupId: m.id, kind, points, ppf: effPpf, value: mc.value, unit: mc.unit, label });
    }
    return out;
  }, [pageMarkups, parsed, ppf]);

  const promotableReady = promotables.some((r) => r.ppf !== null);

  const openPromote = useCallback(() => {
    if (!online) { showToast('Offline — sending to takeoff needs the takeoff page. Reconnect first.'); return; }
    if (!promotableReady) return;
    const counters: Record<MeasureMarkupKind, number> = { linear: 0, area: 0, count: 0 };
    const nameFor = (k: MeasureMarkupKind) => {
      counters[k] += 1;
      return `${k === 'linear' ? 'Linear' : k === 'area' ? 'Area' : 'Count'} ${counters[k]}`;
    };
    setPromoteModal(promotables.map((r) => ({
      ...r,
      include: r.ppf !== null,
      name: nameFor(r.kind),
      assemblyId: '',       // 'Unassigned' — lands priceable; the takeoff page shows its per-row picker
    })));
  }, [online, promotableReady, promotables, showToast]);

  const confirmPromote = useCallback(() => {
    if (!promoteModal) return;
    const picked = promoteModal.filter((r) => r.include && r.ppf !== null);
    if (!picked.length) return;
    const conditions: PromotedCondition[] = picked.map((r) => ({
      id: uid(),
      name: `${sheetLabel} · ${r.name.trim() || r.kind}`,
      kind: r.kind,
      value: r.value,
      assemblyId: r.assemblyId,
      measured: 'traced',
      points: r.points.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
      ppf: r.ppf as number,
      sheetId: `${drawing.id}:${page || 1}`,
      sheet: sheetLabel,
      note: `Promoted from drawings markup ${resolveId(r.markupId)}`,
    }));
    try {
      sessionStorage.setItem(PROMOTE_KEY, JSON.stringify({ projectId, source: 'drawings', conditions }));
    } catch {
      showToast('Could not stage the takeoff handoff (storage unavailable).');
      return;
    }
    setPromoteModal(null);
    router.push(`/app/takeoff/measured?projectId=${projectId}&from=drawings`);
  }, [promoteModal, sheetLabel, drawing.id, page, resolveId, projectId, router, showToast]);

  /* ── hit testing over rendered markups (topmost = latest) ────────────── */
  const hitMarkupAt = useCallback((img: Pt): MarkupRow | null => {
    const tolScreen = 8;
    for (let i = pageMarkups.length - 1; i >= 0; i--) {
      const m = pageMarkups[i];
      const p = parsed(m);
      if (p.mode === 'invisible') continue;
      // convert the image-space point into the markup's OWN reference space
      let k = 1;
      if (p.mode === 'canonical' && p.data.w > 0 && dims.w > 0) k = p.data.w / dims.w;
      else if (p.mode === 'legacy' && p.refW > 0 && dims.w > 0) k = p.refW / dims.w;
      const local = { x: img.x * k, y: img.y * k };
      const tol = (tolScreen / viewRef.current.scale) * k;
      if (hitTestMarkup(p, local, tol)) return m;
    }
    return null;
  }, [pageMarkups, parsed, dims.w]);

  /* ── pointer handlers ────────────────────────────────────────────────── */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;

    // second finger → pinch (cancels any in-progress draw)
    if (pointersRef.current.size === 2) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      const cx = (p1.x + p2.x) / 2 - r.left, cy = (p1.y + p2.y) / 2 - r.top;
      const { scale, tx, ty } = viewRef.current;
      pinchRef.current = { d0: Math.hypot(p2.x - p1.x, p2.y - p1.y), scale0: scale, cx, cy, ix: (cx - tx) / scale, iy: (cy - ty) / scale };
      penRef.current = []; dragShapeRef.current = null; setDragShape(null); setPenTick((t) => t + 1);
      // the first pinch finger just dropped a measure vertex — take it back
      if (tool === 'measure' && measurePtsRef.current.length && Date.now() - lastMeasureTapRef.current < 600) {
        setMeasurePts((pts) => pts.slice(0, -1));
      }
      dragRef.current = { mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 };
      return;
    }

    const panning = spaceRef.current || e.button === 1;
    if (panning) { dragRef.current = { mode: 'pan', sx, sy, tx: viewRef.current.tx, ty: viewRef.current.ty }; return; }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!imgReady) return;
    const img = toImg(e.clientX, e.clientY);

    switch (tool) {
      case 'select': {
        const hit = hitMarkupAt(img);
        if (hit) { setSelId(hit.id); return; }
        setSelId(null);
        dragRef.current = { mode: 'pan', sx, sy, tx: viewRef.current.tx, ty: viewRef.current.ty };
        return;
      }
      case 'pen': {
        penRef.current = [img];
        dragRef.current = { mode: 'draw', sx, sy, tx: 0, ty: 0 };
        return;
      }
      case 'cloud': case 'rect': case 'circle': case 'arrow': case 'callout': {
        dragShapeRef.current = { a: img, b: img };
        setDragShape({ a: img, b: img });
        dragRef.current = { mode: 'draw', sx, sy, tx: 0, ty: 0 };
        return;
      }
      case 'measure': {
        if (Date.now() - measureCommitAtRef.current < 350) return; // trailing dbl-click press after a commit
        if (measureMode === 'count') {
          lastMeasureTapRef.current = Date.now();
          setMeasurePts((pts) => [...pts, img]);
          setCursor(img);
          return;
        }
        if (measureMode === 'area') {
          const pts = measurePtsRef.current;
          // auto-close on first-vertex click
          if (pts.length >= 3 && Math.hypot(img.x - pts[0].x, img.y - pts[0].y) * viewRef.current.scale <= 12) {
            commitMeasurePts();
            return;
          }
          lastMeasureTapRef.current = Date.now();
          setMeasurePts((prev) => [...prev, img]);
          setCursor(img);
          return;
        }
        // linear: polyline once started; first press may still be a quick two-point drag
        if (measurePtsRef.current.length > 0) {
          lastMeasureTapRef.current = Date.now();
          setMeasurePts((pts) => [...pts, img]);
          setCursor(img);
          return;
        }
        dragShapeRef.current = { a: img, b: img };
        setDragShape({ a: img, b: img });
        dragRef.current = { mode: 'draw', sx, sy, tx: 0, ty: 0 };
        return;
      }
      case 'calibrate': {
        const next = [...calibPts, img].slice(-2);
        setCalibPts(next);
        if (next.length === 2) setCalibModal({ a: next[0], b: next[1], ft: '' });
        else setMsg('Click the second end of a known dimension.');
        return;
      }
      case 'text': { setTextModal({ at: img, value: '' }); return; }
      case 'stamp': {
        if (stampChoice === 'PUNCH') setPunchModal({ at: img, title: '', saving: false });
        else placeStamp(img, stampChoice);
        return;
      }
      case 'pin': {
        setPendingPin(img); setPinTitle(''); setPinNote(''); setPinCategory('Other'); setSelectedPin(null);
        return;
      }
      case 'eraser': {
        const hit = hitMarkupAt(img);
        if (!hit) return;
        const p = parsed(hit);
        if (p.mode === 'legacy') { showToast('Legacy markups are read-only here — they were drawn by the old editor.'); return; }
        if (hit.created_by && hit.created_by !== me.id) { showToast(`That markup belongs to ${authorOf(hit)} — you can only erase your own.`); return; }
        deleteMarkup(hit, true);
        return;
      }
    }
  }, [imgReady, tool, toImg, hitMarkupAt, measureMode, commitMeasurePts, calibPts, stampChoice, placeStamp, me.id, parsed, deleteMarkup, showToast]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;

    // pinch zoom
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const pz = pinchRef.current;
      const ns = clamp(pz.scale0 * (d / Math.max(1, pz.d0)), 0.02, 40);
      const cx = (p1.x + p2.x) / 2 - r.left, cy = (p1.y + p2.y) / 2 - r.top;
      applyView({ scale: ns, tx: cx - pz.ix * ns, ty: cy - pz.iy * ns });
      return;
    }

    const d = dragRef.current;
    if (d.mode === 'pan') { applyView((v) => ({ ...v, tx: d.tx + (sx - d.sx), ty: d.ty + (sy - d.sy) })); return; }

    const img = toImg(e.clientX, e.clientY);
    if (d.mode === 'draw') {
      if (tool === 'pen') { penRef.current.push(img); scheduleDraw(); return; }
      if (dragShapeRef.current) { dragShapeRef.current = { a: dragShapeRef.current.a, b: img }; setDragShape(dragShapeRef.current); return; }
      return;
    }

    // hover: measure rubber-band (live cursor readout), author chip
    if (tool === 'measure' && measurePts.length) { setCursor(img); return; }
    if (tool === 'calibrate' && calibPts.length === 1) { setCursor(img); return; }
    if (tool === 'select' || tool === 'eraser') {
      const hit = hitMarkupAt(img);
      setHover((prev) => {
        if (!hit) return prev ? null : prev;
        if (prev && prev.id === hit.id && Math.hypot(prev.sx - sx, prev.sy - sy) < 24) return prev;
        return { id: hit.id, sx, sy };
      });
      return;
    }
    setCursor(null);
  }, [applyView, toImg, tool, measurePts.length, calibPts.length, hitMarkupAt, scheduleDraw]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const d = dragRef.current;
    dragRef.current = { mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 };
    if (d.mode !== 'draw') return;
    const img = toImg(e.clientX, e.clientY);

    if (tool === 'pen') { finishPen(); return; }
    const ds = dragShapeRef.current;
    dragShapeRef.current = null; setDragShape(null);
    if (!ds) return;
    const movedPx = Math.hypot(img.x - ds.a.x, img.y - ds.a.y) * viewRef.current.scale;
    if (tool === 'measure') {
      if (movedPx < 6) {
        setMeasurePts([ds.a]);
        setMsg(ppf > 0
          ? 'Click the next point. Double-click or Enter finishes the run.'
          : 'Click the next point. (Uncalibrated — reads in px until you calibrate.)');
      } else { finishShape(ds.a, img); }
      return;
    }
    finishShape(ds.a, img);
  }, [toImg, tool, finishPen, finishShape, ppf]);

  /* double-click closes a linear polyline (the duplicate double-click vertex is deduped on commit) */
  const onDoubleClick = useCallback(() => {
    if (tool === 'measure' && measureMode === 'linear' && measurePtsRef.current.length >= 2) commitMeasurePts();
  }, [tool, measureMode, commitMeasurePts]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = { mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 };
    penRef.current = []; dragShapeRef.current = null; setDragShape(null); setPenTick((t) => t + 1);
  }, []);

  /* ── wheel zoom (non-passive) ────────────────────────────────────────── */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [zoomAt, imgReady]);

  /* ── keyboard: V P C A T R M, Esc, Ctrl+Z/Y, F fit, Space pan ────────── */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = true;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (textModal || punchModal || calibModal || promoteModal || shareOpen) { setTextModal(null); setPunchModal(null); setCalibModal(null); setPromoteModal(null); setShareOpen(false); setCalibPts([]); return; }
        if (pendingPin) { setPendingPin(null); return; }
        // count clusters COMMIT on Esc (contract) — everything else cancels
        if (tool === 'measure' && measureMode === 'count' && measurePtsRef.current.length) { commitMeasurePts(); return; }
        if (measurePtsRef.current.length || calibPts.length || penRef.current.length || dragShapeRef.current) {
          setMeasurePts([]); setCalibPts([]); penRef.current = []; dragShapeRef.current = null; setDragShape(null); setPenTick((t) => t + 1);
          setMsg('Canceled.');
          return;
        }
        setSelId(null); setSelectedPin(null);
        return;
      }
      if (k === 'enter') {
        if (tool === 'measure' && measurePtsRef.current.length) { e.preventDefault(); commitMeasurePts(); }
        return;
      }
      if (k === 'v') setTool('select');
      else if (k === 'p') setTool('pen');
      else if (k === 'c') setTool('cloud');
      else if (k === 'a') setTool('arrow');
      else if (k === 't') setTool('text');
      else if (k === 'r') setTool('rect');
      else if (k === 'm') setTool('measure');
      else if (k === 'f') fit();
      else if (k === '+' || k === '=') { const box = canvasRef.current?.getBoundingClientRect(); if (box) zoomAt(1.25, box.left + box.width / 2, box.top + box.height / 2); }
      else if (k === '-') { const box = canvasRef.current?.getBoundingClientRect(); if (box) zoomAt(1 / 1.25, box.left + box.width / 2, box.top + box.height / 2); }
    };
    const ku = (e: KeyboardEvent) => { if (e.key === ' ') spaceRef.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [undo, redo, fit, zoomAt, textModal, punchModal, calibModal, promoteModal, shareOpen, pendingPin, tool, measureMode, commitMeasurePts, calibPts.length]);

  /* ── canvas paint ────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return; const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(cssSize.w * dpr) || cv.height !== Math.round(cssSize.h * dpr)) {
      cv.width = Math.round(cssSize.w * dpr); cv.height = Math.round(cssSize.h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize.w, cssSize.h);
    ctx.fillStyle = CANVAS_BG; ctx.fillRect(0, 0, cssSize.w, cssSize.h);
    const { scale, tx, ty } = view;
    const src = sourceRef.current;
    if (src && imgReady) {
      ctx.imageSmoothingEnabled = dragRef.current.mode !== 'pan';
      ctx.drawImage(src, tx, ty, dims.w * scale, dims.h * scale);
    }
    const gold = brandHex();
    /** image px (current render space) → screen */
    const sc = (p: Pt) => ({ x: p.x * scale + tx, y: p.y * scale + ty });

    const chip = (label: string, x: number, y: number, color: string, fontPx: number) => {
      ctx.font = `700 ${Math.max(10, fontPx)}px ui-sans-serif, system-ui, sans-serif`;
      const w = ctx.measureText(label).width;
      const padX = fontPx * 0.5, hh = fontPx * 1.5;
      ctx.fillStyle = 'rgba(11,14,19,0.82)';
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      const rx = x - w / 2 - padX, ry = y - hh / 2, rw = w + padX * 2, rh = hh, rr = Math.min(8, hh / 2);
      ctx.moveTo(rx + rr, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr); ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
      ctx.arcTo(rx, ry + rh, rx, ry, rr); ctx.arcTo(rx, ry, rx + rw, ry, rr); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 0.5);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    };

    const drawStampChip = (x: number, y: number, name: string, color: string, refW: number, kk: number, emph: boolean) => {
      const hRef = Math.max(26, (refW || dims.w) / 30);
      const fontPx = hRef * 0.52 * kk * scale;
      ctx.font = `800 ${Math.max(8, fontPx)}px ui-sans-serif, system-ui, sans-serif`;
      const tw = ctx.measureText(name).width;
      const w = tw + fontPx * 1.4, h = hRef * kk * scale;
      const rx = x - w / 2, ry = y - h / 2, rr = Math.min(6, h / 4);
      ctx.save();
      ctx.globalAlpha = emph ? 1 : 0.92;
      ctx.fillStyle = 'rgba(11,14,19,0.78)';
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, h * 0.07);
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry); ctx.arcTo(rx + w, ry, rx + w, ry + h, rr); ctx.arcTo(rx + w, ry + h, rx, ry + h, rr);
      ctx.arcTo(rx, ry + h, rx, ry, rr); ctx.arcTo(rx, ry, rx + w, ry, rr); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // inner machined line
      ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.strokeRect(rx + h * 0.12, ry + h * 0.12, w - h * 0.24, h - h * 0.24);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, x, y + 0.5);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
    };

    /* saved markups */
    for (const m of pageMarkups) {
      const p = parsed(m);
      if (p.mode === 'invisible') continue;
      const isSel = m.id === selId;
      const isHover = hover?.id === m.id;
      ctx.save();
      ctx.globalAlpha = isSel || isHover ? 1 : 0.88;
      try {
        if (p.mode === 'legacy') {
          // LEGACY: best-effort — view-pixel strokes drawn straight into image space
          // (scaled by the recorded reference width when one exists). Read-only.
          const k = p.refW > 0 ? dims.w / p.refW : 1;
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, 2.5 * scale * k);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const s of p.strokes) {
            if (s.length < 2) continue;
            ctx.beginPath();
            const p0 = sc({ x: s[0].x * k, y: s[0].y * k });
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < s.length; i++) { const q = sc({ x: s[i].x * k, y: s[i].y * k }); ctx.lineTo(q.x, q.y); }
            ctx.stroke();
          }
        } else {
          const k = p.data.w > 0 && dims.w > 0 ? dims.w / p.data.w : 1;
          const S = (pt: Pt) => sc({ x: pt.x * k, y: pt.y * k });
          const g = p.data.geometry;
          const col = p.data.style.color;
          const lw = Math.max(1, p.data.style.width * k * scale);
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          switch (p.kind) {
            case 'freehand': {
              const pts = geomPoints(g).map(S);
              if (pts.length >= 2) {
                ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
              }
              break;
            }
            case 'rect': {
              const rct = geomRect(g); const a = S({ x: rct.x, y: rct.y });
              ctx.strokeRect(a.x, a.y, rct.w * k * scale, rct.h * k * scale);
              break;
            }
            case 'cloud': {
              const rct = geomRect(g); const a = S({ x: rct.x, y: rct.y });
              drawCloudRect(ctx, a.x, a.y, rct.w * k * scale, rct.h * k * scale);
              break;
            }
            case 'circle': {
              const el = geomEllipse(g); const c = S({ x: el.cx, y: el.cy });
              ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(1, el.rx * k * scale), Math.max(1, el.ry * k * scale), 0, 0, Math.PI * 2); ctx.stroke();
              break;
            }
            case 'arrow': {
              const l = geomLine(g); const a = S({ x: l.x1, y: l.y1 }), b = S({ x: l.x2, y: l.y2 });
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
              drawArrowHead(ctx, a.x, a.y, b.x, b.y, Math.max(9, lw * 3.4));
              break;
            }
            case 'measure': {
              const mk = measureKindOf(p.data);
              const raw = measureGeomPoints(g);
              if (!raw.length) break;
              const spts = raw.map(S);
              const fontPx = clamp(12 * Math.sqrt(scale * k), 10, 18);
              if (mk === 'count') {
                const tickR = Math.max(4, lw * 1.8);
                for (const q of spts) { traceCountTick(ctx, q, tickR); ctx.stroke(); }
                const cx = spts.reduce((s, q) => s + q.x, 0) / spts.length;
                const cy = spts.reduce((s, q) => s + q.y, 0) / spts.length;
                chip(countMeasureLabel(raw.length), cx, cy - Math.max(14, tickR * 3), col, fontPx);
                break;
              }
              if (mk === 'area' && raw.length >= 3) {
                ctx.setLineDash([7, 5]);
                traceMeasurePath(ctx, spts, true);
                ctx.save(); ctx.globalAlpha = 0.12; ctx.fill(); ctx.restore();
                ctx.stroke();
                ctx.setLineDash([]);
                const cx = spts.reduce((s, q) => s + q.x, 0) / spts.length;
                const cy = spts.reduce((s, q) => s + q.y, 0) / spts.length;
                chip(areaMeasureLabel(raw, p.data.ppf), cx, cy, col, fontPx);
                break;
              }
              // linear — legacy two-point (dimension ticks) or polyline
              ctx.setLineDash([7, 5]);
              traceMeasurePath(ctx, spts, false);
              ctx.stroke();
              ctx.setLineDash([]);
              if (raw.length === 2) {
                const [a, b] = spts;
                const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, tick = Math.max(5, lw * 2.5);
                ctx.beginPath();
                ctx.moveTo(a.x - tick * Math.cos(ang), a.y - tick * Math.sin(ang)); ctx.lineTo(a.x + tick * Math.cos(ang), a.y + tick * Math.sin(ang));
                ctx.moveTo(b.x - tick * Math.cos(ang), b.y - tick * Math.sin(ang)); ctx.lineTo(b.x + tick * Math.cos(ang), b.y + tick * Math.sin(ang));
                ctx.stroke();
              } else {
                for (const q of spts) { ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2.5, lw), 0, Math.PI * 2); ctx.fill(); }
              }
              const mid = spts[Math.floor((spts.length - 1) / 2)], mid2 = spts[Math.ceil(spts.length / 2)] || mid;
              chip(polylineMeasureLabel(raw, p.data.ppf), (mid.x + mid2.x) / 2, (mid.y + mid2.y) / 2 - Math.max(12, lw * 4), col, fontPx);
              break;
            }
            case 'text': {
              const pt = S(geomPoint(g));
              const fs = Math.max(9, (p.data.fontSize || 24) * k * scale);
              ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
              const lines = (p.data.text || '').split('\n');
              const wMax = Math.max(...lines.map((ln) => ctx.measureText(ln).width), 8);
              ctx.fillStyle = 'rgba(11,14,19,0.72)';
              ctx.fillRect(pt.x - fs * 0.3, pt.y - fs * 1.05, wMax + fs * 0.6, lines.length * fs * 1.25 + fs * 0.4);
              ctx.fillStyle = col;
              lines.forEach((ln, i) => ctx.fillText(ln, pt.x, pt.y + i * fs * 1.25));
              break;
            }
            case 'callout': {
              const l = geomLine(g); const tip = S({ x: l.x1, y: l.y1 }), anchor = S({ x: l.x2, y: l.y2 });
              ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
              drawArrowHead(ctx, anchor.x, anchor.y, tip.x, tip.y, Math.max(9, lw * 3.4));
              const fs = Math.max(9, (p.data.fontSize || 24) * k * scale);
              ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
              const lines = (p.data.text || '').split('\n');
              const wMax = Math.max(...lines.map((ln) => ctx.measureText(ln).width), 8);
              const bx = anchor.x, by = anchor.y;
              ctx.fillStyle = 'rgba(11,14,19,0.85)';
              ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, lw * 0.6);
              ctx.beginPath(); ctx.rect(bx - fs * 0.4, by - fs * 1.1, wMax + fs * 0.8, lines.length * fs * 1.25 + fs * 0.5); ctx.fill(); ctx.stroke();
              ctx.fillStyle = col;
              lines.forEach((ln, i) => ctx.fillText(ln, bx, by + i * fs * 1.25));
              break;
            }
            case 'stamp': {
              const pt = S(geomPoint(g));
              drawStampChip(pt.x, pt.y, p.data.stamp || 'STAMP', col, p.data.w, k, isSel || isHover);
              break;
            }
            default: break;
          }
        }
        // selection halo — dashed brand-gold bbox
        if (isSel) {
          const bb = bboxOf(p, dims.w);
          if (bb) {
            const a = sc({ x: bb.x0, y: bb.y0 }), b = sc({ x: bb.x1, y: bb.y1 });
            ctx.setLineDash([6, 5]); ctx.strokeStyle = gold; ctx.lineWidth = 1.6;
            ctx.strokeRect(a.x - 8, a.y - 8, (b.x - a.x) + 16, (b.y - a.y) + 16);
            ctx.setLineDash([]);
          }
        }
        if (m._queued) {
          const bb = bboxOf(p, dims.w);
          if (bb) { const a = sc({ x: bb.x0, y: bb.y0 }); chip('queued', a.x + 4, a.y - 12, DIM, 10); }
        }
      } catch { /* legacy tolerance: never crash the paint */ }
      ctx.restore();
    }

    /* live drafts */
    ctx.save();
    ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const liveW = Math.max(1.2, ((inkWidth * dims.w) / 1200) * scale);
    ctx.lineWidth = liveW;
    if (penRef.current.length >= 2) {
      const pts = penRef.current.map(sc);
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    if (dragShape) {
      const a = sc(dragShape.a), b = sc(dragShape.b);
      if (tool === 'rect') ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else if (tool === 'cloud') drawCloudRect(ctx, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else if (tool === 'circle') { ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (tool === 'arrow' || tool === 'callout') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); drawArrowHead(ctx, b.x, b.y, a.x, a.y, Math.max(9, liveW * 3.4)); }
      else if (tool === 'measure') {
        ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        chip(measureLabel(dragShape.a.x, dragShape.a.y, dragShape.b.x, dragShape.b.y, ppf > 0 ? ppf : null), (a.x + b.x) / 2, (a.y + b.y) / 2 - 16, ink, 12);
      }
    }
    if (tool === 'measure' && measurePts.length) {
      const livePpf = ppf > 0 ? ppf : null;
      const withCursor = cursor ? [...measurePts, cursor] : measurePts;
      const spts = withCursor.map(sc);
      const anchor = spts[spts.length - 1];
      if (measureMode === 'count') {
        const tickR = Math.max(4, liveW * 1.8);
        for (let i = 0; i < measurePts.length; i++) { const q = sc(measurePts[i]); traceCountTick(ctx, q, tickR); ctx.stroke(); }
        chip(countMeasureLabel(measurePts.length), anchor.x + 26, anchor.y - 20, ink, 12);
      } else if (measureMode === 'area') {
        ctx.setLineDash([7, 5]);
        traceMeasurePath(ctx, spts, spts.length >= 3);
        if (spts.length >= 3) { ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = ink; ctx.fill(); ctx.restore(); }
        ctx.stroke();
        ctx.setLineDash([]);
        // first-vertex close handle
        ctx.beginPath(); ctx.arc(spts[0].x, spts[0].y, 6, 0, Math.PI * 2); ctx.stroke();
        const label = withCursor.length >= 3 ? areaMeasureLabel(withCursor, livePpf) : polylineMeasureLabel(withCursor, livePpf);
        if (label) chip(label, anchor.x + 30, anchor.y - 22, ink, 12);
      } else {
        ctx.setLineDash([7, 5]);
        traceMeasurePath(ctx, spts, false);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < measurePts.length; i++) { const q = sc(measurePts[i]); ctx.save(); ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2.5, liveW), 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
        const label = polylineMeasureLabel(withCursor, livePpf);
        if (label) chip(label, anchor.x + 30, anchor.y - 22, ink, 12);
      }
    }
    if (calibPts.length) {
      ctx.strokeStyle = gold; ctx.lineWidth = 2.4;
      const cp = calibPts.map(sc);
      ctx.beginPath(); ctx.moveTo(cp[0].x, cp[0].y);
      if (cp.length > 1) ctx.lineTo(cp[1].x, cp[1].y);
      else if (cursor) { const cc = sc(cursor); ctx.lineTo(cc.x, cc.y); }
      ctx.stroke();
      for (const q of cp) { ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fillStyle = gold; ctx.fill(); }
    }
    ctx.restore();
  }, [cssSize, view, dims, imgReady, pageMarkups, parsed, selId, hover, ink, inkWidth, dragShape, tool, measureMode, measurePts, cursor, calibPts, ppf, penTick]);

  drawRef.current = draw;
  useEffect(() => { scheduleDraw(); }, [draw, scheduleDraw]);

  /* ── derived UI bits ─────────────────────────────────────────────────── */
  const selMarkup = selId ? markups.find((m) => m.id === selId) || null : null;
  const hoverMarkup = hover ? markups.find((m) => m.id === hover.id) || null : null;
  const pagePins = useMemo(
    () => pins.filter((p) => !isMultiPage || (p.page_number || 1) === page),
    [pins, isMultiPage, page],
  );
  const toolHint = TOOLS.find((t) => t.t === tool)?.hint
    || (tool === 'calibrate' ? 'Click the two ends of a known dimension (a door, a grid bay, a dimension string).' : '');

  const drawingCursor =
    tool === 'select' ? 'grab'
    : tool === 'eraser' ? 'pointer'
    : 'crosshair';

  /* ── pins: save / popup ──────────────────────────────────────────────── */
  const submitPin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPin || !pinTitle.trim()) return;
    setSavingPin(true);
    const payload = {
      project_id: projectId, drawing_id: drawing.id,
      x_pct: pendingPin.x / dims.w, y_pct: pendingPin.y / dims.h,
      page_number: currentPageNumber,
      title: pinTitle.trim(), note: pinNote.trim(), category: pinCategory,
    };
    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch('/api/drawings/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'pin failed');
      if (d.pin) setPins((prev) => [...prev, d.pin]);
    } catch {
      await enqueue({ url: '/api/drawings/pin', method: 'POST', body: JSON.stringify(payload), contentType: 'application/json', isFormData: false });
      setPins((prev) => [...prev, {
        id: uid(), drawing_id: drawing.id, x_pct: payload.x_pct, y_pct: payload.y_pct,
        title: payload.title, note: payload.note, category: pinCategory, page_number: currentPageNumber,
        created_at: new Date().toISOString(),
      }]);
      showToast('Offline — pin queued; it syncs when you reconnect.');
    }
    setPendingPin(null); setSavingPin(false);
  }, [pendingPin, pinTitle, pinNote, pinCategory, projectId, drawing.id, dims, currentPageNumber, showToast]);

  /* ── comments on the selected markup ─────────────────────────────────── */
  const submitComment = useCallback(async () => {
    if (!selMarkup || !commentText.trim() || selMarkup._local) return;
    setPostingComment(true);
    const content = commentText.trim();
    const url = `${apiBase}/${resolveId(selMarkup.id)}`;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.comment) throw new Error(d?.error || 'comment failed');
      const c: MarkupComment = d.comment;
      setMarkups((ms) => ms.map((m) => (m.id === selMarkup.id ? { ...m, comments: [...m.comments, c] } : m)));
      setCommentText('');
    } catch {
      await enqueue({ url, method: 'POST', body: JSON.stringify({ content }), contentType: 'application/json', isFormData: false });
      const c: MarkupComment = { id: uid(), markup_id: selMarkup.id, author_name: me.name, content, created_at: new Date().toISOString() };
      setMarkups((ms) => ms.map((m) => (m.id === selMarkup.id ? { ...m, comments: [...m.comments, c] } : m)));
      setCommentText('');
      showToast('Offline — comment queued.');
    }
    setPostingComment(false);
  }, [selMarkup, commentText, apiBase, resolveId, me.name, showToast]);

  /* ── styles ──────────────────────────────────────────────────────────── */
  const toolBtn = (active: boolean): React.CSSProperties => ({
    background: active ? ACCENT_25 : 'transparent',
    border: `1px solid ${active ? ACCENT : BORDER}`,
    borderRadius: 8, padding: '7px 9px',
    color: active ? ACCENT : DIM,
    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    minWidth: 46, fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: 0.2,
  });
  const iconBtn: React.CSSProperties = {
    background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8,
    padding: 7, color: DIM, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const inkTool = ['pen', 'cloud', 'arrow', 'text', 'callout', 'rect', 'circle', 'measure'].includes(tool);

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* toolbar */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {TOOLS.map((t) => (
            <button
              key={t.t}
              onClick={() => { setTool(t.t); setMeasurePts([]); setCalibPts([]); setPendingPin(null); }}
              style={toolBtn(tool === t.t)}
              title={t.key ? `${t.label} (${t.key})` : t.label}
            >
              <G g={t.g} />
              <span>{t.label}</span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* live-session LED (radio pattern — quiet, no toasts) */}
            <span
              title={rtLive ? 'Live — teammate markups land instantly.' : 'Live sync offline — refreshing every 15s.'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: rtLive ? GREEN : 'rgba(255,255,255,0.35)', padding: '0 4px' }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: rtLive ? GREEN : 'rgba(255,255,255,0.25)', boxShadow: rtLive ? '0 0 6px rgba(44,255,122,0.8)' : 'none' }} />
              {rtLive ? 'LIVE' : 'OFFLINE'}
            </span>
            {/* presence chips — who else is on this sheet */}
            {viewers.slice(0, 4).map((n, i) => (
              <span
                key={`${n}:${i}`}
                title={`${n} is viewing this sheet`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(11,14,19,0.6)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: GREEN }} />
                {initialsOf(n)} · viewing
              </span>
            ))}
            {viewers.length > 4 && (
              <span title={viewers.slice(4).join(', ')} style={{ fontSize: 10, fontWeight: 800, color: DIM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '3px 8px' }}>
                +{viewers.length - 4}
              </span>
            )}
            <button onClick={undo} disabled={!histLen.p} style={{ ...iconBtn, color: histLen.p ? TEXT : 'rgba(255,255,255,0.25)' }} title="Undo (Ctrl+Z)"><G g="undo" /></button>
            <button onClick={redo} disabled={!histLen.f} style={{ ...iconBtn, color: histLen.f ? TEXT : 'rgba(255,255,255,0.25)' }} title="Redo (Ctrl+Shift+Z)"><G g="redo" /></button>
            <button onClick={() => { const b = canvasRef.current?.getBoundingClientRect(); if (b) zoomAt(1.25, b.left + b.width / 2, b.top + b.height / 2); }} style={iconBtn} title="Zoom in (+)"><G g="zoomIn" /></button>
            <button onClick={() => { const b = canvasRef.current?.getBoundingClientRect(); if (b) zoomAt(1 / 1.25, b.left + b.width / 2, b.top + b.height / 2); }} style={iconBtn} title="Zoom out (−)"><G g="zoomOut" /></button>
            <button onClick={fit} style={iconBtn} title="Fit sheet (F)"><G g="fit" /></button>
            <button
              onClick={openPromote}
              disabled={!online || !promotableReady}
              title={!online
                ? 'Offline — promotion needs the takeoff page. Reconnect first.'
                : !promotableReady
                  ? 'Draw a measure markup on a calibrated sheet first.'
                  : 'Promote this sheet’s measurements into the measured takeoff.'}
              style={{
                ...iconBtn, gap: 6, display: 'flex', fontSize: 11, fontWeight: 700,
                color: online && promotableReady ? ACCENT : 'rgba(255,255,255,0.25)',
                borderColor: online && promotableReady ? ACCENT_25 : BORDER,
                cursor: online && promotableReady ? 'pointer' : 'default',
              }}
            >
              <G g="send" s={14} /> Send to Takeoff
            </button>
            <button
              onClick={openShare}
              disabled={!online}
              title={online
                ? 'Create a read-only review link for outside reviewers.'
                : 'Offline — review links need a connection.'}
              style={{
                ...iconBtn, gap: 6, display: 'flex', fontSize: 11, fontWeight: 700,
                color: online ? ACCENT : 'rgba(255,255,255,0.25)',
                borderColor: online ? ACCENT_25 : BORDER,
                cursor: online ? 'pointer' : 'default',
              }}
            >
              <G g="share" s={14} /> Share
            </button>
          </div>
        </div>

        {/* stamp palette — the 6 standard stamps as machined chips */}
        {tool === 'stamp' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            {STAMPS.map((s) => (
              <button
                key={s.name}
                onClick={() => setStampChoice(s.name)}
                style={{
                  background: stampChoice === s.name ? 'rgba(255,255,255,0.06)' : 'rgba(11,14,19,0.6)',
                  border: `1.5px solid ${stampChoice === s.name ? s.color : BORDER}`,
                  boxShadow: stampChoice === s.name ? `0 0 0 1px ${s.color} inset` : 'none',
                  borderRadius: 6, padding: '7px 12px', color: s.color,
                  fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: 'pointer',
                }}
              >
                {s.name}
              </button>
            ))}
            {stampChoice === 'PUNCH' && (
              <span style={{ fontSize: 11, color: DIM, alignSelf: 'center' }}>
                PUNCH creates a punch-list item + a pin at the click point.
              </span>
            )}
          </div>
        )}

        {/* ink controls */}
        {inkTool && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            {INK_COLORS.map((c) => (
              <button key={c} onClick={() => setInk(c)} aria-label={`Ink ${c}`} style={{
                width: 20, height: 20, borderRadius: '50%', background: c,
                border: ink === c ? '2px solid #fff' : '2px solid transparent',
                outline: ink === c ? `1px solid ${c}` : 'none',
                cursor: 'pointer', padding: 0,
              }} />
            ))}
            <span style={{ fontSize: 11, color: DIM, marginLeft: 6 }}>Width</span>
            <input type="range" min={1} max={10} value={inkWidth} onChange={(e) => setInkWidth(Number(e.target.value))} style={{ width: 80, accentColor: 'var(--brand-primary)' }} />
            {tool === 'measure' && (
              <div style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginLeft: 10 }}>
                {MEASURE_MODES.map((mm, i) => (
                  <button
                    key={mm.m}
                    onClick={() => { setMeasureMode(mm.m); setMeasurePts([]); setMsg(mm.hint); }}
                    title={mm.hint}
                    style={{
                      background: measureMode === mm.m ? ACCENT_25 : 'transparent',
                      border: 'none',
                      borderLeft: i > 0 ? `1px solid ${BORDER}` : 'none',
                      padding: '6px 12px',
                      color: measureMode === mm.m ? ACCENT : DIM,
                      fontSize: 11, fontWeight: measureMode === mm.m ? 800 : 500, letterSpacing: 0.3,
                      cursor: 'pointer',
                    }}
                  >
                    {mm.label}
                  </button>
                ))}
              </div>
            )}
            {tool === 'measure' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                {ppf > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>Calibrated · {ppf.toFixed(1)} px/ft</span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>Uncalibrated — reads in px</span>
                )}
                <button onClick={() => { setTool('calibrate'); setCalibPts([]); setMsg('Click the two ends of a known dimension.'); }} style={{ ...iconBtn, gap: 6, color: ACCENT, borderColor: ACCENT_25, display: 'flex', fontSize: 11, fontWeight: 700 }}>
                  <G g="calib" s={14} /> Calibrate
                </button>
              </div>
            )}
          </div>
        )}
        {tool === 'calibrate' && (
          <div style={{ marginTop: 8, fontSize: 12, color: ACCENT, fontWeight: 600 }}>
            Calibrating this sheet: click both ends of a known dimension, then enter the real distance.
          </div>
        )}
      </div>

      {/* status line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 12, color: DIM, flex: 1, minWidth: 180 }}>{msg || toolHint}</p>
        {isMultiPage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => goPage(page - 1)} disabled={page <= 1} style={{ ...iconBtn, padding: '4px 10px', fontSize: 13, color: page > 1 ? TEXT : 'rgba(255,255,255,0.25)' }}>&lsaquo;</button>
            <span style={{ fontSize: 12, color: TEXT, fontWeight: 700 }}>Page {page} / {pageCount}</span>
            <button onClick={() => goPage(page + 1)} disabled={page >= pageCount} style={{ ...iconBtn, padding: '4px 10px', fontSize: 13, color: page < pageCount ? TEXT : 'rgba(255,255,255,0.25)' }}>&rsaquo;</button>
          </div>
        )}
      </div>

      {/* canvas + DOM overlays */}
      <div
        ref={containerRef}
        style={{
          position: 'relative', borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${BORDER}`, background: CANVAS_BG,
          height: 'min(68vh, 860px)', minHeight: 380, marginBottom: 10,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDoubleClick={onDoubleClick}
          onPointerLeave={() => { setHover(null); setCursor(null); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: drawingCursor }}
        />

        {/* pins (DOM, transform-positioned) */}
        {imgReady && pagePins.map((pin) => {
          const px = pin.x_pct * dims.w * view.scale + view.tx;
          const py = pin.y_pct * dims.h * view.scale + view.ty;
          if (px < -30 || py < -30 || px > cssSize.w + 30 || py > cssSize.h + 30) return null;
          const cat = pin.category || pin.pin_type || 'Other';
          const col = CATEGORY_COLORS[cat] || (cat === 'punch' ? CATEGORY_COLORS.Punch : DIM);
          const isTarget = initialPin?.id === pin.id;
          return (
            <button
              key={pin.id}
              onClick={(e) => { e.stopPropagation(); setSelectedPin(pin); setPendingPin(null); }}
              title={pin.title}
              style={{
                position: 'absolute', left: px, top: py, transform: 'translate(-50%, -100%)',
                width: 24, height: 30, padding: 0, background: 'transparent', border: 'none',
                cursor: 'pointer', zIndex: 10,
                pointerEvents: tool === 'select' || tool === 'pin' ? 'auto' : 'none',
                filter: isTarget ? 'drop-shadow(0 0 6px rgba(255,255,255,0.7))' : 'drop-shadow(0 2px 3px rgba(11,14,19,0.6))',
              }}
            >
              <svg width={24} height={30} viewBox="0 0 24 30">
                <path d="M12 29s-9-9.4-9-16a9 9 0 1 1 18 0c0 6.6-9 16-9 16z" fill={col} stroke="#fff" strokeWidth={1.6} />
                <circle cx={12} cy={12.5} r={3.4} fill="#fff" />
              </svg>
            </button>
          );
        })}

        {/* pending pin marker */}
        {imgReady && pendingPin && (
          <div style={{
            position: 'absolute',
            left: pendingPin.x * view.scale + view.tx,
            top: pendingPin.y * view.scale + view.ty,
            transform: 'translate(-50%, -50%)', width: 20, height: 20, borderRadius: '50%',
            background: RED, border: '2px solid #fff', zIndex: 12, pointerEvents: 'none',
            boxShadow: '0 0 0 6px rgba(255,59,48,0.25)',
          }} />
        )}

        {/* hover author chip */}
        {hoverMarkup && hover && !selMarkup && (
          <div style={{
            position: 'absolute', left: clamp(hover.sx + 14, 8, Math.max(8, cssSize.w - 180)), top: clamp(hover.sy - 34, 8, Math.max(8, cssSize.h - 40)),
            background: 'rgba(20,20,22,0.94)', border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '6px 10px', pointerEvents: 'none', zIndex: 20, maxWidth: 240,
          }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {authorOf(hoverMarkup)}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 11, color: DIM }}>
              {hoverMarkup.markup_type}{hoverMarkup._queued ? ' · queued' : ''} · {relTime(hoverMarkup.created_at)}
            </p>
          </div>
        )}

        {/* busy / error overlays */}
        {(busy || loadError) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,14,19,0.72)', zIndex: 30 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: loadError ? RED : TEXT }}>{loadError || busy}</p>
          </div>
        )}

        {/* zoom readout */}
        {imgReady && (
          <div style={{ position: 'absolute', right: 10, bottom: 10, background: 'rgba(20,20,22,0.85)', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: DIM, zIndex: 15, pointerEvents: 'none' }}>
            {Math.round(view.scale * 100)}%
          </div>
        )}
      </div>

      {/* author layers */}
      {authors.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: DIM }}>
            <G g="layers" s={13} /> Layers
          </span>
          {authors.map(([name, count]) => {
            const hidden = hiddenAuthors.has(name);
            return (
              <button
                key={name}
                onClick={() => setHiddenAuthors((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: hidden ? 'transparent' : ACCENT_12,
                  border: `1px solid ${hidden ? BORDER : ACCENT_25}`,
                  borderRadius: 14, padding: '4px 10px',
                  color: hidden ? 'rgba(255,255,255,0.35)' : TEXT,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
                title={hidden ? `Show ${name}'s markups` : `Hide ${name}'s markups`}
              >
                <G g={hidden ? 'eyeOff' : 'eye'} s={13} />
                {name === me.name ? `${name} (you)` : name}
                <span style={{ fontSize: 10, color: DIM }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* selected markup detail + comments */}
      {selMarkup && (
        <div style={{ ...panelStyle, borderColor: ACCENT_25 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: selMarkup.color || '#FF3B30', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, textTransform: 'capitalize' }}>
                {selMarkup.markup_type}{parsed(selMarkup).mode === 'legacy' ? ' (legacy · read-only)' : ''}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: DIM }}>
                {authorOf(selMarkup)} · {relTime(selMarkup.created_at)}{selMarkup._queued ? ' · queued offline' : ''}
              </p>
            </div>
            {parsed(selMarkup).mode === 'canonical' && (!selMarkup.created_by || selMarkup.created_by === me.id) && (
              <button onClick={() => deleteMarkup(selMarkup, true)} style={{ ...iconBtn, color: RED, borderColor: 'rgba(255,59,48,0.35)' }} title="Delete markup"><G g="trash" s={15} /></button>
            )}
            <button onClick={() => setSelId(null)} style={iconBtn} title="Close"><G g="close" s={15} /></button>
          </div>
          {/* comments */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            {selMarkup.comments.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selMarkup.comments.map((c) => (
                  <div key={c.id} style={{ fontSize: 12 }}>
                    <span style={{ color: TEXT, fontWeight: 700 }}>{c.author_name || 'Unknown'}</span>
                    <span style={{ color: DIM }}> · {relTime(c.created_at)}</span>
                    <p style={{ margin: '2px 0 0', color: DIM }}>{c.content}</p>
                  </div>
                ))}
              </div>
            )}
            {selMarkup._local ? (
              <p style={{ margin: 0, fontSize: 12, color: DIM }}>Comments unlock once this markup finishes saving.</p>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" style={{ ...inp, fontSize: 12, padding: '8px 10px' }} onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }} />
                <button onClick={submitComment} disabled={postingComment || !commentText.trim()} style={{ background: commentText.trim() ? 'var(--brand-primary)' : 'transparent', border: `1px solid ${commentText.trim() ? 'var(--brand-primary)' : BORDER}`, borderRadius: 8, padding: '6px 12px', color: commentText.trim() ? '#0A0A00' : DIM, fontSize: 12, fontWeight: 700, cursor: commentText.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                  {postingComment ? '…' : 'Post'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* selected pin popup */}
      {selectedPin && (
        <div style={{ ...panelStyle, borderColor: CATEGORY_COLORS[selectedPin.category || ''] || BORDER, position: 'relative' }}>
          <button onClick={() => setSelectedPin(null)} style={{ ...iconBtn, position: 'absolute', top: 10, right: 10, border: 'none' }}><G g="close" s={15} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingRight: 32 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLORS[selectedPin.category || ''] || DIM }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: CATEGORY_COLORS[selectedPin.category || ''] || DIM }}>{selectedPin.category || selectedPin.pin_type || 'Pin'}</span>
            <span style={{ fontSize: 11, color: DIM, marginLeft: 'auto' }}>{relTime(selectedPin.created_at)}</span>
          </div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT }}>{selectedPin.title}</p>
          {(selectedPin.note || selectedPin.notes) && <p style={{ margin: 0, fontSize: 13, color: DIM, lineHeight: 1.4 }}>{selectedPin.note || selectedPin.notes}</p>}
          {(selectedPin.entity_type === 'punch_item' || selectedPin.entity_type === 'punch') && (
            <button onClick={() => router.push(`/app/projects/${projectId}/punch-list`)} style={{ marginTop: 10, background: ACCENT_12, border: `1px solid ${ACCENT_25}`, borderRadius: 8, padding: '7px 12px', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Open in punch list &rsaquo;
            </button>
          )}
        </div>
      )}

      {/* pin form */}
      {pendingPin && (
        <form onSubmit={submitPin} style={panelStyle}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: TEXT }}>Drop a Pin</p>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Title *</label>
            <input value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} placeholder="e.g. Missing anchor bolt" style={inp} required autoFocus />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Note</label>
            <textarea value={pinNote} onChange={(e) => setPinNote(e.target.value)} placeholder="Additional details…" rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 6 }}>Category</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['RFI', 'Punch', 'Safety', 'Other'] as const).map((cat) => (
                <button key={cat} type="button" onClick={() => setPinCategory(cat)} style={{
                  flex: 1, background: pinCategory === cat ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${pinCategory === cat ? CATEGORY_COLORS[cat] : BORDER}`, borderRadius: 8, padding: '8px 4px',
                  color: pinCategory === cat ? CATEGORY_COLORS[cat] : DIM, fontSize: 12, fontWeight: pinCategory === cat ? 700 : 400, cursor: 'pointer',
                }}>{cat}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setPendingPin(null)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px', color: DIM, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={savingPin} style={{ flex: 2, background: savingPin ? 'rgba(255,255,255,0.12)' : 'var(--brand-primary)', border: 'none', borderRadius: 10, padding: '12px', color: savingPin ? DIM : '#0A0A00', fontSize: 14, fontWeight: 800, cursor: savingPin ? 'wait' : 'pointer' }}>
              {savingPin ? 'Saving…' : 'Save Pin'}
            </button>
          </div>
        </form>
      )}

      {/* text / callout modal */}
      {textModal && (
        <div style={{ ...panelStyle, borderColor: ACCENT_25 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: TEXT }}>{textModal.from ? 'Callout Text' : 'Text Note'}</p>
          <textarea
            value={textModal.value}
            onChange={(e) => setTextModal((m) => (m ? { ...m, value: e.target.value } : m))}
            placeholder="Type the note…"
            rows={2}
            style={{ ...inp, resize: 'vertical' }}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmText(); } }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setTextModal(null)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirmText} disabled={!textModal.value.trim()} style={{ flex: 2, background: textModal.value.trim() ? 'var(--brand-primary)' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, padding: '10px', color: textModal.value.trim() ? '#0A0A00' : DIM, fontSize: 13, fontWeight: 800, cursor: textModal.value.trim() ? 'pointer' : 'default' }}>Place</button>
          </div>
        </div>
      )}

      {/* punch modal (machined) */}
      {punchModal && (
        <div style={{ ...panelStyle, border: `1.5px solid ${CATEGORY_COLORS.Punch}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ background: 'rgba(255,59,48,0.14)', border: '1px solid rgba(255,59,48,0.4)', borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 800, letterSpacing: 1, color: CATEGORY_COLORS.Punch }}>PUNCH</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>New Punch Item from This Drawing</p>
          </div>
          <label style={{ display: 'block', fontSize: 12, color: DIM, marginBottom: 4 }}>Title *</label>
          <input
            value={punchModal.title}
            onChange={(e) => setPunchModal((m) => (m ? { ...m, title: e.target.value } : m))}
            placeholder="e.g. Patch drywall at RCP grid 4-B"
            style={inp}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') confirmPunch(); }}
          />
          <p style={{ margin: '8px 0 0', fontSize: 12, color: DIM }}>
            Creates the punch item (open · medium), pins it here on {drawing.sheet || 'this sheet'}{isMultiPage ? ` p${page}` : ''}, and stamps the drawing.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setPunchModal(null)} disabled={punchModal.saving} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirmPunch} disabled={punchModal.saving || !punchModal.title.trim()} style={{ flex: 2, background: punchModal.title.trim() && !punchModal.saving ? CATEGORY_COLORS.Punch : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, padding: '10px', color: punchModal.title.trim() && !punchModal.saving ? '#fff' : DIM, fontSize: 13, fontWeight: 800, cursor: punchModal.title.trim() && !punchModal.saving ? 'pointer' : 'default' }}>
              {punchModal.saving ? 'Creating…' : 'Create Punch'}
            </button>
          </div>
        </div>
      )}

      {/* calibration distance modal */}
      {calibModal && (
        <div style={{ ...panelStyle, borderColor: ACCENT_25 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: TEXT }}>Known Distance Between the Two Points</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={calibModal.ft}
              onChange={(e) => setCalibModal((m) => (m ? { ...m, ft: e.target.value } : m))}
              placeholder="e.g. 20"
              inputMode="decimal"
              style={{ ...inp, width: 120 }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmCalibration(); }}
            />
            <span style={{ fontSize: 13, color: DIM }}>feet</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => { setCalibModal(null); setCalibPts([]); setTool('measure'); }} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirmCalibration} disabled={!(parseFloat(calibModal.ft) > 0)} style={{ flex: 2, background: parseFloat(calibModal.ft) > 0 ? 'var(--brand-primary)' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, padding: '10px', color: parseFloat(calibModal.ft) > 0 ? '#0A0A00' : DIM, fontSize: 13, fontWeight: 800, cursor: parseFloat(calibModal.ft) > 0 ? 'pointer' : 'default' }}>Set Scale</button>
          </div>
        </div>
      )}

      {/* SEND TO TAKEOFF modal (machined) */}
      {promoteModal && (
        <div style={{ ...panelStyle, borderColor: ACCENT_25 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <G g="send" s={16} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Send to Takeoff — {sheetLabel}</p>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: DIM }}>
            Each checked measurement lands as a traced condition on the measured takeoff. Unassigned rows stay priceable there — you pick their assembly on that page.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {promoteModal.map((r, idx) => {
              const calibrated = r.ppf !== null;
              const options = ASSEMBLY_MENU.filter((a) => a.kind === r.kind);
              return (
                <div
                  key={r.markupId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    background: 'rgba(11,14,19,0.55)', border: `1px solid ${calibrated && r.include ? ACCENT_25 : BORDER}`,
                    borderRadius: 10, padding: '8px 10px', opacity: calibrated ? 1 : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={r.include && calibrated}
                    disabled={!calibrated}
                    onChange={(e) => setPromoteModal((rows) => rows ? rows.map((x, i) => (i === idx ? { ...x, include: e.target.checked } : x)) : rows)}
                    style={{ accentColor: 'var(--brand-primary)', width: 16, height: 16, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 10, fontWeight: 800, color: DIM, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '2px 7px', flexShrink: 0, textTransform: 'capitalize' }}>
                    {r.kind}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: calibrated ? GREEN : AMBER, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 76 }}>
                    {r.label}
                  </span>
                  {calibrated ? (
                    <>
                      <input
                        value={r.name}
                        onChange={(e) => setPromoteModal((rows) => rows ? rows.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) : rows)}
                        placeholder="Condition name"
                        style={{ ...inp, flex: 1, minWidth: 140, fontSize: 12, padding: '7px 10px' }}
                      />
                      <select
                        value={r.assemblyId}
                        onChange={(e) => setPromoteModal((rows) => rows ? rows.map((x, i) => (i === idx ? { ...x, assemblyId: e.target.value } : x)) : rows)}
                        style={{ ...inp, width: 220, fontSize: 12, padding: '7px 10px', cursor: 'pointer' }}
                      >
                        <option value="">Unassigned</option>
                        {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>Calibrate First</span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setPromoteModal(null)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px', color: DIM, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            {(() => {
              const n = promoteModal.filter((r) => r.include && r.ppf !== null).length;
              return (
                <button
                  onClick={confirmPromote}
                  disabled={!n}
                  style={{ flex: 2, background: n ? 'var(--brand-primary)' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, padding: '10px', color: n ? '#0A0A00' : DIM, fontSize: 13, fontWeight: 800, cursor: n ? 'pointer' : 'default' }}
                >
                  {n ? `Send ${n} to Takeoff` : 'Nothing Selected'}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* SHARE FOR REVIEW modal (machined) */}
      {shareOpen && (
        <div style={{ ...panelStyle, borderColor: ACCENT_25, position: 'relative' }}>
          <button onClick={() => setShareOpen(false)} style={{ ...iconBtn, position: 'absolute', top: 10, right: 10, border: 'none' }} title="Close"><G g="close" s={15} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, paddingRight: 32 }}>
            <G g="share" s={16} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Share for Review — {drawing.sheet || drawing.name || 'this drawing'}</p>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: DIM }}>
            Anyone with a link sees this drawing and its markups, read-only — no sign-in, no editing. Revoke a link to cut off access instantly.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={shareLabel}
              onChange={(e) => setShareLabel(e.target.value)}
              placeholder="Label (optional) — e.g. Owner review"
              style={{ ...inp, flex: 1, minWidth: 180, fontSize: 12, padding: '8px 10px' }}
              onKeyDown={(e) => { if (e.key === 'Enter') createShareLink(); }}
            />
            <button
              onClick={createShareLink}
              disabled={shareBusy}
              style={{ background: shareBusy ? 'rgba(255,255,255,0.08)' : 'var(--brand-primary)', border: 'none', borderRadius: 10, padding: '8px 14px', color: shareBusy ? DIM : '#0A0A00', fontSize: 12, fontWeight: 800, cursor: shareBusy ? 'wait' : 'pointer', flexShrink: 0 }}
            >
              {shareBusy ? 'Creating…' : 'Create Link'}
            </button>
          </div>
          {shareCreated && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, background: 'rgba(11,14,19,0.55)', border: `1px solid ${ACCENT_25}`, borderRadius: 10, padding: '8px 10px' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: TEXT, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={shareCreated.url}>
                {shareCreated.url}
              </span>
              <button
                onClick={() => copyText(shareCreated.url, 'created')}
                style={{ background: ACCENT_12, border: `1px solid ${ACCENT_25}`, borderRadius: 8, padding: '5px 11px', color: copiedKey === 'created' ? GREEN : ACCENT, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {copiedKey === 'created' ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {shareLinks.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: DIM }}>Active Links</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {shareLinks.map((l) => {
                  const url = reviewUrl(l);
                  return (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(11,14,19,0.55)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '7px 10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l.label || 'Review Link'}
                        </p>
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l.created_at ? `created ${relTime(l.created_at)}` : 'active'}{l.expires_at ? ` · expires ${relTime(l.expires_at)}` : ''}
                        </p>
                      </div>
                      {url && (
                        <button
                          onClick={() => copyText(url, l.id)}
                          style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '5px 11px', color: copiedKey === l.id ? GREEN : DIM, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                        >
                          {copiedKey === l.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                      <button
                        onClick={() => revokeShareLink(l.id)}
                        disabled={revokingId === l.id}
                        style={{ background: 'transparent', border: '1px solid rgba(255,59,48,0.35)', borderRadius: 8, padding: '5px 11px', color: RED, fontSize: 11, fontWeight: 700, cursor: revokingId === l.id ? 'wait' : 'pointer', flexShrink: 0 }}
                      >
                        {revokingId === l.id ? '…' : 'Revoke'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          background: 'rgba(20,20,22,0.97)', border: `1px solid ${ACCENT_25}`, borderRadius: 12,
          padding: '12px 16px', zIndex: 300, display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 10px 32px rgba(11,14,19,0.6)', maxWidth: 'min(92vw, 480px)',
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>{toast.text}</p>
          {toast.href && (
            <button onClick={() => { const h = toast.href!; setToast(null); router.push(h); }} style={{ background: ACCENT_12, border: `1px solid ${ACCENT_25}`, borderRadius: 8, padding: '6px 11px', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {toast.label || 'Open'} &rsaquo;
            </button>
          )}
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 2, display: 'flex' }}><G g="close" s={14} /></button>
        </div>
      )}

      {/* offline note */}
      {!online && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: AMBER, fontWeight: 600 }}>
          Offline — markups you draw are queued and sync when you reconnect. Punch-from-drawing needs a connection.
        </p>
      )}
    </div>
  );
}

/* ── bbox of a parsed markup in its OWN reference space, mapped to current image space ── */
function bboxOf(p: ParsedMarkup, curW: number): { x0: number; y0: number; x1: number; y1: number } | null {
  try {
    let pts: Pt[] = [];
    let k = 1;
    if (p.mode === 'legacy') {
      k = p.refW > 0 && curW > 0 ? curW / p.refW : 1;
      for (const s of p.strokes) pts.push(...s);
    } else if (p.mode === 'canonical') {
      k = p.data.w > 0 && curW > 0 ? curW / p.data.w : 1;
      const g = p.data.geometry;
      switch (p.kind) {
        case 'freehand': pts = geomPoints(g); break;
        case 'rect': case 'cloud': { const r = geomRect(g); pts = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]; break; }
        case 'circle': { const e = geomEllipse(g); pts = [{ x: e.cx - e.rx, y: e.cy - e.ry }, { x: e.cx + e.rx, y: e.cy + e.ry }]; break; }
        case 'arrow': case 'callout': { const l = geomLine(g); pts = [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]; break; }
        case 'measure': pts = measureGeomPoints(g); break;
        case 'text': { const q = geomPoint(g); const fs = p.data.fontSize || 24; pts = [{ x: q.x, y: q.y - fs }, { x: q.x + fs * Math.max(3, (p.data.text?.length || 4) * 0.6), y: q.y + fs }]; break; }
        case 'stamp': { const q = geomPoint(g); const half = Math.max(40, (p.data.w || 2000) * 0.045); pts = [{ x: q.x - half, y: q.y - half * 0.45 }, { x: q.x + half, y: q.y + half * 0.45 }]; break; }
        default: return null;
      }
    } else return null;
    if (!pts.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x * k); y0 = Math.min(y0, q.y * k); x1 = Math.max(x1, q.x * k); y1 = Math.max(y1, q.y * k); }
    return { x0, y0, x1, y1 };
  } catch { return null; }
}
