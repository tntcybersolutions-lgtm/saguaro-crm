/**
 * Drawing markup model — the B1 markup contract, client side.
 *
 * CANONICAL MODEL (one row per markup in drawing_markups):
 *   markup_type: 'freehand'|'cloud'|'arrow'|'text'|'callout'|'rect'|'circle'|'measure'|'stamp'|'link'
 *   data jsonb : { space:'image', w, h, geometry, style:{color,width}, ...kind extras }
 *
 * MEASURE payload (B2 contract): data adds { ppf: number|null, mkind?: 'linear'|
 * 'area'|'count', calibration?: true }. Geometry by mkind — linear (legacy + new)
 * {x1,y1,x2,y2} OR {points:[...]} polyline; area {points:[[x,y],...], closed:true};
 * count {points:[[x,y],...]} (each point = one tick). Readers tolerate legacy rows:
 * no mkind + x1/y1 present ⇒ linear. Values come from the canonical takeoff engine
 * (lib/takeoff — READ-ONLY import; never edited here).
 *   geometry lives in IMAGE-PIXEL coordinates of the source page render;
 *   data.w/h record the reference image size so ANY viewport rescales exactly.
 *   page_number: 1-based for multi-page PDFs, null for single images.
 *
 * LEGACY tolerance: older mobile rows are markup_type 'freehand' with data =
 * a raw stroke array in view pixels (no `space` field); older web rows carried
 * a consolidated {strokes,shapes,texts,pins} blob. Readers render those
 * best-effort and NEVER crash. Legacy rows are read-only in the editor.
 */

import { areaSF, lengthLF } from '@/lib/takeoff/geometry';

export type Pt = { x: number; y: number };

/** Measure sub-kind (B2). Legacy rows (no mkind, x1/y1 present) read as 'linear'. */
export type MeasureMarkupKind = 'linear' | 'area' | 'count';

export type MarkupKind =
  | 'freehand' | 'cloud' | 'arrow' | 'text' | 'callout'
  | 'rect' | 'circle' | 'measure' | 'stamp' | 'link';

export type StampName = 'APPROVED' | 'REJECTED' | 'RFI' | 'VERIFY' | 'AS-BUILT' | 'PUNCH';

export const STAMPS: { name: StampName; color: string }[] = [
  { name: 'APPROVED', color: 'var(--success)' },
  { name: 'REJECTED', color: 'var(--danger)' },
  { name: 'RFI',      color: 'var(--warning)' },
  { name: 'VERIFY',   color: 'var(--brand-primary)' },
  { name: 'AS-BUILT', color: 'var(--warning)' },
  { name: 'PUNCH',    color: 'var(--danger)' },
];

export interface MarkupStyle { color: string; width: number }

/** Canonical geometry per kind (image-pixel coords of the reference render). */
export interface CanonicalData {
  space: 'image';
  /** reference image size the geometry was captured at */
  w: number; h: number;
  geometry: Record<string, unknown>;
  style: MarkupStyle;
  text?: string;
  fontSize?: number;
  stamp?: StampName;
  /** measure: px-per-foot at capture time (per-sheet calibration lives here); null/absent = uncalibrated */
  ppf?: number | null;
  /** measure: sub-kind — absent on legacy rows (x1/y1 present ⇒ linear) */
  mkind?: MeasureMarkupKind;
  /** measure: true on the row that stored a sheet calibration (a scale reference, not a takeoff quantity) */
  calibration?: true;
  /** stamp PUNCH: the linked punch item + pin, for tooltips/deep links */
  punch_item_id?: string;
  pin_id?: string;
}

export interface MarkupComment {
  id: string;
  markup_id: string;
  author_name: string | null;
  content: string | null;
  created_at: string;
}

/** A drawing_markups row as returned by the canonical API (comments joined). */
export interface MarkupRow {
  id: string;
  project_id: string;
  drawing_id: string | null;
  drawing_sheet_id: string | null;
  markup_type: string;
  data: unknown;
  page_number: number | null;
  color: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  comments: MarkupComment[];
  /** client-only: true while the row is optimistic/queued (no server id yet) */
  _local?: boolean;
  /** client-only: queued offline (will sync) */
  _queued?: boolean;
}

/* ── parsing (legacy tolerance) ─────────────────────────────────────────── */

