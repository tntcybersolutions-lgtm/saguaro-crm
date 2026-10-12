'use client';
/**
 * PlanTracer — the manual/measured takeoff workspace that beats PlanSwift/STACK/Bluebeam
 * on measurement usability. Non-AI, real-estimator flow.
 *
 * All geometry is stored in IMAGE-PIXEL coordinates on each Condition. A view transform
 * {scale, tx, ty} is applied ONLY for display; pointer events are inverse-transformed on
 * the way in, so measurements never drift with zoom/pan.
 *
 * Every measurement routes through lib/takeoff/measure.ts (the deterministic brain):
 *   Area  → netAreaSF (net of voids)      Linear → lengthLF + segmentLengthsLF
 *   Count → marker tally                   Pitch  → slopeArea + roofingSquares
 *   Volume→ prism / averageEndAreaCY       Arc    → fit3PointArc (3-point circumcircle)
 * Snapping uses snapEndpoint / snapOrtho (Shift) / snapGrid. Scale via pxPerFt +
 * calibrationSanity. Finished conditions feed the SAME computeTakeoff engine → a live,
 * auditable priced rollup (material/labor/markups/sell, by division).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASSEMBLIES, type Condition, type ComputeOpts, type MeasureKind, type Pt, type TakeoffResult,
} from '@/lib/takeoff';
import {
  measureCondition, type MeasureToolKind,
  snapEndpoint, snapOrtho, snapGrid,
  grossSF, netAreaSF, lengthLF, segmentLengthsLF, perimeterLF,
  slopeArea, slopeFactorPitch, roofingSquares,
  prismCY, averageEndAreaCY,
  fit3PointArc, pxPerFt, calibrationSanity, toSY,
} from '@/lib/takeoff/measure';
import { findMatches, fillRegion } from '@/lib/takeoff/autocount';
import { divColor } from '@/lib/takeoff/divisions';
import { humanError } from '@/lib/errors';

/* ── palette (Sonoran navy + gold) ──────────────────────────────────────── */
const BG = 'var(--bg-base)', PANEL = 'var(--bg-surface)', LINE = 'rgba(255,255,255,0.09)', GOLD = 'var(--brand-primary)';
// Canvas 2D cannot resolve CSS custom properties — the drawing surface keeps literal brand hexes.
const CANVAS_GOLD = '#FBBF24', CANVAS_CYAN = '#FFE000';
const TEXT = '#e6edf3', DIM = '#8b949e', GREEN = '#4ADE80', RED = '#F87171', CYAN = 'var(--brand-primary-strong)';
const CANVAS_BG = '#0b0e13';
const TRADE_PALETTE = ['#FFE000', '#4ADE80', '#FBBF24', '#FBBF24', '#FBBF24', '#FB7185', '#FBBF24', '#FFE000', '#4ADE80', '#FFE000', '#FBBF24', '#4ADE80'];
const uid = () => Math.random().toString(36).slice(2, 9);
const usd = (c: number) => '$' + Math.round(c / 100).toLocaleString();
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A measured condition + the extra tracer metadata (holes/arc/tool) the engine harmlessly ignores. */
export type TracerCondition = Condition & {
  tool?: MeasureToolKind;
  holes?: Pt[][];
  arc?: { a: Pt; mid: Pt; b: Pt };
  riseOver12?: number;
  depthFt?: number;
  color?: string;
  sheetId?: string;   // which drawing-register sheet this was measured on (undefined = legacy/global)
  ppf?: number;       // px/ft this condition was measured at — recompute() prefers it over the active
                      // sheet's scale, so switching sheets never silently re-scales another sheet's numbers
  note?: string;      // free-form provenance (imported unit cost / CSI / CAD source) — the engine ignores it
};

/* ── multi-sheet drawing register ───────────────────────────────────────── */
type Sheet = {
  id: string;         // DETERMINISTIC: sheetUid(source, page) — re-adding the same file reattaches old conditions
  pdfId: string;      // '' for raster; otherwise keys into the loaded pdf-doc map
  page: number;       // 1-based page within its PDF
  name: string;
  url: string;        // rendered raster (data/blob URL); '' until a PDF page is lazily rendered
  w: number; h: number;
  ppf: number;        // per-sheet scale — calibrating one sheet never wipes another
  source: string;     // originating file name ('' = seeded from the opening plan) — the reattach key
};
/** Register metadata lifted to the parent (survives unmount; rasters are re-derived when the file is re-added). */
export type PersistedSheet = { id: string; name: string; page: number; ppf: number; w: number; h: number; source: string };
/** Deterministic sheet uid — FNV-1a over "source#page": the same plan re-added maps to the same id. */
function sheetUid(source: string, page: number): string {
  const s = `${source}#${page}`; let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 'sh' + h.toString(36);
}
const COUNT_WORK_EDGE = 1400;   // downscale long edge for template match (NCC is O(W·H·tw·th))
const FILL_WORK_EDGE = 2000;    // flood-fill is linear, so it can afford more resolution
const PDF_LONG_EDGE = 2000;     // render PDF pages to ~2000px long edge for crisp tracing

const engineKindOf = (t: MeasureToolKind): MeasureKind =>
  t === 'linear' || t === 'arc' ? 'linear' : t === 'count' ? 'count' : 'area';

const asmList = (kind: MeasureKind) => Object.values(ASSEMBLIES).filter((a) => a.appliesTo === kind);
const tradeOf = (c: TracerCondition) => ASSEMBLIES[c.assemblyId]?.components[0]?.trade ?? c.kind;
const csiOfAsm = (assemblyId: string) => ASSEMBLIES[assemblyId]?.components?.[0]?.csi ?? '';
// ONE canonical color per trade/division: divColor(csi) — the SAME mapping the client estimate PDF
// uses, so a scope is the exact same color on the plan and in the deliverable (v1 sync).
function colorFor(key: string) { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TRADE_PALETTE[h % TRADE_PALETTE.length]; }
const condColor = (c: TracerCondition) => c.color || divColor(csiOfAsm(c.assemblyId));

/** Human-readable measured value per condition (CY for volume, sloped SF + squares for pitch). */
function measuredLabel(c: TracerCondition): string {
  if (c.tool === 'volume') { const cy = c.thicknessIn ? Math.round(c.value * (c.thicknessIn / 12) / 27 * 100) / 100 : 0; return `${cy.toLocaleString()} CY`; }
  if (c.tool === 'pitch') return `${c.value.toLocaleString()} SF · ${roofingSquares(c.value)} sq`;
  const u = c.kind === 'area' ? 'SF' : c.kind === 'linear' ? 'LF' : 'EA';
  return `${c.value.toLocaleString()} ${u}`;
}

/* ── thin-line CAD glyphs (crisp vector, never emoji) ───────────────────── */
type Glyph = keyof typeof GLYPHS;
const GLYPHS = {
  select: 'M6 4l0 15 4-4 2.6 5 2-0.9-2.5-4.9 5.5 0z',
  pan: 'M12 3v7M12 3l-2.5 2.5M12 3l2.5 2.5M3 12h7M3 12l2.5-2.5M3 12l2.5 2.5M21 12h-7M21 12l-2.5-2.5M21 12l2.5 2.5M12 21v-7M12 21l-2.5-2.5M12 21l2.5 2.5',
  scale: 'M3 8h18v8H3zM6.5 8v4M9.5 8v3M12.5 8v4M15.5 8v3M18 8v4',
  area: 'M4 6l7-2 9 4-3 10-9 1z',
  linear: 'M4 18l6-7 4 3 6-8M4 18v0M20 6v0',
  count: 'M6 6h5v5H6zM13 13h5v5h-5zM6 15l2 2 3-3M15 6l3 3M18 6l-3 3',
  pitch: 'M3 15L12 6l9 9M8 15v4M16 15v4M12 6v4',
  volume: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v9M12 12l8-4.5M12 12l-8-4.5',
  arc: 'M4 19a15 15 0 0 1 16-13M4 19h0M20 6h0M11 8l1.5 2',
  deduction: 'M4 5h16v14H4zM8 12h8',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM11 8v6M8 11h6M16.5 16.5L21 21',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM8 11h6M16.5 16.5L21 21',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  trash: 'M5 7h14M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  magnet: 'M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4zM6 4H10M14 4h4',
  grid: 'M4 4h16v16H4zM4 9h16M4 14h16M9 4v16M14 4v16',
  ortho: 'M5 5v14h14M5 5h4M5 5v4',
  check: 'M5 12l5 5 9-11',
  close: 'M6 6l12 12M18 6L6 18',
  findsim: 'M4 4h5v5H4zM12 4h5v5h-5zM4 12h5v5H4zM14 13a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM18.4 18.4L21 21',
  fillroom: 'M4 4h16v16H4zM9 12h6M9 12l3-3M9 12l3 3M15 8v8',
  sheet: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 15h6M9 18h4',
  addsheet: 'M5 4h9l4 4v6M5 4v16h7M16 16v6M13 19h6',
  pdf: 'M6 3h8l4 4v14H6zM14 3v4h4M8.5 13.5h1a1.2 1.2 0 0 0 0-2.4h-1zM8.5 11.1v5M13 11.1v5h1a1.5 1.5 0 0 0 1.5-1.5v-2a1.5 1.5 0 0 0-1.5-1.5zM17.5 11.1h2M17.5 13.6h1.6M17.5 11.1v5',
} as const;
function G({ g, s = 20, c = 'currentColor', w = 1.7 }: { g: Glyph; s?: number; c?: string; w?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d={GLYPHS[g]} />
    </svg>
  );
}

type TracerTool = MeasureToolKind | 'select' | 'pan' | 'scale' | 'countsim' | 'fillroom';
type ToolDef = { t: TracerTool; g: Glyph; label: string; hint: string };
const TOOLS: ToolDef[] = [
  { t: 'select', g: 'select', label: 'Select / Edit', hint: 'Click a shape to select; drag a vertex to move it; Del removes a vertex.' },
  { t: 'pan', g: 'pan', label: 'Pan', hint: 'Drag to pan. (Hold Space with any tool to pan.)' },
  { t: 'scale', g: 'scale', label: 'Set Scale', hint: 'Click two points a known distance apart, then enter the distance.' },
  { t: 'area', g: 'area', label: 'Area', hint: 'Click the corners; click the first point (or Enter) to close. Net of voids.' },
  { t: 'deduction', g: 'deduction', label: 'Void', hint: 'Draw a hole inside the active/selected area to deduct it.' },
  { t: 'linear', g: 'linear', label: 'Linear', hint: 'Click along the run; per-segment + total. Click start to close a loop.' },
  { t: 'count', g: 'count', label: 'Count', hint: 'Click each item to tally.' },
  { t: 'countsim', g: 'findsim', label: 'Find Similar (Auto-Count)', hint: 'Drag a tight box around one symbol — every matching instance is counted (deterministic template match).' },
  { t: 'fillroom', g: 'fillroom', label: 'Fill Room (Auto-Area)', hint: 'Click inside an enclosed room — the walls are traced and turned into a net-area condition.' },
  { t: 'pitch', g: 'pitch', label: 'Pitch', hint: 'Trace the roof footprint; enter rise (x:12) for true sloped area + squares.' },
  { t: 'volume', g: 'volume', label: 'Volume', hint: 'Trace the footprint; enter depth (or use station areas) for CY.' },
  { t: 'arc', g: 'arc', label: 'Arc', hint: 'Click start, a point on the arc, then end (3-point).' },
];

