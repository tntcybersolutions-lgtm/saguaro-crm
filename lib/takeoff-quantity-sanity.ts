/**
 * takeoff-quantity-sanity — deterministic post-processing for AI takeoff lines whose
 * quantity contradicts the takeoff's OWN geometry.
 *
 * WHY: on a 120×80 tilt-up (400 LF perimeter, 28 ft panels) the model wrote
 *   "20 panels, 560 LF face, 3,136 SF/panel avg = 62,720 SF total panel face; concrete 959 CY"
 * — it multiplied a per-panel area by the panel count AND inflated the face length,
 * so the panel concrete came out ~5× the real 400 × 28 = 11,200 SF (~190 CY at 5.5").
 * The same takeoff's paint line said "400 LF x 28 ft = 11,200 SF" — the evidence to
 * catch it was sitting in the result. A $163k line at 5× is a bid-losing error.
 *
 * WHAT IT DOES (concrete wall / tilt-up panel CY lines ONLY — every other line is
 * returned untouched):
 *   1. Find the wall-face area the takeoff itself supports:
 *        a. perimeter LF × height ft stated in the panel line's own description, and
 *        b. "N LF x M ft" / wall-face SF stated on OTHER wall lines (paint, coating,
 *           insulation, sealer on exterior / tilt-up / panel walls).
 *      The LARGEST of these is used, so the check errs toward leaving a line alone.
 *   2. If the line states a thickness: expected CY = face SF × t/12 ÷ 27 × 1.05 (waste).
 *      When the line's CY exceeds 1.5× that, the quantity is RECOMPUTED to the expected
 *      CY (total and labor hours scale with it) and the line is tagged for review.
 *   3. No thickness stated: even at a 12" wall the CY implies qty × 27 SF of face. If that
 *      is more than 1.5× the supported area, the line is only FLAGGED (not changed).
 *   No supporting geometry → nothing happens. Footings, slabs, grade beams, piers,
 *   curbs and paving are excluded by name.
 *
 * A changed/flagged line gets QTY_CHECK_TAG in its notes; the takeoff results row
 * shows a warning icon for it (app/app/projects/[projectId]/takeoff/page.tsx).
 */

export const QTY_CHECK_TAG = 'QTY CHECK:';

export interface SanityLine {
  csi_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  labor_hours: number;
  notes: string;
}

/** Above this ratio a line is considered wildly off (not a rounding / waste difference). */
const TOLERANCE = 1.5;
/** Standard concrete waste allowance applied to the recomputed quantity. */
const WASTE = 1.05;

const num = (s: string) => Number(s.replace(/,/g, ''));

const isWallConcrete = (l: SanityLine) =>
  l.unit.toUpperCase() === 'CY' &&
  l.csi_code.replace(/\s/g, '').startsWith('03') &&
  /tilt[\s-]?up|panel|\bwalls?\b/i.test(l.description) &&
  !/footing|slab|foundation|grade\s*beam|pier|caisson|pile|curb|sidewalk|paving|apron|pad\b|topping|fill/i.test(l.description);

/** "400 LF perimeter" / "perimeter 400 LF" / "perimeter of 400 LF". */
function perimeterLf(text: string): number | null {
  const a = text.match(/(\d[\d,]*(?:\.\d+)?)\s*LF\s+(?:of\s+)?(?:building\s+)?perimeter/i);
  if (a) return num(a[1]);
  const b = text.match(/perimeter[^\d;]{0,20}(\d[\d,]*(?:\.\d+)?)\s*LF/i);
  return b ? num(b[1]) : null;
}

/** "28 ft tall" / "28 ft high" / "28' tall" / "height 28 ft" / "28 ft panel height". */
function heightFt(text: string): number | null {
  const a = text.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:tall|high|height|panel\s+height|wall\s+height)/i);
  if (a) return Number(a[1]);
  const b = text.match(/height[^\d;]{0,12}(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i);
  return b ? Number(b[1]) : null;
}

