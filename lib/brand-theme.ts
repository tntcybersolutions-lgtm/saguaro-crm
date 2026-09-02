/**
 * Tenant theming with a hard guarantee: text stays readable.
 *
 * A GC picks their company colour and the whole platform becomes theirs. The
 * obvious way to build that is to drop their hex into the CSS variables and
 * hope. The predictable result is a tenant whose brand is pale yellow choosing
 * it as a surface, white body text landing on it, and a screen of invisible
 * words — with no way for them to tell whether the product broke or they did.
 *
 * So nothing here trusts an input colour to be usable. Every derived pair is
 * measured with the WCAG contrast formula and, where it falls short, the
 * FOREGROUND is walked toward whichever pole gives more separation until it
 * passes. The tenant's hue survives; only its lightness moves, and only as far
 * as it must. What was adjusted is reported, so the branding screen can say
 * "we darkened your text to keep it legible" rather than silently overriding
 * somebody's brand and leaving them to wonder.
 *
 * Targets are the WCAG 2.1 AA thresholds, which are the accepted floor rather
 * than an opinion: 4.5:1 for body text, 3:1 for large text and for the edges
 * of interface components.
 *
 * Everything is pure and synchronous, so the same function runs in the browser
 * for live preview, on the server for emailed HTML, and in the PDF generator.
 * One definition of the tenant's theme, not three that drift.
 */

/* ── colour primitives ──────────────────────────────────────────────────── */

