/**
 * Crop-box geometry for components/FileCropper.
 */

export type CropRect = { left: number; top: number; width: number; height: number };

type Rectish = { left: number; top: number; width: number; height: number };
/** What the maths reads off the <img> — an HTMLImageElement satisfies it. */
export type CropImage = { getBoundingClientRect(): Rectish; offsetWidth: number; offsetHeight: number; naturalWidth: number; naturalHeight: number };

/**
 * The box drawn on screen → a rectangle in the stored image's own pixels.
 *
 * The server crops FIRST, in the image's unrotated pixels, then rotates
 * (lib/blueprint-processor cropAndRotate). On screen the photo is centred in
 * the frame and may be turned by `rotate` degrees. So each corner of the box is
 * taken relative to the photo's centre, turned back by -rotate, and scaled from
 * the photo's laid-out size (offsetWidth/Height — unaffected by the CSS rotate)
 * to its natural size. Null when the box misses the photo entirely.
 */
export function toNaturalRect(
  box: { x: number; y: number; w: number; h: number },
  img: CropImage,
  frame: { getBoundingClientRect(): Rectish },
  rotate: number,
): CropRect | null {
  const f = frame.getBoundingClientRect();
  const d = img.getBoundingClientRect(); // the turned box on screen
  const cx = d.left + d.width / 2 - f.left, cy = d.top + d.height / 2 - f.top;
  const lw = img.offsetWidth, lh = img.offsetHeight;
  if (!lw || !lh) return null;
  const sx = img.naturalWidth / lw, sy = img.naturalHeight / lh;
  const t = (-rotate * Math.PI) / 180;
  const cos = Math.round(Math.cos(t)), sin = Math.round(Math.sin(t)); // quarter turns only
  const pts = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map(([px, py]) => {
    const vx = px - cx, vy = py - cy;
    // undo CSS rotate(θ): (x, y) → (x·cosθ' − y·sinθ', x·sinθ' + y·cosθ') with θ' = −θ
    const ux = vx * cos - vy * sin, uy = vx * sin + vy * cos;
    return [(ux + lw / 2) * sx, (uy + lh / 2) * sy];
  });
  const clampX = (v: number) => Math.max(0, Math.min(img.naturalWidth, v));
  const clampY = (v: number) => Math.max(0, Math.min(img.naturalHeight, v));
  const left = clampX(Math.min(...pts.map((p) => p[0]))), right = clampX(Math.max(...pts.map((p) => p[0])));
  const top = clampY(Math.min(...pts.map((p) => p[1]))), bottom = clampY(Math.max(...pts.map((p) => p[1])));
  const width = Math.round(right - left), height = Math.round(bottom - top);
  if (width < 2 || height < 2) return null;
  return { left: Math.round(left), top: Math.round(top), width, height };
}
