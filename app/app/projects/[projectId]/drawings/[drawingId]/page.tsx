'use client';
/**
 * Drawing workspace — a markup tool, not a picture viewer.
 *
 *  ┌ top bar: sheet ◂ ▸ · revision · zoom · fit · full screen · download · upload ┐
 *  │ tools │ properties (color · weight) ......................................... │
 *  │ palette│                    the sheet                          │ Markups / Pins │
 *  │        │   (markups as SVG over the render, pins on top)       │ Revisions      │
 *  └ status: page · zoom · scale · markups · saved ────────────────────────────────┘
 *
 * Markups save one row each to drawing_markups (B1 contract: space 'image',
 * w/h = a 1000-wide reference, geometry in those units) and every person on
 * the job sees them. Measure uses the sheet's scale, set once with Calibrate.
 * Pins (RFI / punch / note) create or link real items.
 *
 * Reads   /api/drawings/:id/sheet · /api/drawings/list · /api/projects/:p/drawings/markups
 * Writes  markups POST/DELETE · pins POST/DELETE · /api/rfis/create ·
 *         /api/punch-list/create · /api/drawings/upload
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, type BadgeTone } from '@/components/ui/kit';
import {
  Cursor, Hand, PencilSimple, Highlighter, LineSegment, ArrowUpRight, Square, Circle, Cloud, TextT,
  Ruler, Crosshair, Polygon, Hash, Question, Wrench, NotePencil, Eraser, CaretLeft, CaretRight, CaretDown,
  ArrowsOut, CornersOut, DownloadSimple, UploadSimple, X, Trash, Eye, EyeSlash, ArrowSquareOut,
  WarningCircle, ClockCounterClockwise, SquareHalf, CheckCircle, Lock, LockOpen, ArrowCounterClockwise, MapPin, LinkSimple, Plus,
} from '@phosphor-icons/react';

/* ── types ─────────────────────────────────────────────────────────────── */
type Item = { type: string; id: string; noun: string; name: string; status: string; closed?: boolean; href: string };
type Pin = { id: string; x: number; y: number; page: number; title: string | null; description: string | null; item: Item | null; created_at: string };
type Rev = { id: string; version: string | null; status: string | null; revision_date: string | null; created_at: string; url: string | null; isPdf: boolean };
type Sheet = {
  drawing: { id: string; name: string; sheet_number: string; discipline: string | null; version: string | null; status: string | null; revision_date: string | null; url: string; isPdf: boolean };
  project: { id: string; name: string } | null;
  revisions: Rev[];
  pins: Pin[];
};
type ListRow = { id: string; sheet_number: string; title: string; discipline: string | null; status: string | null };
type Hit = { type: string; id: string; name: string; status: string };
type Pt = [number, number];
type MStyle = { color: string; width: number; opacity?: number; head?: boolean };
type MData = { space: 'image'; w: number; h: number; style: MStyle; geometry: Pt[]; text?: string; ftPerUnit?: number; feet?: number; kind?: 'scale' | 'count' | 'area'; sqft?: number; private?: boolean };
type MComment = { id: string; content: string; author_name: string | null; created_at: string };
type Markup = { comments?: MComment[]; id: string; markup_type: string; data: MData; page_number: number | null; color: string; created_by: string; created_by_name: string | null; created_at: string; entity_type?: string | null; entity_id?: string | null };

type Tool = 'select' | 'pan' | 'pen' | 'highlight' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'cloud' | 'text' | 'measure' | 'area' | 'count' | 'calibrate' | 'link' | 'rfi' | 'punch' | 'note' | 'erase';
const DRAW_TOOLS: Tool[] = ['pen', 'highlight', 'line', 'arrow', 'rect', 'ellipse', 'cloud', 'text', 'measure', 'area', 'count', 'calibrate', 'link'];
const PIN_TOOLS: Tool[] = ['rfi', 'punch', 'note'];

/* Redline colors: red is the industry markup color; the rest separate trades. */
const SWATCHES = [
  { c: 'rgb(239,68,68)', n: 'Red' }, { c: 'rgb(245,158,11)', n: 'Amber' }, { c: 'rgb(34,197,94)', n: 'Green' },
  { c: 'rgb(217,70,239)', n: 'Magenta' }, { c: 'rgb(232,255,42)', n: 'Neon' }, { c: 'rgb(15,23,42)', n: 'Ink' },
];
const WEIGHTS = [{ w: 2, n: 'Fine' }, { w: 4, n: 'Medium' }, { w: 7, n: 'Bold' }];
const REF_W = 1000;

const TOOL_GROUPS: { tools: { k: Tool; label: string; key?: string; icon: React.ReactNode }[] }[] = [
  { tools: [
    { k: 'select', label: 'Select', key: 'V', icon: <Cursor size={19} /> },
    { k: 'pan', label: 'Pan', key: 'H', icon: <Hand size={19} /> },
  ] },
  { tools: [
    { k: 'pen', label: 'Pen', key: 'P', icon: <PencilSimple size={19} /> },
    { k: 'highlight', label: 'Highlighter', key: 'I', icon: <Highlighter size={19} /> },
    { k: 'line', label: 'Line', key: 'L', icon: <LineSegment size={19} /> },
    { k: 'arrow', label: 'Arrow', key: 'A', icon: <ArrowUpRight size={19} /> },
    { k: 'rect', label: 'Rectangle', key: 'R', icon: <Square size={19} /> },
    { k: 'ellipse', label: 'Ellipse', key: 'E', icon: <Circle size={19} /> },
    { k: 'cloud', label: 'Revision cloud', key: 'C', icon: <Cloud size={19} /> },
    { k: 'text', label: 'Text', key: 'T', icon: <TextT size={19} /> },
  ] },
  { tools: [
    { k: 'measure', label: 'Measure length', key: 'M', icon: <Ruler size={19} /> },
    { k: 'area', label: 'Measure area', key: 'G', icon: <Polygon size={19} /> },
    { k: 'count', label: 'Count', key: 'N', icon: <Hash size={19} weight="bold" /> },
    { k: 'calibrate', label: 'Set scale', icon: <Crosshair size={19} /> },
  ] },
  { tools: [
    { k: 'link', label: 'Link to a sheet', key: 'K', icon: <LinkSimple size={19} weight="bold" /> },
    { k: 'rfi', label: 'RFI pin', icon: <Question size={19} weight="bold" /> },
    { k: 'punch', label: 'Punch pin', icon: <Wrench size={19} weight="bold" /> },
    { k: 'note', label: 'Note pin', icon: <NotePencil size={19} weight="bold" /> },
  ] },
  { tools: [{ k: 'erase', label: 'Eraser', key: 'X', icon: <Eraser size={19} /> }] },
];
const TOOL_LABEL = Object.fromEntries(TOOL_GROUPS.flatMap((g) => g.tools.map((t) => [t.k, t.label]))) as Record<Tool, string>;

