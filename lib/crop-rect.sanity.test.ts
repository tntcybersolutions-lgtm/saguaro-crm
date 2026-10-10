/**
 * Crop box on screen → stored-image pixels.
 * Run: npx -y tsx lib/crop-rect.sanity.test.ts   (exit 0 = every assertion held)
 */
import { toNaturalRect, type CropImage } from './crop-rect';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const r = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const frame = (w: number, h: number) => ({ getBoundingClientRect: () => r(0, 0, w, h) });
/** An image laid out at lw×lh, its centre at (cx, cy), shown turned by `rot`. */
function img(nw: number, nh: number, lw: number, lh: number, cx: number, cy: number, rot = 0): CropImage {
  const turned = Math.abs(rot) % 180 === 90;
  const dw = turned ? lh : lw, dh = turned ? lw : lh;
  return { naturalWidth: nw, naturalHeight: nh, offsetWidth: lw, offsetHeight: lh, getBoundingClientRect: () => r(cx - dw / 2, cy - dh / 2, dw, dh) };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Landscape filling the frame, no turn
let got = toNaturalRect({ x: 100, y: 75, w: 200, h: 150 }, img(4000, 3000, 400, 300, 200, 150), frame(400, 300), 0);
check('landscape centre box', same(got, { left: 1000, top: 750, width: 2000, height: 1500 }), JSON.stringify(got));

// Portrait centred in a wider frame: the old maths measured from the frame's edge
got = toNaturalRect({ x: 87.5, y: 0, w: 112.5, h: 300 }, img(3000, 4000, 225, 300, 200, 150), frame(400, 300), 0);
check('portrait left half (centred photo)', same(got, { left: 0, top: 0, width: 1500, height: 4000 }), JSON.stringify(got));

// Turned right 90°: the top half on screen is the stored image's left half
got = toNaturalRect({ x: 150, y: 100, w: 300, h: 200 }, img(4000, 3000, 400, 300, 300, 300, 90), frame(600, 600), 90);
check('rotate right: screen top half = left half', same(got, { left: 0, top: 0, width: 2000, height: 3000 }), JSON.stringify(got));

// Turned left 90°: the top half on screen is the stored image's right half
got = toNaturalRect({ x: 150, y: 100, w: 300, h: 200 }, img(4000, 3000, 400, 300, 300, 300, -90), frame(600, 600), -90);
check('rotate left: screen top half = right half', same(got, { left: 2000, top: 0, width: 2000, height: 3000 }), JSON.stringify(got));

// 180°: the screen's top-left quarter is the stored bottom-right quarter
got = toNaturalRect({ x: 0, y: 0, w: 200, h: 150 }, img(4000, 3000, 400, 300, 200, 150, 180), frame(400, 300), 180);
check('180: top-left = bottom-right', same(got, { left: 2000, top: 1500, width: 2000, height: 1500 }), JSON.stringify(got));

// A box that spills off the photo is clamped to it
got = toNaturalRect({ x: 0, y: 0, w: 150, h: 300 }, img(3000, 4000, 225, 300, 200, 150), frame(400, 300), 0);
check('spill past the left edge is clamped', same(got, { left: 0, top: 0, width: 833, height: 4000 }), JSON.stringify(got));

// A box only in the empty margin beside a portrait photo
got = toNaturalRect({ x: 0, y: 0, w: 60, h: 300 }, img(3000, 4000, 225, 300, 200, 150), frame(400, 300), 0);
check('box off the photo → null', got === null, JSON.stringify(got));

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall crop-rect checks passed');
