'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { lengthLF, areaSF } from '@/lib/takeoff/geometry';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Drawing review — public portal page (B4 + Wave-2 guest markups).
 * Token-gated, no auth.
 *
 * An owner/architect opens /portals/drawing-review/<token> from a text or
 * email link. The page renders the sheet (pdf.js for PDFs — house pattern:
 * dynamic import + '/pdf.worker.min.mjs'; plain raster for images), overlays
 * every visual markup, offers wheel+drag pan/zoom and a page picker for
 * multi-page PDFs, shows author + time on hover, and polls the portal API
 * every 10s so new markups appear.
 *
 * Wave-2: guests can add comment markups (freehand, cloud, arrow, rect, text
 * — the API enforces the same list). First use asks their name once
 * (localStorage 'sag_review_name'); committed markups POST to the portal API,
 * render optimistically, and reconcile with the 10s poll by server id.
 *
 * Wave-3: guests can edit/remove their OWN markups. A per-token local ledger
 * (localStorage 'sag_review_mine:<token>') records the ids this browser
 * created; tapping a ledger row (pan mode) opens a machined chip pair —
 * 'Edit text' (text markups only, inline input, Enter saves via PATCH) and
 * 'Remove' (confirm popover, DELETE, optimistic w/ rollback toast). Rows not
 * in the ledger stay read-only; the server re-verifies ownership regardless.
 *
 * The geometry helpers below are deliberate minimal COPIES of the canonical
 * markup model (components/drawings/markup-model.ts is app-shell code and is
 * not imported here). Measure math comes from the canonical takeoff engine
 * (lib/takeoff — read-only import), so portal labels match the editor's.
 */

/* ── Design tokens (gold-on-black, matches the portal family) ── */
const GOLD = '#F59E0B', DARK = '#0a0a0a', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)', DIM = '#CBD5E1', TEXT = '#FFFFFF';