export type ParsedMarkup =
  | { mode: 'canonical'; kind: MarkupKind; data: CanonicalData }
  | { mode: 'legacy'; strokes: Pt[][]; color: string; refW: number; refH: number }
  | { mode: 'invisible' };

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function toPt(v: unknown): Pt | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const x = Number(o.x), y = Number(o.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function legacyStrokesFrom(value: unknown): Pt[][] {
  const out: Pt[][] = [];
  if (!Array.isArray(value)) return out;
  for (const entry of value) {
    if (Array.isArray(entry)) {
      // array of point arrays
      const pts = entry.map(toPt).filter((p): p is Pt => !!p);
      if (pts.length >= 2) out.push(pts);
    } else if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      if (Array.isArray(o.points)) {
        const pts = (o.points as unknown[]).map(toPt).filter((p): p is Pt => !!p);
        if (pts.length >= 2) out.push(pts);
      } else {
        const p = toPt(entry);
        if (p) {
          // a bare flat array of points — collect into one stroke
          const last = out[out.length - 1];
          if (last && Array.isArray(value) && value.every((e) => toPt(e))) { last.push(p); }
          else out.push([p]);
        }
      }
    }
  }
  return out.filter((s) => s.length >= 2);
}

/** Parse any drawing_markups row — canonical, legacy, or link — without ever throwing. */
export function parseMarkup(row: MarkupRow): ParsedMarkup {
  try {
    if (row.markup_type === 'link') return { mode: 'invisible' };
    const d = row.data;
    if (d && typeof d === 'object' && !Array.isArray(d) && (d as Record<string, unknown>).space === 'image') {
      const o = d as Record<string, unknown>;
      const kind = (row.markup_type || 'freehand') as MarkupKind;
      const style = (o.style && typeof o.style === 'object')
        ? { color: String((o.style as Record<string, unknown>).color || row.color || 'var(--danger)'), width: num((o.style as Record<string, unknown>).width) || 3 }
        : { color: row.color || 'var(--danger)', width: 3 };
      return {
        mode: 'canonical',
        kind,
        data: {
          space: 'image',
          w: num(o.w), h: num(o.h),
          geometry: (o.geometry && typeof o.geometry === 'object' ? o.geometry : {}) as Record<string, unknown>,
          style,
          text: typeof o.text === 'string' ? o.text : undefined,
          fontSize: num(o.fontSize) || undefined,
          stamp: typeof o.stamp === 'string' ? (o.stamp as StampName) : undefined,
          ppf: typeof o.ppf === 'number' && o.ppf > 0 ? o.ppf : null,
          mkind: o.mkind === 'linear' || o.mkind === 'area' || o.mkind === 'count' ? o.mkind : undefined,
          calibration: o.calibration === true ? true : undefined,
          punch_item_id: typeof o.punch_item_id === 'string' ? o.punch_item_id : undefined,
          pin_id: typeof o.pin_id === 'string' ? o.pin_id : undefined,
        },
      };
    }
    // LEGACY — mobile raw stroke array (view pixels), or old web consolidated blob.
    let strokes: Pt[][] = [];
    let refW = 0, refH = 0;
    if (Array.isArray(d)) {
      strokes = legacyStrokesFrom(d);
    } else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      refW = num(o.w) || num(o.width);
      refH = num(o.h) || num(o.height);
      if (Array.isArray(o.strokes)) strokes = legacyStrokesFrom(o.strokes);
      else if (Array.isArray(o.points)) strokes = legacyStrokesFrom([o.points]);
    }
    return { mode: 'legacy', strokes, color: row.color || 'var(--danger)', refW, refH };
  } catch {
    return { mode: 'invisible' };
  }
}

/* ── geometry readers (canonical) ───────────────────────────────────────── */

export function geomPoints(g: Record<string, unknown>): Pt[] {
  if (!Array.isArray(g.points)) return [];
  return (g.points as unknown[]).map(toPt).filter((p): p is Pt => !!p);
}
export function geomRect(g: Record<string, unknown>): { x: number; y: number; w: number; h: number } {
  return { x: num(g.x), y: num(g.y), w: num(g.w), h: num(g.h) };
}
export function geomLine(g: Record<string, unknown>): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: num(g.x1), y1: num(g.y1), x2: num(g.x2), y2: num(g.y2) };
}
export function geomEllipse(g: Record<string, unknown>): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: num(g.cx), cy: num(g.cy), rx: num(g.rx), ry: num(g.ry) };
}
export function geomPoint(g: Record<string, unknown>): Pt {
  return { x: num(g.x), y: num(g.y) };
}