/* ── component ──────────────────────────────────────────────────────────── */
interface Props {
  planUrl: string;
  dims: { w: number; h: number };
  ppf: number;
  setPpf: (n: number) => void;
  setPlan: (url: string, w: number, h: number) => void;
  conditions: TracerCondition[];
  setConditions: React.Dispatch<React.SetStateAction<TracerCondition[]>>;
  result: TakeoffResult;
  opts: ComputeOpts;
  onClose: () => void;
  /** TARGETED TRACE — when set, finishing a draft measures INTO this existing condition (no new row). */
  targetConditionId?: string;
  /** Fires with the measured value + meta when a targeted trace completes (geometry/sheetId land via setConditions). */
  onSetConditionValue?: (id: string, value: number, meta: Record<string, unknown>) => void;
  /** Sheet-register persistence — register metadata is lifted here on every change (survives unmount). */
  onSheetsChange?: (sheets: PersistedSheet[]) => void;
  /** Reopen with a previously persisted register — deterministic ids reattach sheet-scoped conditions. */
  initialSheets?: PersistedSheet[];
}

type Snap = { conditions: TracerCondition[]; draft: Pt[]; holes: Pt[][] };

export default function PlanTracer({ planUrl, dims, ppf, setPpf, setPlan, conditions, setConditions, result, opts, onClose, targetConditionId, onSetConditionValue, onSheetsChange, initialSheets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });

  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const applyView = useCallback((u: typeof view | ((v: typeof view) => typeof view)) => {
    // update the ref synchronously so rapid same-tick wheel/pan events compound off the latest view
    const nv = typeof u === 'function' ? (u as (v: typeof view) => typeof view)(viewRef.current) : u;
    viewRef.current = nv; setView(nv);
  }, []);

  const [tool, setTool] = useState<TracerTool>(ppf > 0 ? 'area' : 'scale');
  const [draft, setDraft] = useState<Pt[]>([]);
  const [holes, setHoles] = useState<Pt[][]>([]);       // completed voids for the pending area draft
  const [holeDraft, setHoleDraft] = useState<Pt[]>([]); // void being drawn
  const [calib, setCalib] = useState<Pt[]>([]);
  const [knownFt, setKnownFt] = useState('');
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [snapHint, setSnapHint] = useState<'endpoint' | 'ortho' | 'grid' | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // snapping options
  const [snapOn, setSnapOn] = useState(true);
  const [gridOn, setGridOn] = useState(false);
  const [gridFt, setGridFt] = useState('1');

  // finish-condition form
  const [cName, setCName] = useState('');
  const [asm, setAsm] = useState('');
  const [cH, setCH] = useState(''); const [cT, setCT] = useState('');
  const [cOpenSf, setCOpenSf] = useState(''); const [cOpenCt, setCOpenCt] = useState('');
  const [rise, setRise] = useState('4'); const [depthIn, setDepthIn] = useState('4');
  const [stations, setStations] = useState<{ s: string; a: string }[]>([{ s: '0', a: '' }, { s: '', a: '' }]);
  const [volMode, setVolMode] = useState<'depth' | 'stations'>('depth');

  // undo/redo
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);

  // multi-sheet drawing register
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const pdfDocsRef = useRef<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [busy, setBusy] = useState('');

  // auto-count (Find similar) drag-box + region-fill sensitivity
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const boxRef = useRef<{ a: Pt; b: Pt } | null>(null);
  const [cntThresh, setCntThresh] = useState(0.82); // NCC match threshold (0.6 loose → 0.95 exact)
  const [wallThresh, setWallThresh] = useState(0.5); // 0..1 of 255; dark < thr ⇒ wall

  // transient key state
  const shiftRef = useRef(false);
  const spaceRef = useRef(false);
  const dragRef = useRef<{ mode: 'none' | 'pan' | 'vertex' | 'box'; sx: number; sy: number; tx: number; ty: number; cid?: string; idx?: number; ring?: 'outer' | number }>({ mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 });
  // PERF — live vertex-drag geometry lives here, OFF the parent `conditions` state, so a drag no
  // longer re-runs the pricing engine per frame; committed once on pointer-up. draw() overlays it.
  const dragLiveRef = useRef<TracerCondition | null>(null);
  // Undo honesty — the snapshot for a vertex drag is PENDED here at pointer-down and only pushed to
  // `past` on pointer-up if the vertex actually moved (a bare tap must not burn a no-op undo step).
  const pendingSnapRef = useRef<Snap | null>(null);
  // vertex-list pagination (an auto-count can hold 3000 markers — rendering all rows froze the panel)
  const [vtxPage, setVtxPage] = useState(0);
  useEffect(() => { setVtxPage(0); }, [selId]);
  // PERF — rAF-coalesced repaint. draw() reads latest state via drawRef, so multiple state updates
  // in one frame collapse to a single canvas paint (and the decoupled drag repaints off the ref).
  const drawRef = useRef<() => void>(() => {});
  const rafRef = useRef<number | null>(null);
  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return; // one paint per frame
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; drawRef.current(); });
  }, []);

  const engineKind = tool === 'select' || tool === 'pan' || tool === 'scale' || tool === 'countsim' || tool === 'fillroom'
    ? null : engineKindOf(tool);

  /* reset the finish form's default assembly whenever the drawing kind changes */
  useEffect(() => {
    if (engineKind) setAsm((prev) => (asmList(engineKind).some((a) => a.id === prev) ? prev : asmList(engineKind)[0]?.id || ''));
  }, [engineKind]);

  /* ── image load + fit ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!planUrl) { imgRef.current = null; setImgReady(false); return; }
    setImgReady(false); // reset while the new (possibly switched) sheet loads
    const im = new Image();
    im.onload = () => { imgRef.current = im; setImgReady(true); };
    im.src = planUrl;
  }, [planUrl]);

  const fit = useCallback(() => {
    const box = containerRef.current; if (!box || !dims.w) return;
    const w = box.clientWidth, h = box.clientHeight;
    const s = Math.min(w / dims.w, h / dims.h) * 0.96;
    applyView({ scale: s, tx: (w - dims.w * s) / 2, ty: (h - dims.h * s) / 2 });
  }, [dims, applyView]);

  useEffect(() => { if (imgReady && cssSize.w) fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [imgReady, cssSize.w > 0, dims.w]);

  /* ── container size (canvas backing store @ dpr) ───────────────────── */
  useEffect(() => {
    const box = containerRef.current; if (!box) return;
    const ro = new ResizeObserver(() => setCssSize({ w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box); setCssSize({ w: box.clientWidth, h: box.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ── coordinate transforms ─────────────────────────────────────────── */
  const toImg = useCallback((clientX: number, clientY: number): Pt => {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); const { scale, tx, ty } = viewRef.current;
    return { x: (clientX - r.left - tx) / scale, y: (clientY - r.top - ty) / scale };
  }, []);

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const cv = canvasRef.current; if (!cv) return; const r = cv.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top; const { scale, tx, ty } = viewRef.current;
    const ns = clamp(scale * factor, 0.03, 60); const ix = (sx - tx) / scale, iy = (sy - ty) / scale;
    applyView({ scale: ns, tx: sx - ix * ns, ty: sy - iy * ns });
  }, [applyView]);

  /* conditions belonging to the active sheet (undefined sheetId = legacy/global → always shown) */
  const sheetConds = useMemo(
    () => conditions.filter((c) => !c.sheetId || c.sheetId === activeSheet),
    [conditions, activeSheet],
  );

  /* ── all snap targets (image coords), optionally excluding a dragged vertex ── */
  const allVerts = useMemo(() => {
    const out: Pt[] = [];
    for (const c of sheetConds) { if (c.points) out.push(...c.points); if (c.holes) for (const h of c.holes) out.push(...h); }
    out.push(...draft, ...holeDraft);
    return out;
  }, [sheetConds, draft, holeDraft]);

  const snapPoint = useCallback((raw: Pt, prev: Pt | null, exclude?: Pt): { p: Pt; kind: 'endpoint' | 'ortho' | 'grid' | null } => {
    const verts = exclude ? allVerts.filter((v) => v !== exclude) : allVerts;
    if (snapOn) { const pe = snapEndpoint(raw, verts, 11 / viewRef.current.scale); if (pe.x !== raw.x || pe.y !== raw.y) return { p: pe, kind: 'endpoint' }; }
    let p = raw; let kind: 'ortho' | 'grid' | null = null;
    if (shiftRef.current && prev) { p = snapOrtho(prev, p, true); kind = 'ortho'; }
    if (gridOn && ppf > 0) { const g = snapGrid(p, Math.max(0.25, +gridFt || 1), ppf); if (g.x !== p.x || g.y !== p.y) { p = g; kind = kind ?? 'grid'; } }
    return { p, kind };
  }, [allVerts, snapOn, gridOn, gridFt, ppf]);

  /* ── undo/redo ─────────────────────────────────────────────────────── */
  const snapNow = useCallback((): Snap => ({
    conditions: conditions.map((c) => ({ ...c, points: c.points ? c.points.map((p) => ({ ...p })) : undefined, holes: c.holes ? c.holes.map((h) => h.map((p) => ({ ...p }))) : undefined })),
    draft: draft.map((p) => ({ ...p })), holes: holes.map((h) => h.map((p) => ({ ...p }))),
  }), [conditions, draft, holes]);

  const commit = useCallback((fn: () => void) => { setPast((p) => [...p.slice(-49), snapNow()]); setFuture([]); fn(); }, [snapNow]);
  const undo = useCallback(() => {
    setPast((p) => { if (!p.length) return p; const prev = p[p.length - 1]; setFuture((f) => [snapNow(), ...f].slice(0, 50)); setConditions(prev.conditions); setDraft(prev.draft); setHoles(prev.holes); setHoleDraft([]); return p.slice(0, -1); });
  }, [snapNow, setConditions]);
  const redo = useCallback(() => {
    setFuture((f) => { if (!f.length) return f; const nx = f[0]; setPast((p) => [...p, snapNow()].slice(-50)); setConditions(nx.conditions); setDraft(nx.draft); setHoles(nx.holes); setHoleDraft([]); return f.slice(1); });
  }, [snapNow, setConditions]);

  /* ── recompute a condition's value from its (edited) geometry ───────── */
  // SCALE CORRECTNESS: the condition's OWN stored ppf wins over the active sheet's — editing a shape
  // while a differently-calibrated sheet is active must not re-scale its numbers. Only an explicit
  // recalibration of ITS sheet restamps c.ppf (applyScale re-projects that sheet's conditions).
  const recompute = useCallback((c: TracerCondition): TracerCondition => {
    const cp = c.ppf ?? ppf;
    const pts = c.points || []; const t = c.tool || c.kind;
    if (t === 'count') return { ...c, value: pts.length };
    if (t === 'linear') return { ...c, value: lengthLF(pts, cp) };
    if (t === 'arc' && c.arc) { const f = fit3PointArc(pts[0] ?? c.arc.a, pts[1] ?? c.arc.mid, pts[2] ?? c.arc.b, cp); return { ...c, arc: { a: pts[0] ?? c.arc.a, mid: pts[1] ?? c.arc.mid, b: pts[2] ?? c.arc.b }, value: f.arcLenFt }; }
    if (t === 'pitch') return { ...c, value: slopeArea(grossSF(pts, cp), c.riseOver12 ?? 4) };
    if (t === 'volume') return { ...c, value: grossSF(pts, cp) };
    const net = netAreaSF(pts, c.holes || [], cp); return { ...c, value: net.netSF };
  }, [ppf]);

  /* void finishing — attach to the active area draft or the selected area condition.
     Defined BEFORE finishDraft so finishDraft can list it as a real dependency (the old
     dep-suppressed ordering left Enter finishing a void through a stale closure). */
  const finishHole = useCallback(() => {
    if (holeDraft.length < 3) { setMsg('A void needs at least 3 points.'); return; }
    const hole = holeDraft.map((p) => ({ ...p }));
    if (draft.length >= 3) { commit(() => { setHoles((hs) => [...hs, hole]); setHoleDraft([]); }); setMsg('Void added to the active area.'); return; }
    const sel = conditions.find((c) => c.id === selId);
    if (sel && (sel.tool === 'area' || sel.kind === 'area') && sel.points) {
      commit(() => setConditions((cs) => cs.map((c) => c.id === sel.id ? recompute({ ...c, holes: [...(c.holes || []), hole] }) : c)));
      setHoleDraft([]); setMsg('Void deducted from the selected area.'); return;
    }
    setMsg('Start an Area first, or select an area shape, then draw the void inside it.');
    setHoleDraft([]);
  }, [holeDraft, draft, conditions, selId, commit, setConditions, recompute]);

  /* ── finish the active draft → a priced Condition (or, targeted, measure INTO an existing one) ── */
  const finishDraft = useCallback(() => {
    if (!engineKind) return;
    if (tool === 'deduction') { finishHole(); return; }
    if (ppf <= 0 && tool !== 'count') { setMsg('Set the scale first (Scale tool).'); return; }
    const need = tool === 'arc' ? 3 : tool === 'linear' ? 2 : tool === 'count' ? 1 : 3;
    if (draft.length < need) { setMsg(`Need at least ${need} point${need > 1 ? 's' : ''}.`); return; }
    // TARGETED TRACE — the sibling hands us a condition id; the measurement lands on it, no new row,
    // and no assembly pick is required (the target already has one).
    const targeted = !!(targetConditionId && onSetConditionValue);
    if (!targeted && !asm) { setMsg('Pick an assembly.'); return; }
    const a = ASSEMBLIES[asm];
    const base: TracerCondition = { id: uid(), name: cName.trim() || a?.name || 'Condition', kind: engineKind, value: 0, assemblyId: asm, points: draft.map((p) => ({ ...p })), tool: tool as MeasureToolKind, color: divColor(a?.components?.[0]?.csi ?? ''), sheetId: activeSheet || undefined, ppf: ppf > 0 ? ppf : undefined };
    if (+cH > 0) base.heightFt = +cH;
    if (+cOpenSf > 0) base.openingsSf = +cOpenSf;
    if (+cOpenCt > 0) base.openingsCount = +cOpenCt;

    // canonical measured value via the measure.ts dispatcher (same brain as iOS)
    const mc = measureCondition(tool as MeasureToolKind, {
      points: draft, holes, ppf, count: draft.length, riseOver12: +rise || 4,
      depthFt: (+depthIn || 0) / 12, arc: draft.length >= 3 ? { a: draft[0], mid: draft[1], b: draft[2] } : undefined,
    });
    if (tool === 'area') { base.value = mc.value; if (holes.length) base.holes = holes.map((h) => h.map((p) => ({ ...p }))); if (+cT > 0) base.thicknessIn = +cT; }
    else if (tool === 'linear') base.value = mc.value;
    else if (tool === 'count') base.value = mc.value;
    else if (tool === 'pitch') { base.value = mc.value; base.riseOver12 = +rise || 4; }
    else if (tool === 'volume') {
      // store as footprint SF + thickness so computeTakeoff prices the CY through its concrete/earthwork assemblies
      const planSF = grossSF(draft, ppf); base.value = planSF;
      if (volMode === 'stations') {
        const st = stations.map((r) => ({ stationFt: parseFloat(r.s), areaSF: parseFloat(r.a) })).filter((r) => Number.isFinite(r.stationFt) && Number.isFinite(r.areaSF));
        const cy = averageEndAreaCY(st);
        base.thicknessIn = planSF > 0 ? (cy * 27 / planSF) * 12 : 0; base.depthFt = base.thicknessIn / 12;
      } else { base.thicknessIn = +depthIn || 0; base.depthFt = (+depthIn || 0) / 12; }
    } else if (tool === 'arc') { base.value = mc.value; base.arc = { a: draft[0], mid: draft[1], b: draft[2] }; }

    if (targeted) {
      const target = conditions.find((c) => c.id === targetConditionId);
      // traced geometry + scale land on the target through the existing onChange path…
      const patch: Partial<TracerCondition> = { value: base.value, points: base.points, tool: base.tool, sheetId: base.sheetId, ppf: base.ppf };
      if (base.holes) patch.holes = base.holes;
      if (base.arc) patch.arc = base.arc;
      if (base.riseOver12 != null) patch.riseOver12 = base.riseOver12;
      if (base.thicknessIn != null) patch.thicknessIn = base.thicknessIn;
      if (base.depthFt != null) patch.depthFt = base.depthFt;
      commit(() => { setConditions((cs) => cs.map((c) => (c.id === targetConditionId ? { ...c, ...patch } : c))); setDraft([]); setHoles([]); setHoleDraft([]); });
      // …and the measured value + meta go back to the caller
      onSetConditionValue!(targetConditionId!, base.value, {
        tool, kind: engineKind, unit: engineKind === 'area' ? 'SF' : engineKind === 'linear' ? 'LF' : 'EA',
        sheetId: base.sheetId, ppf: base.ppf, points: base.points, holes: base.holes, arc: base.arc,
        riseOver12: base.riseOver12, thicknessIn: base.thicknessIn, depthFt: base.depthFt,
        ...(+cH > 0 ? { heightFt: +cH } : {}), ...(+cOpenSf > 0 ? { openingsSf: +cOpenSf } : {}), ...(+cOpenCt > 0 ? { openingsCount: +cOpenCt } : {}),
      });
      setMsg(`Measured ${target ? `"${target.name}"` : 'condition'} — ${measuredLabel({ ...base, ...patch } as TracerCondition)}.`);
      setSelId(targetConditionId!);
      return;
    }

    commit(() => { setConditions((cs) => [...cs, base]); setDraft([]); setHoles([]); setHoleDraft([]); setCName(''); });
    setMsg(`Added "${base.name}" — ${measuredLabel(base)}.`);
    setSelId(base.id);
  }, [engineKind, tool, ppf, draft, holes, asm, cName, cH, cT, cOpenSf, cOpenCt, rise, depthIn, volMode, stations, commit, setConditions, finishHole, activeSheet, targetConditionId, onSetConditionValue, conditions]);

  /* ── multi-sheet drawing register ─────────────────────────────────────── */
  /* seed the register: from parent-persisted metadata when provided (reopen — sheet-scoped conditions
     reattach by deterministic id), else one entry from whatever plan the tracer opened with */
  useEffect(() => {
    if (sheets.length) return;
    if (initialSheets && initialSheets.length) {
      const seeded: Sheet[] = initialSheets.map((s) => ({ id: s.id, pdfId: '', page: s.page, name: s.name, url: '', w: s.w, h: s.h, ppf: s.ppf, source: s.source }));
      // the parent's current plan (if any) is the raster for the first register entry
      if (planUrl && seeded[0]) seeded[0] = { ...seeded[0], url: planUrl, w: dims.w || seeded[0].w, h: dims.h || seeded[0].h };
      setSheets(seeded); setActiveSheet(seeded[0]?.id || '');
      return;
    }
    if (planUrl) {
      const id = sheetUid('', 1); // deterministic — reopening the same project reattaches sheet-scoped conditions
      setSheets([{ id, pdfId: '', page: 1, name: 'Sheet 1', url: planUrl, w: dims.w, h: dims.h, ppf, source: '' }]);
      setActiveSheet(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planUrl, initialSheets]);

  /* keep the active sheet's stored scale in sync as the user calibrates (never touches other sheets) */
  useEffect(() => {
    if (!activeSheet) return;
    setSheets((ss) => ss.map((s) => (s.id === activeSheet && s.ppf !== ppf ? { ...s, ppf } : s)));
  }, [ppf, activeSheet]);

  /* SHEET REGISTER PERSISTENCE — lift the register metadata to the parent on every change, so the
     sheets (ids, names, per-sheet scales, source refs) survive this component unmounting. */
  const onSheetsChangeRef = useRef(onSheetsChange); onSheetsChangeRef.current = onSheetsChange;
  useEffect(() => {
    if (!sheets.length) return;
    onSheetsChangeRef.current?.(sheets.map(({ id, name, page, ppf: sppf, w, h, source }) => ({ id, name, page, ppf: sppf, w, h, source })));
  }, [sheets]);

  /* render a PDF page to a crisp raster (~PDF_LONG_EDGE long edge) → data URL + dims */
  const renderPdfPageToDataUrl = useCallback(async (pdf: any, n: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const s = Math.min(4, Math.max(1, PDF_LONG_EDGE / Math.max(base.width, base.height)));
    const vp = page.getViewport({ scale: s });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
    return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
  }, []);

  /* switch the active sheet (lazily rendering an un-rendered PDF page on first visit) */
  const goSheet = useCallback(async (id: string) => {
    let s = sheets.find((x) => x.id === id); if (!s || id === activeSheet) return;
    setSelId(null); setDraft([]); setHoles([]); setHoleDraft([]); setCalib([]); setBox(null); boxRef.current = null;
    if (!s.url) {
      const doc = pdfDocsRef.current[s.pdfId];
      // persisted register entry whose file isn't loaded this session — never switch to a blank plan
      if (!doc) { setMsg(`"${s.name}" isn't loaded in this session — Add ${s.source || 'its file'} again and it re-attaches (same sheet ids; its conditions and scale are intact).`); return; }
      setBusy('Rendering sheet…');
      try { const r = await renderPdfPageToDataUrl(doc, s.page); s = { ...s, url: r.url, w: r.w, h: r.h }; setSheets((ss) => ss.map((x) => (x.id === id ? s! : x))); }
      catch (e) { console.error(e); setMsg("Couldn't render that page. Re-export a flattened PDF or a PNG and try again."); setBusy(''); return; }
      setBusy('');
    }
    setActiveSheet(id);
    setPlan(s.url, s.w, s.h);
    setPpf(s.ppf);
    setTool(s.ppf > 0 ? 'area' : 'scale');
  }, [sheets, activeSheet, renderPdfPageToDataUrl, setPlan, setPpf]);

  /* open a PDF plan set → one register entry per page (page 1 rendered now, rest lazily) */
  const openPdf = useCallback(async (file: File) => {
    setBusy('Rendering PDF…'); setMsg('');
    try {
      const pdfjs = await import('pdfjs-dist');
      // static worker path — the heatmap uses the exact same setup; do NOT use new URL(...,import.meta.url) (breaks next build)
      (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; // eslint-disable-line @typescript-eslint/no-explicit-any
      const buf = await file.arrayBuffer();
      const pdf = await (pdfjs as any).getDocument({ data: buf }).promise; // eslint-disable-line @typescript-eslint/no-explicit-any
      // DETERMINISTIC ids (hash of file name + page) — re-adding the same plan set merges into the
      // persisted register entries instead of duplicating, so their conditions + scales reattach.
      const pdfId = sheetUid(file.name, 0); pdfDocsRef.current[pdfId] = pdf;
      const base = file.name.replace(/\.[^.]+$/, '');
      const first = await renderPdfPageToDataUrl(pdf, 1);
      const firstId = sheetUid(file.name, 1);
      const prior = sheets.find((x) => x.id === firstId); // reattach → keep the stored calibration
      setSheets((ss) => {
        const next = [...ss];
        for (let p = 1; p <= pdf.numPages; p++) {
          const id = sheetUid(file.name, p);
          const url = p === 1 ? first.url : '', w = p === 1 ? first.w : 0, h = p === 1 ? first.h : 0;
          const i = next.findIndex((x) => x.id === id);
          if (i >= 0) next[i] = { ...next[i], pdfId, url: url || next[i].url, w: w || next[i].w, h: h || next[i].h, source: file.name };
          else next.push({ id, pdfId, page: p, name: pdf.numPages > 1 ? `${base} · p${p}` : base, url, w, h, ppf: 0, source: file.name });
        }
        return next;
      });
      setActiveSheet(firstId); setPlan(first.url, first.w, first.h);
      const keepPpf = prior?.ppf ?? 0;
      setPpf(keepPpf); setTool(keepPpf > 0 ? 'area' : 'scale');
      setMsg(prior
        ? `Re-attached ${pdf.numPages} sheet${pdf.numPages > 1 ? 's' : ''} — stored scales and conditions are back.`
        : `Loaded ${pdf.numPages} sheet${pdf.numPages > 1 ? 's' : ''} — set the scale on this sheet, then trace.`);
    } catch (e) { console.error(e); setMsg("Couldn't read that PDF. Re-export a flattened PDF or a PNG and try again."); }
    setBusy('');
  }, [sheets, renderPdfPageToDataUrl, setPlan, setPpf]);

  /* decode a phone-photo/scan format the browser can't render (HEIC/HEIF, TIFF, stubborn WEBP)
     server-side (/api/takeoff/decode-image → sharp) → PNG data-URL, then add it as a sheet. */
  const decodeAndAddSheet = useCallback(async (file: File) => {
    setBusy(`Decoding ${file.name}…`); setMsg('');
    try {
      const b64: string = await new Promise((res, rej) => {
        const rd = new FileReader(); rd.onload = () => res(rd.result as string); rd.onerror = rej; rd.readAsDataURL(file);
      });
      // same-origin fetch → cookies (auth) ride along automatically
      const resp = await fetch('/api/takeoff/decode-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: b64 }) });
      const d = await resp.json().catch(() => ({ ok: false, error: 'Bad response from the decoder.' }));
      if (!d.ok || !d.dataUrl) { setMsg(d.error || `Couldn't decode ${file.name}. Export it as PDF, PNG, or JPG.`); setBusy(''); return; }
      const id = sheetUid(file.name, 1); const name = file.name.replace(/\.[^.]+$/, '');
      const prior = sheets.find((x) => x.id === id); // re-added file → reattach (keep the stored calibration)
      setSheets((ss) => (ss.some((x) => x.id === id)
        ? ss.map((x) => (x.id === id ? { ...x, url: d.dataUrl, w: d.width || x.w, h: d.height || x.h, source: file.name } : x))
        : [...ss, { id, pdfId: '', page: 1, name, url: d.dataUrl, w: d.width || 0, h: d.height || 0, ppf: 0, source: file.name }]));
      setActiveSheet(id); setPlan(d.dataUrl, d.width || 0, d.height || 0);
      const keepPpf = prior?.ppf ?? 0; setPpf(keepPpf); setTool(keepPpf > 0 ? 'area' : 'scale');
      setMsg(prior ? `Re-attached ${file.name} — its scale and conditions are back.` : `Decoded ${file.name} — set the scale on this sheet, then trace.`);
    } catch (e) { console.error(e); setMsg(`Couldn't decode ${file.name}. Try a PNG or JPG export of the sheet.`); }
    setBusy('');
  }, [sheets, setPlan, setPpf]);

  /* blob object URLs created for raster sheets — revoked on unmount (they leaked before) */
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => () => { for (const u of objectUrlsRef.current) URL.revokeObjectURL(u); objectUrlsRef.current = []; }, []);

  /* add a raster image as a new register entry (deterministic id — re-adding the same file reattaches) */
  const addImageSheet = useCallback((file: File) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      objectUrlsRef.current.push(url);
      const id = sheetUid(file.name, 1); const name = file.name.replace(/\.[^.]+$/, '');
      const prior = sheets.find((x) => x.id === id); // re-added file → reattach (keep the stored calibration)
      setSheets((ss) => (ss.some((x) => x.id === id)
        ? ss.map((x) => (x.id === id ? { ...x, url, w: im.naturalWidth, h: im.naturalHeight, source: file.name } : x))
        : [...ss, { id, pdfId: '', page: 1, name, url, w: im.naturalWidth, h: im.naturalHeight, ppf: 0, source: file.name }]));
      setActiveSheet(id); setPlan(url, im.naturalWidth, im.naturalHeight);
      const keepPpf = prior?.ppf ?? 0; setPpf(keepPpf); setTool(keepPpf > 0 ? 'area' : 'scale');
    };
    // the browser couldn't render it (e.g. some WEBP/TIFF variants) → fall back to server-side decode
    im.onerror = () => { URL.revokeObjectURL(url); decodeAndAddSheet(file); };
    im.src = url;
  }, [sheets, setPlan, setPpf, decodeAndAddSheet]);

  /* one file input → PDF plan-set, browser-native raster, or server-decoded phone-photo format */
  const onAddFile = useCallback((file: File | undefined) => {
    if (!file) return;
    const ext = (file.name.toLowerCase().split('.').pop() || '');
    if (file.type === 'application/pdf' || ext === 'pdf') openPdf(file);
    else if (/^(heic|heif|tif|tiff)$/i.test(ext)) decodeAndAddSheet(file);   // browser can't render → decode server-side
    else if (/^(dwg|dxf|dwf|rvt)$/i.test(ext)) setMsg(`${file.name} is a CAD/vector file — use "Import DXF" on the takeoff page for exact quantities, or export a PDF/PNG to trace.`);
    else addImageSheet(file);   // PNG/JPG/WEBP → browser-native (auto-falls back to decode on error)
  }, [openPdf, addImageSheet, decodeAndAddSheet]);

  /* ── grayscale/binary raster from the FULL plan image (not the zoomed viewport) ── */
  const buildGray = useCallback((scale: number): { data: Uint8Array; w: number; h: number } | null => {
    const im = imgRef.current; if (!im) return null;
    const iw = Math.max(1, Math.round(dims.w * scale)), ih = Math.max(1, Math.round(dims.h * scale));
    const off = document.createElement('canvas'); off.width = iw; off.height = ih;
    const octx = off.getContext('2d', { willReadFrequently: true }); if (!octx) return null;
    octx.drawImage(im as CanvasImageSource, 0, 0, iw, ih);
    let px: Uint8ClampedArray;
    try { px = octx.getImageData(0, 0, iw, ih).data; } catch { return null; } // tainted canvas guard
    const g = new Uint8Array(iw * ih);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114) | 0;
    return { data: g, w: iw, h: ih };
  }, [dims]);

  /* ── AUTO-COUNT: template-match one symbol across the whole sheet (findMatches) ── */
  const runCount = useCallback(async (bx: { a: Pt; b: Pt } | null) => {
    setBox(null); boxRef.current = null;
    if (!bx) return;
    if (!imgReady || !imgRef.current) { setMsg('Plan still loading — try again in a moment.'); return; }
    const x0 = Math.min(bx.a.x, bx.b.x), y0 = Math.min(bx.a.y, bx.b.y), x1 = Math.max(bx.a.x, bx.b.x), y1 = Math.max(bx.a.y, bx.b.y);
    if (x1 - x0 < 5 || y1 - y0 < 5) { setMsg('Draw a tight box around a single symbol.'); return; }
    setBusy('Scanning the sheet for matches…');
    await new Promise((r) => setTimeout(r, 20)); // let the busy overlay paint before the heavy NCC loop
    try {
      const maxEdge = Math.max(dims.w, dims.h);
      const scale = Math.min(1, COUNT_WORK_EDGE / maxEdge);
      const gray = buildGray(scale);
      if (!gray) { setMsg('Could not read the plan pixels (image blocked cross-origin).'); setBusy(''); return; }
      const tpl = { x: Math.max(0, Math.round(x0 * scale)), y: Math.max(0, Math.round(y0 * scale)), w: Math.round((x1 - x0) * scale), h: Math.round((y1 - y0) * scale) };
      const step = gray.w * gray.h > 500_000 ? 2 : 1; // coarser sweep on big sheets (perf)
      const matches = findMatches(gray, tpl, { threshold: cntThresh, maxMatches: 3000, step });
      if (!matches.length) { setMsg('No matches — draw a tighter box or lower the sensitivity.'); setBusy(''); return; }
      const pts = matches.map((m) => ({ x: m.x / scale, y: m.y / scale })); // work-coords → image px
      const asmId = asmList('count')[0]?.id || '';
      const cond: TracerCondition = {
        id: uid(), name: `Auto-count ×${pts.length}`, kind: 'count', value: pts.length, assemblyId: asmId,
        points: pts, tool: 'count', color: divColor(csiOfAsm(asmId)), sheetId: activeSheet || undefined,
      };
      commit(() => setConditions((cs) => [...cs, cond]));
      setSelId(cond.id); setTool('select');
      setMsg(`Found ${pts.length} matches → Select is active; delete any false positives from the vertex list.`);
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setBusy('');
  }, [imgReady, dims, cntThresh, activeSheet, buildGray, commit, setConditions]);

  /* ── REGION-FILL: flood an enclosed room from a seed → Area condition (fillRegion) ── */
  const runFill = useCallback(async (seed: Pt) => {
    if (!imgReady || !imgRef.current) { setMsg('Plan still loading — try again in a moment.'); return; }
    if (ppf <= 0) { setMsg('Set the scale first (Scale tool) so the room prices in SF.'); return; }
    setBusy('Tracing the room…');
    await new Promise((r) => setTimeout(r, 20));
    try {
      const maxEdge = Math.max(dims.w, dims.h);
      const scale = Math.min(1, FILL_WORK_EDGE / maxEdge);
      const gray = buildGray(scale);
      if (!gray) { setMsg('Could not read the plan pixels (image blocked cross-origin).'); setBusy(''); return; }
      const thr = Math.round(clamp(wallThresh, 0.05, 0.95) * 255);
      const bin = new Uint8Array(gray.w * gray.h);
      for (let i = 0; i < bin.length; i++) bin[i] = gray.data[i] < thr ? 1 : 0; // dark pixel = wall/line
      const sx = Math.round(seed.x * scale), sy = Math.round(seed.y * scale);
      if (sx < 0 || sy < 0 || sx >= gray.w || sy >= gray.h) { setMsg('Click inside the plan.'); setBusy(''); return; }
      if (bin[sy * gray.w + sx]) { setMsg('That point is on a wall/line — click in open floor, or lower wall sensitivity.'); setBusy(''); return; }
      const region = fillRegion({ data: bin, w: gray.w, h: gray.h }, { x: sx, y: sy }, { simplifyTol: 1.5 });
      if (region.polygon.length < 3) { setMsg('Couldn’t trace a room there — try another point.'); setBusy(''); return; }
      if (region.area > gray.w * gray.h * 0.6) { setMsg('The fill leaked out (open doorway?). Close the gap or raise wall sensitivity.'); setBusy(''); return; }
      const pts = region.polygon.map((p) => ({ x: p.x / scale, y: p.y / scale })); // work-coords → image px
      const asmId = asmList('area')[0]?.id || '';
      const mc = measureCondition('area', { points: pts, holes: [], ppf, count: pts.length });
      const cond: TracerCondition = {
        id: uid(), name: 'Room fill', kind: 'area', value: mc.value, assemblyId: asmId,
        points: pts, holes: [], tool: 'area', color: divColor(csiOfAsm(asmId)), sheetId: activeSheet || undefined, ppf,
      };
      commit(() => setConditions((cs) => [...cs, cond]));
      setSelId(cond.id); setTool('select');
      setMsg(`Room traced — ${mc.value.toLocaleString()} SF (net-of-voids ready; add voids with the Void tool).`);
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setBusy('');
  }, [imgReady, ppf, dims, wallThresh, activeSheet, buildGray, commit, setConditions]);

  /* ── hit-testing (screen space) ────────────────────────────────────── */
  const S = useCallback((p: Pt) => { const { scale, tx, ty } = viewRef.current; return { x: p.x * scale + tx, y: p.y * scale + ty }; }, []);
  const hitVertex = useCallback((sx: number, sy: number) => {
    for (const c of sheetConds) {
      if (!c.points) continue;
      for (let i = 0; i < c.points.length; i++) { const s = S(c.points[i]); if (Math.hypot(s.x - sx, s.y - sy) <= 9) return { cid: c.id, idx: i, ring: 'outer' as const }; }
      if (c.holes) for (let hi = 0; hi < c.holes.length; hi++) for (let i = 0; i < c.holes[hi].length; i++) { const s = S(c.holes[hi][i]); if (Math.hypot(s.x - sx, s.y - sy) <= 9) return { cid: c.id, idx: i, ring: hi }; }
    }
    return null;
  }, [sheetConds, S]);
  const hitCondition = useCallback((img: Pt) => {
    for (const c of sheetConds) {
      if (c.points && (c.kind === 'area' || c.tool === 'pitch' || c.tool === 'volume') && c.points.length >= 3) { if (pointInPoly(img, c.points)) return c.id; }
    }
    // near a polyline / marker
    for (const c of sheetConds) {
      if (!c.points) continue;
      for (let i = 0; i < c.points.length; i++) { const s = S(c.points[i]); const ss = S(img); if (Math.hypot(s.x - ss.x, s.y - ss.y) <= 14) return c.id; }
    }
    return null;
  }, [sheetConds, S]);

  /* ── pointer handlers ──────────────────────────────────────────────── */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const panning = tool === 'pan' || spaceRef.current || e.button === 1;
    if (panning) { dragRef.current = { mode: 'pan', sx, sy, tx: viewRef.current.tx, ty: viewRef.current.ty }; return; }
    if (e.button !== 0) return;
    const img = toImg(e.clientX, e.clientY);

    if (tool === 'countsim') { dragRef.current = { mode: 'box', sx, sy, tx: 0, ty: 0 }; boxRef.current = { a: img, b: img }; setBox({ a: img, b: img }); return; }
    if (tool === 'fillroom') { runFill(img); return; }
    if (tool === 'scale') {
      const next = [...calib, img].slice(-2); setCalib(next); setKnownFt(''); setMsg(next.length < 2 ? 'Click the second point.' : 'Enter the known distance below.'); return;
    }
    if (tool === 'select') {
      const hv = hitVertex(sx, sy);
      // Snapshot is PENDED, not pushed — a bare tap on a vertex must not burn a no-op undo step;
      // onPointerUp pushes it only if the vertex actually moved.
      if (hv) { dragRef.current = { mode: 'vertex', sx, sy, tx: 0, ty: 0, cid: hv.cid, idx: hv.idx, ring: hv.ring }; setSelId(hv.cid); pendingSnapRef.current = snapNow(); return; }
      setSelId(hitCondition(img)); return;
    }
    // drawing tools
    if (tool === 'deduction') {
      const prev = holeDraft[holeDraft.length - 1] ?? null; const { p, kind } = snapPoint(img, prev); setSnapHint(kind);
      if (holeDraft.length >= 3 && near(S(p), S(holeDraft[0]))) { finishHole(); return; }
      setHoleDraft((d) => [...d, p]); return;
    }
    const prev = draft[draft.length - 1] ?? null; const { p, kind } = snapPoint(img, prev); setSnapHint(kind);
    if ((tool === 'area' || tool === 'pitch' || tool === 'volume') && draft.length >= 3 && near(S(p), S(draft[0]))) { setDraft((d) => [...d]); finishDraft(); return; }
    if (tool === 'linear' && draft.length >= 2 && near(S(p), S(draft[0]))) { setDraft((d) => [...d, draft[0]]); setMsg('Loop closed.'); return; }
    if (tool === 'arc' && draft.length >= 3) return;
    setDraft((d) => [...d, p]);
  }, [tool, calib, draft, holeDraft, toImg, snapPoint, hitVertex, hitCondition, finishDraft, finishHole, runFill, S, snapNow]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const d = dragRef.current;
    if (d.mode === 'pan') { applyView((v) => ({ ...v, tx: d.tx + (sx - d.sx), ty: d.ty + (sy - d.sy) })); return; }
    if (d.mode === 'box') { const img = toImg(e.clientX, e.clientY); const b = { a: boxRef.current?.a ?? img, b: img }; boxRef.current = b; setBox(b); return; }
    if (d.mode === 'vertex' && d.cid) {
      const img = toImg(e.clientX, e.clientY);
      // Snap exclusion uses the ORIGINAL committed vertex (still in allVerts, since conditions is
      // untouched during the drag). Geometry is edited on a LOCAL copy (dragLiveRef), NOT the parent
      // state — the engine reprices only on release. draw() overlays this condition from the ref.
      const committed = conditions.find((c) => c.id === d.cid);
      if (!committed) return;
      const excluded = committed.points?.[d.idx!];
      const { p, kind } = snapPoint(img, null, excluded); setSnapHint(kind);
      const src = dragLiveRef.current && dragLiveRef.current.id === d.cid ? dragLiveRef.current : committed;
      let edited: TracerCondition;
      if (d.ring === 'outer') { const pts = [...(src.points || [])]; pts[d.idx!] = p; edited = recompute({ ...src, points: pts }); }
      else { const hs = (src.holes || []).map((h) => [...h]); if (hs[d.ring as number]) hs[d.ring as number][d.idx!] = p; edited = recompute({ ...src, holes: hs }); }
      dragLiveRef.current = edited;
      scheduleDraw();
      return;
    }
    // hover: rubber-band + snap preview
    const img = toImg(e.clientX, e.clientY);
    if (tool === 'deduction') { const prev = holeDraft[holeDraft.length - 1] ?? null; const { p, kind } = snapPoint(img, prev); setCursor(p); setSnapHint(kind); return; }
    if (tool === 'area' || tool === 'linear' || tool === 'pitch' || tool === 'volume' || tool === 'arc') { const prev = draft[draft.length - 1] ?? null; const { p, kind } = snapPoint(img, prev); setCursor(p); setSnapHint(kind); return; }
    // In Select the cursor isn't drawn (no rubber-band) — only its hit/no-hit truthiness matters for
    // the pointer style. Keep the same reference while the hover state is unchanged so draw() (dep:
    // cursor) doesn't repaint on every idle mouse move over the plan.
    if (tool === 'select') { const hit = !!hitVertex(sx, sy); setCursor((prev) => (!!prev === hit ? prev : (hit ? img : null))); return; }
    setCursor(img);
  }, [applyView, toImg, conditions, snapPoint, recompute, tool, draft, holeDraft, hitVertex, scheduleDraw]);

  const onPointerUp = useCallback(() => {
    if (dragRef.current.mode === 'vertex') {
      // Commit the dragged geometry to the parent ONCE — the engine reprices here, not per frame.
      // Only a REAL move commits + pushes the pended undo snapshot: a bare tap (or a drag that
      // snapped back to its start) leaves history and state untouched.
      const d = dragRef.current; const dc = dragLiveRef.current;
      if (dc) {
        const orig = conditions.find((c) => c.id === d.cid);
        const before = d.ring === 'outer' ? orig?.points?.[d.idx!] : orig?.holes?.[d.ring as number]?.[d.idx!];
        const after = d.ring === 'outer' ? dc.points?.[d.idx!] : dc.holes?.[d.ring as number]?.[d.idx!];
        if (before && after && (before.x !== after.x || before.y !== after.y)) {
          const snap = pendingSnapRef.current;
          if (snap) { setPast((p) => [...p.slice(-49), snap]); setFuture([]); }
          setConditions((cs) => cs.map((c) => (c.id === dc.id ? dc : c)));
          setMsg('Vertex moved.');
        }
      }
      dragLiveRef.current = null; pendingSnapRef.current = null;
      scheduleDraw(); // repaint from committed state (clears any live overlay from a reverted drag)
    }
    if (dragRef.current.mode === 'box') { dragRef.current = { mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 }; runCount(boxRef.current); return; }
    dragRef.current = { mode: 'none', sx: 0, sy: 0, tx: 0, ty: 0 };
  }, [runCount, setConditions, conditions, scheduleDraw]);
  const onDoubleClick = useCallback(() => { if (tool === 'deduction') finishHole(); else finishDraft(); }, [tool, finishDraft, finishHole]);

  /* ── wheel zoom (non-passive) ──────────────────────────────────────── */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [zoomAt, planUrl]);

  /* defined before the keyboard effect so Delete never fires a stale closure */
  const deleteSelectedVertexOrCondition = useCallback(() => {
    if (!selId) return;
    // if a vertex is hovered/selected we can't know without a stored idx; delete last-hovered near cursor
    const c = conditions.find((x) => x.id === selId); if (!c) return;
    commit(() => setConditions((cs) => cs.filter((x) => x.id !== selId)));
    setSelId(null); setMsg('Condition deleted.');
  }, [selId, conditions, commit, setConditions]);

  /* ── keyboard ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true;
      if (e.key === ' ') { spaceRef.current = true; }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Enter') { e.preventDefault(); finishDraft(); }
      else if (e.key === 'Escape') { if (draft.length || holeDraft.length) { setDraft([]); setHoles([]); setHoleDraft([]); setMsg('Cleared draft.'); } else onClose(); }
      else if (e.key === 'Backspace') { e.preventDefault(); if (holeDraft.length) setHoleDraft((d) => d.slice(0, -1)); else if (draft.length) setDraft((d) => d.slice(0, -1)); }
      else if ((e.key === 'Delete') && selId) { deleteSelectedVertexOrCondition(); }
      else if (e.key.toLowerCase() === 'f') fit();
    };
    const ku = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false; if (e.key === ' ') spaceRef.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, finishDraft, fit, draft, holeDraft, selId, onClose, deleteSelectedVertexOrCondition]);

  /* delete a specific vertex (from the panel) */
  const deleteVertex = useCallback((cid: string, idx: number) => {
    commit(() => setConditions((cs) => cs.map((c) => {
      if (c.id !== cid || !c.points) return c;
      const minPts = c.kind === 'area' ? 3 : c.kind === 'linear' ? 2 : 1;
      if (c.points.length <= minPts) return c;
      return recompute({ ...c, points: c.points.filter((_, i) => i !== idx) });
    })));
  }, [commit, setConditions, recompute]);

  /* bulk-delete one page of vertices (auto-count cleanup) — always leaves the geometric minimum */
  const deleteVertexRange = useCallback((cid: string, start: number, end: number) => {
    commit(() => setConditions((cs) => cs.map((c) => {
      if (c.id !== cid || !c.points) return c;
      const minPts = c.kind === 'area' ? 3 : c.kind === 'linear' ? 2 : 1;
      let kept = c.points.filter((_, i) => i < start || i >= end);
      if (kept.length < minPts) kept = [...c.points.slice(0, start), ...c.points.slice(start, start + (minPts - kept.length)), ...c.points.slice(end)];
      return recompute({ ...c, points: kept });
    })));
  }, [commit, setConditions, recompute]);

  /* ── set scale from calibration ────────────────────────────────────── */
  const applyScale = () => {
    if (calib.length < 2) { setMsg('Click two points first.'); return; }
    const ft = parseFloat(knownFt); if (!(ft > 0)) { setMsg('Enter a positive distance.'); return; }
    const p = pxPerFt(calib[0], calib[1], ft); setPpf(p);
    // SCALE CORRECTNESS: recalibrating THIS sheet re-projects every scale-bearing condition on it —
    // stored ppf restamped to the new scale, values recomputed from the unchanged pixel geometry.
    // Counts are scale-free and other sheets' conditions (own stored ppf) are untouched.
    const onThis = (c: TracerCondition) => (!c.sheetId || c.sheetId === activeSheet) && !!c.points?.length && (c.tool ?? c.kind) !== 'count';
    const n = conditions.filter(onThis).length;
    if (n > 0) commit(() => setConditions((cs) => cs.map((c) => (onThis(c) ? recompute({ ...c, ppf: p }) : c))));
    const sanity = calibrationSanity(p, dims.w, dims.h);
    const re = n > 0 ? ` ${n} condition${n === 1 ? '' : 's'} re-measured at the new scale.` : '';
    setMsg((sanity.ok ? `Scale set — ${p.toFixed(2)} px/ft (sheet ≈ ${sanity.impliedWidthFt}×${sanity.impliedHeightFt} ft).` : `Scale set, but ${sanity.warning}`) + re);
    setCalib([]); setKnownFt(''); setTool('area');
  };

  /* ── live measurement readout for the active draft ─────────────────── */
  const live = useMemo(() => {
    if (!engineKind) return null;
    if (tool === 'count') return { value: draft.length, unit: 'EA', extra: '' };
    if (ppf <= 0) return null;
    if (tool === 'area') { const net = netAreaSF(draft.length >= 3 ? draft : [], holes, ppf); return { value: net.netSF, unit: 'SF', extra: draft.length >= 3 ? `gross ${net.grossSF} − voids ${net.holesSF} · perim ${perimeterLF(draft, ppf)} LF · ${toSY(net.netSF)} SY` : '' }; }
    if (tool === 'linear') { const segs = segmentLengthsLF(draft, ppf); return { value: lengthLF(draft, ppf), unit: 'LF', extra: segs.length ? `${segs.length} segs · last ${segs[segs.length - 1]} LF` : '' }; }
    if (tool === 'pitch') { const plan = grossSF(draft.length >= 3 ? draft : [], ppf); const sl = slopeArea(plan, +rise || 4); return { value: sl, unit: 'SF', extra: `plan ${plan} SF × ${slopeFactorPitch(+rise || 4)} · ${roofingSquares(sl)} squares` }; }
    if (tool === 'volume') {
      const plan = grossSF(draft.length >= 3 ? draft : [], ppf);
      if (volMode === 'stations') { const st = stations.map((r) => ({ stationFt: parseFloat(r.s), areaSF: parseFloat(r.a) })).filter((r) => Number.isFinite(r.stationFt) && Number.isFinite(r.areaSF)); const cy = averageEndAreaCY(st); return { value: cy, unit: 'CY', extra: `avg-end-area · ${st.length} stations · footprint ${plan} SF` }; }
      const cy = prismCY(plan, (+depthIn || 0) / 12); return { value: cy, unit: 'CY', extra: `${plan} SF × ${depthIn || 0}" deep` };
    }
    if (tool === 'arc' && draft.length >= 3) { const f = fit3PointArc(draft[0], draft[1], draft[2], ppf); return { value: f.arcLenFt, unit: 'LF', extra: f.ok ? `R ${f.radiusFt} ft · seg area ${f.segmentAreaSF} SF` : 'need 3 non-collinear points' }; }
    return { value: 0, unit: engineKind === 'linear' ? 'LF' : 'SF', extra: '' };
  }, [engineKind, tool, draft, holes, ppf, rise, depthIn, volMode, stations]);

  /* ── canvas draw ───────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return; const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(cssSize.w * dpr) || cv.height !== Math.round(cssSize.h * dpr)) { cv.width = Math.round(cssSize.w * dpr); cv.height = Math.round(cssSize.h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize.w, cssSize.h);
    ctx.fillStyle = CANVAS_BG; ctx.fillRect(0, 0, cssSize.w, cssSize.h);
    const { scale, tx, ty } = view;
    const img = imgRef.current;
    // Smoothing off while a gesture is live — a smoothed full-res rescale is the single most
    // expensive op in the paint; drop it during pan/drag for a snappier blit, restore on release.
    if (img) { ctx.imageSmoothingEnabled = dragRef.current.mode === 'none'; ctx.drawImage(img, tx, ty, dims.w * scale, dims.h * scale); }
    const sc = (p: Pt) => ({ x: p.x * scale + tx, y: p.y * scale + ty });

    // foot grid
    if (gridOn && ppf > 0 && scale * ppf * (+gridFt || 1) > 7) {
      const g = Math.max(0.25, +gridFt || 1) * ppf; ctx.strokeStyle = 'rgba(251,191,36,0.12)'; ctx.lineWidth = 1;
      const x0 = Math.floor((-tx / scale) / g) * g, x1 = (-tx + cssSize.w) / scale, y0 = Math.floor((-ty / scale) / g) * g, y1 = (-ty + cssSize.h) / scale;
      ctx.beginPath(); for (let x = x0; x < x1; x += g) { const a = sc({ x, y: y0 }), b = sc({ x, y: y1 }); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      for (let y = y0; y < y1; y += g) { const a = sc({ x: x0, y }), b = sc({ x: x1, y }); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } ctx.stroke();
    }

    // in-shape cost HUD: sum priced line items per condition (Bluebeam-style $ on the plan)
    const costMap = new Map<string, number>();
    for (const l of result.lines) costMap.set(l.conditionId, (costMap.get(l.conditionId) || 0) + l.totalCents);

    // committed conditions (coverage) — only the active sheet's. The vertex being dragged is
    // overlaid live from dragLiveRef (its geometry isn't in `conditions` until pointer-up).
    for (const c0 of sheetConds) {
      const c = dragLiveRef.current && dragLiveRef.current.id === c0.id ? dragLiveRef.current : c0;
      if (!c.points || !c.points.length) continue;
      const col = condColor(c); const sel = c.id === selId;
      const isArea = c.kind === 'area' || c.tool === 'pitch' || c.tool === 'volume';
      const pts = c.points.map(sc);
      ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = col; ctx.lineJoin = 'round';
      if (c.tool === 'count') {
        if (pts.length > 300) {
          // heat-dot layer — a 3000-match auto-count paints as cheap squares (no per-point arc/stroke/state churn)
          ctx.fillStyle = col; ctx.globalAlpha = sel ? 0.95 : 0.8;
          for (const p of pts) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
          ctx.globalAlpha = 1;
        } else {
          for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = col; }
        }
      } else if (c.tool === 'arc' && c.arc) {
        drawArc(ctx, sc(c.arc.a), sc(c.arc.mid), sc(c.arc.b), col, sel ? 3 : 2);
      } else {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (isArea) { ctx.closePath(); ctx.fillStyle = col; ctx.globalAlpha = sel ? 0.22 : 0.13; ctx.fill(); ctx.globalAlpha = 1; }
        ctx.stroke();
        // voids
        if (c.holes) for (const h of c.holes) { const hp = h.map(sc); ctx.beginPath(); ctx.moveTo(hp[0].x, hp[0].y); for (let i = 1; i < hp.length; i++) ctx.lineTo(hp[i].x, hp[i].y); ctx.closePath(); ctx.fillStyle = 'rgba(248,113,113,0.18)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = col; }
      }
      // vertices when selected — capped at 300 handles (an uncapped 3000-marker auto-count froze the paint;
      // above the cap the heat-dot layer above is the selection affordance and the vertex list paginates)
      if (sel && pts.length <= 300) for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 7); ctx.fillStyle = CANVAS_GOLD; ctx.fill(); ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 1.5; ctx.stroke(); }
      // per-segment length HUD on the selected linear run (the "feels like Bluebeam" lever)
      if (sel && !isArea && c.tool !== 'count' && c.tool !== 'arc' && ppf > 0 && c.points.length >= 2) {
        const segs = segmentLengthsLF(c.points, ppf);
        for (let i = 0; i < pts.length - 1 && i < segs.length; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          segTag(ctx, `${segs[i].toFixed(1)}′`, mx, my, col);
        }
      }
      // label — name · measured value · IN-SHAPE COST
      const anchor = isArea ? centroidS(pts) : pts[Math.floor(pts.length / 2)] || pts[0];
      const cCost = costMap.get(c.id) || 0;
      labelChip(ctx, cCost > 0 ? `${c.name} · ${measuredLabel(c)} · ${usd(cCost)}` : `${c.name} · ${measuredLabel(c)}`, anchor.x, anchor.y, col);
    }

    // active area voids (draft)
    for (const h of holes) { const hp = h.map(sc); ctx.beginPath(); ctx.moveTo(hp[0].x, hp[0].y); for (let i = 1; i < hp.length; i++) ctx.lineTo(hp[i].x, hp[i].y); ctx.closePath(); ctx.fillStyle = 'rgba(248,113,113,0.2)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = RED; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]); }

    // active draft
    const drawPts = draft.map(sc);
    if (drawPts.length) {
      const isArea = tool === 'area' || tool === 'pitch' || tool === 'volume';
      ctx.strokeStyle = CANVAS_CYAN; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      if (tool === 'count') {
        for (const p of drawPts) { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fillStyle = CANVAS_CYAN; ctx.fill(); ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 1.4; ctx.stroke(); }
      } else if (tool === 'arc' && drawPts.length >= 3) {
        drawArc(ctx, drawPts[0], drawPts[1], drawPts[2], CANVAS_CYAN, 2.2);
        for (const p of drawPts) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fillStyle = CANVAS_CYAN; ctx.fill(); ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 1.2; ctx.stroke(); }
      } else {
        ctx.beginPath(); ctx.moveTo(drawPts[0].x, drawPts[0].y);
        for (let i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i].x, drawPts[i].y);
        if (cursor) { const cp = sc(cursor); ctx.lineTo(cp.x, cp.y); }
        if (isArea && cursor) ctx.closePath();
        ctx.stroke();
        if (isArea && drawPts.length >= 2) { ctx.fillStyle = 'rgba(56,189,248,0.14)'; ctx.fill(); }
        for (const p of drawPts) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fillStyle = CANVAS_CYAN; ctx.fill(); ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
    }
    // active void draft
    const hd = holeDraft.map(sc);
    if (hd.length) { ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hd[0].x, hd[0].y); for (let i = 1; i < hd.length; i++) ctx.lineTo(hd[i].x, hd[i].y); if (cursor) { const cp = sc(cursor); ctx.lineTo(cp.x, cp.y); } ctx.stroke(); for (const p of hd) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fillStyle = RED; ctx.fill(); } }

    // calibration
    if (calib.length) { const cp = calib.map(sc); ctx.strokeStyle = CANVAS_GOLD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cp[0].x, cp[0].y); for (let i = 1; i < cp.length; i++) ctx.lineTo(cp[i].x, cp[i].y); if (calib.length === 1 && cursor) { const c2 = sc(cursor); ctx.lineTo(c2.x, c2.y); } ctx.stroke(); for (const p of cp) { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fillStyle = CANVAS_GOLD; ctx.fill(); } }

    // auto-count template box
    if (tool === 'countsim' && box) {
      const a = sc(box.a), b = sc(box.b);
      ctx.save(); ctx.strokeStyle = CANVAS_GOLD; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6;
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(251,191,36,0.10)'; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.restore();
    }

    // snap indicator
    if (cursor && snapHint) { const cp = sc(cursor); ctx.strokeStyle = snapHint === 'endpoint' ? GREEN : CANVAS_GOLD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cp.x, cp.y, 8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cp.x - 11, cp.y); ctx.lineTo(cp.x + 11, cp.y); ctx.moveTo(cp.x, cp.y - 11); ctx.lineTo(cp.x, cp.y + 11); ctx.stroke(); }
  }, [view, cssSize, dims, sheetConds, draft, holes, holeDraft, cursor, snapHint, selId, tool, calib, box, gridOn, gridFt, ppf, imgReady]);

  drawRef.current = draw;
  // Repaint via rAF whenever draw's inputs change (view/conditions/cursor/…). scheduleDraw coalesces
  // multiple same-frame updates into one paint; the decoupled vertex drag calls it off the ref too.
  useEffect(() => { scheduleDraw(); }, [draw, scheduleDraw]);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  /* ── running totals ────────────────────────────────────────────────── */
  const totals = useMemo(() => {
    let sf = 0, lf = 0, ea = 0;
    for (const c of conditions) { if (c.kind === 'area') sf += c.value; else if (c.kind === 'linear') lf += c.value; else ea += c.value; }
    return { sf: Math.round(sf * 100) / 100, lf: Math.round(lf * 100) / 100, ea };
  }, [conditions]);

  const scaleBad = ppf > 0 && !calibrationSanity(ppf, dims.w, dims.h).ok;
  const selected = conditions.find((c) => c.id === selId) || null;

  /* ── UI ────────────────────────────────────────────────────────────── */
  const inp: React.CSSProperties = { background: BG, border: `1px solid ${LINE}`, borderRadius: 7, color: TEXT, padding: '7px 9px', fontSize: 13, width: '100%' };
  const iconBtn = (active: boolean): React.CSSProperties => ({ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: `1px solid ${active ? GOLD : LINE}`, background: active ? 'color-mix(in srgb, var(--brand-primary) 16%, transparent)' : 'transparent', color: active ? GOLD : TEXT, cursor: 'pointer' });
  const miniBtn: React.CSSProperties = { width: 38, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: `1px solid ${LINE}`, background: 'transparent', color: TEXT, cursor: 'pointer' };
  const activeHint = TOOLS.find((t) => t.t === tool)?.hint || '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,8,0.96)', zIndex: 60, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui,Segoe UI,sans-serif' }}>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${LINE}`, background: PANEL }}>
        <button onClick={onClose} style={{ ...miniBtn, width: 'auto', padding: '0 12px', gap: 7 }}><G g="close" s={16} />Close</button>
        <b style={{ fontSize: 15 }}>Plan Tracer</b>
        <span style={{ fontSize: 12, color: ppf > 0 ? GREEN : DIM, border: `1px solid ${ppf > 0 ? 'rgba(52,211,153,0.4)' : LINE}`, borderRadius: 20, padding: '3px 10px' }}>
          {ppf > 0 ? `Scale ${ppf.toFixed(2)} px/ft` : 'No Scale — Set It First'}{scaleBad ? ' · check!' : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo} style={{ ...miniBtn, opacity: past.length ? 1 : 0.4 }}><G g="undo" s={17} /></button>
          <button title="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo} style={{ ...miniBtn, opacity: future.length ? 1 : 0.4 }}><G g="redo" s={17} /></button>
          <span style={{ width: 1, height: 22, background: LINE, margin: '0 4px' }} />
          <button title="Zoom Out" onClick={() => zoomAt(1 / 1.2, cssSize.w / 2 + (containerRef.current?.getBoundingClientRect().left || 0), cssSize.h / 2 + (containerRef.current?.getBoundingClientRect().top || 0))} style={miniBtn}><G g="zoomOut" s={17} /></button>
          <span style={{ fontSize: 12, color: DIM, width: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(view.scale * 100)}%</span>
          <button title="Zoom In" onClick={() => zoomAt(1.2, cssSize.w / 2 + (containerRef.current?.getBoundingClientRect().left || 0), cssSize.h / 2 + (containerRef.current?.getBoundingClientRect().top || 0))} style={miniBtn}><G g="zoomIn" s={17} /></button>
          <button title="Fit (F)" onClick={fit} style={{ ...miniBtn, width: 'auto', padding: '0 10px', gap: 6 }}><G g="fit" s={16} />Fit</button>
        </div>
      </div>

      {/* drawing register — per-sheet scale, switch pages, add PDF/image sheets */}
      {sheets.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${LINE}`, background: BG, overflowX: 'auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: DIM, fontWeight: 700, flexShrink: 0 }}><G g="sheet" s={15} c={DIM} />Sheets · {sheets.length}</span>
          {sheets.map((s) => {
            const act = s.id === activeSheet;
            return (
              <button key={s.id} onClick={() => goSheet(s.id)} title={`${s.name}${s.ppf > 0 ? ` · ${s.ppf.toFixed(2)} px/ft` : ' · no scale'}`}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', borderRadius: 8, border: `1px solid ${act ? GOLD : LINE}`, background: act ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'transparent', color: act ? GOLD : TEXT, cursor: 'pointer' }}>
                {s.url
                  ? <img src={s.url} alt="" style={{ width: 30, height: 22, objectFit: 'cover', borderRadius: 3, border: `1px solid ${LINE}`, background: '#fff' }} />
                  : <span style={{ width: 30, height: 22, borderRadius: 3, border: `1px dashed ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: DIM }}>{s.page}</span>}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: s.ppf > 0 ? GREEN : DIM, fontWeight: 600 }}>{s.ppf > 0 ? `${s.ppf.toFixed(1)} px/ft` : 'no scale'}</span>
                </span>
              </button>
            );
          })}
          <label title="Add a PDF plan-set or image sheet" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px dashed ${LINE}`, color: TEXT, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <G g="addsheet" s={16} />Add
            <input type="file" accept="application/pdf,.pdf,image/*,.heic,.heif,.tif,.tiff" style={{ display: 'none' }} onChange={(e) => { onAddFile(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
          </label>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* toolbar */}
        <div style={{ width: 60, borderRight: `1px solid ${LINE}`, background: PANEL, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {TOOLS.map((td) => (
            <button key={td.t} title={td.label} onClick={() => { setTool(td.t); setSnapHint(null); if (td.t !== 'scale') setCalib([]); }} style={iconBtn(tool === td.t)}><G g={td.g} s={21} /></button>
          ))}
          <span style={{ height: 1, background: LINE, margin: '4px 2px' }} />
          <button title="Endpoint Snap" onClick={() => setSnapOn((v) => !v)} style={iconBtn(snapOn)}><G g="magnet" s={20} /></button>
          <button title="Grid Snap" onClick={() => setGridOn((v) => !v)} style={iconBtn(gridOn)}><G g="grid" s={20} /></button>
        </div>

        {/* canvas */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', minWidth: 0, background: CANVAS_BG }}>
          {!planUrl ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: GOLD, color: '#101722', fontWeight: 700, borderRadius: 9, padding: '12px 20px', cursor: 'pointer' }}>
                  <G g="pdf" s={18} c="#101722" />Open PDF plan set
                  <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { onAddFile(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, fontWeight: 700, borderRadius: 9, padding: '12px 20px', cursor: 'pointer' }}>
                  <G g="area" s={18} />Upload a plan image
                  <input type="file" accept="image/*,.heic,.heif,.tif,.tiff" style={{ display: 'none' }} onChange={(e) => { onAddFile(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
                </label>
              </div>
              <div style={{ fontSize: 13, color: DIM, maxWidth: 440, textAlign: 'center', lineHeight: 1.5 }}>Multi-page PDFs render into a sheet register — calibrate each sheet&apos;s scale independently, then trace, auto-count symbols, and flood-fill rooms on any page. Phone-photo formats (HEIC/HEIF, TIFF) are decoded automatically.</div>
            </div>
          ) : (
            <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick}
              style={{ width: '100%', height: '100%', display: 'block', cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : tool === 'countsim' ? 'crosshair' : 'crosshair', touchAction: 'none' }} />
          )}
          {/* busy overlay (PDF render / CV scan) */}
          {busy && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.95)', border: `1px solid ${GOLD}`, borderRadius: 9, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: TEXT, fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid ${GOLD}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              {busy}
            </div>
          )}
          {/* targeted-trace banner — measurements land on the caller's condition, not a new row */}
          {targetConditionId && (
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(13,17,23,0.95)', border: `1px solid ${GOLD}`, borderRadius: 9, padding: '7px 12px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
              <G g="linear" s={15} c={GOLD} />Tracing: {conditions.find((c) => c.id === targetConditionId)?.name || 'condition'}
            </div>
          )}
          {/* hint + scale entry */}
          <div style={{ position: 'absolute', left: 12, bottom: 12, right: 12, display: 'flex', gap: 10, alignItems: 'flex-end', pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto', background: 'rgba(13,17,23,0.9)', border: `1px solid ${LINE}`, borderRadius: 9, padding: '8px 12px', fontSize: 13, color: DIM, maxWidth: 460 }}>
              {activeHint}{msg ? <div style={{ color: msg.includes('first') || msg.includes('Need') || msg.includes('Pick') ? GOLD : GREEN, marginTop: 3 }}>{msg}</div> : null}
            </div>
            {tool === 'scale' && calib.length === 2 && (
              <div style={{ pointerEvents: 'auto', background: 'rgba(13,17,23,0.95)', border: `1px solid ${GOLD}`, borderRadius: 9, padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: TEXT }}>Known Distance</span>
                <input autoFocus value={knownFt} onChange={(e) => setKnownFt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyScale()} placeholder="ft" style={{ ...inp, width: 80 }} />
                <button onClick={applyScale} style={{ background: GOLD, color: '#101722', fontWeight: 700, border: 'none', borderRadius: 7, padding: '8px 12px', cursor: 'pointer' }}>Set</button>
              </div>
            )}
          </div>
        </div>

        {/* right panel */}
        <div style={{ width: 340, borderLeft: `1px solid ${LINE}`, background: PANEL, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* live measurement / finish form */}
            {engineKind && (
              <div style={{ border: `1px solid rgba(56,189,248,0.4)`, borderRadius: 12, padding: 12, background: 'rgba(56,189,248,0.05)' }}>
                <div style={{ fontSize: 12, color: DIM, fontWeight: 700 }}>{TOOLS.find((t) => t.t === tool)?.label} — measuring</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{live ? live.value.toLocaleString() : '0'} <span style={{ fontSize: 15, color: DIM }}>{live?.unit}</span></div>
                {live?.extra ? <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{live.extra}</div> : null}

                {tool !== 'deduction' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                    {!targetConditionId && (<>
                      <input placeholder="Name (optional)" value={cName} onChange={(e) => setCName(e.target.value)} style={inp} />
                      <select value={asm} onChange={(e) => setAsm(e.target.value)} style={inp}>
                        {engineKind && asmList(engineKind).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </>)}
                    {(tool === 'linear') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input placeholder="Height ft" value={cH} onChange={(e) => setCH(e.target.value)} style={inp} />
                        <input placeholder="Openings SF" value={cOpenSf} onChange={(e) => setCOpenSf(e.target.value)} style={inp} />
                        <input placeholder="# openings" value={cOpenCt} onChange={(e) => setCOpenCt(e.target.value)} style={inp} />
                      </div>
                    )}
                    {tool === 'area' && <input placeholder="Thickness in (concrete)" value={cT} onChange={(e) => setCT(e.target.value)} style={inp} />}
                    {tool === 'pitch' && <label style={{ fontSize: 12, color: DIM }}>Rise (x:12)<input value={rise} onChange={(e) => setRise(e.target.value)} style={{ ...inp, marginTop: 3 }} /></label>}
                    {tool === 'volume' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['depth', 'stations'] as const).map((m) => <button key={m} onClick={() => setVolMode(m)} style={{ flex: 1, padding: '6px', borderRadius: 7, border: `1px solid ${volMode === m ? GOLD : LINE}`, background: volMode === m ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'transparent', color: volMode === m ? GOLD : TEXT, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{m === 'depth' ? 'Uniform Depth' : 'Stations'}</button>)}
                        </div>
                        {volMode === 'depth'
                          ? <input placeholder="Depth in" value={depthIn} onChange={(e) => setDepthIn(e.target.value)} style={inp} />
                          : <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {stations.map((r, i) => (
                                <div key={i} style={{ display: 'flex', gap: 5 }}>
                                  <input placeholder="station ft" value={r.s} onChange={(e) => setStations((ss) => ss.map((x, j) => j === i ? { ...x, s: e.target.value } : x))} style={inp} />
                                  <input placeholder="area SF" value={r.a} onChange={(e) => setStations((ss) => ss.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} style={inp} />
                                </div>
                              ))}
                              <button onClick={() => setStations((ss) => [...ss, { s: '', a: '' }])} style={{ ...miniBtn, width: '100%', height: 30, fontSize: 12 }}>+ Station</button>
                            </div>}
                      </div>
                    )}
                    <button onClick={finishDraft} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: GOLD, color: '#101722', fontWeight: 700, border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 14 }}><G g="check" s={17} c="#101722" />{targetConditionId ? 'Set Measured Value' : 'Add Condition'}</button>
                  </div>
                )}
                {tool === 'deduction' && <div style={{ fontSize: 12, color: DIM, marginTop: 8 }}>Draw a hole inside the active area (or select an area shape first). Double-click to finish the void.</div>}
              </div>
            )}
            {(tool === 'countsim' || tool === 'fillroom') && (
              <div style={{ border: `1px solid var(--brand-primary-35)`, borderRadius: 12, padding: 12, background: 'var(--bg-surface-2)' }}>
                <div style={{ fontSize: 12, color: DIM, fontWeight: 700 }}>{tool === 'countsim' ? 'Find Similar — Auto-Count' : 'Fill Room — Auto-Area'}</div>
                <div style={{ fontSize: 13, color: DIM, marginTop: 6, lineHeight: 1.45 }}>{tool === 'countsim'
                  ? 'Drag a tight box around one symbol on the plan. Every matching instance is counted and dropped as a marker — deterministic template match, no AI round-trip.'
                  : 'Click inside an enclosed room. The walls are traced into a net-area condition. Needs a scale set on this sheet.'}</div>
                {tool === 'countsim' ? (
                  <label style={{ display: 'block', marginTop: 10, fontSize: 12, color: DIM }}>Match sensitivity · {cntThresh.toFixed(2)}
                    <input type="range" min={0.6} max={0.97} step={0.01} value={cntThresh} onChange={(e) => setCntThresh(+e.target.value)} style={{ width: '100%', accentColor: GOLD, marginTop: 4 }} />
                    <div style={{ fontSize: 12 }}>Lower = looser (more matches) · higher = exact only</div>
                  </label>
                ) : (
                  <label style={{ display: 'block', marginTop: 10, fontSize: 12, color: DIM }}>Wall sensitivity · {Math.round(wallThresh * 100)}%
                    <input type="range" min={0.2} max={0.85} step={0.01} value={wallThresh} onChange={(e) => setWallThresh(+e.target.value)} style={{ width: '100%', accentColor: GOLD, marginTop: 4 }} />
                    <div style={{ fontSize: 12 }}>Higher treats fainter lines as walls (stops leaks through gaps)</div>
                  </label>
                )}
                {busy && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{busy}</div>}
              </div>
            )}
            {tool === 'select' && selected && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: DIM, fontWeight: 700, marginBottom: 6 }}>Selected · {measuredLabel(selected)}</div>
                <input value={selected.name} onChange={(e) => setConditions((cs) => cs.map((c) => c.id === selected.id ? { ...c, name: e.target.value } : c))} style={{ ...inp, marginBottom: 6 }} />
                <select value={selected.assemblyId} onChange={(e) => setConditions((cs) => cs.map((c) => c.id === selected.id ? { ...c, assemblyId: e.target.value, color: divColor(csiOfAsm(e.target.value)) } : c))} style={{ ...inp, marginBottom: 8 }}>
                  {asmList(selected.kind).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {selected.points && selected.points.length > 0 && (() => {
                  // paginated — an auto-count can hold 3000 markers; rendering one page of 100 keeps the panel instant
                  const N = selected.points.length, PER = 100;
                  const pages = Math.max(1, Math.ceil(N / PER));
                  const pg = clamp(vtxPage, 0, pages - 1);
                  const start = pg * PER, end = Math.min(N, start + PER);
                  return (
                    <>
                      {pages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <button disabled={pg === 0} onClick={() => setVtxPage(pg - 1)} style={{ ...miniBtn, width: 30, height: 26, opacity: pg === 0 ? 0.4 : 1, fontSize: 12 }}>&lt;</button>
                          <span style={{ flex: 1, fontSize: 12, color: DIM, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>Vertices {start + 1}–{end} of {N.toLocaleString()}</span>
                          <button disabled={pg >= pages - 1} onClick={() => setVtxPage(pg + 1)} style={{ ...miniBtn, width: 30, height: 26, opacity: pg >= pages - 1 ? 0.4 : 1, fontSize: 12 }}>&gt;</button>
                        </div>
                      )}
                      <div style={{ maxHeight: 130, overflowY: 'auto', border: `1px solid ${LINE}`, borderRadius: 7 }}>
                        {selected.points.slice(start, end).map((_p, i) => (
                          <div key={start + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12, color: DIM, borderBottom: i < end - start - 1 ? `1px solid ${LINE}` : 'none' }}>
                            <span style={{ flex: 1 }}>Vertex {start + i + 1}</span>
                            <button onClick={() => deleteVertex(selected.id, start + i)} style={{ ...miniBtn, width: 26, height: 24 }}><G g="trash" s={13} c={RED} /></button>
                          </div>
                        ))}
                      </div>
                      {pages > 1 && (
                        <button onClick={() => deleteVertexRange(selected.id, start, end)} style={{ ...miniBtn, width: '100%', height: 28, marginTop: 5, fontSize: 12, color: RED, borderColor: 'rgba(248,113,113,0.4)' }}>Delete this page ({end - start} markers)</button>
                      )}
                    </>
                  );
                })()}
                <button onClick={() => { commit(() => setConditions((cs) => cs.filter((c) => c.id !== selected.id))); setSelId(null); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 8, border: `1px solid rgba(248,113,113,0.4)`, background: 'rgba(248,113,113,0.08)', color: RED, borderRadius: 8, padding: '8px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}><G g="trash" s={15} c={RED} />Delete Condition</button>
              </div>
            )}

            {/* running totals */}
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: DIM, fontWeight: 700, marginBottom: 8 }}>Running totals · {conditions.length} conditions</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['Area', `${totals.sf.toLocaleString()} SF`], ['Linear', `${totals.lf.toLocaleString()} LF`], ['Count', `${totals.ea} EA`]].map(([k, v]) => (
                  <div key={k} style={{ flex: 1 }}><div style={{ fontSize: 12, color: DIM, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v}</div></div>
                ))}
              </div>
            </div>

            {/* priced rollup */}
            <div style={{ border: `1px solid var(--brand-primary-25)`, background: 'var(--bg-surface-2)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: DIM, fontWeight: 700 }}>Priced Live · Sell</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{usd(result.sellCents)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                {[['Material', usd(result.materialCents)], ['Labor', `${usd(result.laborCents)} · ${result.laborHrs}h`], ['Items', `${result.lines.length}`]].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 12, color: DIM, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 800 }}>{v}</div></div>
                ))}
              </div>
              {result.byDivision.length > 0 && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                  {result.byDivision.slice(0, 8).map((d) => <div key={d.trade} style={{ display: 'flex', fontSize: 13, padding: '3px 0' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: divColor(result.lines.find((l) => l.trade === d.trade)?.csi ?? ''), marginRight: 7, alignSelf: 'center' }} /><span style={{ flex: 1, color: TEXT }}>{d.trade}</span><span style={{ fontWeight: 700 }}>{usd(d.totalCents)}</span></div>)}
                </div>
              )}
            </div>

            {/* coverage list */}
            <div>
              <div style={{ fontSize: 12, color: DIM, fontWeight: 700, marginBottom: 8 }}>Coverage — Every Measured Condition</div>
              {conditions.length === 0 && <div style={{ fontSize: 13, color: DIM }}>Nothing measured yet. Pick a tool and trace on the plan.</div>}
              {conditions.map((c) => (
                <div key={c.id} onClick={() => { if (c.sheetId && c.sheetId !== activeSheet) goSheet(c.sheetId); setSelId(c.id); zoomToCondition(c); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${c.id === selId ? GOLD : LINE}`, marginBottom: 5, background: c.id === selId ? 'var(--brand-primary-08)' : 'transparent' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: condColor(c), flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div><div style={{ fontSize: 12, color: DIM }}>{measuredLabel(c)}{c.tool ? ` · ${c.tool}` : ''}</div></div>
                  <button onClick={(e) => { e.stopPropagation(); commit(() => setConditions((cs) => cs.filter((x) => x.id !== c.id))); if (selId === c.id) setSelId(null); }} style={{ ...miniBtn, width: 26, height: 24 }}><G g="trash" s={13} c={RED} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* helpers that close over view/state */
  function zoomToCondition(c: TracerCondition) {
    if (!c.points || !c.points.length || !containerRef.current) return;
    const xs = c.points.map((p) => p.x), ys = c.points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = Math.max(maxX - minX, 20), bh = Math.max(maxY - minY, 20);
    const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
    const s = clamp(Math.min(w / bw, h / bh) * 0.6, 0.03, 20);
    applyView({ scale: s, tx: w / 2 - (minX + maxX) / 2 * s, ty: h / 2 - (minY + maxY) / 2 * s });
  }
}

