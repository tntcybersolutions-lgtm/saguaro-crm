#!/usr/bin/env node
/**
 * test-help-placement — the callout is always on screen.
 *
 * "I opened new project, clicked away, and it goes dark and that's it" is what
 * a mispositioned callout looks like from the outside: the scrim is up, the
 * card is somewhere past the edge of the viewport, and the page appears to
 * have simply died.
 *
 * The placement is pure arithmetic over the anchor rect and the viewport, so
 * it can be checked exhaustively rather than eyeballed. This mirrors the
 * geometry in components/HelpMode.tsx and asserts, across every awkward case
 * the app actually produces — a full-width sidebar row, a control at the very
 * bottom, a rect that is off-screen, a NaN from an element with no layout —
 * that the callout stays fully within the viewport.
 *
 * If the geometry in HelpMode changes, change it here too and re-run.
 */

const CALLOUT_W = 336;
const ARROW_GAP = 132;

function chooseSide(r, vw, vh) {
  if (r.x + r.w + ARROW_GAP + CALLOUT_W < vw - 16) return 'right';
  if (r.x - ARROW_GAP - CALLOUT_W > 16) return 'left';
  if (r.y + r.h + ARROW_GAP + 150 < vh - 16) return 'below';
  return 'above';
}

function place(rect, vw, vh, calloutH, onRoute = true) {
  let side = 'right';
  let cx = vw / 2 - CALLOUT_W / 2;
  let cy = vh / 2 - calloutH / 2;

  if (rect && onRoute) {
    side = chooseSide(rect, vw, vh);
    if (side === 'right') { cx = rect.x + rect.w + ARROW_GAP; cy = rect.y + rect.h / 2 - calloutH / 2; }
    else if (side === 'left') { cx = rect.x - ARROW_GAP - CALLOUT_W; cy = rect.y + rect.h / 2 - calloutH / 2; }
    else if (side === 'below') { cx = rect.x + rect.w / 2 - CALLOUT_W / 2; cy = rect.y + rect.h + ARROW_GAP; }
    else { cx = rect.x + rect.w / 2 - CALLOUT_W / 2; cy = rect.y - ARROW_GAP - calloutH; }
  }

  if (!Number.isFinite(cx)) cx = Math.max(14, vw / 2 - CALLOUT_W / 2);
  if (!Number.isFinite(cy)) cy = Math.max(70, vh / 2 - calloutH / 2);
  cx = Math.max(14, Math.min(cx, Math.max(14, vw - CALLOUT_W - 14)));
  cy = Math.max(70, Math.min(cy, Math.max(70, vh - calloutH - 14)));

  return { cx, cy, side };
}

/* Viewports the app is actually used on, including a short laptop. */
const VIEWPORTS = [
  [1920, 1080, 'desktop'],
  [1536, 864, 'laptop'],
  [1366, 768, 'small laptop'],
  [1280, 620, 'short window'],
  [900, 700, 'narrow'],
];

/* Anchor rects taken from the real screens. */
const RECTS = [
  { x: 0, y: 408, w: 220, h: 36, note: 'sidebar row (full-width, left edge)' },
  { x: 377, y: 650, w: 327, h: 190, note: 'job-type card' },
  { x: 1420, y: 300, w: 180, h: 40, note: 'top-right action button' },
  { x: 600, y: 960, w: 200, h: 40, note: 'control near the bottom' },
  { x: 600, y: 8, w: 200, h: 40, note: 'control near the top' },
  { x: 1850, y: 500, w: 200, h: 40, note: 'rect running off the right edge' },
  { x: -50, y: 500, w: 200, h: 40, note: 'rect starting off the left edge' },
  { x: NaN, y: 500, w: 200, h: 40, note: 'NaN rect (element with no layout)' },
  null, // no anchor at all
];

/* The callout grows with its body text; 150 is the pre-measurement guess. */
const HEIGHTS = [110, 150, 240, 360];

let checks = 0;
const failures = [];

for (const [vw, vh, vname] of VIEWPORTS) {
  for (const rect of RECTS) {
    for (const h of HEIGHTS) {
      for (const onRoute of [true, false]) {
        const { cx, cy, side } = place(rect, vw, vh, h, onRoute);
        checks++;
        const where = `${vname} ${vw}x${vh} · ${rect ? rect.note : 'no anchor'} · h=${h} · onRoute=${onRoute}`;

        if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
          failures.push(`${where}\n      cx/cy not finite (${cx}, ${cy}) — React drops the declaration and the card vanishes`);
          continue;
        }
        if (cx < 0 || cy < 0) failures.push(`${where}\n      negative position (${cx}, ${cy}) — off the top/left`);
        /* Fully visible: the whole card, not just its corner. */
        if (cx + CALLOUT_W > vw) failures.push(`${where}\n      right edge ${Math.round(cx + CALLOUT_W)} past viewport ${vw} [${side}]`);
        if (cy + h > vh) failures.push(`${where}\n      bottom edge ${Math.round(cy + h)} past viewport ${vh} [${side}]`);
      }
    }
  }
}

console.log('='.repeat(70));
console.log('HELP MODE — is the callout always on screen?');
console.log('='.repeat(70));
console.log(`  cases checked   ${checks}`);
console.log(`  FAILURES        ${failures.length}`);
if (failures.length) {
  console.log('');
  failures.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  if (failures.length > 20) console.log(`  … ${failures.length - 20} more`);
}
process.exitCode = failures.length ? 1 : 0;