const statusTone = (s: string | null): BadgeTone => (s === 'current' ? 'ongoing' : s === 'superseded' ? 'closed' : s === 'void' ? 'overdue' : 'neutral');
const label = (s: string | null) => { const t = (s || '').replace(/_/g, ' '); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'; };
const day = (d: string | null) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const pinKind = (p: Pin) => (!p.item ? 'note' : p.item.type === 'rfis' ? 'rfi' : p.item.type === 'punch_list' ? 'punch' : 'other');
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 12.5 → 12'-6" */
function feetIn(ft: number): string {
  if (!Number.isFinite(ft)) return '—';
  const totalIn = Math.round(ft * 12 * 4) / 4;
  const f = Math.floor(totalIn / 12);
  const i = +(totalIn - f * 12).toFixed(2);
  return `${f}'-${i}"`;
}
/** "12' 6"", "12-6", "12.5", "150in" → feet */
function parseFeet(s: string): number | null {
  const t = s.trim().toLowerCase();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*[- ]?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/);
  if (/^\d+(\.\d+)?\s*(in|")$/.test(t)) return parseFloat(t) / 12;
  if (!m) return null;
  const v = parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
  return v > 0 ? v : null;
}

/** Shoelace area of a polygon in reference units². */
function polyArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
const sqftLabel = (v: number) => `${Math.round(v).toLocaleString('en-US')} sq ft`;

/** A scalloped revision cloud around a rectangle. */
function cloudPath(a: Pt, b: Pt, w: number): string {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const r = Math.max(6, w * 3);
  const edge = (sx: number, sy: number, ex: number, ey: number) => {
    const len = Math.hypot(ex - sx, ey - sy);
    const n = Math.max(1, Math.round(len / (r * 2)));
    let d = '';
    for (let i = 1; i <= n; i++) {
      const px = sx + ((ex - sx) * i) / n, py = sy + ((ey - sy) * i) / n;
      d += ` A ${len / n / 2} ${len / n / 2} 0 0 1 ${px} ${py}`;
    }
    return d;
  };
  return `M ${x0} ${y0}${edge(x0, y0, x1, y0)}${edge(x1, y0, x1, y1)}${edge(x1, y1, x0, y1)}${edge(x0, y1, x0, y0)} Z`;
}

/** Render one PDF page (or image) into a canvas at a CSS width; returns page count and aspect. */
async function drawSource(url: string, isPdf: boolean, page: number, cssWidth: number, canvas: HTMLCanvasElement): Promise<{ pages: number; aspect: number }> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { pages: 1, aspect: 1 };
  if (isPdf) {
    const pdfjs = await import('pdfjs-dist');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (pdfjs as any).getDocument({ url }).promise;
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const base = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: (cssWidth / base.width) * dpr });
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = `${vp.width / dpr}px`; canvas.style.height = `${vp.height / dpr}px`;
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    return { pages: doc.numPages, aspect: base.height / base.width };
  }
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const aspect = img.naturalHeight / img.naturalWidth;
  canvas.width = cssWidth * dpr; canvas.height = cssWidth * aspect * dpr;
  canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssWidth * aspect}px`;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { pages: 1, aspect };
}

/** Ink only on the old revision → red, only on this one → green, both → dark. */
function compareInto(target: HTMLCanvasElement, oldC: HTMLCanvasElement) {
  const ctx = target.getContext('2d');
  const o = document.createElement('canvas');
  o.width = target.width; o.height = target.height;
  const octx = o.getContext('2d');
  if (!ctx || !octx) return;
  octx.drawImage(oldC, 0, 0, o.width, o.height);
  const a = ctx.getImageData(0, 0, target.width, target.height);
  const B = octx.getImageData(0, 0, o.width, o.height).data, A = a.data;
  for (let i = 0; i < A.length; i += 4) {
    const n = 255 - (A[i] + A[i + 1] + A[i + 2]) / 3 > 60, od = 255 - (B[i] + B[i + 1] + B[i + 2]) / 3 > 60;
    const c = n && od ? [45, 45, 45] : n ? [22, 163, 74] : od ? [220, 38, 38] : [255, 255, 255];
    A[i] = c[0]; A[i + 1] = c[1]; A[i + 2] = c[2]; A[i + 3] = 255;
  }
  ctx.putImageData(a, 0, 0);
}

/* ── one markup as SVG ────────────────────────────────────────────────── */
function MarkupShape({ m, scale, selected, onPick, interactive }: { m: Markup; scale: number | null; selected: boolean; onPick: () => void; interactive: boolean }) {
  const d = m.data;
  if (!d || !Array.isArray(d.geometry) || d.geometry.length === 0) return null;
  const st = d.style || { color: m.color, width: 3 };
  const g = d.geometry;
  const common = {
    stroke: st.color, strokeWidth: st.width, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    opacity: st.opacity ?? 1, style: { pointerEvents: interactive ? ('stroke' as const) : ('none' as const), cursor: interactive ? 'pointer' : undefined },
    onClick: interactive ? (e: React.MouseEvent) => { e.stopPropagation(); onPick(); } : undefined,
  };
  const halo = selected ? { filter: 'url(#dw-sel)' } : {};
  let shape: React.ReactNode = null;
  switch (m.markup_type) {
    case 'freehand':
      shape = <polyline points={g.map((p) => p.join(',')).join(' ')} {...common} {...halo} />;
      break;
    case 'arrow': {
      const [a, b] = [g[0], g[g.length - 1]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 10 + st.width * 3;
      const h1: Pt = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)];
      const h2: Pt = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)];
      shape = <g {...halo}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} />{st.head !== false && <polyline points={`${h1.join(',')} ${b.join(',')} ${h2.join(',')}`} {...common} />}</g>;
      break;
    }
    case 'rect': {
      const [a, b] = [g[0], g[1] || g[0]];
      shape = <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} {...common} {...halo} />;
      break;
    }
    case 'circle': {
      const [a, b] = [g[0], g[1] || g[0]];
      shape = <ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} {...common} {...halo} />;
      break;
    }
    case 'cloud':
      shape = <path d={cloudPath(g[0], g[1] || g[0], st.width)} {...common} {...halo} />;
      break;
    case 'link': {
      const [a, b] = [g[0], g[1] || g[0]];
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      const tag = `↗ ${d.text || 'Sheet'}`;
      shape = (
        <g {...halo} style={{ cursor: 'pointer', pointerEvents: interactive ? 'all' : 'none' }} onClick={interactive ? (e) => { e.stopPropagation(); onPick(); } : undefined}>
          <rect x={x} y={y} width={w} height={h} fill="rgba(232,255,42,.10)" stroke="rgb(161,178,0)" strokeWidth={2} strokeDasharray="5 4" rx={3} />
          <rect x={x} y={y - 18} width={tag.length * 7 + 10} height={17} rx={3} fill="rgb(15,23,42)" />
          <text x={x + 5} y={y - 6} fontSize={11} fontWeight={700} fill="rgb(232,255,42)">{tag}</text>
        </g>
      );
      break;
    }
    case 'text':
      shape = (
        <text x={g[0][0]} y={g[0][1]} fill={st.color} fontSize={10 + st.width * 3} fontWeight={700} {...halo}
          style={{ pointerEvents: interactive ? 'all' : 'none', cursor: interactive ? 'pointer' : undefined, paintOrder: 'stroke', stroke: 'rgba(255,255,255,.85)', strokeWidth: 3 }}
          onClick={interactive ? (e) => { e.stopPropagation(); onPick(); } : undefined}>{d.text}</text>
      );
      break;
    case 'measure': {
      if (d.kind === 'area') {
        const sq = d.sqft ?? (scale ? polyArea(g) * scale * scale : null);
        const cx = g.reduce((s2, p) => s2 + p[0], 0) / g.length, cy = g.reduce((s2, p) => s2 + p[1], 0) / g.length;
        const lbl = sq != null ? sqftLabel(sq) : 'Set scale';
        shape = (
          <g {...halo}>
            <polygon points={g.map((p) => p.join(',')).join(' ')} {...common} fill={st.color} fillOpacity={0.14} style={{ ...common.style, pointerEvents: interactive ? 'all' : 'none' }} />
            {g.length > 2 && <><rect x={cx - lbl.length * 4 - 6} y={cy - 11} width={lbl.length * 8 + 12} height={20} rx={4} fill={st.color} style={{ pointerEvents: 'none' }} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="white" style={{ pointerEvents: 'none' }}>{lbl}</text></>}
          </g>
        );
        break;
      }
      const [a, b] = [g[0], g[1] || g[0]];
      const ft = d.feet ?? (scale ? dist(a, b) * scale : null);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), tx = Math.sin(ang) * 6, ty = -Math.cos(ang) * 6;
      const lbl = ft != null ? feetIn(ft) : 'Set scale';
      shape = (
        <g {...halo}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} strokeDasharray="6 4" />
          <line x1={a[0] - tx} y1={a[1] - ty} x2={a[0] + tx} y2={a[1] + ty} {...common} />
          <line x1={b[0] - tx} y1={b[1] - ty} x2={b[0] + tx} y2={b[1] + ty} {...common} />
          <rect x={mx - lbl.length * 4 - 6} y={my - 11} width={lbl.length * 8 + 12} height={20} rx={4} fill={st.color} style={{ pointerEvents: 'none' }} />
          <text x={mx} y={my + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="white" style={{ pointerEvents: 'none' }}>{lbl}</text>
        </g>
      );
      break;
    }
    default:
      return null;
  }
  return <g data-mk={m.id}>{shape}</g>;
}

/* ── page ─────────────────────────────────────────────────────────────── */
export default function DrawingWorkspace() {
  const { projectId, drawingId } = useParams() as { projectId: string; drawingId: string };
  const router = useRouter();
  const base = `/app/projects/${projectId}`;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [list, setList] = useState<ListRow[]>([]);
  const [markups, setMarkups] = useState<Markup[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [aspect, setAspect] = useState(1.4);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(SWATCHES[0].c);
  const [weight, setWeight] = useState(4);
  const [draftPts, setDraftPts] = useState<Pt[] | null>(null);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [textVal, setTextVal] = useState('');
  const [calib, setCalib] = useState<{ a: Pt; b: Pt } | null>(null);
  const [calibVal, setCalibVal] = useState('');
  const [pinDraft, setPinDraft] = useState<{ x: number; y: number; kind: 'rfi' | 'punch' | 'note' } | null>(null);
  const [pinTitle, setPinTitle] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [showMarkups, setShowMarkups] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [selMarkup, setSelMarkup] = useState<string | null>(null);
  const [activePin, setActivePin] = useState<string | null>(null);
  const [tab, setTab] = useState<'markups' | 'pins' | 'revs'>('markups');
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [myIds, setMyIds] = useState<string[]>([]);
  const [priv, setPriv] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [linkDraft, setLinkDraft] = useState<{ a: Pt; b: Pt } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const REF_H = Math.round(REF_W * aspect);

  /* The workspace fills the window below the app header — the page itself never scrolls. */
  useEffect(() => {
    const fit = () => {
      const el = rootRef.current;
      if (!el || document.fullscreenElement) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(520, window.innerHeight - top - 12)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    return () => { window.removeEventListener('resize', fit); document.removeEventListener('fullscreenchange', fit); };
  }, []);

  /* data */
  const loadSheet = useCallback(async () => {
    try {
      const r = await fetch(`/api/drawings/${drawingId}/sheet`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't open this sheet.");
      setSheet(j); setError('');
    } catch (e) { setError((e as Error).message); }
  }, [drawingId]);
  const loadMarkups = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/drawings/markups?drawing_id=${drawingId}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setMarkups((j.markups || []) as Markup[]);
  }, [projectId, drawingId]);
  useEffect(() => { loadSheet(); loadMarkups(); }, [loadSheet, loadMarkups]);
  useEffect(() => {
    fetch(`/api/drawings/list?projectId=${projectId}`).then((r) => r.json()).then((j) => setList((j.drawings || []) as ListRow[])).catch(() => setList([]));
  }, [projectId]);

  /* scale from the latest calibration on this sheet */
  const scaleMk = useMemo(() => [...markups].reverse().find((m) => m.markup_type === 'stamp' && typeof m.data?.ftPerUnit === 'number'), [markups]);
  const counts = useMemo(() => markups.filter((m) => m.markup_type === 'stamp' && m.data?.kind === 'count'), [markups]);
  const ftPerUnit = scaleMk?.data.ftPerUnit ?? null;

  /* render */
  useEffect(() => {
    const d = sheet?.drawing, c = canvasRef.current;
    if (!d?.url || !c) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const width = Math.max(600, (scrollRef.current?.clientWidth ?? 1000) - 80) * zoom;
        const { pages: n, aspect: a } = await drawSource(d.url, d.isPdf, page, width, c);
        if (cancelled) return;
        setPages(n); setAspect(a);
        const old = compareId ? sheet!.revisions.find((r) => r.id === compareId) : null;
        if (old?.url) { const oc = document.createElement('canvas'); await drawSource(old.url, old.isPdf, page, width, oc); if (!cancelled) compareInto(c, oc); }
      } catch (e) {
        console.error('[drawing] render', e);
        if (!cancelled) setMsg({ text: "This sheet's file couldn't be drawn. Use Download to open it." });
      } finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; };
  }, [sheet, page, zoom, compareId]);

  /* pin search */
  useEffect(() => {
    if (!pinDraft || pinDraft.kind === 'note') return;
    const want = pinDraft.kind === 'rfi' ? 'rfis' : 'punch_list';
    const t = setTimeout(async () => {
      const r = await fetch(`/api/items/search?projectId=${projectId}&q=${encodeURIComponent(q)}`);
      const j = await r.json().catch(() => ({}));
      setHits(((j.items || []) as Hit[]).filter((h) => h.type === want));
    }, 180);
    return () => clearTimeout(t);
  }, [q, pinDraft, projectId]);

  /* keyboard: tool keys, delete, undo, escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter' && tool === 'area' && draftPts) { e.preventDefault(); void finishArea(); return; }
      if (e.key === 'Escape') { setDraftPts(null); setTextAt(null); setPinDraft(null); setCalib(null); setLinkDraft(null); setSelMarkup(null); setActivePin(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); void undo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selMarkup) { e.preventDefault(); void removeMarkup(selMarkup); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const hit = TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.key && t.key.toLowerCase() === e.key.toLowerCase());
      if (hit) setTool(hit.k);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, +(z * 1.2).toFixed(2)));
      if (e.key === '-') setZoom((z) => Math.max(0.4, +(z / 1.2).toFixed(2)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ctrl/⌘ + wheel zoom */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom((z) => Math.min(4, Math.max(0.4, +(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)).toFixed(2)))); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* geometry */
  const toRef = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return [+(((e.clientX - r.left) / r.width) * REF_W).toFixed(1), +(((e.clientY - r.top) / r.height) * REF_H).toFixed(1)];
  };

  const saveMarkup = async (type: string, geometry: Pt[], extra: Partial<MData> = {}, style?: Partial<MStyle>, entity?: { type: string; id: string }) => {
    const st: MStyle = { color, width: weight, ...(style || {}) };
    const data: MData = { space: 'image', w: REF_W, h: REF_H, style: st, geometry, ...(priv && type !== 'stamp' ? { private: true } : {}), ...extra };
    const temp: Markup = { id: `tmp-${Date.now()}`, markup_type: type, data, page_number: page, color: st.color, created_by: 'me', created_by_name: 'You', created_at: new Date().toISOString() };
    setMarkups((m) => [...m, temp]);
    setSaveState('saving');
    const r = await fetch(`/api/projects/${projectId}/drawings/markups`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drawing_id: drawingId, markup_type: type, data, page_number: page, color: st.color, ...(entity ? { entity_type: entity.type, entity_id: entity.id } : {}) }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !j.markup?.id) {
      setMarkups((m) => m.filter((x) => x.id !== temp.id));
      setSaveState('failed');
      setMsg({ text: j.error || "Couldn't save that markup. Check your connection and draw it again." });
      return null;
    }
    setMarkups((m) => m.map((x) => (x.id === temp.id ? (j.markup as Markup) : x)));
    setMyIds((ids) => [...ids, j.markup.id]);
    setSaveState('saved');
    return j.markup as Markup;
  };
  const removeMarkup = async (id: string) => {
    if (id.startsWith('tmp-')) return;
    const keep = markups;
    setMarkups((m) => m.filter((x) => x.id !== id)); setSelMarkup(null); setSaveState('saving');
    const r = await fetch(`/api/projects/${projectId}/drawings/markups/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!r || !r.ok) {
      setMarkups(keep); setSaveState('failed');
      const j = r ? await r.json().catch(() => ({})) : {};
      setMsg({ text: j.error || "Couldn't remove that markup." });
      return;
    }
    setMyIds((ids) => ids.filter((x) => x !== id)); setSaveState('saved');
  };
  const publish = async (m: Markup) => {
    const data = { ...m.data, private: false };
    setMarkups((all) => all.map((x) => (x.id === m.id ? { ...x, data } : x)));
    const r = await fetch(`/api/projects/${projectId}/drawings/markups/${m.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data }) }).catch(() => null);
    if (!r || !r.ok) { setMarkups((all) => all.map((x) => (x.id === m.id ? m : x))); setMsg({ text: "Couldn't publish that markup." }); return; }
    setMsg({ text: 'Published — everyone on the job can see it now.', ok: true });
  };
  const addComment = async (m: Markup) => {
    const content = commentText.trim();
    if (!content) return;
    setCommentText('');
    const r = await fetch(`/api/projects/${projectId}/drawings/markups/${m.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !j.comment) { setCommentText(content); setMsg({ text: j.error || "Couldn't post the comment." }); return; }
    setMarkups((all) => all.map((x) => (x.id === m.id ? { ...x, comments: [...(x.comments || []), j.comment as MComment] } : x)));
  };
  const publishAll = async () => { for (const m of markups.filter((x) => x.data?.private)) await publish(m); };
  const undo = async () => { const last = myIds[myIds.length - 1]; if (last) await removeMarkup(last); };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'pan') { drag.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current!.scrollLeft, st: scrollRef.current!.scrollTop }; return; }
    if (tool === 'select' || tool === 'erase') { setSelMarkup(null); setActivePin(null); return; }
    const p = toRef(e);
    if (PIN_TOOLS.includes(tool)) { setPinDraft({ x: p[0] / REF_W, y: p[1] / REF_H, kind: tool as 'rfi' | 'punch' | 'note' }); setPinTitle(''); setQ(''); return; }
    if (tool === 'text') { setTextAt(p); setTextVal(''); return; }
    if (tool === 'count') { void saveMarkup('stamp', [p], { kind: 'count' }); return; }
    if (tool === 'area') {
      if (!draftPts) setDraftPts([p, p]);
      else if (e.detail >= 2) void finishArea();
      else setDraftPts([...draftPts.slice(0, -1), p, p]);
      return;
    }
    if (DRAW_TOOLS.includes(tool)) { (e.target as Element).setPointerCapture?.(e.pointerId); setDraftPts([p, p]); }
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toRef(e);
    setCursor(p);
    if (drag.current && scrollRef.current) { scrollRef.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x); scrollRef.current.scrollTop = drag.current.st - (e.clientY - drag.current.y); return; }
    if (!draftPts) return;
    if (tool === 'area') { setDraftPts([...draftPts.slice(0, -1), p]); return; }
    if (tool === 'pen' || tool === 'highlight') {
      const last = draftPts[draftPts.length - 1];
      if (dist(last, p) > 1.5) setDraftPts([...draftPts, p]);
    } else setDraftPts([draftPts[0], p]);
  };
  const onUp = async () => {
    drag.current = null;
    const pts = draftPts;
    if (!pts || tool === 'area') return;
    setDraftPts(null);
    const tiny = dist(pts[0], pts[pts.length - 1]) < 4 && pts.length < 4;
    if (tiny) return;
    if (tool === 'pen') await saveMarkup('freehand', pts);
    else if (tool === 'highlight') await saveMarkup('freehand', pts, {}, { width: Math.max(12, weight * 4), opacity: 0.35 });
    else if (tool === 'line') await saveMarkup('arrow', [pts[0], pts[1]], {}, { head: false });
    else if (tool === 'arrow') await saveMarkup('arrow', [pts[0], pts[1]], {}, { head: true });
    else if (tool === 'rect') await saveMarkup('rect', [pts[0], pts[1]]);
    else if (tool === 'ellipse') await saveMarkup('circle', [pts[0], pts[1]]);
    else if (tool === 'cloud') await saveMarkup('cloud', [pts[0], pts[1]]);
    else if (tool === 'measure') {
      if (!ftPerUnit) { setMsg({ text: 'Set the scale first: pick Set scale and trace a dimension you know.' }); setTool('calibrate'); return; }
      await saveMarkup('measure', [pts[0], pts[1]], { feet: +(dist(pts[0], pts[1]) * ftPerUnit).toFixed(3) });
    } else if (tool === 'calibrate') { setCalib({ a: pts[0], b: pts[1] }); setCalibVal(''); }
    else if (tool === 'link') setLinkDraft({ a: pts[0], b: pts[1] });
  };

  const finishArea = async () => {
    const pts = (draftPts || []).slice(0, -1).filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 2);
    setDraftPts(null);
    if (pts.length < 3) { setMsg({ text: 'Click at least three corners, then double-click or press Enter to close the area.' }); return; }
    if (!ftPerUnit) { setMsg({ text: 'Set the scale first: pick Set scale and trace a dimension you know.' }); setTool('calibrate'); return; }
    await saveMarkup('measure', pts, { kind: 'area', sqft: +(polyArea(pts) * ftPerUnit * ftPerUnit).toFixed(2) });
  };
  const saveText = async () => {
    if (!textAt || !textVal.trim()) { setTextAt(null); return; }
    await saveMarkup('text', [textAt], { text: textVal.trim().slice(0, 200) });
    setTextAt(null);
  };
  const saveCalib = async () => {
    if (!calib) return;
    const ft = parseFeet(calibVal);
    if (!ft) { setMsg({ text: 'Type the real length, like 24\' 6" or 12.5.' }); return; }
    const units = dist(calib.a, calib.b);
    await saveMarkup('stamp', [calib.a, calib.b], { kind: 'scale', ftPerUnit: ft / units, feet: ft }, { color: 'rgb(148,163,184)', width: 1, opacity: 0 });
    setCalib(null); setTool('measure');
    setMsg({ text: `Scale set — ${feetIn(ft)} over that line. Measure now reads real lengths.`, ok: true });
  };

  /* pins */
  const postPin = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/drawings/${drawingId}/pins`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x_pct: pinDraft!.x, y_pct: pinDraft!.y, page_number: page, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Couldn't save the pin.");
    return j.pin?.id as string | undefined;
  };
  const pinDone = async (id: string | undefined, text: string) => { setPinDraft(null); setTool('select'); await loadSheet(); setActivePin(id ?? null); setTab('pins'); setMsg({ text, ok: true }); };
  const pinCreate = async () => {
    if (!pinDraft || !sheet || !pinTitle.trim()) return;
    setBusy(true);
    try {
      const where = `${sheet.drawing.sheet_number} · ${sheet.drawing.name}`;
      const title = pinTitle.trim();
      if (pinDraft.kind === 'note') { await pinDone(await postPin({ title: title.slice(0, 120), description: title }), 'Note pinned.'); return; }
      const isRfi = pinDraft.kind === 'rfi';
      const r = await fetch(isRfi ? '/api/rfis/create' : '/api/punch-list/create', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isRfi ? { projectId, subject: title, question: title, drawing_reference: where } : { projectId, title, location: where }),
      });
      const j = await r.json().catch(() => ({}));
      const id = isRfi ? (j.rfi?.id || j.data?.rfi?.id) : (j.item?.id || j.data?.item?.id);
      if (!r.ok || !id) throw new Error(j.error || `Couldn't create the ${isRfi ? 'RFI' : 'punch item'}.`);
      await pinDone(await postPin({ entity_type: isRfi ? 'rfis' : 'punch_list', entity_id: id }), `${isRfi ? 'RFI' : 'Punch item'} created and pinned.`);
    } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  const pinLink = async (h: Hit) => {
    setBusy(true);
    try { await pinDone(await postPin({ entity_type: h.type, entity_id: h.id }), `Pinned ${h.name}.`); }
    catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  const removePin = async (p: Pin) => {
    const r = await fetch(`/api/drawings/${drawingId}/pins?pinId=${p.id}`, { method: 'DELETE' });
    if (r.ok) { setActivePin(null); await loadSheet(); } else setMsg({ text: "Couldn't remove the pin." });
  };

  const uploadRevision = async (f: File) => {
    if (!sheet) return;
    setBusy(true); setMsg({ text: 'Uploading the new revision…', ok: true });
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('projectId', projectId); fd.append('sheet_number', sheet.drawing.sheet_number); fd.append('title', sheet.drawing.name);
      if (sheet.drawing.discipline) fd.append('discipline', sheet.drawing.discipline);
      const r = await fetch('/api/drawings/upload', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.drawing?.id) throw new Error(j.error || "Couldn't upload the revision.");
      router.push(`${base}/drawings/${j.drawing.id}`);
    } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };

  /** The sheet as it looks now — drawing, markups and pins — saved as a PNG. */
  const exportPng = async () => {
    const c = canvasRef.current, svg = svgRef.current;
    if (!c || !svg || !d) return;
    try {
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('width', String(c.width)); clone.setAttribute('height', String(c.height));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      await new Promise<void>((res, rej) => { const im = new Image(); im.onload = () => { ctx.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(); }; im.onerror = rej; im.src = url; });
      const r = Math.max(10, c.width / 120);
      for (const [i, p] of pins.entries()) {
        const k = pinKind(p);
        ctx.fillStyle = p.item?.closed ? 'rgb(22,163,74)' : k === 'rfi' ? 'rgb(220,38,38)' : k === 'punch' ? 'rgb(217,119,6)' : 'rgb(71,85,105)';
        ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = r / 5; ctx.strokeStyle = 'white'; ctx.stroke();
        ctx.fillStyle = 'white'; ctx.font = `bold ${r}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), p.x * c.width, p.y * c.height);
      }
      const blob: Blob | null = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no image');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${d.sheet_number}-rev${d.version || ''}-markups${pages > 1 ? `-p${page}` : ''}.png`.replace(/[^\w.-]+/g, '_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setMsg({ text: 'Downloaded the sheet with its markups and pins.', ok: true });
    } catch (e) {
      console.error('[drawing] export', e);
      setMsg({ text: "Couldn't build the image. Try again once the sheet finishes loading." });
    }
  };

  const fitPage = () => {
    const el = scrollRef.current;
    if (!el) return;
    const w = Math.max(600, el.clientWidth - 80), h = el.clientHeight - 60;
    setZoom(Math.max(0.4, +Math.min(1, h / (w * aspect)).toFixed(2)));
  };
  const fullScreen = () => { const el = rootRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };

  if (error && !sheet) {
    return <div className="k-page"><EmptyState icon={<WarningCircle size={22} />} title="Couldn't open this sheet" text={error} action={<Button href={`${base}/drawings`}>Back to drawings</Button>} /></div>;
  }

  const d = sheet?.drawing;
  const sheets = list.filter((s) => s.status !== 'superseded' || s.id === drawingId).sort((a, b) => a.sheet_number.localeCompare(b.sheet_number, undefined, { numeric: true }));
  const idx = sheets.findIndex((s) => s.id === drawingId);
  const prev = idx > 0 ? sheets[idx - 1] : null, next = idx >= 0 && idx < sheets.length - 1 ? sheets[idx + 1] : null;
  const current = sheet?.revisions.find((r) => r.status === 'current');
  const older = (sheet?.revisions || []).filter((r) => r.id !== drawingId);
  const pageMarkups = markups.filter((m) => (m.page_number || 1) === page && m.markup_type !== 'stamp');
  const pins = (sheet?.pins || []).filter((p) => p.page === page);
  const pinSel = (sheet?.pins || []).find((p) => p.id === activePin) || null;
  const isDraw = DRAW_TOOLS.includes(tool);
  const markupLabel: Record<string, string> = { freehand: 'Pen', arrow: 'Line / arrow', rect: 'Rectangle', circle: 'Ellipse', cloud: 'Revision cloud', text: 'Text', measure: 'Measurement', link: 'Link' };
  const privateCount = markups.filter((m) => m.data?.private).length;

  return (
    <div className="dz" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadRevision(f); e.target.value = ''; }} />

      {/* ── top bar ── */}
      <header className="dz-top">
        <Link href={`${base}/drawings`} className="dz-ib" title="All drawings" aria-label="All drawings"><CaretLeft size={18} /></Link>
        <div className="dz-sheet">
          <button type="button" className="dz-ib" disabled={!prev} aria-label="Previous sheet" onClick={() => prev && router.push(`${base}/drawings/${prev.id}`)}><CaretLeft size={16} /></button>
          <label className="dz-sel">
            <span className="dz-sel-v"><b>{d?.sheet_number || '…'}</b><span>{d?.name}</span></span>
            <CaretDown size={14} />
            <select value={drawingId} aria-label="Sheet" onChange={(e) => router.push(`${base}/drawings/${e.target.value}`)}>
              {!sheets.some((s) => s.id === drawingId) && <option value={drawingId}>{d?.sheet_number}</option>}
              {sheets.map((s) => <option key={s.id} value={s.id}>{s.sheet_number} — {s.title}</option>)}
            </select>
          </label>
          <button type="button" className="dz-ib" disabled={!next} aria-label="Next sheet" onClick={() => next && router.push(`${base}/drawings/${next.id}`)}><CaretRight size={16} /></button>
        </div>
        {d && <Badge tone={statusTone(d.status)} dot>{label(d.status)} · Rev {d.version || '—'}</Badge>}
        <span className="dz-grow" />
        {older.length > 0 && (
          <label className="dz-sel dz-sel-sm" title="Compare with an older revision">
            <SquareHalf size={15} /><span className="dz-sel-v">{compareId ? `vs Rev ${sheet?.revisions.find((r) => r.id === compareId)?.version}` : 'Compare'}</span><CaretDown size={13} />
            <select value={compareId || ''} aria-label="Compare with" onChange={(e) => setCompareId(e.target.value || null)}>
              <option value="">No comparison</option>
              {older.map((r) => <option key={r.id} value={r.id}>Rev {r.version} · {day(r.revision_date || r.created_at)}</option>)}
            </select>
          </label>
        )}
        <span className="dz-div" />
        <button type="button" className="dz-ib" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z / 1.2).toFixed(2)))}>−</button>
        <label className="dz-sel dz-sel-sm dz-zoom">
          <span className="dz-sel-v">{Math.round(zoom * 100)}%</span><CaretDown size={13} />
          <select value="" aria-label="Zoom" onChange={(e) => { const v = e.target.value; if (v === 'page') fitPage(); else if (v) setZoom(Number(v)); }}>
            <option value="" disabled>Zoom</option><option value="page">Fit page</option><option value="1">Fit width</option>
            {[0.5, 0.75, 1.5, 2, 3, 4].map((z) => <option key={z} value={z}>{z * 100}%</option>)}
          </select>
        </label>
        <button type="button" className="dz-ib" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, +(z * 1.2).toFixed(2)))}>+</button>
        <button type="button" className="dz-ib" aria-label="Fit page" title="Fit page" onClick={fitPage}><ArrowsOut size={17} /></button>
        <span className="dz-div" />
        <button type="button" className="dz-ib" aria-label="Full screen" title="Full screen" onClick={fullScreen}><CornersOut size={17} /></button>
        {d?.url && <a className="dz-ib" href={d.url} target="_blank" rel="noreferrer" download aria-label="Download the original file" title="Download the original file"><DownloadSimple size={17} /></a>}
        <button type="button" className="dz-act" disabled={!sheet || rendering} onClick={() => void exportPng()} title="Save this page with markups and pins as an image"><DownloadSimple size={16} /> With markups</button>
        <button type="button" className="dz-act" disabled={!sheet || busy} onClick={() => fileRef.current?.click()}><UploadSimple size={16} /> Upload revision</button>
      </header>

      {/* ── properties ── */}
      <div className="dz-props">
        <span className="dz-tool-name">{TOOL_LABEL[tool]}</span>
        {(isDraw && tool !== 'calibrate') ? (
          <>
            <span className="dz-div" />
            <div className="dz-swatches" role="radiogroup" aria-label="Color">
              {SWATCHES.map((s) => <button key={s.n} type="button" role="radio" aria-checked={color === s.c} aria-label={s.n} title={s.n} className="dz-sw" style={{ background: s.c }} data-on={color === s.c || undefined} onClick={() => setColor(s.c)} />)}
            </div>
            <span className="dz-div" />
            <div className="dz-weights" role="radiogroup" aria-label="Line weight">
              {WEIGHTS.map((w) => <button key={w.w} type="button" role="radio" aria-checked={weight === w.w} title={w.n} className="dz-wt" data-on={weight === w.w || undefined} onClick={() => setWeight(w.w)}><i style={{ height: w.w }} />{w.n}</button>)}
            </div>
            {tool === 'area' && <span className="dz-hint">Click each corner · double-click or Enter to close</span>}
            {tool === 'link' && <span className="dz-hint">Drag a box over a callout, then pick the sheet it points to</span>}
            {tool === 'count' && <span className="dz-hint">Click each one to count it · each color is its own tally</span>}
            {(tool === 'measure' || tool === 'area') && !ftPerUnit && <button type="button" className="dz-link" onClick={() => setTool('calibrate')}>Set the scale first</button>}
          </>
        ) : (
          <span className="dz-hint">
            {tool === 'select' && 'Click a markup or pin to select it. Delete removes it. Ctrl+Z undoes your last markup.'}
            {tool === 'pan' && 'Drag the sheet to move around. Ctrl + scroll zooms.'}
            {tool === 'calibrate' && 'Trace a dimension printed on the sheet, then type its real length.'}
            {tool === 'erase' && 'Click a markup to remove it.'}
            {tool === 'area' && 'Click each corner. Double-click or press Enter to close the area.'}
            {PIN_TOOLS.includes(tool) && `Click the sheet where the ${tool === 'rfi' ? 'RFI' : tool === 'punch' ? 'punch item' : 'note'} goes.`}
          </span>
        )}
        <span className="dz-grow" />
        <button type="button" className="dz-vis" data-on={priv || undefined} onClick={() => setPriv((v) => !v)} title="Who sees the markups you draw next">
          {priv ? <><Lock size={14} weight="bold" /> Only me</> : <><LockOpen size={14} /> Everyone on the job</>}
        </button>
        <label className="dz-toggle"><input type="checkbox" checked={showMarkups} onChange={(e) => setShowMarkups(e.target.checked)} /> Markups</label>
        <label className="dz-toggle"><input type="checkbox" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} /> Pins</label>
      </div>

      <div className="dz-body">
        {/* ── tool palette ── */}
        <nav className="dz-tools" aria-label="Tools">
          {TOOL_GROUPS.map((g, gi) => (
            <div key={gi} className="dz-tgroup">
              {g.tools.map((t) => (
                <button key={t.k} type="button" className="dz-tool" data-k={t.k} data-on={tool === t.k || undefined} aria-pressed={tool === t.k} aria-label={t.label}
                  onClick={() => { setTool(t.k); setPinDraft(null); setTextAt(null); setCalib(null); }}>
                  {t.icon}
                  <span className="dz-tip">{t.label}{t.key ? <kbd>{t.key}</kbd> : null}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="dz-tgroup dz-tgroup-end">
            <button type="button" className="dz-tool" aria-label="Undo" disabled={!myIds.length} onClick={() => void undo()}><ArrowCounterClockwise size={19} /><span className="dz-tip">Undo <kbd>Ctrl Z</kbd></span></button>
          </div>
        </nav>

        {/* ── canvas ── */}
        <main className="dz-stage">
          {d?.status === 'superseded' && current && (
            <div className="dz-banner"><ClockCounterClockwise size={15} /> Older revision. <Link href={`${base}/drawings/${current.id}`}>Open the current sheet (Rev {current.version})</Link></div>
          )}
          {compareId && <div className="dz-legend"><i style={{ background: 'rgb(22,163,74)' }} /> Added <i style={{ background: 'rgb(220,38,38)' }} /> Removed <i style={{ background: 'rgb(45,45,45)' }} /> Unchanged</div>}
          {msg && <div className="dz-toast" data-ok={msg.ok || undefined} role="status">{msg.text}<button type="button" aria-label="Dismiss" onClick={() => setMsg(null)}><X size={12} /></button></div>}
          <div ref={scrollRef} className="dz-scroll">
            <div className="dz-paper" data-tool={tool}>
              <canvas ref={canvasRef} />
              {rendering && <div className="dz-loading"><span className="dz-spin" /> Loading sheet</div>}
              <svg ref={svgRef} className="dz-svg" viewBox={`0 0 ${REF_W} ${REF_H}`} preserveAspectRatio="none"
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => void onUp()} onPointerLeave={() => { drag.current = null; setCursor(null); }}>
                <defs>
                  <filter id="dw-sel" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgb(232,255,42)" floodOpacity="1" /></filter>
                </defs>
                {showMarkups && pageMarkups.map((m) => (
                  <MarkupShape key={m.id} m={m} scale={ftPerUnit} selected={selMarkup === m.id} interactive={tool === 'select' || tool === 'erase' || (m.markup_type === 'link' && tool === 'pan')}
                    onPick={() => {
                      if (tool === 'erase') { void removeMarkup(m.id); return; }
                      if (m.markup_type === 'link' && m.entity_id) { router.push(`${base}/drawings/${m.entity_id}`); return; }
                      setSelMarkup(m.id); setTab('markups');
                    }} />
                ))}
                {showMarkups && counts.filter((m) => (m.page_number || 1) === page).map((m) => {
                  const same = counts.filter((x) => x.data.style.color === m.data.style.color);
                  const n = same.indexOf(m) + 1, [x, y] = m.data.geometry[0];
                  return (
                    <g key={m.id} style={{ pointerEvents: tool === 'select' || tool === 'erase' ? 'all' : 'none', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); if (tool === 'erase') void removeMarkup(m.id); else { setSelMarkup(m.id); setTab('markups'); } }}
                      filter={selMarkup === m.id ? 'url(#dw-sel)' : undefined}>
                      <circle cx={x} cy={y} r={11} fill={m.data.style.color} stroke="white" strokeWidth={2} />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="white">{n}</text>
                    </g>
                  );
                })}
                {draftPts && (() => {
                  const fake: Markup = {
                    id: 'draft', page_number: page, color, created_by: '', created_by_name: '', created_at: '',
                    markup_type: tool === 'pen' || tool === 'highlight' ? 'freehand' : tool === 'line' || tool === 'arrow' ? 'arrow' : tool === 'ellipse' ? 'circle' : tool === 'rect' ? 'rect' : tool === 'cloud' ? 'cloud' : tool === 'link' ? 'link' : 'measure',
                    data: { space: 'image', w: REF_W, h: REF_H, geometry: draftPts, style: tool === 'highlight' ? { color, width: Math.max(12, weight * 4), opacity: 0.35 } : tool === 'calibrate' ? { color: 'rgb(232,255,42)', width: 2 } : { color, width: weight, head: tool !== 'line' } },
                  };
                  if (tool === 'calibrate') fake.data.feet = undefined;
                  if (tool === 'area') { fake.data.kind = 'area'; fake.data.style = { color, width: weight }; }
                  return <MarkupShape m={fake} scale={tool === 'calibrate' ? null : ftPerUnit} selected={false} interactive={false} onPick={() => undefined} />;
                })()}
                {calib && <line x1={calib.a[0]} y1={calib.a[1]} x2={calib.b[0]} y2={calib.b[1]} stroke="rgb(232,255,42)" strokeWidth={3} strokeDasharray="6 4" />}
              </svg>

              {showPins && pins.map((p, i) => {
                const k = pinKind(p);
                return (
                  <button key={p.id} type="button" className="dz-pin" data-k={k} data-closed={p.item?.closed || undefined} data-on={activePin === p.id || undefined}
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={p.item ? p.item.name : p.title || 'Note'}
                    onClick={(e) => { e.stopPropagation(); if (tool === 'erase') void removePin(p); else { setActivePin(p.id); setTab('pins'); } }}>
                    {p.item?.closed ? <CheckCircle size={13} weight="fill" /> : k === 'rfi' ? <Question size={13} weight="bold" /> : k === 'punch' ? <Wrench size={13} weight="bold" /> : k === 'note' ? <NotePencil size={13} weight="bold" /> : <MapPin size={13} weight="bold" />}
                    <span>{i + 1}</span>
                  </button>
                );
              })}

              {pinSel && pinSel.page === page && (
                <div className="dz-pop" style={{ left: `${pinSel.x * 100}%`, top: `${pinSel.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
                  <header><b>{pinSel.item ? pinSel.item.noun : 'Note'}</b>{pinSel.item && <Badge tone={pinSel.item.closed ? 'completed' : 'under_contract'}>{pinSel.item.status}</Badge>}<button type="button" aria-label="Close" onClick={() => setActivePin(null)}><X size={12} /></button></header>
                  <p>{pinSel.item ? pinSel.item.name : pinSel.title || pinSel.description}</p>
                  <footer>
                    {pinSel.item && <Link className="dz-btn" data-primary href={pinSel.item.href}>Open <ArrowSquareOut size={12} /></Link>}
                    <button type="button" className="dz-btn" onClick={() => void removePin(pinSel)}><Trash size={12} /> Remove pin</button>
                  </footer>
                </div>
              )}

              {pinDraft && (
                <div className="dz-pop dz-pop-new" style={{ left: `${pinDraft.x * 100}%`, top: `${pinDraft.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
                  <header><b>{pinDraft.kind === 'rfi' ? 'New RFI on this sheet' : pinDraft.kind === 'punch' ? 'New punch item on this sheet' : 'Note on this sheet'}</b><button type="button" aria-label="Cancel" onClick={() => setPinDraft(null)}><X size={12} /></button></header>
                  <input autoFocus className="dz-input" placeholder={pinDraft.kind === 'rfi' ? 'What needs an answer?' : pinDraft.kind === 'punch' ? 'What needs fixing?' : 'Write the note'} value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void pinCreate(); }} />
                  <button type="button" className="dz-btn" data-primary disabled={busy || !pinTitle.trim()} onClick={() => void pinCreate()}><Plus size={12} weight="bold" /> {busy ? 'Saving…' : pinDraft.kind === 'rfi' ? 'Create RFI' : pinDraft.kind === 'punch' ? 'Create punch item' : 'Pin note'}</button>
                  {pinDraft.kind !== 'note' && (
                    <>
                      <p className="dz-or"><LinkSimple size={12} /> Or pin one that exists</p>
                      <input className="dz-input" placeholder={`Search ${pinDraft.kind === 'rfi' ? 'RFIs' : 'punch items'}`} value={q} onChange={(e) => setQ(e.target.value)} />
                      <div className="dz-hits">{hits.length === 0 ? <p className="dz-dim">None on this job yet.</p> : hits.slice(0, 6).map((h) => <button key={h.id} type="button" disabled={busy} onClick={() => void pinLink(h)}><span>{h.name}</span><small>{h.status}</small></button>)}</div>
                    </>
                  )}
                </div>
              )}

              {textAt && (
                <div className="dz-pop dz-pop-text" style={{ left: `${(textAt[0] / REF_W) * 100}%`, top: `${(textAt[1] / REF_H) * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
                  <input autoFocus className="dz-input" placeholder="Type, then Enter" value={textVal} onChange={(e) => setTextVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveText(); if (e.key === 'Escape') setTextAt(null); }} onBlur={() => void saveText()} />
                </div>
              )}

              {linkDraft && (
                <div className="dz-pop" style={{ left: `${(Math.max(linkDraft.a[0], linkDraft.b[0]) / REF_W) * 100}%`, top: `${(Math.min(linkDraft.a[1], linkDraft.b[1]) / REF_H) * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
                  <header><b>Link this area to a sheet</b><button type="button" aria-label="Cancel" onClick={() => setLinkDraft(null)}><X size={12} /></button></header>
                  <div className="dz-hits">
                    {sheets.filter((x) => x.id !== drawingId).length === 0 ? <p className="dz-dim">No other sheets on this job yet.</p> : sheets.filter((x) => x.id !== drawingId).map((x) => (
                      <button key={x.id} type="button" onClick={async () => { const ld = linkDraft; setLinkDraft(null); await saveMarkup('link', [ld.a, ld.b], { text: x.sheet_number }, { color: 'rgb(161,178,0)', width: 2 }, { type: 'drawings', id: x.id }); }}>
                        <span><b>{x.sheet_number}</b> {x.title}</span><small>{x.discipline || ''}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {calib && (
                <div className="dz-pop" style={{ left: `${(calib.b[0] / REF_W) * 100}%`, top: `${(calib.b[1] / REF_H) * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
                  <header><b>How long is that line?</b><button type="button" aria-label="Cancel" onClick={() => setCalib(null)}><X size={12} /></button></header>
                  <input autoFocus className="dz-input" placeholder={`e.g. 24' 6"`} value={calibVal} onChange={(e) => setCalibVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveCalib(); }} />
                  <button type="button" className="dz-btn" data-primary onClick={() => void saveCalib()}>Set scale</button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ── side panel ── */}
        <aside className="dz-side">
          <div className="dz-tabs" role="tablist">
            {([['markups', 'Markups', pageMarkups.length], ['pins', 'Pins', sheet?.pins.length ?? 0], ['revs', 'Revisions', sheet?.revisions.length ?? 0]] as const).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} data-on={tab === k || undefined} onClick={() => setTab(k)}>{l}<span>{n}</span></button>
            ))}
          </div>
          <div className="dz-pane">
            {tab === 'markups' && privateCount > 0 && (
              <div className="dz-privbar"><Lock size={13} weight="bold" /> {privateCount} only you can see <button type="button" className="dz-link" onClick={() => void publishAll()}>Publish all</button></div>
            )}
            {tab === 'markups' && counts.length > 0 && (
              <div className="dz-counts">
                {Array.from(new Set(counts.map((c) => c.data.style.color))).map((c) => (
                  <span key={c}><i style={{ background: c }} /><b>{counts.filter((x) => x.data.style.color === c).length}</b> counted</span>
                ))}
              </div>
            )}
            {tab === 'markups' && (pageMarkups.length === 0 ? (
              <div className="dz-empty"><PencilSimple size={26} /><b>No markups on this page</b><span>Pick a tool on the left and draw on the sheet. Everyone on the job sees them.</span></div>
            ) : pageMarkups.slice().reverse().map((m) => (
              <React.Fragment key={m.id}>
              <div className="dz-row" data-on={selMarkup === m.id || undefined} onClick={() => { setSelMarkup(m.id); setTool('select'); }}>
                <span className="dz-chip" style={{ background: m.data?.style?.color || m.color }} />
                <span className="dz-row-t"><b>{markupLabel[m.markup_type] || label(m.markup_type)}{(m.markup_type === 'text' || m.markup_type === 'link') && m.data?.text ? ` · ${m.markup_type === 'link' ? 'to ' : ''}${m.data.text}` : ''}{m.markup_type === 'measure' ? (m.data?.kind === 'area' ? ` · ${m.data.sqft != null ? sqftLabel(m.data.sqft) : '—'}` : ` · ${m.data?.feet != null ? feetIn(m.data.feet) : ftPerUnit ? feetIn(dist(m.data.geometry[0], m.data.geometry[1]) * ftPerUnit) : '—'}`) : ''}</b><small>{(m.created_by_name || '').split('@')[0] || 'Someone'} · {day(m.created_at)}</small></span>
                {m.data?.private && <button type="button" className="dz-pub" title="Only you can see this. Publish to share it." onClick={(e) => { e.stopPropagation(); void publish(m); }}><Lock size={12} weight="bold" /> Publish</button>}
                {m.markup_type === 'link' && m.entity_id && <Link className="dz-x" style={{ opacity: 1, display: 'grid', placeItems: 'center' }} href={`${base}/drawings/${m.entity_id}`} aria-label="Open linked sheet" onClick={(e) => e.stopPropagation()}><ArrowSquareOut size={14} /></Link>}
                <button type="button" className="dz-x" aria-label="Remove markup" onClick={(e) => { e.stopPropagation(); void removeMarkup(m.id); }}><Trash size={14} /></button>
                {(m.comments?.length ?? 0) > 0 && selMarkup !== m.id && <span className="dz-ccount" title="Comments">{m.comments!.length}</span>}
              </div>
              {selMarkup === m.id && !m.id.startsWith('tmp-') && (
                <div className="dz-thread">
                  {(m.comments || []).map((c) => (
                    <div key={c.id} className="dz-comment"><b>{(c.author_name || '').split('@')[0] || 'Someone'}</b><small>{day(c.created_at)}</small><p>{c.content}</p></div>
                  ))}
                  <div className="dz-reply">
                    <input className="dz-input" placeholder="Comment on this markup" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addComment(m); }} />
                    <button type="button" className="dz-btn" data-primary disabled={!commentText.trim()} onClick={() => void addComment(m)}>Post</button>
                  </div>
                </div>
              )}
              </React.Fragment>
            )))}
            {tab === 'pins' && ((sheet?.pins.length ?? 0) === 0 ? (
              <div className="dz-empty"><MapPin size={26} /><b>No pins yet</b><span>Use RFI, Punch or Note in the tools and click the sheet.</span></div>
            ) : sheet!.pins.map((p) => {
              const k = pinKind(p);
              return (
                <div key={p.id} className="dz-row" data-on={activePin === p.id || undefined} onClick={() => { setActivePin(p.id); if (p.page !== page) setPage(p.page); }}>
                  <span className="dz-pinmini" data-k={k} data-closed={p.item?.closed || undefined} />
                  <span className="dz-row-t">{p.item ? <Link href={p.item.href} onClick={(e) => e.stopPropagation()}>{p.item.name}</Link> : <b>{p.title || 'Note'}</b>}<small>{p.item ? p.item.status : 'Note'}{pages > 1 ? ` · page ${p.page}` : ''}</small></span>
                </div>
              );
            }))}
            {tab === 'revs' && (
              <ol className="dz-tl">
                {(sheet?.revisions || []).map((r) => (
                  <li key={r.id} data-on={r.id === drawingId || undefined} data-cur={r.status === 'current' || undefined}>
                    <span className="dz-tl-dot" />
                    <div><Link href={`${base}/drawings/${r.id}`}>Rev {r.version || '—'}</Link> <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge><small>{day(r.revision_date || r.created_at)}</small>
                      {r.id !== drawingId && <button type="button" className="dz-link" onClick={() => setCompareId(r.id)}><SquareHalf size={12} /> Compare</button>}</div>
                  </li>
                ))}
                <li><span className="dz-tl-dot" data-new /><div><button type="button" className="dz-link" onClick={() => fileRef.current?.click()}><UploadSimple size={12} /> Upload the next revision</button><small>Same sheet number; this one is kept as superseded.</small></div></li>
              </ol>
            )}
          </div>
        </aside>
      </div>

      {/* ── status bar ── */}
      <footer className="dz-status">
        {pages > 1 ? (
          <span className="dz-pages"><button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><CaretLeft size={12} /></button>Page {page} of {pages}<button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><CaretRight size={12} /></button></span>
        ) : <span>Page 1 of 1</span>}
        <span>{Math.round(zoom * 100)}%</span>
        <span>{ftPerUnit ? <>Scale set from a {feetIn(scaleMk?.data.feet ?? 0)} dimension · <button type="button" className="dz-link" onClick={() => setTool('calibrate')}>Reset</button></> : <button type="button" className="dz-link" onClick={() => setTool('calibrate')}>Scale not set — set it</button>}</span>
        {cursor && ftPerUnit && <span>{feetIn(cursor[0] * ftPerUnit)}, {feetIn(cursor[1] * ftPerUnit)}</span>}
        <span className="dz-grow" />
        <span>{markups.filter((m) => m.markup_type !== 'stamp').length} markups · {counts.length} counted · {sheet?.pins.length ?? 0} pins</span>
        <span className="dz-save" data-s={saveState}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'failed' ? 'Not saved' : 'Up to date'}</span>
        <span className="dz-showhide">{showMarkups ? <Eye size={13} /> : <EyeSlash size={13} />}</span>
      </footer>
    </div>
  );
}

const CSS = `
.dz{--dz-ink:rgb(226,232,240);--dz-dim:rgb(148,163,184);--dz-line:rgba(148,163,184,.18);--dz-chrome:rgb(17,24,35);--dz-chrome-2:rgb(24,33,47);--dz-well:rgb(10,14,22);--dz-hot:var(--brand-primary);
  display:flex;flex-direction:column;height:calc(100vh - 150px);min-height:520px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--dz-line);border-radius:10px;overflow:hidden;background:var(--dz-chrome);color:var(--dz-ink);font-size:13px}
.dz:fullscreen{height:100vh !important;border-radius:0}
.dz-top{display:flex;align-items:center;gap:6px;height:52px;padding:0 10px;background:var(--dz-chrome);border-bottom:1px solid var(--dz-line);flex:none;min-width:0;overflow-x:auto;scrollbar-width:none}
.dz-top::-webkit-scrollbar{display:none}
.dz-grow{flex:1}
.dz-div{width:1px;height:22px;background:var(--dz-line);margin:0 4px;flex:none}
.dz-ib{display:inline-grid;place-items:center;min-width:34px;height:34px;border-radius:7px;border:0;background:none;color:var(--dz-dim);cursor:pointer;font:600 18px/1 inherit;text-decoration:none;flex:none}
.dz-ib:hover:not(:disabled){background:var(--dz-chrome-2);color:var(--dz-ink)}
.dz-ib:disabled{opacity:.3;cursor:default}
.dz-sheet{display:flex;align-items:center;gap:2px;min-width:0}
.dz-sel{position:relative;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 10px;border-radius:7px;background:var(--dz-chrome-2);border:1px solid var(--dz-line);color:var(--dz-ink);cursor:pointer;min-width:0}
.dz-sel:hover{border-color:rgba(148,163,184,.4)}
.dz-sel select{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:16px}
.dz-sel-v{display:flex;gap:8px;align-items:baseline;min-width:0;white-space:nowrap}
.dz-sel-v b{font-size:15px;color:var(--title-page,var(--dz-hot))}
.dz-sel-v span{color:var(--dz-dim);overflow:hidden;text-overflow:ellipsis;max-width:22vw}
.dz-sel-sm{height:32px;gap:6px;font-weight:600}
.dz-zoom{min-width:78px;justify-content:space-between}
.dz-act{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;margin-left:6px;border-radius:7px;border:1px solid var(--dz-line);background:var(--dz-chrome-2);color:var(--dz-ink);font:600 13px/1 inherit;cursor:pointer;white-space:nowrap}
.dz-act:hover{border-color:var(--dz-hot)}
.dz-props{display:flex;align-items:center;gap:8px;height:42px;padding:0 12px 0 98px;background:var(--dz-chrome-2);border-bottom:1px solid var(--dz-line);flex:none;overflow-x:auto}
.dz-tool-name{font-weight:700;color:var(--dz-ink);min-width:96px}
.dz-hint{color:var(--dz-dim);white-space:nowrap}
.dz-swatches{display:flex;gap:6px}
.dz-sw{width:22px;height:22px;border-radius:50%;border:2px solid var(--dz-chrome-2);box-shadow:0 0 0 1px var(--dz-line);cursor:pointer;padding:0}
.dz-sw[data-on]{box-shadow:0 0 0 2px var(--dz-hot)}
.dz-weights{display:flex;gap:4px}
.dz-wt{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:6px;border:1px solid transparent;background:none;color:var(--dz-dim);font:600 12px/1 inherit;cursor:pointer}
.dz-wt i{display:block;width:18px;border-radius:4px;background:currentColor}
.dz-wt[data-on]{border-color:var(--dz-line);background:var(--dz-chrome);color:var(--dz-ink)}
.dz-toggle{display:inline-flex;align-items:center;gap:6px;color:var(--dz-dim);white-space:nowrap;cursor:pointer}
.dz-toggle input{accent-color:var(--dz-hot)}
.dz-body{flex:1;min-height:0;min-width:0;display:grid;grid-template-columns:88px minmax(0,1fr) minmax(240px,300px)}
@media (max-width:1100px){.dz-body{grid-template-columns:88px minmax(0,1fr)}.dz-side{display:none}.dz-props{padding-left:12px}}
.dz-tools{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;background:var(--dz-chrome);border-right:1px solid var(--dz-line);overflow:visible;position:relative;z-index:3}
.dz-tgroup{display:grid;grid-template-columns:repeat(2,36px);gap:3px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid var(--dz-line)}
.dz-tgroup-end{border:0;margin-top:auto}
.dz-tool{position:relative;display:grid;place-items:center;width:36px;height:36px;border-radius:7px;border:0;background:none;color:var(--dz-dim);cursor:pointer}
.dz-tool:hover:not(:disabled){background:var(--dz-chrome-2);color:var(--dz-ink)}
.dz-tool[data-on]{background:var(--dz-hot);color:var(--bg-base)}
.dz-tool[data-k=rfi]:not([data-on]){color:rgb(248,113,113)}.dz-tool[data-k=punch]:not([data-on]){color:rgb(251,191,36)}
.dz-tool:disabled{opacity:.3;cursor:default}
.dz-tip{position:absolute;left:44px;top:50%;transform:translateY(-50%);display:none;align-items:center;gap:8px;padding:6px 9px;border-radius:6px;background:var(--dz-well);border:1px solid var(--dz-line);color:var(--dz-ink);font:600 12px/1 inherit;white-space:nowrap;z-index:20;pointer-events:none}
.dz-tip kbd{padding:2px 5px;border-radius:4px;background:var(--dz-chrome-2);color:var(--dz-dim);font:600 11px/1 inherit}
.dz-tool:hover .dz-tip,.dz-tool:focus-visible .dz-tip{display:inline-flex}
.dz-stage{position:relative;min-width:0;min-height:0;display:flex;background:var(--dz-well)}
.dz-scroll{flex:1;overflow:auto;padding:28px 40px}
.dz-paper{position:relative;width:max-content;margin:0 auto;line-height:0;background:white;box-shadow:0 1px 0 rgba(255,255,255,.04),0 24px 64px rgba(0,0,0,.6)}
.dz-paper canvas{display:block}
.dz-svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
.dz-paper[data-tool=pan] .dz-svg{cursor:grab}.dz-paper[data-tool=pan] .dz-svg:active{cursor:grabbing}
.dz-paper[data-tool=pen] .dz-svg,.dz-paper[data-tool=highlight] .dz-svg,.dz-paper[data-tool=line] .dz-svg,.dz-paper[data-tool=arrow] .dz-svg,.dz-paper[data-tool=rect] .dz-svg,.dz-paper[data-tool=ellipse] .dz-svg,.dz-paper[data-tool=cloud] .dz-svg,.dz-paper[data-tool=measure] .dz-svg,.dz-paper[data-tool=calibrate] .dz-svg,.dz-paper[data-tool=rfi] .dz-svg,.dz-paper[data-tool=punch] .dz-svg,.dz-paper[data-tool=note] .dz-svg{cursor:crosshair}
.dz-paper[data-tool=text] .dz-svg{cursor:text}
.dz-paper[data-tool=erase] .dz-svg{cursor:not-allowed}
.dz-loading{position:absolute;top:14px;left:14px;display:flex;gap:8px;align-items:center;line-height:1;padding:8px 12px;border-radius:7px;background:var(--dz-chrome);color:var(--dz-ink)}
.dz-spin{width:12px;height:12px;border-radius:50%;border:2px solid var(--dz-line);border-top-color:var(--dz-hot);animation:dzspin .8s linear infinite}
@keyframes dzspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dz-spin{animation:none}}
.dz-pin{position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 7px 0 5px;border-radius:12px;border:2px solid white;background:var(--k);color:white;font:700 11px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.45);z-index:2}
.dz-pin[data-k=rfi],.dz-pinmini[data-k=rfi]{--k:rgb(220,38,38)}
.dz-pin[data-k=punch],.dz-pinmini[data-k=punch]{--k:rgb(217,119,6)}
.dz-pin[data-k=note],.dz-pinmini[data-k=note]{--k:rgb(71,85,105)}
.dz-pin[data-k=other],.dz-pinmini[data-k=other]{--k:rgb(147,51,234)}
.dz-pin[data-closed],.dz-pinmini[data-closed]{--k:rgb(22,163,74)}
.dz-pin[data-on]{box-shadow:0 0 0 3px var(--dz-hot),0 2px 8px rgba(0,0,0,.45)}
.dz-pop{position:absolute;z-index:5;transform:translate(16px,-50%);width:280px;padding:12px;border-radius:9px;background:var(--dz-chrome);border:1px solid var(--dz-line);box-shadow:0 18px 44px rgba(0,0,0,.6);line-height:1.4;display:grid;gap:8px;color:var(--dz-ink);font-size:13px}
.dz-pop header{display:flex;align-items:center;gap:8px}
.dz-pop header button{margin-left:auto;background:none;border:0;color:var(--dz-dim);cursor:pointer;min-width:26px;min-height:26px}
.dz-pop p{margin:0}
.dz-pop footer{display:flex;gap:6px;flex-wrap:wrap}
.dz-pop-text{width:240px;padding:6px;transform:translate(0,-50%)}
.dz-input{height:36px;padding:0 10px;border-radius:7px;border:1px solid var(--dz-line);background:var(--dz-well);color:var(--dz-ink);font-size:16px;outline:0}
.dz-input:focus{border-color:var(--dz-hot)}
.dz-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:7px;border:1px solid var(--dz-line);background:var(--dz-chrome-2);color:var(--dz-ink);font:600 13px/1 inherit;cursor:pointer;text-decoration:none}
.dz-btn[data-primary]{background:var(--dz-hot);border-color:var(--dz-hot);color:var(--bg-base)}
.dz-btn:disabled{opacity:.45;cursor:default}
.dz-or{display:flex;gap:6px;align-items:center;color:var(--dz-dim);font-size:12px}
.dz-hits{display:grid;gap:3px;max-height:170px;overflow:auto}
.dz-hits button{display:flex;justify-content:space-between;gap:8px;padding:7px 8px;border-radius:6px;border:1px solid var(--dz-line);background:var(--dz-chrome-2);color:var(--dz-ink);text-align:left;cursor:pointer;font-size:13px}
.dz-hits small{color:var(--dz-dim);white-space:nowrap}
.dz-hits button:hover{border-color:var(--dz-hot)}
.dz-banner,.dz-legend{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:4;display:flex;gap:8px;align-items:center;padding:6px 12px;border-radius:7px;background:var(--dz-chrome);border:1px solid var(--dz-line);white-space:nowrap}
.dz-banner{border-color:rgb(217,119,6)}.dz-banner a{color:var(--dz-ink)}
.dz-legend{top:auto;bottom:12px}
.dz-legend i{width:10px;height:10px;border-radius:2px;display:inline-block;margin-left:6px}
.dz-toast{position:absolute;bottom:14px;right:14px;z-index:6;display:flex;gap:10px;align-items:center;max-width:420px;padding:10px 12px;border-radius:8px;background:var(--dz-chrome);border:1px solid rgb(220,38,38);box-shadow:0 12px 32px rgba(0,0,0,.5)}
.dz-toast[data-ok]{border-color:rgb(22,163,74)}
.dz-toast button{background:none;border:0;color:var(--dz-dim);cursor:pointer}
.dz-side{display:flex;flex-direction:column;min-height:0;background:var(--dz-chrome);border-left:1px solid var(--dz-line)}
.dz-tabs{display:flex;border-bottom:1px solid var(--dz-line);flex:none}
.dz-tabs button{flex:1;min-width:0;display:inline-flex;justify-content:center;gap:5px;padding:13px 2px;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:none;color:var(--dz-dim);font:600 13px/1 inherit;cursor:pointer}
.dz-tabs button span{color:var(--dz-dim);font-weight:500}
.dz-tabs button[data-on]{color:var(--dz-ink);border-bottom-color:var(--dz-hot)}
.dz-pane{flex:1;overflow:auto;padding:6px}
.dz-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:7px;cursor:pointer}
.dz-row:hover,.dz-row[data-on]{background:var(--dz-chrome-2)}
.dz-row-t{display:grid;min-width:0;flex:1;gap:2px}
.dz-row-t b,.dz-row-t a{font-weight:600;color:var(--dz-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none}
.dz-row-t a:hover{text-decoration:underline}
.dz-row-t small{color:var(--dz-dim);font-size:12px}
.dz-chip{width:12px;height:12px;border-radius:3px;flex:none;box-shadow:0 0 0 1px var(--dz-line)}
.dz-pinmini{width:12px;height:12px;border-radius:50%;background:var(--k);box-shadow:0 0 0 2px white;flex:none}
.dz-x{background:none;border:0;color:var(--dz-dim);cursor:pointer;min-width:30px;min-height:30px;border-radius:6px;opacity:0}
.dz-row:hover .dz-x,.dz-row[data-on] .dz-x{opacity:1}
.dz-x:hover{color:rgb(248,113,113);background:var(--dz-chrome)}
.dz-empty{display:grid;justify-items:center;text-align:center;gap:6px;padding:48px 18px;color:var(--dz-dim);line-height:1.45}
.dz-empty b{color:var(--dz-ink)}
.dz-tl{list-style:none;margin:0;padding:8px 6px}
.dz-tl li{position:relative;display:grid;grid-template-columns:16px 1fr;gap:10px;padding-bottom:16px}
.dz-tl li:not(:last-child)::before{content:'';position:absolute;left:7px;top:16px;bottom:0;width:2px;background:var(--dz-line)}
.dz-tl li>div{display:grid;gap:3px}
.dz-tl a{color:var(--dz-ink);font-weight:600;text-decoration:none}
.dz-tl li[data-on] a{color:var(--title-page,var(--dz-hot))}
.dz-tl small{color:var(--dz-dim);font-size:12px}
.dz-tl-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--dz-dim);background:var(--dz-chrome);margin-top:1px;z-index:1}
.dz-tl li[data-cur] .dz-tl-dot{border-color:rgb(22,163,74);background:rgb(22,163,74)}
.dz-tl-dot[data-new]{border-style:dashed}
.dz-link{display:inline-flex;gap:5px;align-items:center;padding:0;border:0;background:none;color:var(--dz-ink);text-decoration:underline;font:inherit;cursor:pointer;width:max-content}
.dz-dim{color:var(--dz-dim);margin:0}
.dz-ccount{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--dz-chrome-2);color:var(--dz-ink);font:700 11px/20px inherit;text-align:center}
.dz-thread{display:grid;gap:8px;margin:0 6px 8px 28px;padding:10px;border-left:2px solid var(--dz-hot);background:var(--dz-chrome-2);border-radius:0 7px 7px 0}
.dz-comment{display:grid;grid-template-columns:auto 1fr;column-gap:8px;line-height:1.4}
.dz-comment small{color:var(--dz-dim);font-size:12px}
.dz-comment p{grid-column:1/-1;margin:2px 0 0;color:var(--dz-ink)}
.dz-reply{display:flex;gap:6px}
.dz-reply .dz-input{flex:1;min-width:0}
.dz-vis{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--dz-line);background:var(--dz-chrome);color:var(--dz-dim);font:600 12px/1 inherit;cursor:pointer;white-space:nowrap}
.dz-vis[data-on]{color:var(--dz-ink);border-color:var(--dz-hot)}
.dz-pub{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:5px;border:1px solid var(--dz-line);background:var(--dz-chrome);color:var(--dz-ink);font:600 11px/1 inherit;cursor:pointer;white-space:nowrap}
.dz-pub:hover{border-color:var(--dz-hot)}
.dz-privbar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dz-line);color:var(--dz-dim)}
.dz-counts{display:flex;flex-wrap:wrap;gap:12px;padding:8px 10px 10px;border-bottom:1px solid var(--dz-line);margin-bottom:4px}
.dz-counts span{display:inline-flex;align-items:center;gap:6px;color:var(--dz-dim)}
.dz-counts i{width:12px;height:12px;border-radius:50%;display:inline-block}
.dz-counts b{color:var(--dz-ink);font-size:15px}
.dz-status{display:flex;align-items:center;gap:16px;height:30px;padding:0 12px;background:var(--dz-chrome);border-top:1px solid var(--dz-line);color:var(--dz-dim);font-size:12px;flex:none;white-space:nowrap;overflow:hidden}
.dz-pages{display:inline-flex;align-items:center;gap:4px}
.dz-pages button{display:grid;place-items:center;width:20px;height:20px;border-radius:4px;border:0;background:none;color:var(--dz-dim);cursor:pointer}
.dz-pages button:disabled{opacity:.3}
.dz-save[data-s=saved]{color:rgb(74,222,128)}.dz-save[data-s=failed]{color:rgb(248,113,113)}.dz-save[data-s=saving]{color:var(--dz-ink)}
`;