/* ── pure canvas/geometry helpers ──────────────────────────────────────── */
function pointInPoly(pt: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    const hit = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
const near = (a: Pt, b: Pt, tol = 12) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
function centroidS(pts: Pt[]): Pt { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }
function labelChip(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, border: string) {
  ctx.font = '600 12px system-ui'; const tw = ctx.measureText(text).width; const w = tw + 14, h = 20;
  ctx.fillStyle = 'rgba(13,17,23,0.9)'; roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 6); ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#e6edf3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Compact per-segment dimension tag drawn at an edge midpoint. */
function segTag(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, border: string) {
  ctx.font = '700 10.5px system-ui'; const tw = ctx.measureText(text).width; const w = tw + 8, h = 15;
  ctx.fillStyle = 'rgba(13,17,23,0.85)'; roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4); ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 0.75; ctx.stroke();
  ctx.fillStyle = '#cfe3ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
/** Draw a circular arc through 3 screen points. */
function drawArc(ctx: CanvasRenderingContext2D, a: Pt, mid: Pt, b: Pt, color: string, lw: number) {
  const d = 2 * (a.x * (mid.y - b.y) + mid.x * (b.y - a.y) + b.x * (a.y - mid.y));
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  if (Math.abs(d) < 1e-6) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); return; }
  const a2 = a.x * a.x + a.y * a.y, m2 = mid.x * mid.x + mid.y * mid.y, b2 = b.x * b.x + b.y * b.y;
  const ux = (a2 * (mid.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - mid.y)) / d;
  const uy = (a2 * (b.x - mid.x) + m2 * (a.x - b.x) + b2 * (mid.x - a.x)) / d;
  const R = Math.hypot(a.x - ux, a.y - uy);
  const ang = (p: Pt) => Math.atan2(p.y - uy, p.x - ux);
  let a0 = ang(a), a1 = ang(b); const am = ang(mid);
  const between = (s: number, e: number, m: number) => { const norm = (x: number) => (x + Math.PI * 4) % (Math.PI * 2); s = norm(s); e = norm(e); m = norm(m); return s < e ? m > s && m < e : m > s || m < e; };
  const ccw = !between(a0, a1, am);
  ctx.beginPath(); ctx.arc(ux, uy, R, a0, a1, ccw); ctx.stroke();
}