/** "5.5 in thick" / '7-1/4" thick' (fraction ignored → conservative) / "thickness 6 in". */
function thicknessIn(text: string): number | null {
  const a = text.match(/(\d+(?:\.\d+)?)\s*(?:in\b|inch(?:es)?|")\s*(?:thick|panel|wall)/i);
  if (a) return Number(a[1]);
  const b = text.match(/thick(?:ness)?[^\d;]{0,8}(\d+(?:\.\d+)?)\s*(?:in\b|inch|")/i);
  return b ? Number(b[1]) : null;
}

/** Wall-face SF evidenced by OTHER lines on the same walls (paint / coating / insulation). */
function faceAreaFromOtherLines(lines: SanityLine[], self: SanityLine): number[] {
  const out: number[] = [];
  for (const l of lines) {
    if (l === self) continue;
    const d = l.description;
    if (!/tilt[\s-]?up|panel|exterior\s+wall|perimeter\s+wall/i.test(d)) continue;
    if (!/paint|coat|seal|insulat|elastomeric|stain|face/i.test(d)) continue;
    // Prefer the explicit "N LF x M ft" product on that line.
    const m = d.match(/(\d[\d,]*(?:\.\d+)?)\s*LF\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i);
    if (m) out.push(num(m[1]) * Number(m[2]));
    else if (l.unit.toUpperCase() === 'SF' && l.quantity > 0) out.push(l.quantity);
  }
  return out;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export interface SanityResult<T> { lines: T[]; adjusted: number; flagged: number }

export function applyQuantitySanity<T extends SanityLine>(lines: T[]): SanityResult<T> {
  let adjusted = 0, flagged = 0;
  const out = lines.map((line) => {
    if (!isWallConcrete(line) || !(line.quantity > 0)) return line;

    const candidates: number[] = [];
    const p = perimeterLf(line.description), h = heightFt(line.description);
    if (p && h && p > 0 && h > 0) candidates.push(p * h);
    candidates.push(...faceAreaFromOtherLines(lines, line));
    const faceSf = candidates.filter((n) => Number.isFinite(n) && n > 0).reduce((a, b) => Math.max(a, b), 0);
    if (!faceSf) return line; // no geometry to check against — leave it alone

    const t = thicknessIn(line.description);
    if (t && t > 0 && t <= 24) {
      const expected = Math.ceil((faceSf * (t / 12) / 27) * WASTE);
      if (line.quantity <= expected * TOLERANCE) return line;
      const ratio = expected / line.quantity;
      adjusted++;
      const note = `${QTY_CHECK_TAG} AI quantity ${fmt(line.quantity)} CY implied ~${fmt(line.quantity * 27 / (t / 12))} SF of wall face, but this takeoff's walls are ~${fmt(faceSf)} SF (perimeter × height). Recomputed to ${fmt(expected)} CY = ${fmt(faceSf)} SF × ${t}" ÷ 12 ÷ 27 + 5% waste. Verify against the panel schedule.`;
      return {
        ...line,
        quantity: expected,
        total_cost: Math.round(expected * line.unit_cost * 100) / 100,
        labor_hours: Math.round(line.labor_hours * ratio * 10) / 10,
        notes: line.notes ? `${note} ${line.notes}` : note,
      };
    }

    // No stated thickness: even a 12" wall can't make this much concrete from this face area.
    if (line.quantity * 27 > faceSf * TOLERANCE) {
      flagged++;
      const note = `${QTY_CHECK_TAG} ${fmt(line.quantity)} CY is more concrete than ~${fmt(faceSf)} SF of wall face could hold even at 12" thick. Quantity left as the AI wrote it — verify before bidding.`;
      return { ...line, notes: line.notes ? `${note} ${line.notes}` : note };
    }
    return line;
  });
  return { lines: out, adjusted, flagged };
}