/* ── measure readers (B2 contract, legacy-tolerant) ─────────────────────── */

/** Point from either canonical {x,y} or contract pair [x,y]. */
function ptFrom(v: unknown): Pt | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = Number(v[0]), y = Number(v[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    return null;
  }
  return toPt(v);
}

/** Effective measure sub-kind: mkind when present, else legacy x1/y1 ⇒ linear. */
export function measureKindOf(data: Pick<CanonicalData, 'mkind' | 'geometry'>): MeasureMarkupKind {
  if (data.mkind === 'area' || data.mkind === 'count' || data.mkind === 'linear') return data.mkind;
  return 'linear';
}

/**
 * Measure geometry → ordered points, tolerating every contract shape:
 * {points:[{x,y},...]}, {points:[[x,y],...]}, or legacy line {x1,y1,x2,y2}.
 */
export function measureGeomPoints(g: Record<string, unknown>): Pt[] {
  if (Array.isArray(g.points)) {
    const pts = (g.points as unknown[]).map(ptFrom).filter((p): p is Pt => !!p);
    if (pts.length) return pts;
  }
  if (g.x1 !== undefined || g.y1 !== undefined || g.x2 !== undefined) {
    const l = geomLine(g);
    return [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
  }
  return [];
}

/* ── measure path builders (SCREEN-space, like the other draw helpers) ──── */

/** Polyline / polygon path builder: begins a path through pts; closes for areas. */
export function traceMeasurePath(ctx: CanvasRenderingContext2D, pts: Pt[], close: boolean) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

/** Count tick: a machined crosshair dot at a screen point. */
export function traceCountTick(ctx: CanvasRenderingContext2D, p: Pt, r: number) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.moveTo(p.x - r * 1.7, p.y); ctx.lineTo(p.x - r * 0.6, p.y);
  ctx.moveTo(p.x + r * 0.6, p.y); ctx.lineTo(p.x + r * 1.7, p.y);
  ctx.moveTo(p.x, p.y - r * 1.7); ctx.lineTo(p.x, p.y - r * 0.6);
  ctx.moveTo(p.x, p.y + r * 0.6); ctx.lineTo(p.x, p.y + r * 1.7);
}

/* ── drawing helpers (all take SCREEN-space coords) ─────────────────────── */

export function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - Math.PI / 6), y2 - size * Math.sin(a - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a + Math.PI / 6), y2 - size * Math.sin(a + Math.PI / 6));
  ctx.stroke();
}

/** The classic revision cloud: puffy arcs along the rectangle perimeter (clockwise walk, outward bulge). */
export function drawCloudRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const W = Math.abs(w), H = Math.abs(h);
  const x0 = Math.min(x, x + w), y0 = Math.min(y, y + h);
  if (W < 4 || H < 4) { ctx.strokeRect(x0, y0, Math.max(W, 2), Math.max(H, 2)); return; }
  const r = Math.max(5, Math.min(22, Math.min(W, H) / 6));
  const step = r * 1.7;
  // clockwise perimeter walk: top L→R, right T→B, bottom R→L, left B→T
  const corners: Pt[] = [
    { x: x0, y: y0 }, { x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + H }, { x: x0, y: y0 + H },
  ];
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
      // sweep from ang+PI to ang clockwise → bulge to the LEFT of travel = outward on a clockwise walk
      ctx.moveTo(p1.x, p1.y);
      ctx.arc(mx, my, half, ang + Math.PI, ang, false);
    }
  }
  ctx.stroke();
}