const card = (extra?: React.CSSProperties): React.CSSProperties => ({ background: RAISED, backgroundImage: 'linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))', border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)', ...extra });
const zoomBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${BORDER}`, background: RAISED, color: TEXT, fontSize: 16, fontWeight: 800, cursor: 'pointer', lineHeight: 1 };

const PDF_LONG_EDGE = 2600; // crisp raster for plan sheets (house constant)

/* ── minimal markup model (copied; legacy-tolerant, never throws) ───────── */

type Pt = { x: number; y: number };

interface MarkupRow {
  id: string;
  markup_type: string;
  data: unknown;
  page_number: number | null;
  color: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface CanonicalData {
  w: number; h: number;
  geometry: Record<string, unknown>;
  style: { color: string; width: number };
  text?: string;
  fontSize?: number;
  stamp?: string;
  ppf: number | null;
  mkind?: 'linear' | 'area' | 'count';
}

type ParsedMarkup =
  | { mode: 'canonical'; kind: string; data: CanonicalData }
  | { mode: 'legacy'; strokes: Pt[][]; color: string; refW: number }
  | { mode: 'invisible' };

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function toPt(v: unknown): Pt | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = Number(v[0]), y = Number(v[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const x = Number(o.x), y = Number(o.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function legacyStrokesFrom(value: unknown): Pt[][] {
  const out: Pt[][] = [];
  if (!Array.isArray(value)) return out;
  for (const entry of value) {
    if (Array.isArray(entry)) {
      const pts = entry.map(toPt).filter((p): p is Pt => !!p);
      if (pts.length >= 2) out.push(pts);
    } else if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      if (Array.isArray(o.points)) {
        const pts = (o.points as unknown[]).map(toPt).filter((p): p is Pt => !!p);
        if (pts.length >= 2) out.push(pts);
      }
    }
  }
  return out;
}

function parseMarkup(row: MarkupRow): ParsedMarkup {
  try {
    if (row.markup_type === 'link') return { mode: 'invisible' };
    const d = row.data;
    if (d && typeof d === 'object' && !Array.isArray(d) && (d as Record<string, unknown>).space === 'image') {
      const o = d as Record<string, unknown>;
      const style = (o.style && typeof o.style === 'object')
        ? { color: String((o.style as Record<string, unknown>).color || row.color || '#EF4444'), width: num((o.style as Record<string, unknown>).width) || 3 }
        : { color: row.color || '#EF4444', width: 3 };
      return {
        mode: 'canonical',
        kind: row.markup_type || 'freehand',
        data: {
          w: num(o.w), h: num(o.h),
          geometry: (o.geometry && typeof o.geometry === 'object' ? o.geometry : {}) as Record<string, unknown>,
          style,
          text: typeof o.text === 'string' ? o.text : undefined,
          fontSize: num(o.fontSize) || undefined,
          stamp: typeof o.stamp === 'string' ? o.stamp : undefined,
          ppf: typeof o.ppf === 'number' && o.ppf > 0 ? o.ppf : null,
          mkind: o.mkind === 'linear' || o.mkind === 'area' || o.mkind === 'count' ? o.mkind : undefined,
        },
      };
    }
    // LEGACY — mobile raw stroke array (view pixels) or old consolidated blob.
    let strokes: Pt[][] = [];
    let refW = 0;
    if (Array.isArray(d)) {
      strokes = legacyStrokesFrom(d);
    } else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      refW = num(o.w) || num(o.width);
      if (Array.isArray(o.strokes)) strokes = legacyStrokesFrom(o.strokes);
      else if (Array.isArray(o.points)) strokes = legacyStrokesFrom([o.points]);
    }
    return { mode: 'legacy', strokes, color: row.color || '#EF4444', refW };
  } catch {
    return { mode: 'invisible' };
  }
}

const geomPoints = (g: Record<string, unknown>): Pt[] => Array.isArray(g.points) ? (g.points as unknown[]).map(toPt).filter((p): p is Pt => !!p) : [];
const geomRect = (g: Record<string, unknown>) => ({ x: num(g.x), y: num(g.y), w: num(g.w), h: num(g.h) });
const geomLine = (g: Record<string, unknown>) => ({ x1: num(g.x1), y1: num(g.y1), x2: num(g.x2), y2: num(g.y2) });
const geomEllipse = (g: Record<string, unknown>) => ({ cx: num(g.cx), cy: num(g.cy), rx: num(g.rx), ry: num(g.ry) });
const geomPoint = (g: Record<string, unknown>): Pt => ({ x: num(g.x), y: num(g.y) });

function measureKindOf(data: CanonicalData): 'linear' | 'area' | 'count' {
  return data.mkind === 'area' || data.mkind === 'count' || data.mkind === 'linear' ? data.mkind : 'linear';
}

function measureGeomPoints(g: Record<string, unknown>): Pt[] {
  if (Array.isArray(g.points)) {
    const pts = (g.points as unknown[]).map(toPt).filter((p): p is Pt => !!p);
    if (pts.length) return pts;
  }
  if (g.x1 !== undefined || g.y1 !== undefined || g.x2 !== undefined) {
    const l = geomLine(g);
    return [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
  }
  return [];
}

/* measure labels — honest: feet when calibrated, px + 'uncalibrated' otherwise */
function ftIn(ft: number): string {
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches >= 12) return `${whole + 1}′-0″`;
  return `${whole}′-${inches}″`;
}
function polylineMeasureLabel(points: Pt[], ppf: number | null): string {
  if (points.length < 2) return '';
  if (ppf && ppf > 0) return ftIn(lengthLF(points, ppf));
  return `${Math.round(lengthLF(points, 1))} px · uncalibrated`;
}
function areaMeasureLabel(points: Pt[], ppf: number | null): string {
  if (points.length < 3) return '';
  if (ppf && ppf > 0) {
    const sf = areaSF(points, ppf);
    return `${sf.toLocaleString('en-US', { maximumFractionDigits: sf < 100 ? 1 : 0 })} SF`;
  }
  return `${Math.round(areaSF(points, 1)).toLocaleString('en-US')} px² · uncalibrated`;
}

/* drawing helpers (screen-space) */
function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - Math.PI / 6), y2 - size * Math.sin(a - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a + Math.PI / 6), y2 - size * Math.sin(a + Math.PI / 6));
  ctx.stroke();
}

function drawCloudRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const W = Math.abs(w), H = Math.abs(h);
  const x0 = Math.min(x, x + w), y0 = Math.min(y, y + h);
  if (W < 4 || H < 4) { ctx.strokeRect(x0, y0, Math.max(W, 2), Math.max(H, 2)); return; }
  const r = Math.max(5, Math.min(22, Math.min(W, H) / 6));
  const step = r * 1.7;
  const corners: Pt[] = [{ x: x0, y: y0 }, { x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + H }, { x: x0, y: y0 + H }];
  ctx.beginPath();
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    for (let i = 0; i < n; i++) {
      const p1 = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      const p2 = { x: a.x + ((b.x - a.x) * (i + 1)) / n, y: a.y + ((b.y - a.y) * (i + 1)) / n };
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const half = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
      ctx.moveTo(p1.x, p1.y);
      ctx.arc(mx, my, half, ang + Math.PI, ang, false);
    }
  }
  ctx.stroke();
}

function traceCountTick(ctx: CanvasRenderingContext2D, p: Pt, r: number) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.moveTo(p.x - r * 1.7, p.y); ctx.lineTo(p.x - r * 0.6, p.y);
  ctx.moveTo(p.x + r * 0.6, p.y); ctx.lineTo(p.x + r * 1.7, p.y);
  ctx.moveTo(p.x, p.y - r * 1.7); ctx.lineTo(p.x, p.y - r * 0.6);
  ctx.moveTo(p.x, p.y + r * 0.6); ctx.lineTo(p.x, p.y + r * 1.7);
}

/** Bounding box in the markup's OWN reference space (for hover attribution). */
function bboxOf(p: ParsedMarkup): { x0: number; y0: number; x1: number; y1: number } | null {
  try {
    const grow = (pts: Pt[]) => {
      if (!pts.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      return { x0, y0, x1, y1 };
    };
    if (p.mode === 'invisible') return null;
    if (p.mode === 'legacy') return grow(p.strokes.flat());
    const g = p.data.geometry;
    switch (p.kind) {
      case 'freehand': return grow(geomPoints(g));
      case 'rect': case 'cloud': {
        const r = geomRect(g);
        return grow([{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]);
      }
      case 'circle': {
        const e = geomEllipse(g);
        return grow([{ x: e.cx - e.rx, y: e.cy - e.ry }, { x: e.cx + e.rx, y: e.cy + e.ry }]);
      }
      case 'arrow': case 'callout': {
        const l = geomLine(g);
        return grow([{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]);
      }
      case 'measure': return grow(measureGeomPoints(g));
      case 'text': {
        const pt = geomPoint(g);
        const fs = p.data.fontSize || 24;
        const wGuess = Math.max(40, (p.data.text?.length || 4) * fs * 0.6);
        return { x0: pt.x, y0: pt.y - fs * 1.2, x1: pt.x + wGuess, y1: pt.y + fs * 0.6 };
      }
      case 'stamp': {
        const pt = geomPoint(g);
        const half = Math.max(40, (p.data.w || 2000) * 0.045);
        return { x0: pt.x - half, y0: pt.y - half * 0.5, x1: pt.x + half, y1: pt.y + half * 0.5 };
      }
      default: return null;
    }
  } catch { return null; }
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff) || diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ── Wave-2 guest markup creation ───────────────────────────────────────── */

const GUEST_COLOR = GOLD; // guests always mark in the house gold
const NAME_KEY = 'sag_review_name';
const MINE_KEY_PREFIX = 'sag_review_mine:'; // + token -> JSON array of own row ids
const MINE_MAX_IDS = 500; // ledger cap — oldest ids fall off first
/** Grace before pruning a just-created id the poll hasn't echoed yet (a stale
 *  in-flight poll response can otherwise race the POST and eat the id). */
const MINE_PRUNE_GRACE_MS = 30000;

type GuestTool = 'freehand' | 'cloud' | 'arrow' | 'rect' | 'text';

const GUEST_TOOLS: { id: GuestTool; label: string; hint: string }[] = [
  { id: 'freehand', label: 'Draw', hint: 'Drag to sketch freehand' },
  { id: 'cloud', label: 'Cloud', hint: 'Drag a revision cloud' },
  { id: 'arrow', label: 'Arrow', hint: 'Drag from tail to tip' },
  { id: 'rect', label: 'Box', hint: 'Drag a rectangle' },
  { id: 'text', label: 'Text', hint: 'Tap where the note goes' },
];

type Draft =
  | { kind: 'freehand'; points: Pt[] }
  | { kind: 'cloud' | 'rect' | 'arrow'; x0: number; y0: number; x1: number; y1: number };

const toolBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? GOLD : BORDER}`,
  background: active ? GOLD + '22' : RAISED,
  color: active ? GOLD : TEXT,
});

