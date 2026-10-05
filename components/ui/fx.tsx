'use client';

/**
 * Saguaro premium UI kit — shared FX layer.
 *
 * Codifies the shared premium look — jet black page, glass cards, neon-yellow
 * brand accent, entrance motion (docs/COPY-STYLE.md §6–§7) — as reusable
 * primitives so every module can adopt the same look with a few components.
 *
 * PURELY PRESENTATIONAL. No data, routing, or business logic lives here.
 *
 * Theming:
 *  - Gold tints resolve through `var(--brand-primary)` (globals.css), so a
 *    tenant's white-label override reskins the whole kit automatically.
 *  - Every component carries the `sgUi` class, which defines a small set of
 *    theme-aware CSS custom properties (text/surface/border) that flip under
 *    `[data-theme="light"]`. Inline styles read those vars, so the kit is
 *    light/dark aware without any JS.
 *  - Animations are disabled under `prefers-reduced-motion`.
 */

import React from 'react';

/* ── Gold tint helper ──────────────────────────────────────────────────
 * color-mix lets us derive an arbitrary-alpha gold from the single brand
 * variable, so white-label overrides + reduced-opacity glows both work. */
export const gold = (a: number) =>
  `color-mix(in srgb, var(--brand-primary) ${a}%, transparent)`;

/** Bright brand highlight (top of the gold gradient). */
export const GOLD = 'var(--brand-primary)';
export const GOLD_HI = 'var(--brand-primary-strong)';

/** The gold → light-gold shimmer gradient used for accent words + shine. */
export const GOLD_TEXT_GRADIENT =
  'linear-gradient(100deg, var(--brand-primary) 6%, var(--brand-primary-strong) 42%, #FFF7A8 60%, var(--brand-primary) 92%)';

/* ── Shared stylesheet ─────────────────────────────────────────────────
 * Injected once per page via <UiFx/> (which <ModuleHero> and <PremiumEmpty>
 * render for you). Interactive hover is handled with inline JS handlers on
 * each component so they still work if this sheet is absent — the sheet only
 * adds keyframe motion, the gradient-text shine, and the heading size-cap
 * overrides that beat globals.css `h1{font-size:18px!important}`. */
export const UI_FX_CSS = `
/* Theme-aware tokens (dark default; flip under light) */
.sgUi{
  --sg-text:#ffffff;
  --sg-text-2:#D4D4D8;
  --sg-text-3:#A9B4C4;
  --sg-surface-from:rgba(255,255,255,0.055);
  --sg-surface-to:rgba(255,255,255,0.03);
  --sg-surface-solid:#0E0F12;
  --sg-border:rgba(255,255,255,0.09);
  --sg-border-strong:rgba(255,255,255,0.16);
  --sg-page-fade:rgba(0,0,0,0);
  --sg-inner-glow:rgba(255,255,255,0.045);
  --sg-shadow:0 24px 60px -24px rgba(0,0,0,0.55);
}
[data-theme="light"] .sgUi{
  --sg-text:#0a0a0a;
  --sg-text-2:#7A8597;
  --sg-text-3:#A3ACBB;
  --sg-surface-from:#ffffff;
  --sg-surface-to:#f7f8fa;
  --sg-surface-solid:#ffffff;
  --sg-border:#e6e8ec;
  --sg-border-strong:#d5d9e0;
  --sg-page-fade:rgba(255,255,255,0);
  --sg-inner-glow:rgba(0,0,0,0.015);
  --sg-shadow:0 20px 48px -26px rgba(20,20,22,0.28);
}

@keyframes sgRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes sgPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@keyframes sgFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes sgGlow{0%,100%{box-shadow:0 0 0 1px color-mix(in srgb,var(--brand-primary) 30%,transparent),0 22px 60px -18px color-mix(in srgb,var(--brand-primary) 20%,transparent),inset 0 0 60px color-mix(in srgb,var(--brand-primary) 5%,transparent)}50%{box-shadow:0 0 0 1px color-mix(in srgb,var(--brand-primary) 55%,transparent),0 26px 90px -14px color-mix(in srgb,var(--brand-primary) 34%,transparent),inset 0 0 90px color-mix(in srgb,var(--brand-primary) 8%,transparent)}}
@keyframes sgRing{0%{transform:scale(.85);opacity:.7}70%{opacity:0}100%{transform:scale(1.7);opacity:0}}
@keyframes sgAur1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(7%,5%) scale(1.14)}}
@keyframes sgAur2{0%,100%{transform:translate(0,0) scale(1.06)}50%{transform:translate(-8%,6%) scale(1)}}
@keyframes sgAur3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(5%,-7%) scale(1.16)}}
@keyframes sgGridPan{from{background-position:0 0}to{background-position:34px 34px}}
@keyframes sgShimmer{from{background-position:180% 0}to{background-position:-180% 0}}
@keyframes sgSpin{to{transform:rotate(360deg)}}

/* Entrance helper — stagger via inline animation-delay */
.sgIn{animation:sgRise .5s cubic-bezier(.2,.7,.3,1) both}

/* Gradient-text shine used by accent words */
.sgShine{background-size:200% 100%;animation:sgShimmer 3.6s linear infinite}

/* Heading size-cap overrides (beat globals.css h1/h2 !important via specificity) */
h1.sgHeroTitle{font-size:clamp(28px,4.6vw,46px)!important;font-weight:900!important;line-height:1.04!important;letter-spacing:-0.03em!important}
h1.sgHeroTitle[data-size="sm"]{font-size:clamp(22px,3vw,30px)!important}
h1.sgHeroTitle[data-size="lg"]{font-size:clamp(34px,5.6vw,60px)!important}
h2.sgSectionTitle{font-size:clamp(15px,1.6vw,18px)!important;font-weight:800!important;line-height:1.25!important;letter-spacing:-0.01em!important}

/* Loading spinner */
.sgSpin{animation:sgSpin .8s linear infinite}

@media (max-width:720px){
  .sgHeroRow{flex-direction:column;align-items:flex-start!important}
  .sgHeroActions{width:100%}
}
@media (prefers-reduced-motion: reduce){
  .sgUi,.sgUi *{animation:none!important}
  .sgIn{opacity:1!important;transform:none!important}
}
`;

/**
 * Injects the shared stylesheet. Rendered automatically by <ModuleHero> and
 * <PremiumEmpty>; render it once yourself (near the top of a page) if you use
 * StatCard / SectionCard / GradientButton standalone and want entrance motion.
 * Duplicate instances are harmless (identical CSS).
 */
export function UiFx() {
  return <style dangerouslySetInnerHTML={{ __html: UI_FX_CSS }} />;
}

/* ── Aurora backdrop ───────────────────────────────────────────────────
 * Jet black (COPY-STYLE §6). The animated gold blobs, drifting blueprint grid
 * and vignette sat behind text and hurt legibility, so the backdrop is now a
 * single faint, static, COOL sheen at the top. Props kept (`grid` is accepted
 * and ignored) so every caller keeps compiling. position:absolute so it fills
 * only its positioned parent; pointer-events:none keeps content interactive. */
export function Aurora({ soft = false }: { soft?: boolean; grid?: boolean }) {
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}
    >
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 60% at 50% -12%, rgba(170,195,255,${soft ? 0.035 : 0.05}), transparent 60%)` }} />
    </div>
  );
}