/* ── hit testing (image-pixel coords of the markup's OWN reference space) ── */

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Hit-test a parsed markup at an image-space point (already converted into the
 * markup's OWN reference space by the caller). tol is in the same units.
 */
export function hitTestMarkup(parsed: ParsedMarkup, p: Pt, tol: number): boolean {
  try {
    if (parsed.mode === 'invisible') return false;
    if (parsed.mode === 'legacy') {
      for (const s of parsed.strokes) {
        for (let i = 0; i < s.length - 1; i++) if (distToSeg(p, s[i], s[i + 1]) <= tol) return true;
      }
      return false;
    }
    const g = parsed.data.geometry;
    switch (parsed.kind) {
      case 'freehand': {
        const pts = geomPoints(g);
        for (let i = 0; i < pts.length - 1; i++) if (distToSeg(p, pts[i], pts[i + 1]) <= tol) return true;
        return false;
      }
      case 'rect': case 'cloud': {
        const r = geomRect(g);
        const x0 = Math.min(r.x, r.x + r.w), x1 = Math.max(r.x, r.x + r.w);
        const y0 = Math.min(r.y, r.y + r.h), y1 = Math.max(r.y, r.y + r.h);
        const nearX = p.x >= x0 - tol && p.x <= x1 + tol;
        const nearY = p.y >= y0 - tol && p.y <= y1 + tol;
        if (!nearX || !nearY) return false;
        // edge proximity (outline shapes, not filled)
        return (
          Math.abs(p.x - x0) <= tol || Math.abs(p.x - x1) <= tol ||
          Math.abs(p.y - y0) <= tol || Math.abs(p.y - y1) <= tol
        );
      }
      case 'circle': {
        const e = geomEllipse(g);
        if (e.rx < 1 || e.ry < 1) return false;
        const v = Math.hypot((p.x - e.cx) / e.rx, (p.y - e.cy) / e.ry);
        return Math.abs(v - 1) * Math.min(e.rx, e.ry) <= tol;
      }
      case 'arrow': case 'callout': {
        const l = geomLine(g);
        if (distToSeg(p, { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }) <= tol) return true;
        if (parsed.kind === 'callout') return Math.hypot(p.x - l.x2, p.y - l.y2) <= tol * 3;
        return false;
      }
      case 'measure': {
        const mk = measureKindOf(parsed.data);
        const pts = measureGeomPoints(g);
        if (!pts.length) return false;
        if (mk === 'count') {
          for (const q of pts) if (Math.hypot(p.x - q.x, p.y - q.y) <= tol * 2) return true;
          return false;
        }
        // linear polyline (incl. legacy two-point) + area ring edges (auto-closed)
        const ring = mk === 'area' && pts.length >= 3 ? [...pts, pts[0]] : pts;
        for (let i = 0; i < ring.length - 1; i++) if (distToSeg(p, ring[i], ring[i + 1]) <= tol) return true;
        return false;
      }
      case 'text': {
        const pt = geomPoint(g);
        const fs = parsed.data.fontSize || 24;
        const wGuess = Math.max(40, (parsed.data.text?.length || 4) * fs * 0.6);
        return p.x >= pt.x - tol && p.x <= pt.x + wGuess + tol && p.y >= pt.y - fs - tol && p.y <= pt.y + fs * 0.5 + tol;
      }
      case 'stamp': {
        const pt = geomPoint(g);
        const refW = parsed.data.w || 2000;
        const half = Math.max(40, refW * 0.045);
        return Math.abs(p.x - pt.x) <= half + tol && Math.abs(p.y - pt.y) <= half * 0.45 + tol;
      }
      default:
        return false;
    }
  } catch { return false; }
}

/* ── labels ─────────────────────────────────────────────────────────────── */

/** Feet → honest ft-in display (12″ carry). */
function ftIn(ft: number): string {
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches >= 12) return `${whole + 1}′-0″`;
  return `${whole}′-${inches}″`;
}

/** Honest measurement label: feet when calibrated, px + 'uncalibrated' otherwise. */
export function measureLabel(x1: number, y1: number, x2: number, y2: number, ppf: number | null | undefined): string {
  const px = Math.hypot(x2 - x1, y2 - y1);
  if (ppf && ppf > 0) return ftIn(px / ppf);
  return `${Math.round(px)} px · uncalibrated`;
}

/** Polyline label — chained length via the canonical engine (lib/takeoff lengthLF). */
export function polylineMeasureLabel(points: Pt[], ppf: number | null | undefined): string {
  if (points.length < 2) return '';
  if (ppf && ppf > 0) return ftIn(lengthLF(points, ppf));
  return `${Math.round(lengthLF(points, 1))} px · uncalibrated`;
}

/** Area label via the canonical engine (lib/takeoff areaSF): 'N,NNN SF' or honest px². */
export function areaMeasureLabel(points: Pt[], ppf: number | null | undefined): string {
  if (points.length < 3) return '';
  if (ppf && ppf > 0) {
    const sf = areaSF(points, ppf);
    return `${sf.toLocaleString('en-US', { maximumFractionDigits: sf < 100 ? 1 : 0 })} SF`;
  }
  return `${Math.round(areaSF(points, 1)).toLocaleString('en-US')} px² · uncalibrated`;
}

/** Count label — one tick per point. */
export function countMeasureLabel(n: number): string {
  return `${n} EA`;
}

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff) || diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
