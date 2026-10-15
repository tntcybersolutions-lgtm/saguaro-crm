/**
 * Automatic sheet hyperlinks on drawings — computed on view, never stored.
 *
 * pdf.js gives each page's text as items (a string plus a transform in PDF
 * user space). We find sheet numbers in that text ("A-501", "M2.01",
 * "E-101", "S3.1", and detail callouts "5/A-501"), keep only the ones that
 * name a current sheet on the same job, and place a box over each one in the
 * workspace's 1000-wide reference space.
 */
import { sheetKey } from './drawing-revisions';

export type TextItemLite = { str: string; transform: number[]; width: number; height?: number };
export type SheetRow = { id: string; sheet_number: string; title?: string | null; name?: string | null; status?: string | null; created_at?: string | null };
export type SheetRefMatch = { text: string; sheet: string; detail: string | null; start: number; end: number };
export type Box = { x: number; y: number; w: number; h: number };
export type AutoLink = { key: string; sheetId: string; sheetNumber: string; title: string; detail: string | null; text: string; box: Box };

/** Optional "5/" detail number, then the sheet number. */
const REF_RE = /(?:\b(\d{1,3})\s*\/\s*)?\b([A-Z]{1,2}-?\d{1,3}(?:\.\d{1,2})?)\b/g;

/** Every sheet-number-shaped token in one string, with its character span. */
export function findSheetRefs(str: string): SheetRefMatch[] {
  const out: SheetRefMatch[] = [];
  if (!str) return out;
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(str))) {
    out.push({ text: m[0], sheet: m[2], detail: m[1] || null, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Normalized sheet number → the sheet to open. Superseded revisions are
 * dropped; when two rows share a number the current one wins, then the newest.
 * The sheet being viewed is left out (its own title block is not a link).
 */
export function buildSheetIndex(rows: SheetRow[], selfKey?: string): Map<string, SheetRow> {
  const idx = new Map<string, SheetRow>();
  for (const r of rows) {
    if (!r || !r.id || !r.sheet_number) continue;
    if (r.status === 'superseded' || r.status === 'void') continue;
    const k = sheetKey(r.sheet_number);
    if (!k || (selfKey && k === selfKey)) continue;
    const have = idx.get(k);
    if (!have) { idx.set(k, r); continue; }
    const rank = (x: SheetRow) => (x.status === 'current' ? 1 : 0);
    if (rank(r) > rank(have) || (rank(r) === rank(have) && String(r.created_at || '') > String(have.created_at || ''))) idx.set(k, r);
  }
  return idx;
}

/** pdf.js Util.transform: m1 × m2 for [a b c d e f] affine matrices. */
export function mulTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * The box (reference units) around characters [start, end) of a text item.
 * `vt` is the page viewport's transform and `vw` its width at that scale;
 * the characters are placed proportionally along the run.
 */
export function itemBox(item: TextItemLite, vt: number[], vw: number, start: number, end: number, refW = 1000): Box | null {
  const len = item.str.length;
  if (!len || !(vw > 0) || !Array.isArray(item.transform) || item.transform.length < 6) return null;
  const tx = mulTransform(vt, item.transform);
  const vpScale = Math.hypot(vt[0], vt[1]) || 1;
  const runW = (Number(item.width) || 0) * vpScale;
  let fontH = Math.hypot(tx[2], tx[3]);
  if (!(fontH > 0)) fontH = (Number(item.height) || 0) * vpScale;
  if (!(runW > 0) || !(fontH > 0)) return null;
  const a0 = Math.hypot(tx[0], tx[1]) || 1;
  const dir: [number, number] = [tx[0] / a0, tx[1] / a0];
  const up: [number, number] = [tx[2] / fontH, tx[3] / fontH];
  const s = (runW * Math.max(0, start)) / len, e = (runW * Math.min(len, end)) / len;
  const ox = tx[4], oy = tx[5];
  // Ascent ≈ the font size; a little descent below the baseline.
  const pts: [number, number][] = [];
  for (const along of [s, e]) for (const h of [-0.22 * fontH, fontH]) pts.push([ox + dir[0] * along + up[0] * h, oy + dir[1] * along + up[1] * h]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const k = refW / vw;
  const pad = 2;
  const x = Math.min(...xs) * k - pad, y = Math.min(...ys) * k - pad;
  const w = (Math.max(...xs) - Math.min(...xs)) * k + pad * 2, h = (Math.max(...ys) - Math.min(...ys)) * k + pad * 2;
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Hotspots for one page: every sheet reference in the page text that names a
 * sheet in `index`. Boxes that land on a hand-drawn link (`skip`) or repeat
 * an earlier hotspot are dropped.
 */
export function computeAutoLinks(items: TextItemLite[], vt: number[], vw: number, index: Map<string, SheetRow>, opts: { refW?: number; skip?: Box[] } = {}): AutoLink[] {
  const refW = opts.refW ?? 1000;
  const out: AutoLink[] = [];
  if (!index.size || !Array.isArray(items)) return out;
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    for (const m of findSheetRefs(it.str)) {
      const row = index.get(sheetKey(m.sheet));
      if (!row) continue;
      const box = itemBox(it, vt, vw, m.start, m.end, refW);
      if (!box) continue;
      if ((opts.skip || []).some((b) => boxesOverlap(b, box))) continue;
      if (out.some((o) => boxesOverlap(o.box, box))) continue;
      out.push({
        key: `${row.id}:${box.x}:${box.y}`, sheetId: row.id, sheetNumber: row.sheet_number,
        title: String(row.title || row.name || ''), detail: m.detail, text: m.text, box,
      });
    }
  }
  return out;
}

/** "Go to A-501 — Wall Sections" / "Go to detail 5 on A-501 — Wall Sections". */
export function autoLinkLabel(l: Pick<AutoLink, 'sheetNumber' | 'title' | 'detail'>): string {
  const head = l.detail ? `Go to detail ${l.detail} on ${l.sheetNumber}` : `Go to ${l.sheetNumber}`;
  return l.title ? `${head} — ${l.title}` : head;
}