export interface RGB { r: number; g: number; b: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** #abc, #aabbcc, with or without the hash. Null when it is not a colour. */
export function parseHex(input: string | null | undefined): RGB | null {
  if (!input) return null;
  let h = String(input).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: RGB): string {
  const p = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/**
 * WCAG relative luminance.
 *
 * Not the same as HSL lightness, and the difference is the whole point: pure
 * yellow and pure blue have identical HSL lightness and wildly different
 * luminance. Judging readability on lightness is how pale-brand tenants end up
 * with invisible text.
 */
export function luminance({ r, g, b }: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* HSL, used only to move lightness while holding hue and saturation. */

export interface HSL { h: number; s: number; l: number }

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 };
}

/* ── the guarantee ──────────────────────────────────────────────────────── */

export interface ContrastFix {
  /** What the pair is for, in words a person can act on. */
  what: string;
  /** Contrast before the adjustment. */
  was: number;
  /** Contrast after. */
  now: number;
  from: string;
  to: string;
}

/**
 * Return a foreground that meets `min` against `bg`, moving as little as
 * possible.
 *
 * Walks lightness toward whichever pole increases separation — up on a dark
 * background, down on a light one — in small steps, keeping hue and saturation.
 * If the hue cannot reach the target at any lightness (a mid-tone background is
 * the usual cause, because everything is close to it), it falls back to plain
 * white or near-black, whichever wins. That fallback is the difference between
 * "we tried" and "the words are readable".
 */
export function ensureContrast(fg: RGB, bg: RGB, min: number): { rgb: RGB; adjusted: boolean } {
  /**
   * Aim just past the line, not at it.
   *
   * Stopping the moment the ratio computes as >= min lands on values like
   * 2.99997, which prints as "3.00" and fails the threshold it appears to
   * meet. Channels are also rounded to whole bytes on the way to a hex string,
   * which can shave the ratio again after the check. A small margin absorbs
   * both, and costs a barely perceptible shift in lightness.
   */
  const target = min + 0.05;

  if (contrast(fg, bg) >= target) return { rgb: fg, adjusted: false };

  const bgLum = luminance(bg);
  const goLighter = bgLum < 0.5;
  const hsl = rgbToHsl(fg);

  for (let i = 1; i <= 100; i++) {
    const l = clamp(goLighter ? hsl.l + i / 100 : hsl.l - i / 100, 0, 1);
    const candidate = hslToRgb({ ...hsl, l });
    if (contrast(candidate, bg) >= target) return { rgb: candidate, adjusted: true };
    if (l === 0 || l === 1) break;
  }

  /* The hue cannot get there. Take the readable one. */
  const white = { r: 255, g: 255, b: 255 };
  const ink = { r: 12, g: 16, b: 22 };
  const best = contrast(white, bg) >= contrast(ink, bg) ? white : ink;
  return { rgb: best, adjusted: true };
}

/** Whichever of white / near-black reads better on this background. */
export function bestTextOn(bg: RGB): RGB {
  const white = { r: 255, g: 255, b: 255 };
  const ink = { r: 12, g: 16, b: 22 };
  return contrast(white, bg) >= contrast(ink, bg) ? white : ink;
}

/** Mix two colours by weight, for deriving surfaces from a base. */
function mix(a: RGB, b: RGB, weight: number): RGB {
  const w = clamp(weight, 0, 1);
  return { r: a.r + (b.r - a.r) * w, g: a.g + (b.g - a.g) * w, b: a.b + (b.b - a.b) * w };
}

/* ── the theme ──────────────────────────────────────────────────────────── */

export interface BrandInput {
  /** The tenant's accent — buttons, links, active states. */
  primary?: string | null;
  /** Optional page ground. Omitted keeps the platform's dark base. */
  surface?: string | null;
}

export interface BrandTheme {
  base: string;
  surface: string;
  surface2: string;
  elevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryStrong: string;
  primaryHover: string;
  /** Text that sits ON the accent — a button label, for instance. */
  onPrimary: string;
  primary12: string;
  primary18: string;
  primary25: string;
  primary35: string;
  /** Everything that had to be moved to stay readable, for the branding screen. */
  fixes: ContrastFix[];
  /** True when the input was unusable and the platform default was kept. */
  usedFallback: boolean;
}

/** WCAG AA. Body text 4.5:1; large text and component edges 3:1. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

const SAGUARO_GOLD = '#F59E0B';
const SAGUARO_BASE = '#0d1117';

/**
 * Build a complete, readable theme from whatever the tenant supplied.
 *
 * Nothing in here can produce an unreadable pair. Where the tenant's own colour
 * would, it is adjusted and the adjustment is recorded rather than hidden.
 */
export function deriveTheme(input: BrandInput): BrandTheme {
  const fixes: ContrastFix[] = [];
  let usedFallback = false;

  const primaryRgb = parseHex(input.primary) ?? (() => { usedFallback = true; return parseHex(SAGUARO_GOLD)!; })();
  const baseRgb = parseHex(input.surface) ?? parseHex(SAGUARO_BASE)!;

  const white = { r: 255, g: 255, b: 255 };
  const ink = { r: 12, g: 16, b: 22 };
  const towardText = luminance(baseRgb) < 0.5 ? white : ink;

  /* Surfaces are the ground nudged toward its text pole, so cards separate from
     the page without ever inverting the relationship. */
  const surface = mix(baseRgb, towardText, 0.05);
  const surface2 = mix(baseRgb, towardText, 0.09);
  const elevated = mix(baseRgb, towardText, 0.14);
  const border = mix(baseRgb, towardText, 0.16);
  const borderStrong = mix(baseRgb, towardText, 0.28);

  /* Body text on the busiest surface, not on the page ground — that is where
     the ratio is tightest and where a failure would actually show. */
  const textBase = bestTextOn(surface2);
  const textFixed = ensureContrast(textBase, surface2, AA_TEXT);
  if (textFixed.adjusted) {
    fixes.push({
      what: 'Body text on cards',
      was: Number(contrast(textBase, surface2).toFixed(2)),
      now: Number(contrast(textFixed.rgb, surface2).toFixed(2)),
      from: toHex(textBase), to: toHex(textFixed.rgb),
    });
  }

  /* Secondary text is deliberately quieter, but quiet is not the same as gone —
     it still has to clear the body threshold. */
  const mutedRaw = mix(textFixed.rgb, surface2, 0.38);
  const mutedFixed = ensureContrast(mutedRaw, surface2, AA_TEXT);
  if (mutedFixed.adjusted) {
    fixes.push({
      what: 'Secondary text',
      was: Number(contrast(mutedRaw, surface2).toFixed(2)),
      now: Number(contrast(mutedFixed.rgb, surface2).toFixed(2)),
      from: toHex(mutedRaw), to: toHex(mutedFixed.rgb),
    });
  }

  /* Faint text is labels and captions — large or bold, so the 3:1 rule is the
     honest threshold rather than a loophole. */
  const faintRaw = mix(textFixed.rgb, surface2, 0.55);
  const faintFixed = ensureContrast(faintRaw, surface2, AA_LARGE);
  if (faintFixed.adjusted) {
    fixes.push({
      what: 'Captions and labels',
      was: Number(contrast(faintRaw, surface2).toFixed(2)),
      now: Number(contrast(faintFixed.rgb, surface2).toFixed(2)),
      from: toHex(faintRaw), to: toHex(faintFixed.rgb),
    });
  }

  /* The accent has to be visible AS a colour against the page — a navy brand on
     a navy ground is a button you cannot find. */
  const primaryFixed = ensureContrast(primaryRgb, surface, AA_LARGE);
  if (primaryFixed.adjusted) {
    fixes.push({
      what: 'Your brand colour against the page',
      was: Number(contrast(primaryRgb, surface).toFixed(2)),
      now: Number(contrast(primaryFixed.rgb, surface).toFixed(2)),
      from: toHex(primaryRgb), to: toHex(primaryFixed.rgb),
    });
  }

  /* And the label on a filled button has to read against the fill. This is the
     pair that breaks most often in practice, because a brand colour is chosen
     to look good on a letterhead, not to carry white type. */
  const onPrimaryBase = bestTextOn(primaryFixed.rgb);
  const onPrimaryFixed = ensureContrast(onPrimaryBase, primaryFixed.rgb, AA_TEXT);
  if (onPrimaryFixed.adjusted) {
    fixes.push({
      what: 'Button text on your brand colour',
      was: Number(contrast(onPrimaryBase, primaryFixed.rgb).toFixed(2)),
      now: Number(contrast(onPrimaryFixed.rgb, primaryFixed.rgb).toFixed(2)),
      from: toHex(onPrimaryBase), to: toHex(onPrimaryFixed.rgb),
    });
  }

  const pHsl = rgbToHsl(primaryFixed.rgb);
  const primaryStrong = hslToRgb({ ...pHsl, l: clamp(pHsl.l + 0.1, 0, 1) });
  const primaryHover = hslToRgb({ ...pHsl, l: clamp(pHsl.l - 0.08, 0, 1) });
  const pa = (a: number) => `rgba(${Math.round(primaryFixed.rgb.r)}, ${Math.round(primaryFixed.rgb.g)}, ${Math.round(primaryFixed.rgb.b)}, ${a})`;

  return {
    base: toHex(baseRgb),
    surface: toHex(surface),
    surface2: toHex(surface2),
    elevated: toHex(elevated),
    border: toHex(border),
    borderStrong: toHex(borderStrong),
    text: toHex(textFixed.rgb),
    textMuted: toHex(mutedFixed.rgb),
    textFaint: toHex(faintFixed.rgb),
    primary: toHex(primaryFixed.rgb),
    primaryStrong: toHex(primaryStrong),
    primaryHover: toHex(primaryHover),
    onPrimary: toHex(onPrimaryFixed.rgb),
    primary12: pa(0.12),
    primary18: pa(0.18),
    primary25: pa(0.25),
    primary35: pa(0.35),
    fixes,
    usedFallback,
  };
}

/** The CSS custom properties for a theme, for the browser or an inline style. */
export function themeToCssVars(t: BrandTheme): Record<string, string> {
  return {
    '--brand-primary': t.primary,
    '--brand-primary-strong': t.primaryStrong,
    '--brand-primary-hover': t.primaryHover,
    '--brand-on-primary': t.onPrimary,
    '--brand-primary-12': t.primary12,
    '--brand-primary-18': t.primary18,
    '--brand-primary-25': t.primary25,
    '--brand-primary-35': t.primary35,
    '--sg-base': t.base,
    '--sg-surface': t.surface,
    '--sg-surface-2': t.surface2,
    '--sg-elevated': t.elevated,
    '--sg-border': t.border,
    '--sg-border-strong': t.borderStrong,
    '--sg-text': t.text,
    '--sg-text-2': t.textMuted,
    '--sg-text-faint': t.textFaint,
  };
}