/* ── the page ───────────────────────────────────────────────────────────── */

export default function DrawingReviewPortalPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [drawingLabel, setDrawingLabel] = useState('');
  const [projectName, setProjectName] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [markups, setMarkups] = useState<MarkupRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [imgReady, setImgReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number; who: string; when: string; kind: string } | null>(null);

  /* guest markup state */
  const [tool, setTool] = useState<GuestTool | null>(null);
  const [guestName, setGuestName] = useState('');
  const [namePrompt, setNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [textDraft, setTextDraft] = useState<{ ix: number; iy: number; sx: number; sy: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  /* own-markup selection (ledger rows only) */
  const [selected, setSelected] = useState<{ id: string; sx: number; sy: number } | null>(null);
  const [selMode, setSelMode] = useState<'chips' | 'edit' | 'confirm'>('chips');
  const [editValue, setEditValue] = useState('');

  const deniedRef = useRef(false);
  const fileStartedRef = useRef(false);
  const sourceRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  const dimsRef = useRef({ w: 0, h: 0 });
  const pdfDocRef = useRef<any>(null);
  const pageCacheRef = useRef(new Map<number, { src: HTMLCanvasElement; w: number; h: number }>());
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const markupsRef = useRef<MarkupRow[]>([]);
  const pageRef = useRef(1);
  const pageCountRef = useRef(1);
  const rafRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  /* guest markup refs */
  const toolRef = useRef<GuestTool | null>(null);
  const guestNameRef = useRef('');
  const pendingToolRef = useRef<GuestTool | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const pendingRef = useRef<MarkupRow[]>([]); // optimistic rows the server hasn't echoed yet
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* own-markup ledger refs */
  const mineRef = useRef<Set<string>>(new Set()); // ids this browser created for this token
  const mineAddedAtRef = useRef<Map<string, number>>(new Map()); // id -> when it entered the ledger
  const selectedIdRef = useRef(''); // mirror of `selected` for non-React handlers

  const clearSelection = useCallback(() => {
    selectedIdRef.current = '';
    setSelected(null);
    setSelMode('chips');
    setEditValue('');
  }, []);

  /** Persist the ledger (best-effort — private mode just means session-only). */
  const persistMine = useCallback(() => {
    try {
      localStorage.setItem(MINE_KEY_PREFIX + token, JSON.stringify(Array.from(mineRef.current).slice(-MINE_MAX_IDS)));
    } catch { /* storage unavailable */ }
  }, [token]);

  /* ledger loads once per token */
  useEffect(() => {
    if (!token) return;
    try {
      const arr = JSON.parse(localStorage.getItem(MINE_KEY_PREFIX + token) || '[]');
      if (Array.isArray(arr)) {
        const s = new Set<string>();
        for (const v of arr) if (typeof v === 'string' && v) s.add(v);
        mineRef.current = s;
      }
    } catch { /* corrupt/unavailable storage — start with an empty ledger */ }
  }, [token]);

  /* ── painting (rAF-coalesced, whole-canvas) ── */
  const paint = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current, src = sourceRef.current;
    if (!cv || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, cw, ch);
    if (!src) return;

    const { scale, tx, ty } = viewRef.current;
    const dims = dimsRef.current;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // white sheet ground so PDF transparency reads like paper
    ctx.fillStyle = '#f5f5f2';
    ctx.fillRect(tx, ty, dims.w * scale, dims.h * scale);
    try { ctx.drawImage(src, tx, ty, dims.w * scale, dims.h * scale); } catch { /* mid-swap */ }

    const sc = (pt: Pt): Pt => ({ x: tx + pt.x * scale, y: ty + pt.y * scale });
    const chip = (label: string, x: number, y: number, color: string, fontPx: number) => {
      if (!label) return;
      ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
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

    const isMulti = pageCountRef.current > 1;
    const rows = markupsRef.current.filter((m) => {
      if (m.markup_type === 'link') return false;
      if (!isMulti) return true;
      return (m.page_number || 1) === pageRef.current;
    });

    for (const m of rows) {
      const p = parseMarkup(m);
      if (p.mode === 'invisible') continue;
      ctx.save();
      ctx.globalAlpha = 0.9;
      try {
        if (p.mode === 'legacy') {
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
              const r = geomRect(g); const a = S({ x: r.x, y: r.y });
              ctx.strokeRect(a.x, a.y, r.w * k * scale, r.h * k * scale);
              break;
            }
            case 'cloud': {
              const r = geomRect(g); const a = S({ x: r.x, y: r.y });
              drawCloudRect(ctx, a.x, a.y, r.w * k * scale, r.h * k * scale);
              break;
            }
            case 'circle': {
              const e = geomEllipse(g); const c = S({ x: e.cx, y: e.cy });
              ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(1, e.rx * k * scale), Math.max(1, e.ry * k * scale), 0, 0, Math.PI * 2); ctx.stroke();
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
                chip(`${raw.length} EA`, cx, cy - Math.max(14, tickR * 3), col, fontPx);
                break;
              }
              if (mk === 'area' && raw.length >= 3) {
                ctx.setLineDash([7, 5]);
                ctx.beginPath(); ctx.moveTo(spts[0].x, spts[0].y);
                for (let i = 1; i < spts.length; i++) ctx.lineTo(spts[i].x, spts[i].y);
                ctx.closePath();
                ctx.save(); ctx.globalAlpha = 0.12; ctx.fill(); ctx.restore();
                ctx.stroke();
                ctx.setLineDash([]);
                const cx = spts.reduce((s, q) => s + q.x, 0) / spts.length;
                const cy = spts.reduce((s, q) => s + q.y, 0) / spts.length;
                chip(areaMeasureLabel(raw, p.data.ppf), cx, cy, col, fontPx);
                break;
              }
              ctx.setLineDash([7, 5]);
              ctx.beginPath(); ctx.moveTo(spts[0].x, spts[0].y);
              for (let i = 1; i < spts.length; i++) ctx.lineTo(spts[i].x, spts[i].y);
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
              ctx.fillStyle = 'rgba(11,14,19,0.85)';
              ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, lw * 0.6);
              ctx.beginPath(); ctx.rect(anchor.x - fs * 0.4, anchor.y - fs * 1.1, wMax + fs * 0.8, lines.length * fs * 1.25 + fs * 0.5); ctx.fill(); ctx.stroke();
              ctx.fillStyle = col;
              lines.forEach((ln, i) => ctx.fillText(ln, anchor.x, anchor.y + i * fs * 1.25));
              break;
            }
            case 'stamp': {
              const pt = S(geomPoint(g));
              const name = p.data.stamp || 'STAMP';
              const hRef = Math.max(26, (p.data.w || dims.w) / 30);
              const fontPx = Math.max(8, hRef * 0.52 * k * scale);
              ctx.font = `800 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
              const tw = ctx.measureText(name).width;
              const w = tw + fontPx * 1.4, h = hRef * k * scale;
              const rx = pt.x - w / 2, ry = pt.y - h / 2, rr = Math.min(6, h / 4);
              ctx.save();
              ctx.globalAlpha = 0.92;
              ctx.fillStyle = 'rgba(11,14,19,0.78)';
              ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, h * 0.07);
              ctx.beginPath();
              ctx.moveTo(rx + rr, ry); ctx.arcTo(rx + w, ry, rx + w, ry + h, rr); ctx.arcTo(rx + w, ry + h, rx, ry + h, rr);
              ctx.arcTo(rx, ry + h, rx, ry, rr); ctx.arcTo(rx, ry, rx + w, ry, rr); ctx.closePath();
              ctx.fill(); ctx.stroke();
              ctx.globalAlpha = 1;
              ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(name, pt.x, pt.y + 0.5);
              ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
              ctx.restore();
              break;
            }
            default: break;
          }
        }
      } catch { /* legacy tolerance: never crash the paint */ }
      ctx.restore();
    }

    // in-progress guest draft (image-pixel coords of the LIVE page, so k = 1)
    const draft = draftRef.current;
    if (draft) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = GUEST_COLOR;
      ctx.lineWidth = Math.max(1.5, 3 * scale);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      try {
        if (draft.kind === 'freehand') {
          if (draft.points.length >= 2) {
            ctx.beginPath();
            const p0 = sc(draft.points[0]);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < draft.points.length; i++) { const q = sc(draft.points[i]); ctx.lineTo(q.x, q.y); }
            ctx.stroke();
          }
        } else {
          const a = sc({ x: draft.x0, y: draft.y0 }), b = sc({ x: draft.x1, y: draft.y1 });
          if (draft.kind === 'arrow') {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            drawArrowHead(ctx, a.x, a.y, b.x, b.y, Math.max(9, ctx.lineWidth * 3.4));
          } else if (draft.kind === 'cloud') {
            drawCloudRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y);
          } else {
            ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          }
        }
      } catch { /* draft never crashes the paint */ }
      ctx.restore();
    }
  }, []);

  const requestPaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; paint(); });
  }, [paint]);

  const fitView = useCallback(() => {
    const wrap = wrapRef.current;
    const dims = dimsRef.current;
    if (!wrap || !dims.w || !dims.h) return;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const s = Math.min(cw / dims.w, ch / dims.h) * 0.96;
    viewRef.current = { scale: s, tx: (cw - dims.w * s) / 2, ty: (ch - dims.h * s) / 2 };
    requestPaint();
  }, [requestPaint]);

  /* ── pdf.js loading (house pattern) ── */
  const renderPdfPage = useCallback(async (n: number) => {
    const hit = pageCacheRef.current.get(n);
    if (hit) return hit;
    const pdf = pdfDocRef.current;
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

  const openPdf = useCallback(async (url: string): Promise<boolean> => {
    try {
      const pdfjs: any = await import('pdfjs-dist');
      // static worker path — house pattern; do NOT use new URL(...,import.meta.url)
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ url }).promise;
      pdfDocRef.current = doc;
      pageCountRef.current = doc.numPages;
      setPageCount(doc.numPages);
      const r = await renderPdfPage(1);
      if (!r) return false;
      sourceRef.current = r.src;
      dimsRef.current = { w: r.w, h: r.h };
      pageRef.current = 1;
      setPage(1); setImgReady(true);
      fitView();
      return true;
    } catch (e) {
      console.error('[drawing-review portal] pdf load failed:', e);
      return false;
    }
  }, [renderPdfPage, fitView]);

  const goPage = useCallback(async (n: number) => {
    if (n < 1 || n > pageCountRef.current || n === pageRef.current) return;
    setBusy('Rendering page…');
    setHoverTip(null);
    setTextDraft(null);
    clearSelection();
    draftRef.current = null;
    try {
      const r = await renderPdfPage(n);
      if (r) {
        sourceRef.current = r.src;
        dimsRef.current = { w: r.w, h: r.h };
        pageRef.current = n;
        setPage(n);
        fitView();
      }
    } catch {
      setLoadError("Couldn't render that page.");
    }
    setBusy('');
  }, [renderPdfPage, fitView, clearSelection]);

  const loadFile = useCallback(async (url: string, fileType: string) => {
    setBusy('Loading sheet…');
    const finish = () => setBusy('');
    if (fileType === 'application/pdf') {
      const ok = await openPdf(url);
      if (!ok) setLoadError("Couldn't open this PDF. Ask the project team to re-share the sheet.");
      finish();
      return;
    }
    const im = new Image();
    im.onload = () => {
      sourceRef.current = im;
      dimsRef.current = { w: im.naturalWidth, h: im.naturalHeight };
      pageCountRef.current = 1; pageRef.current = 1;
      setPageCount(1); setPage(1); setImgReady(true);
      fitView();
      finish();
    };
    im.onerror = async () => {
      // extension-less storage URLs: try PDF before giving up (house fallback)
      const ok = await openPdf(url);
      if (!ok) setLoadError("Couldn't load this drawing file.");
      finish();
    };
    im.src = url;
  }, [openPdf, fitView]);

  /* ── feed: fetch immediately, then a 10s poll (markups only after first load) ── */
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const load = async () => {
      if (stop || deniedRef.current) return;
      try {
        const res = await fetch(`/api/portal/drawing-review?token=${encodeURIComponent(token)}`);
        if (stop) return;
        if (res.status === 401) { deniedRef.current = true; setDenied(true); setLoading(false); return; }
        if (!res.ok) return;
        const d = await res.json();
        if (stop || d.error) return;
        setDrawingLabel(d.drawing?.label || '');
        setProjectName(d.projectName || '');
        setLinkLabel(d.linkLabel || '');
        const server: MarkupRow[] = Array.isArray(d.markups) ? d.markups : [];
        const serverIds = new Set(server.map((r) => r.id));
        // keep optimistic guest rows the server hasn't echoed yet (dedupe by id)
        markupsRef.current = server.concat(pendingRef.current.filter((r) => !serverIds.has(r.id)));
        setMarkups(markupsRef.current);
        // prune ledger ids whose rows are gone (e.g. staff deleted them) —
        // fresh ids get a grace window so a stale poll can't race the POST
        let pruned = false;
        for (const id of Array.from(mineRef.current)) {
          if (serverIds.has(id)) continue;
          const added = mineAddedAtRef.current.get(id) || 0;
          if (Date.now() - added < MINE_PRUNE_GRACE_MS) continue;
          mineRef.current.delete(id);
          mineAddedAtRef.current.delete(id);
          pruned = true;
        }
        if (pruned) persistMine();
        if (selectedIdRef.current && !markupsRef.current.some((r) => r.id === selectedIdRef.current)) {
          clearSelection(); // the selected row vanished under us
        }
        setUpdatedAt(new Date(d.generatedAt || Date.now()).toLocaleTimeString());
        setLoading(false);
        if (!fileStartedRef.current && d.drawing?.fileUrl) {
          fileStartedRef.current = true;
          void loadFile(d.drawing.fileUrl, d.drawing.fileType || 'image');
        }
        requestPaint();
      } catch { /* transient network error: keep last-good view, retry next tick */ }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => { stop = true; clearInterval(iv); };
  }, [token, loadFile, requestPaint, persistMine, clearSelection]);

  useEffect(() => {
    if (projectName || drawingLabel) document.title = `${drawingLabel || 'Drawing Review'}${projectName ? ` - ${projectName}` : ''}`;
  }, [projectName, drawingLabel]);

  /* guest name persists across visits (asked once, on first tool use) */
  useEffect(() => {
    try {
      const n = (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 40);
      if (n) { setGuestName(n); guestNameRef.current = n; }
    } catch { /* storage unavailable — we'll ask when they pick a tool */ }
  }, []);

  /* ── resize → repaint ── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => requestPaint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [requestPaint, loading, denied]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  /* ── wheel zoom (non-passive so preventDefault works) ── */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const s = clamp(v.scale * factor, 0.02, 16);
      const k = s / v.scale;
      viewRef.current = { scale: s, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
      setHoverTip(null);
      setTextDraft(null); // its screen anchor is stale once the view moves
      clearSelection(); // ditto for the own-markup chips
      requestPaint();
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [requestPaint, clearSelection, loading, denied]);

  /* ── drag pan + hover attribution ── */
  const hitAt = useCallback((mx: number, my: number) => {
    const { scale, tx, ty } = viewRef.current;
    const dims = dimsRef.current;
    if (!dims.w) return null;
    const ix = (mx - tx) / scale, iy = (my - ty) / scale;
    const isMulti = pageCountRef.current > 1;
    const rows = markupsRef.current.filter((m) => {
      if (m.markup_type === 'link') return false;
      if (!isMulti) return true;
      return (m.page_number || 1) === pageRef.current;
    });
    for (let i = rows.length - 1; i >= 0; i--) {
      const m = rows[i];
      const p = parseMarkup(m);
      if (p.mode === 'invisible') continue;
      const refW = p.mode === 'legacy' ? (p.refW || dims.w) : (p.data.w || dims.w);
      const k = refW > 0 ? dims.w / refW : 1;
      const own = { x: ix / k, y: iy / k };
      const tol = 14 / (scale * k);
      const bb = bboxOf(p);
      if (!bb) continue;
      if (own.x >= bb.x0 - tol && own.x <= bb.x1 + tol && own.y >= bb.y0 - tol && own.y <= bb.y1 + tol) return m;
    }
    return null;
  }, []);

  /* ── guest markup creation ── */
  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'err') => {
    setToast({ msg, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const selectTool = (t: GuestTool | null) => {
    setHoverTip(null);
    setTextDraft(null);
    clearSelection();
    draftRef.current = null;
    if (t && !guestNameRef.current) {
      // first use: ask their name once, then arm the tool they picked
      pendingToolRef.current = t;
      setNameInput('');
      setNamePrompt(true);
      return;
    }
    toolRef.current = t;
    setTool(t);
  };

  const saveGuestName = () => {
    const n = nameInput.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!n) return;
    guestNameRef.current = n;
    setGuestName(n);
    try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode: session-only */ }
    setNamePrompt(false);
    const t = pendingToolRef.current;
    pendingToolRef.current = null;
    if (t) { toolRef.current = t; setTool(t); }
  };

  /** Screen px -> image px of the current page, clamped to the sheet. */
  const toImage = (mx: number, my: number): Pt => {
    const { scale, tx, ty } = viewRef.current;
    const dims = dimsRef.current;
    return { x: clamp((mx - tx) / scale, 0, dims.w || 0), y: clamp((my - ty) / scale, 0, dims.h || 0) };
  };

  const commitMarkup = useCallback(async (markupType: string, geometry: Record<string, unknown>, extras?: { text?: string; fontSize?: number }) => {
    const dims = dimsRef.current;
    if (!dims.w || !dims.h || !token) return;
    const data: Record<string, unknown> = {
      space: 'image', w: Math.round(dims.w), h: Math.round(dims.h),
      geometry,
      style: { color: GUEST_COLOR, width: 3 },
      ...(extras?.text !== undefined ? { text: extras.text } : {}),
      ...(extras?.fontSize !== undefined ? { fontSize: extras.fontSize } : {}),
    };
    // page_number only means something for PDFs (the API stores it only then)
    const pageNumber = pdfDocRef.current ? pageRef.current : undefined;
    const temp: MarkupRow = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      markup_type: markupType,
      data,
      page_number: pageNumber ?? null,
      color: GUEST_COLOR,
      created_by_name: `Guest · ${guestNameRef.current || 'You'}`,
      created_at: new Date().toISOString(),
    };
    pendingRef.current = [...pendingRef.current, temp];
    markupsRef.current = [...markupsRef.current, temp];
    setMarkups(markupsRef.current);
    requestPaint();
    const drop = () => {
      pendingRef.current = pendingRef.current.filter((r) => r.id !== temp.id);
      markupsRef.current = markupsRef.current.filter((r) => r.id !== temp.id);
      setMarkups(markupsRef.current);
      requestPaint();
    };
    try {
      const res = await fetch(`/api/portal/drawing-review?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: guestNameRef.current,
          markups: [{ markup_type: markupType, data, ...(pageNumber ? { page_number: pageNumber } : {}) }],
        }),
      });
      if (res.status === 401) { drop(); deniedRef.current = true; setDenied(true); return; }
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !d.ok) throw new Error(String(d?.error || `HTTP ${res.status}`));
      const saved: MarkupRow[] = Array.isArray(d.saved) ? d.saved : [];
      // ledger: these server ids are OURS — remember them for edit/remove
      let ledgerGrew = false;
      for (const r of saved) {
        if (r && typeof r.id === 'string' && r.id) {
          mineRef.current.add(r.id);
          mineAddedAtRef.current.set(r.id, Date.now());
          ledgerGrew = true;
        }
      }
      if (ledgerGrew) persistMine();
      // reconcile: swap the optimistic row for the server rows (dedupe by id —
      // the 10s poll may already have echoed them)
      pendingRef.current = pendingRef.current.filter((r) => r.id !== temp.id);
      const have = new Set(markupsRef.current.map((r) => r.id));
      markupsRef.current = markupsRef.current
        .filter((r) => r.id !== temp.id)
        .concat(saved.filter((r) => !have.has(r.id)));
      setMarkups(markupsRef.current);
      requestPaint();
    } catch (e) {
      console.error('[drawing-review portal] markup save failed:', e);
      drop();
      showToast("Couldn't save your markup — check your connection and try again.");
    }
  }, [token, requestPaint, showToast, persistMine]);

  /* ── Wave-3: edit / remove OWN markups (ledger rows only) ── */

  const doDelete = useCallback(async (id: string) => {
    const row = markupsRef.current.find((r) => r.id === id);
    clearSelection();
    if (!row || !token) return;
    // optimistic removal — rolled back on failure
    markupsRef.current = markupsRef.current.filter((r) => r.id !== id);
    setMarkups(markupsRef.current);
    requestPaint();
    try {
      const res = await fetch(`/api/portal/drawing-review?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 401) { deniedRef.current = true; setDenied(true); return; }
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(d as any).ok) throw new Error(String((d as any)?.error || `HTTP ${res.status}`));
      mineRef.current.delete(id);
      mineAddedAtRef.current.delete(id);
      persistMine();
      showToast('Markup removed.', 'ok');
    } catch (e) {
      console.error('[drawing-review portal] markup delete failed:', e);
      if (!markupsRef.current.some((r) => r.id === id)) {
        markupsRef.current = [...markupsRef.current, row];
        setMarkups(markupsRef.current);
        requestPaint();
      }
      showToast("Couldn't remove that markup — check your connection and try again.");
    }
  }, [token, requestPaint, showToast, persistMine, clearSelection]);

  const doEditSave = useCallback(async (id: string, nextText: string) => {
    const t = nextText.trim().slice(0, 500);
    const row = markupsRef.current.find((r) => r.id === id);
    clearSelection();
    if (!row || !t || !token) return;
    // optimistic text swap — rolled back on failure
    const optimistic: MarkupRow = {
      ...row,
      data: row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? { ...(row.data as Record<string, unknown>), text: t }
        : { text: t },
    };
    markupsRef.current = markupsRef.current.map((r) => (r.id === id ? optimistic : r));
    setMarkups(markupsRef.current);
    requestPaint();
    try {
      const res = await fetch(`/api/portal/drawing-review?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text: t }),
      });
      if (res.status === 401) { deniedRef.current = true; setDenied(true); return; }
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !(d as any).ok) throw new Error(String((d as any)?.error || `HTTP ${res.status}`));
      const serverRow = (d as any).row as MarkupRow | null;
      if (serverRow && serverRow.id === id) {
        markupsRef.current = markupsRef.current.map((r) => (r.id === id ? serverRow : r));
        setMarkups(markupsRef.current);
        requestPaint();
      }
    } catch (e) {
      console.error('[drawing-review portal] markup edit failed:', e);
      markupsRef.current = markupsRef.current.map((r) => (r.id === id ? row : r));
      setMarkups(markupsRef.current);
      requestPaint();
      showToast("Couldn't save your edit — check your connection and try again.");
    }
  }, [token, requestPaint, showToast, clearSelection]);

  const commitText = () => {
    const td = textDraft;
    const t = textValue.trim();
    setTextDraft(null);
    setTextValue('');
    if (!td || !t) return;
    const dims = dimsRef.current;
    const fontSize = Math.round(clamp((dims.w || 2000) / 80, 16, 64));
    void commitMarkup('text', { x: Math.round(td.ix), y: Math.round(td.iy) }, { text: t.slice(0, 500), fontSize });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.setPointerCapture(e.pointerId);
    setHoverTip(null);
    const t = toolRef.current;
    if (t && imgReady && dimsRef.current.w) {
      if (textDraft) { setTextDraft(null); setTextValue(''); }
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const p = toImage(mx, my);
      if (t === 'text') {
        setTextDraft({ ix: p.x, iy: p.y, sx: mx, sy: my });
        setTextValue('');
        return;
      }
      draftRef.current = t === 'freehand'
        ? { kind: 'freehand', points: [p] }
        : { kind: t, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      requestPaint();
      return;
    }
    const v = viewRef.current;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const draft = draftRef.current;
    if (draft) {
      const p = toImage(mx, my);
      if (draft.kind === 'freehand') {
        const last = draft.points[draft.points.length - 1];
        const minStep = 1.5 / Math.max(0.0001, viewRef.current.scale);
        if (draft.points.length < 4000 && (Math.abs(p.x - last.x) > minStep || Math.abs(p.y - last.y) > minStep)) {
          draft.points.push(p);
        }
      } else {
        draft.x1 = p.x; draft.y1 = p.y;
      }
      requestPaint();
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      // a real pan (not a tap wobble) leaves the chip anchor stale — drop it
      if (selectedIdRef.current && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) clearSelection();
      viewRef.current = { ...viewRef.current, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) };
      requestPaint();
      return;
    }
    if (toolRef.current) return; // no hover attribution while a tool is armed
    if (e.pointerType !== 'mouse') return;
    const m = hitAt(mx, my);
    if (m) {
      setHoverTip({
        x: mx, y: my,
        who: m.created_by_name || 'Unknown',
        when: relTime(m.created_at),
        kind: m.markup_type,
      });
    } else setHoverTip(null);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (cv && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    const draft = draftRef.current;
    const drag = dragRef.current;
    draftRef.current = null;
    dragRef.current = null;
    if (!draft) {
      // pan mode: a still tap on one of the guest's OWN rows opens the
      // edit/remove chips; a tap anywhere else dismisses them
      if (cv && drag && !toolRef.current && e.type !== 'pointercancel'
        && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) {
        const rect = cv.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const m = hitAt(mx, my);
        if (m && mineRef.current.has(m.id)) {
          setHoverTip(null);
          selectedIdRef.current = m.id;
          setSelected({ id: m.id, sx: mx, sy: my });
          setSelMode('chips');
          setEditValue('');
        } else if (selectedIdRef.current) {
          clearSelection();
        }
      }
      return;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    if (draft.kind === 'freehand') {
      if (draft.points.length >= 2) {
        void commitMarkup('freehand', { points: draft.points.map((p) => ({ x: r2(p.x), y: r2(p.y) })) });
      }
      requestPaint();
      return;
    }
    const { x0, y0, x1, y1 } = draft;
    if (draft.kind === 'arrow') {
      // tail at pointer-down, head at release — matches the renderer's (x2,y2) head
      if (Math.hypot(x1 - x0, y1 - y0) >= 3) {
        void commitMarkup('arrow', { x1: r2(x0), y1: r2(y0), x2: r2(x1), y2: r2(y1) });
      }
      requestPaint();
      return;
    }
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1), rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    if (rw >= 3 && rh >= 3) {
      void commitMarkup(draft.kind, { x: r2(rx), y: r2(ry), w: r2(rw), h: r2(rh) });
    }
    requestPaint();
  };

  const zoomBy = (factor: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
    const v = viewRef.current;
    const s = clamp(v.scale * factor, 0.02, 16);
    const k = s / v.scale;
    viewRef.current = { scale: s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    requestPaint();
  };

  const visibleCount = markups.filter((m) => {
    if (m.markup_type === 'link') return false;
    if (pageCount <= 1) return true;
    return (m.page_number || 1) === page;
  }).length;

  /* ── Expired / revoked: clean full-page state ── */
  if (denied) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 22 }}>Drawing Review</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>This review link is no longer active</div>
        <div style={{ fontSize: 14, color: DIM, marginTop: 10, lineHeight: 1.6 }}>The invitation has expired or was revoked by the project team. Ask your contact at the general contractor for a fresh link.</div>
      </div>
    </div>
  );

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'sgSpin 1s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ color: DIM, fontSize: 14 }}>Opening the sheet...</div>
        <style>{`@keyframes sgSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', background: DARK, fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Brand-neutral header: the project takes top billing ── */}
      <header style={{ background: 'rgba(10,10,10,0.92)', borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', flexShrink: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName || 'Project Drawing'}</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {drawingLabel || 'Drawing'}
              {linkLabel && <span> &middot; shared with <span style={{ color: GOLD, fontWeight: 700 }}>{linkLabel}</span></span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {pageCount > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 6px' }}>
                <button onClick={() => goPage(page - 1)} disabled={page <= 1} style={{ ...zoomBtn, width: 28, height: 28, opacity: page <= 1 ? 0.35 : 1 }} aria-label="Previous page">&lsaquo;</button>
                <span style={{ fontSize: 12, fontWeight: 700, color: DIM, minWidth: 74, textAlign: 'center' }}>Page {page} / {pageCount}</span>
                <button onClick={() => goPage(page + 1)} disabled={page >= pageCount} style={{ ...zoomBtn, width: 28, height: 28, opacity: page >= pageCount ? 0.35 : 1 }} aria-label="Next page">&rsaquo;</button>
              </div>
            )}
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: GOLD, background: GOLD + '14', border: `1px solid ${GOLD}44`, borderRadius: 20, padding: '5px 12px' }}>REVIEW &middot; MARKUPS ENABLED</span>
          </div>
        </div>
      </header>

      {/* ── Sheet ── */}
      <main style={{ flex: 1, minHeight: 0, padding: 12, display: 'flex', flexDirection: 'column', maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* ── Guest markup toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: DIM, textTransform: 'uppercase', marginRight: 4 }}>Add comment markup</span>
          <button onClick={() => selectTool(null)} style={toolBtn(tool === null)} title="Pan and zoom the sheet">Pan</button>
          {GUEST_TOOLS.map((t) => (
            <button key={t.id} onClick={() => selectTool(tool === t.id ? null : t.id)} title={t.hint} style={toolBtn(tool === t.id)}>{t.label}</button>
          ))}
          {guestName && (
            <span style={{ fontSize: 11, color: DIM, marginLeft: 4 }}>as <span style={{ color: GOLD, fontWeight: 700 }}>{guestName}</span></span>
          )}
        </div>

        <div ref={wrapRef} style={{ ...card(), flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => { if (!dragRef.current) setHoverTip(null); }}
            style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: tool ? 'crosshair' : 'grab', display: 'block' }}
          />

          {/* text markup input (anchored where the guest tapped) */}
          {textDraft && (
            <div style={{ position: 'absolute', left: clamp(textDraft.sx, 8, Math.max(8, (wrapRef.current?.clientWidth || 400) - 280)), top: clamp(textDraft.sy, 8, Math.max(8, (wrapRef.current?.clientHeight || 300) - 56)), zIndex: 6, display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(10,10,10,0.94)', border: `1px solid ${GOLD}66`, borderRadius: 8, padding: 6 }}>
              <input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText();
                  if (e.key === 'Escape') { setTextDraft(null); setTextValue(''); }
                }}
                placeholder="Type a note..."
                maxLength={500}
                style={{ width: 180, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, padding: '6px 8px', outline: 'none' }}
              />
              <button onClick={commitText} disabled={!textValue.trim()} style={{ ...toolBtn(true), padding: '6px 10px', opacity: textValue.trim() ? 1 : 0.5 }}>Add</button>
              <button onClick={() => { setTextDraft(null); setTextValue(''); }} style={{ ...toolBtn(false), padding: '6px 10px' }} aria-label="Cancel note">&#10005;</button>
            </div>
          )}

          {/* own-markup chips: tap-selected ledger row -> edit/remove */}
          {selected && (() => {
            const row = markups.find((r) => r.id === selected.id);
            if (!row) return null;
            const isText = row.markup_type === 'text';
            const left = clamp(selected.sx, 8, Math.max(8, (wrapRef.current?.clientWidth || 400) - 320));
            const top = clamp(selected.sy + 14, 8, Math.max(8, (wrapRef.current?.clientHeight || 300) - 56));
            return (
              <div style={{ position: 'absolute', left, top, zIndex: 7, display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(10,10,10,0.94)', border: `1px solid ${GOLD}66`, borderRadius: 8, padding: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.45)' }}>
                {selMode === 'edit' ? (
                  <>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editValue.trim()) void doEditSave(selected.id, editValue);
                        if (e.key === 'Escape') { setSelMode('chips'); setEditValue(''); }
                      }}
                      placeholder="Edit your note..."
                      maxLength={500}
                      style={{ width: 200, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, padding: '6px 8px', outline: 'none' }}
                    />
                    <button onClick={() => { if (editValue.trim()) void doEditSave(selected.id, editValue); }} disabled={!editValue.trim()} style={{ ...toolBtn(true), padding: '6px 10px', opacity: editValue.trim() ? 1 : 0.5 }}>Save</button>
                    <button onClick={() => { setSelMode('chips'); setEditValue(''); }} style={{ ...toolBtn(false), padding: '6px 10px' }} aria-label="Cancel edit">&#10005;</button>
                  </>
                ) : selMode === 'confirm' ? (
                  <>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, padding: '0 4px' }}>Remove this markup?</span>
                    <button onClick={() => void doDelete(selected.id)} style={{ ...toolBtn(false), borderColor: '#EF444488', color: '#EF4444' }}>Remove</button>
                    <button onClick={() => setSelMode('chips')} style={toolBtn(false)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: GOLD, textTransform: 'uppercase', padding: '0 4px' }}>Your markup</span>
                    {isText && (
                      <button onClick={() => { setEditValue(String((row.data as Record<string, unknown> | null)?.text || '')); setSelMode('edit'); }} style={toolBtn(false)}>Edit text</button>
                    )}
                    <button onClick={() => setSelMode('confirm')} style={toolBtn(false)}>Remove</button>
                    <button onClick={clearSelection} style={{ ...toolBtn(false), padding: '6px 9px' }} aria-label="Dismiss">&#10005;</button>
                  </>
                )}
              </div>
            );
          })()}

          {/* hover attribution */}
          {hoverTip && (
            <div style={{ position: 'absolute', left: Math.min(hoverTip.x + 14, (wrapRef.current?.clientWidth || 400) - 190), top: hoverTip.y + 14, background: 'rgba(10,10,10,0.94)', border: `1px solid ${GOLD}55`, borderRadius: 8, padding: '7px 11px', pointerEvents: 'none', zIndex: 5, maxWidth: 180 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hoverTip.who}</div>
              <div style={{ fontSize: 10, color: DIM, marginTop: 2, textTransform: 'capitalize' }}>{hoverTip.kind} &middot; {hoverTip.when}</div>
            </div>
          )}

          {/* zoom controls */}
          <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 4 }}>
            <button onClick={() => zoomBy(1.35)} style={zoomBtn} aria-label="Zoom in">+</button>
            <button onClick={() => zoomBy(1 / 1.35)} style={zoomBtn} aria-label="Zoom out">&minus;</button>
            <button onClick={fitView} style={{ ...zoomBtn, fontSize: 10, letterSpacing: 0.5 }} aria-label="Fit to screen">FIT</button>
          </div>

          {/* busy / error overlays */}
          {(busy || (!imgReady && !loadError)) && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,10,0.55)', zIndex: 3 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 38, height: 38, border: `3px solid ${BORDER}`, borderTopColor: GOLD, borderRadius: '50%', animation: 'sgSpin 1s linear infinite', margin: '0 auto 12px' }} />
                <div style={{ color: DIM, fontSize: 13 }}>{busy || 'Loading sheet...'}</div>
                <style>{`@keyframes sgSpin{to{transform:rotate(360deg)}}`}</style>
              </div>
            </div>
          )}
          {loadError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, padding: 24 }}>
              <div style={{ textAlign: 'center', maxWidth: 380 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Sheet unavailable</div>
                <div style={{ fontSize: 13, color: DIM, marginTop: 8, lineHeight: 1.6 }}>{loadError}</div>
              </div>
            </div>
          )}
        </div>

        {/* status strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 4px 0', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: DIM }}>
            {visibleCount} markup{visibleCount === 1 ? '' : 's'} on this {pageCount > 1 ? 'page' : 'sheet'} &middot; hover a markup for author + time &middot; You can edit or remove your own markups.
          </div>
          <div style={{ fontSize: 11, color: DIM }}>
            Refreshes automatically{updatedAt ? <span> &middot; updated {updatedAt}</span> : null}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ textAlign: 'center', padding: '4px 16px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: DIM }}>Powered by <strong style={{ color: GOLD }}>Saguaro Control Systems — Construction Management & Project Controls</strong></div>
      </footer>

      {/* ── honest failure / status toast ── */}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 30, background: 'rgba(10,10,10,0.96)', border: `1px solid ${toast.kind === 'err' ? '#EF444488' : GOLD + '88'}`, borderRadius: 10, padding: '10px 16px', color: TEXT, fontSize: 13, fontWeight: 600, maxWidth: '90vw', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── first-use name prompt (stored once in localStorage) ── */}
      {namePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: 24 }}>
          <div style={{ ...card(), padding: 22, maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Who&#39;s marking up?</div>
            <div style={{ fontSize: 13, color: DIM, marginTop: 6, lineHeight: 1.5 }}>Your name shows next to every markup you add, so the project team knows who said what.</div>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveGuestName();
                if (e.key === 'Escape') { setNamePrompt(false); pendingToolRef.current = null; }
              }}
              placeholder="Your name"
              maxLength={40}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 14, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, padding: '9px 11px', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => { setNamePrompt(false); pendingToolRef.current = null; }} style={toolBtn(false)}>Cancel</button>
              <button onClick={saveGuestName} disabled={!nameInput.trim()} style={{ ...toolBtn(true), opacity: nameInput.trim() ? 1 : 0.5 }}>Start marking up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
