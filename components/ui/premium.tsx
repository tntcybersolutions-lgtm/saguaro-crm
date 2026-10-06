'use client';

/**
 * Premium UI kit — the cinematic "Takeoff-level" surface language.
 *
 * Purely presentational building blocks used to elevate flagship screens
 * (Dashboard, Projects, …) to the same bar as the AI Blueprint Takeoff page:
 * an aurora/blueprint backdrop, a big gradient headline hero, premium stat
 * cards with depth + glow, section cards with an icon chip, and cinematic
 * empty/error states.
 *
 * Everything themes through --brand-primary (white-label aware). The look is
 * jet black + glass + neon yellow (docs/COPY-STYLE.md §6–§7): no warm glows
 * behind text. No data, no fetching, no routing here.
 */

import React from 'react';
import { NEON_CYCLE, neonCard, neonFor, neonText } from '@/lib/neon';
import { Check } from '@phosphor-icons/react';
import { moduleAccent } from '@/lib/module-identity';
import { ScribbleNote } from '@/components/Scribble';
import { STATUS_COLORS } from '@/lib/status-colors';

// Brand hooks (white-label re-themes these via WhiteLabelProvider) ------------
const GOLD = 'var(--brand-primary)';        // #FFE600 neon yellow default
const GOLD_HI = 'var(--brand-primary-strong)'; // #FFF04A default
const ON_GOLD = 'var(--on-brand)';             // #0A0A00 — text/icons on a yellow fill
// Brand alpha steps — tokens, so a white-label override re-themes them too.
const A08 = 'var(--brand-primary-08)';
const A12 = 'var(--brand-primary-12)';
const A18 = 'var(--brand-primary-18)';
const A22 = 'var(--brand-primary-18)';
const A30 = 'var(--brand-primary-25)';
const A45 = 'var(--brand-primary-35)';
const BORDER = 'rgba(255,255,255,0.09)';
// Glass (COPY-STYLE §6): translucent white over jet black, blurred.
const SURFACE = 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03))';
const GLASS_BLUR = 'blur(16px) saturate(140%)';
const WHITE = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';
const RED = STATUS_COLORS.overdue;

// ─── FX keyframes + interaction classes ──────────────────────────────────────
// Rendered once per page. All motion is disabled under prefers-reduced-motion.
export const PREMIUM_FX = `
@keyframes pmRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}/* transform:none at rest — translateY(0) + fill-mode both left a PERMANENT stacking context that painted every hero dropdown UNDER later cards */
@keyframes pmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes pmAur1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(7%,5%) scale(1.14)}}
@keyframes pmAur2{0%,100%{transform:translate(0,0) scale(1.06)}50%{transform:translate(-8%,6%) scale(1)}}
@keyframes pmAur3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(5%,-7%) scale(1.16)}}
@keyframes pmGridPan{from{background-position:0 0}to{background-position:34px 34px}}
@keyframes pmShimmer{from{background-position:180% 0}to{background-position:-180% 0}}
@keyframes pmPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.4)}}
@keyframes pmRing{0%{transform:scale(.85);opacity:.7}70%{opacity:0}100%{transform:scale(1.7);opacity:0}}
@keyframes pmSkeleton{0%,100%{opacity:1}50%{opacity:.4}}
.pmHover{transition:transform .2s cubic-bezier(.2,.7,.3,1),box-shadow .2s ease,border-color .2s ease,background .2s ease}
/* !important on hover: outranks pmRise's held fill value (transform:none) and the inline resting shadow so the lift/elevation actually renders. Hover-only transforms are transient — the rest state stays transform:none, so no permanent stacking context. */
.pmHover:hover{transform:translateY(-4px)!important;border-color:${A45};box-shadow:0 22px 44px -26px ${A30},inset 0 1px 0 rgba(255,255,255,0.08)!important}
.pmHover:hover .pmChip{box-shadow:0 0 0 3px ${A12},0 0 22px ${A30}!important}
.pmBtn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}
.pmBtn:hover{transform:translateY(-1px);filter:brightness(1.05)}
.pmBtn:active{transform:scale(.98)}/* transient press; rest state stays transform:none */
/* Machined button material (mobile MAT port — lib/theme goldGrad/ghostGrad/dangerGrad).
   Class-based so :active gets REAL pressed depth: a full-step darker gradient with the
   glow tucked in, not just a scale. Disabled: dimmed, glow off, faint top edge only. */
.pmGold{background:linear-gradient(180deg,var(--brand-primary-strong),var(--brand-primary) 60%,var(--brand-primary-hover));color:var(--on-brand);border:none;box-shadow:0 4px 14px var(--brand-primary-25),inset 0 1px 0 rgba(255,255,255,0.35);transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,background .16s ease}
.pmGold:hover{transform:translateY(-1px);filter:brightness(1.05);box-shadow:0 8px 22px var(--brand-primary-35),inset 0 1px 0 rgba(255,255,255,0.35)}
.pmGold:active{transform:translateY(0.5px) scale(.985);filter:none;background:linear-gradient(180deg,var(--brand-primary) 0%,var(--brand-primary-hover) 55%,#CCB800 100%);box-shadow:0 2px 8px var(--brand-primary-25),inset 0 1px 3px rgba(0,0,0,0.2)}
.pmGhost{background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04));backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);color:var(--c-text);border:1px solid ${BORDER};box-shadow:0 2px 10px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.07);transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease}
.pmGhost:hover{transform:translateY(-1px);border-color:rgba(255,255,255,0.16)}
.pmGhost:active{transform:translateY(0.5px) scale(.985);background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));box-shadow:inset 0 1px 3px rgba(0,0,0,0.25)}
.pmDanger{background:linear-gradient(180deg,rgba(255,59,48,0.20),rgba(255,59,48,0.09));color:#FF3B30;border:1px solid rgba(255,59,48,0.50);box-shadow:0 2px 10px rgba(255,59,48,0.18),inset 0 1px 0 rgba(255,255,255,0.10);transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
.pmDanger:hover{transform:translateY(-1px);background:linear-gradient(180deg,rgba(255,59,48,0.26),rgba(255,59,48,0.12))}
.pmDanger:active{transform:translateY(0.5px) scale(.985);background:linear-gradient(180deg,rgba(255,59,48,0.30),rgba(255,59,48,0.16));box-shadow:0 1px 6px rgba(255,59,48,0.15),inset 0 1px 3px rgba(0,0,0,0.25)}
.pmGold:disabled,.pmGhost:disabled,.pmDanger:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06)}
/* Interactive milled plates press in slightly (pairs with .pmHover lift). !important
   outranks pmRise's held fill value, same as the :hover rule above. */
.pmHover:active{transform:translateY(-1px) scale(.985)!important}
.pmTile{transition:transform .18s ease}
.pmTile:hover{transform:translateY(-1px)}
.pmShine{background-size:200% 100%;animation:pmShimmer 3.6s linear infinite}
.pmSkeleton{animation:pmSkeleton 1.4s ease-in-out infinite}
/* Machined sortable table headers (premium DataTable). Color states live here so
   hover/active read as one material: dim chrome -> white on hover -> brand on sort. */
.pmSortTh{cursor:pointer;transition:color .15s ease}
.pmSortTh:hover{color:var(--c-text-2)}
.pmSortTh .pmSortGlyph{font-size:10px;line-height:1;opacity:.35;transition:opacity .15s ease}
.pmSortTh:hover .pmSortGlyph{opacity:.8}
.pmSortTh[aria-sort="ascending"],.pmSortTh[aria-sort="descending"]{color:var(--brand-primary-strong)}
.pmSortTh[aria-sort="ascending"] .pmSortGlyph,.pmSortTh[aria-sort="descending"] .pmSortGlyph{opacity:1}
/* Beat the global h1 !important size cap (globals.css) with higher specificity */
@media (max-width:640px){.pmStatValue{font-size:26px!important}}
h1.pmH1{font-size:clamp(24px,2.4vw,32px)!important;font-weight:800!important;line-height:1.12!important;letter-spacing:-0.02em!important;margin:0!important} /* page-title scale: 28–32 desktop, 24 phone */
@media (prefers-reduced-motion: reduce){
  .pmRoot,.pmRoot *{animation:none!important;transition:none!important}
  .pmHover:hover,.pmHover:active,.pmBtn:hover,.pmBtn:active,.pmTile:hover,.pmGold:hover,.pmGold:active,.pmGhost:hover,.pmGhost:active,.pmDanger:hover,.pmDanger:active{transform:none!important}
}
`;

export function PremiumFX() {
  /* dangerouslySetInnerHTML, not a text child — and it is the SAFE option here.
   *
   * As `<style>{PREMIUM_FX}</style>` this CSS was a text child, so the server
   * HTML-escaped it on the way out:
   *
   *     .pmSortTh[aria-sort="ascending"]      (what we wrote)
   *     .pmSortTh[aria-sort=&quot;ascending&quot;]   (what shipped)
   *
   * A browser does not decode entities inside <style> — its content is raw
   * text — so those selectors were invalid and the browser dropped them. The
   * sorted-column highlight on every premium DataTable was dead in the
   * server-rendered HTML. The `->` and apostrophes in the comments above
   * escaped the same way.
   *
   * Then hydration made it worse. The client renders the UNESCAPED text, the
   * two text nodes differ, and React throws #425 (text content did not match)
   * followed by #422 (Suspense boundary hydration failed) and throws away the
   * server HTML for that subtree — on every single page that mounts this, which
   * is every page under /app.
   *
   * __html is not a risk: PREMIUM_FX is a module constant in this file. No
   * request data reaches it, so there is nothing to inject.
   */
  return <style dangerouslySetInnerHTML={{ __html: PREMIUM_FX }} />;
}

// ─── Aurora backdrop ─────────────────────────────────────────────────────────
// Jet black (COPY-STYLE §6). The warm amber blobs, drifting blueprint grid and
// vignette that used to live here sat behind text and made it hard to read;
// the backdrop is now one faint, static, COOL sheen at the top of the column
// and nothing else. Name and props kept so every caller keeps compiling.
// position:absolute so it fills only the content column; pointer-events:none.
export function Aurora({ soft = true }: { soft?: boolean }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 60% at 50% -12%, rgba(170,195,255,${soft ? 0.035 : 0.05}), transparent 60%)` }} />
    </div>
  );
}

// ─── PremiumSurface ──────────────────────────────────────────────────────────
// The relative wrapper that carries the Aurora + FX for a whole page. Content
// sits above the backdrop at zIndex 1.
export function PremiumSurface({
  children,
  maxWidth = 2200,
  soft = true,
  pad = '32px 24px 56px',
}: {
  children: React.ReactNode;
  maxWidth?: number;
  soft?: boolean;
  pad?: string;
}) {
  return (
    <div className="pmRoot" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 56px)' }}>
      <PremiumFX />
      <Aurora soft={soft} />
      <div style={{ position: 'relative', zIndex: 1, padding: pad, maxWidth, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

// ─── ModuleHero ──────────────────────────────────────────────────────────────
export function ModuleHero({
  eyebrow,
  eyebrowIcon,
  aux,
  title,
  accent,
  subtitle,
  note,
  actions,
  align = 'left',
  accentColor,
  style,
}: {
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  aux?: React.ReactNode;
  title: React.ReactNode;
  accent?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Handwritten margin note. Plain text, one short line. */
  note?: string;
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /** Module accent HEX (lib/module-identity moduleAccent). When set, the eyebrow
   *  pill, title shine and a StatCard-style 3px left bar wash in the module hue
   *  instead of gold. Money modules simply don't pass it — they stay gold. */
  accentColor?: string;
  style?: React.CSSProperties;
}) {
  const centered = align === 'center';
  const ac = accentColor;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: centered ? 'center' : 'flex-end',
        flexDirection: centered ? 'column' : 'row',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 24,
        paddingLeft: ac && !centered ? 18 : undefined,
        textAlign: centered ? 'center' : 'left',
        ...style,
      }}
    >
      {/* module-accent left bar (StatCard-style) — only when accentColor is set */}
      {ac && !centered && (
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 2, bottom: 6, width: 3, borderRadius: 2, background: `linear-gradient(180deg, ${ac}, transparent)`, opacity: 0.85 }} />
      )}
      <div style={{ minWidth: 0, maxWidth: centered ? 720 : undefined }}>
        {(eyebrow || aux) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap', justifyContent: centered ? 'center' : 'flex-start' }}>
            {eyebrow && (
              <span
                style={{
                  animation: 'pmRise .5s ease both',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '6px 14px', borderRadius: 999,
                  background: ac ? `${ac}24` : A12,
                  border: `1px solid ${ac ? ac + '73' : A45}`, color: ac || GOLD,
                  fontSize: 12.5, fontWeight: 700, letterSpacing: 'normal',
                }}
              >
                {eyebrowIcon}{eyebrow}
              </span>
            )}
            {aux}
          </div>
        )}
        <h1 className="pmH1" style={{ animation: 'pmRise .55s ease .05s both', color: WHITE }}>
          {title}
          {accent != null && accent !== '' && (
            <>
              {' '}
              <span
                className="pmShine"
                style={{
                  background: ac
                    ? `linear-gradient(100deg, ${ac} 6%, color-mix(in srgb, ${ac} 70%, #FFFFFF) 38%, color-mix(in srgb, ${ac} 42%, #FFFFFF) 56%, ${ac} 92%)`
                    : `linear-gradient(100deg, ${GOLD} 6%, ${GOLD_HI} 38%, #FFF7A8 56%, ${GOLD} 92%)`,
                  WebkitBackgroundClip: 'text', backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent', color: 'transparent',
                }}
              >
                {accent}
              </span>
            </>
          )}
        </h1>
        {subtitle && (
          <p style={{ animation: 'pmRise .6s ease .1s both', color: MUTED, fontSize: 15, margin: '12px 0 0', maxWidth: 620, lineHeight: 1.6, marginInline: centered ? 'auto' : undefined }}>
            {subtitle}
          </p>
        )}
        {/* A mark in the margin, the way a super writes on a drawing — the bit
            the official subtitle leaves out. One line on a screen, never two:
            the value is that it reads as a person, and a page covered in them
            reads as a gimmick. */}
        {note && (
          <div style={{ margin: '9px 0 0', marginInline: centered ? 'auto' : undefined }}>
            <ScribbleNote size={15} rotate={-3}>{note}</ScribbleNote>
          </div>
        )}
      </div>
      {actions && (
        <div style={{ animation: 'pmRise .6s ease .12s both', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: centered ? 'center' : 'flex-end', paddingBottom: centered ? 0 : 4 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

// ─── IconChip ────────────────────────────────────────────────────────────────
// Default (no `vivid`): the classic low-alpha brand-yellow chip. With `vivid` (a module-identity vivid hex) the
// chip goes chip-loud: saturated gradient ground (vivid -> ~20% darker), a
// 1px vivid ring at 55%, and a soft outer glow at 25% — built for a WHITE
// (#F8FAFC) glyph sitting ON the color. Never hue-on-hue.
export function IconChip({ children, size = 40, vivid }: { children: React.ReactNode; size?: number; vivid?: string }) {
  return (
    <span
      className="pmChip"
      style={{
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        background: vivid
          ? `linear-gradient(150deg, ${vivid}, color-mix(in srgb, ${vivid} 80%, #000000))`
          : `linear-gradient(150deg, ${A18}, ${A08})`,
        border: `1px solid ${vivid ? vivid + '8C' : A30}`,
        boxShadow: vivid
          ? `0 0 0 3px ${vivid}1F, 0 6px 20px -6px ${vivid}40, inset 0 1px 0 rgba(255,255,255,0.25)`
          : `0 0 0 3px ${A08}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        transition: 'box-shadow .2s ease',
      }}
    >
      {children}
    </span>
  );
}

/** Vivid chip hue for a module key — moduleAccent(key).vivid, hex fallback.
 *  Pair with <IconChip vivid={vividOf('daily')}> + a white (#F8FAFC) glyph. */
export function vividOf(accentKey?: string | null): string {
  const a = moduleAccent(accentKey);
  return a.vivid ?? a.hex;
}

// ─── StatCard (premium) ──────────────────────────────────────────────────────
export function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  onClick,
  href,
  interactive: forceInteractive,
  active = false,
  delay = 0,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  /** Tints the whole card: 'bad' for a count that must be zero (Paperwork Missing > 0), 'warn', 'good'. */
  tone?: 'bad' | 'warn' | 'good';
  onClick?: () => void;
  href?: string;
  interactive?: boolean;
  /** Selected state — e.g. a card acting as the active filter on a list. */
  active?: boolean;
  delay?: number;
}) {
  const interactive = !!(onClick || href || forceInteractive);
  /* Neon by default (owner 2026-10-03): every stat card is lit in its own
     accent — a caller's accent wins, otherwise a stable neon from the label. */
  const toneColor = tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warning)' : tone === 'good' ? 'var(--success)' : null;
  const lit = accent || toneColor || neonFor(label);
  const numberColor = lit;
  const ring = active ? lit : toneColor;
  const glow = neonCard(lit);
  const inner = (
    <div
      onClick={onClick}
      className={interactive ? 'pmHover' : undefined}
      aria-pressed={onClick ? active : undefined}
      style={{
        position: 'relative', overflow: 'hidden',
        background: ring
          ? `linear-gradient(160deg, color-mix(in srgb, ${ring} 24%, transparent), color-mix(in srgb, ${ring} 8%, transparent)), ${SURFACE}`
          : `${glow.background}, ${SURFACE}`,
        backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
        border: `1px solid ${ring || BORDER}`, borderTop: glow.borderTop, borderRadius: 12,
        padding: '14px 16px 14px 18px',
        // compact plate — tight, not fat (Procore/JobTread density)
        boxShadow: ring
          ? `0 0 0 1px ${ring}, 0 8px 20px -14px color-mix(in srgb, ${ring} 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)`
          : glow.boxShadow,
        cursor: interactive ? 'pointer' : 'default',
        animation: `pmRise .5s ease ${delay.toFixed(2)}s both`,
        height: '100%',
        transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease',
      }}
    >
      {interactive && (
        <span aria-hidden style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 800, color: active ? 'var(--on-brand)' : lit, background: active ? lit : 'rgba(255,255,255,0.06)', border: `1px solid ${active ? lit : 'rgba(255,255,255,0.12)'}`, padding: '3px 8px', borderRadius: 999, lineHeight: 1.2 }}>
          {active ? 'Filtering' : 'View →'}
        </span>
      )}
      {/* left accent bar */}
      <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${numberColor}, transparent)`, opacity: 0.85 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <IconChip size={32} vivid={toneColor || undefined}>{icon}</IconChip>
        <span style={{ fontSize: 12.5, color: MUTED, fontWeight: 750, letterSpacing: '.02em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div className="pmStatValue" style={{ fontSize: 30, fontWeight: 800, color: accent || toneColor ? numberColor : 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub != null && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  if (href) {
    // Link is intentionally not imported here to keep the kit routing-agnostic;
    // callers wrap with their own <Link>. A plain <a> keeps it self-contained.
    return <a href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{inner}</a>;
  }
  return inner;
}

// ─── SectionCard ─────────────────────────────────────────────────────────────
export function SectionCard({
  title,
  subtitle,
  icon,
  action,
  children,
  accent = GOLD,
  flush = false,
  flat = false,
  style,
  bodyStyle,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
  flush?: boolean;
  /**
   * Content on the page rather than an object on a tray.
   *
   * Nine of these stacked on one screen, each with its own background, border,
   * radius, drop shadow and inset light ring — and when everything is raised,
   * nothing is. Elevation stops meaning "this is a thing you act on" and
   * becomes wallpaper.
   *
   * flat keeps the header — the small Title Case label is still how you find
   * your way down a page — and drops the tray: no fill, no border, no shadow,
   * a hairline rule instead. Reserve the raised form for objects you would
   * point at and name: the line-item table, the takeoff result, a form.
   */
  flat?: boolean;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  if (flat) {
    return (
      <div style={{ position: 'relative', ...style }}>
        {(title || icon || action) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 9, marginBottom: 14, borderBottom: `1px solid ${BORDER}` }}>
            {icon && <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.9 }}>{icon}</span>}
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && (
                /* Neon section title (owner 2026-10-03): bright, with a lit
                   underline in a stable neon per title — not grey-on-black. */
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--title-color, var(--brand-primary))', lineHeight: 1.3, paddingBottom: 6, display: 'inline-block', background: `linear-gradient(90deg, ${neonFor(typeof title === 'string' ? title : '')}, transparent) left bottom / 44px 2px no-repeat` }}>
                  {title}
                </div>
              )}
              {subtitle && <div style={{ fontSize: 12.5, color: FAINT, marginTop: 3, fontWeight: 400 }}>{subtitle}</div>}
            </div>
            {action && <div style={{ flex: '0 0 auto' }}>{action}</div>}
          </div>
        )}
        <div style={bodyStyle}>{children}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        /* Glass, not paint.
           A flat fill reads as a rectangle painted onto the page. A blurred,
           slightly saturated pane with a lit top edge reads as something
           sitting ABOVE it — which is what "raised" was supposed to mean, and
           what makes the flat/raised distinction do any work. */
        background: 'rgba(255,255,255,0.045)',
        backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
        border: `1px solid ${BORDER}`, borderRadius: 16,
        boxShadow: '0 26px 54px -34px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
        ...style,
      }}
    >
      {(title || icon || action) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          {icon && <IconChip size={32}>{icon}</IconChip>}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <div style={{ fontWeight: 800, fontSize: 15.5, color: WHITE, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action && <div style={{ flex: '0 0 auto' }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: flush ? 0 : 16, ...bodyStyle }}>{children}</div>
      {/* top accent hairline */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.35 }} />
    </div>
  );
}

// ─── PremiumEmpty ────────────────────────────────────────────────────────────
export function PremiumEmpty({
  icon,
  title,
  description,
  action,
  tone = 'default',
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: 'default' | 'error';
  compact?: boolean;
}) {
  const ring = tone === 'error' ? RED.border : A45;
  const halo = tone === 'error' ? RED.bg : A12;
  const glow = tone === 'error' ? 'rgba(255,59,48,0.35)' : A30;
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: compact ? '32px 24px' : '52px 24px',
      }}
    >
      <div
        style={{
          position: 'relative', display: 'inline-flex', width: compact ? 66 : 84, height: compact ? 66 : 84,
          borderRadius: '50%', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
          background: `radial-gradient(circle, ${halo}, transparent)`,
          border: `1px solid ${ring}`,
          boxShadow: `0 0 0 6px ${tone === 'error' ? 'rgba(255,59,48,0.07)' : A08}, 0 0 44px -10px ${glow}`,
        }}
      >
        <span aria-hidden style={{ position: 'absolute', inset: -1, borderRadius: '50%', border: `1px solid ${ring}`, animation: 'pmRing 3s ease-out infinite' }} />
        {icon}
      </div>
      <div style={{ fontSize: compact ? 16 : 18, fontWeight: 800, color: WHITE, marginBottom: 8, letterSpacing: '-0.01em' }}>{title}</div>
      {description && <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.55, maxWidth: 400, marginBottom: action ? 22 : 0 }}>{description}</div>}
      {action}
    </div>
  );
}

// ─── PremiumButton (link-agnostic) ───────────────────────────────────────────
// The neon-yellow primary CTA. Renders as a <button> unless the
// caller wraps it. Kept here so pages don't re-derive the same gradient.
export const goldButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: `linear-gradient(180deg, ${GOLD_HI}, ${GOLD} 60%, var(--brand-primary-hover))`, color: ON_GOLD,
  fontWeight: 800, fontSize: 13.5, letterSpacing: '0.01em', textDecoration: 'none',
  boxShadow: '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',
};

export const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 18px', borderRadius: 12, cursor: 'pointer',
  /* The quietest tier, still glass so it reads as the same material as the
     cards and the outlined button rather than a flat grey chip. */
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
  color: 'var(--text-primary)',
  border: '1px solid rgba(255,255,255,0.11)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
  fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
};

/**
 * The SECOND action on a screen, and it is deliberately not gold any more.
 *
 * There are 356 filled-gold buttons across the app and 86 gold-outlined ones,
 * so a typical screen shouted in the same color three or four times. When one
 * color means "this is the important thing" and it is used four times on one
 * view, it has stopped meaning anything — the eye has nowhere to land and
 * every page reads as a wall of amber. It is the same failure the status
 * colors had before they were given one meaning each.
 *
 * Gold now marks exactly one thing per screen: the filled button, the action
 * the GC came to that page to take. Everything beside it is a neutral outline
 * — still obviously a button, still hoverable, just not competing. On the
 * project overview that is the difference between "Run Autopilot" and "New Pay
 * App" both demanding attention and one of them being the answer.
 *
 * Glass, like every other raised surface: a faint fill with a lit top edge
 * rather than a flat panel.
 */
export const goldOutlineButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 18px', borderRadius: 12, cursor: 'pointer',
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
  color: 'var(--text-primary)',
  border: '1px solid rgba(255,255,255,0.16)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
  fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
};

// ─── Machined buttons (mobile Btn port) ──────────────────────────────────────
// Real components over the style objects above: the .pmGold/.pmGhost/.pmDanger
// classes (PREMIUM_FX) give :active a TRUE pressed state — a full-step darker
// gradient with the glow tucked in — which inline style objects can't express.
// goldButtonStyle/ghostButtonStyle stay exported; existing callers untouched.
// Use inside a <PremiumSurface> (or render <PremiumFX/> once on the page).

const BTN_SIZE: Record<'lg' | 'md', React.CSSProperties> = {
  lg: { padding: '12px 22px', fontSize: 14, borderRadius: 12 },
  md: { padding: '9px 16px', fontSize: 13, borderRadius: 10 },
};

const BTN_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontWeight: 800, letterSpacing: '0.01em', textDecoration: 'none',
  cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.2, whiteSpace: 'nowrap',
};

type MachinedButtonProps = {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  icon?: React.ReactNode;
  size?: 'lg' | 'md';
  disabled?: boolean;
  /** Renders as an <a> (kit stays routing-agnostic, same as StatCard href). */
  href?: string;
  type?: 'button' | 'submit';
  title?: string;
  style?: React.CSSProperties;
};

function MachinedButton({ cls, children, onClick, icon, size = 'lg', disabled, href, type = 'button', title, style }: MachinedButtonProps & { cls: string }) {
  const s = { ...BTN_BASE, ...BTN_SIZE[size], ...style };
  if (href && !disabled) {
    return <a className={cls} href={href} onClick={onClick} title={title} style={s}>{icon}{children}</a>;
  }
  return (
    <button className={cls} type={type} onClick={onClick} disabled={disabled} title={title} style={s}>
      {icon}{children}
    </button>
  );
}

/** Primary gold CTA — top-lit gradient, pressed = full-step darker + tucked glow. */
export function GoldButton(props: MachinedButtonProps) {
  return <MachinedButton cls="pmGold" {...props} />;
}

/** Frosted glass secondary — barely-there machined part, dims a step on press. */
export function GhostButton(props: MachinedButtonProps) {
  return <MachinedButton cls="pmGhost" {...props} />;
}

/** Destructive — red-tinted glass (mobile dangerGrad), same machined geometry. */
export function DangerButton(props: MachinedButtonProps) {
  return <MachinedButton cls="pmDanger" {...props} />;
}

// ─── Pill (mobile port) ──────────────────────────────────────────────────────
/** Ringed status pill. Tones read the ONE status palette (lib/status-colors):
 *  green = Ongoing, amber = Under Contract, red = Overdue; gold = the brand.
 *  `caps` is kept for callers but no longer forces capitals (COPY-STYLE §2) —
 *  it only selects the slightly smaller eyebrow size. */
export function Pill({ children, tone = 'neutral', caps, style }: {
  children: React.ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'gold';
  caps?: boolean;
  style?: React.CSSProperties;
}) {
  const map = {
    neutral: { bg: STATUS_COLORS.closed.bg, fg: 'var(--text-secondary)', bd: 'rgba(255,255,255,0.16)' },
    green:   { bg: STATUS_COLORS.ongoing.bg, fg: STATUS_COLORS.ongoing.color, bd: STATUS_COLORS.ongoing.border },
    amber:   { bg: STATUS_COLORS.under_contract.bg, fg: STATUS_COLORS.under_contract.color, bd: STATUS_COLORS.under_contract.border },
    red:     { bg: STATUS_COLORS.overdue.bg, fg: STATUS_COLORS.overdue.color, bd: STATUS_COLORS.overdue.border },
    gold:    { bg: A12, fg: GOLD, bd: A45 },
  } as const;
  const t = map[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
      fontSize: caps ? 11 : 12, fontWeight: 700,
      letterSpacing: 'normal',
      whiteSpace: 'nowrap', lineHeight: 1.5,
      ...style,
    }}>{children}</span>
  );
}

// ─── SmartCreate kit ─────────────────────────────────────────────────────────
// Shared anatomy for every add/create flow: the screen walks in already knowing
// the project (contract, COs, prior records) and shows the user what the system
// pre-filled and what happens after submit. No create screen ships a bare form.

/** Tiny brand pill marking a field the system filled from live project data. */
export function AutoChip({ label = 'Auto' }: { label?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', marginLeft: 8, padding: '1.5px 7px',
      borderRadius: 999, background: `linear-gradient(180deg, ${A22}, ${A08})`, border: `1px solid ${A45}`,
      color: GOLD, fontSize: 10, fontWeight: 800, letterSpacing: 'normal',
      verticalAlign: 'middle', lineHeight: 1.6,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
    }}>{label}</span>
  );
}

/** Dense full-width stat band for the top of create screens — kills dead space
 *  by surfacing what the system already knows (sums, counts, prior records). */
export function StatStrip({ items }: {
  items: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string; icon?: React.ReactNode; href?: string; onClick?: () => void }[];
}) {
  return (
    <div style={{
      // Same compact tiles as the kit stat grid: separate rounded cards, 12px
      // apart, 2-up on phones (minmax 150 keeps two columns at 393).
      display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 12,
      marginBottom: 20, minWidth: 0,
    }}>
      {items.map((it, i) => {
        const clickable = !!(it.href || it.onClick);
        // Each tile lit in its own neon (owner 2026-10-03); a caller accent wins.
        const lit = it.accent || NEON_CYCLE[i % NEON_CYCLE.length];
        const body = (
          <div
            className="pmTile"
            onClick={it.onClick}
            style={{ position: 'relative', background: 'linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.03)), var(--surface-card, #0E0F12)', border: `1px solid ${BORDER}`, borderTop: '2px solid color-mix(in srgb, var(--brand-primary) 80%, transparent)', borderRadius: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 28px -18px rgba(0,0,0,0.9)', padding: '13px 16px', minWidth: 0, cursor: clickable ? 'pointer' : 'default', height: '100%', boxSizing: 'border-box' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 750, color: MUTED, marginBottom: 5, whiteSpace: 'nowrap' }}>
              {it.icon}{it.label}
              {clickable && <span aria-hidden style={{ marginLeft: 'auto', color: FAINT, fontWeight: 700 }}>→</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: it.accent || 'var(--text-primary)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>}
          </div>
        );
        if (it.href) {
          return <a key={i} href={it.href} className="pmStripLink" style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}>{body}</a>;
        }
        return <React.Fragment key={i}>{body}</React.Fragment>;
      })}
    </div>
  );
}

/** Vertical "what happens next" pipeline for the create-screen context rail:
 *  numbered gold nodes with a connector line, so the user sees the downstream
 *  automation (approvals, waivers, budget sync) before they ever submit. */
export function FlowSteps({ title = 'What Happens Next', steps }: {
  title?: string;
  steps: { title: string; desc?: string; done?: boolean }[];
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 14 }}>{title}</div>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 10, top: 8, bottom: 14, width: 1, background: `linear-gradient(180deg, ${A45}, ${A18} 55%, transparent)` }} />
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i === steps.length - 1 ? 0 : 16, position: 'relative' }}>
            <div style={{
              width: 21, height: 21, borderRadius: 999, flexShrink: 0, zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? `linear-gradient(180deg, ${GOLD_HI}, ${GOLD} 62%, var(--brand-primary-hover))` : 'var(--surface-card)',
              border: s.done ? 'none' : `1px solid ${A45}`,
              boxShadow: s.done ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 14px -2px ${A45}` : `0 0 0 3px ${A08}`,
              color: s.done ? ON_GOLD : GOLD, fontSize: 10, fontWeight: 900,
            }}>{s.done ? <Check size={11} weight="bold" /> : i + 1}</div>
            <div style={{ minWidth: 0, paddingTop: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: WHITE, lineHeight: 1.35 }}>{s.title}</div>
              {s.desc && <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>{s.desc}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact horizontal "how this module flows" strip — the one-line sibling of
 *  FlowSteps, built for dead-space kills (spec 4.1): numbered gold mini-nodes
 *  with short labels in a single wrapping band, so an empty module still
 *  teaches what it automates. */
export function FlowStrip({ steps, style }: {
  steps: { title: string; desc?: string }[];
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px',
      padding: '11px 14px', borderRadius: 12,
      background: `linear-gradient(180deg, ${A08}, rgba(255,255,255,0.02))`,
      border: `1px solid ${BORDER}`,
      ...style,
    }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden style={{ color: FAINT, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>&rarr;</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{
              width: 17, height: 17, borderRadius: 999, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: A12, border: `1px solid ${A45}`, color: GOLD,
              fontSize: 9, fontWeight: 900,
            }}>{i + 1}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: WHITE, whiteSpace: 'nowrap' }}>{s.title}</span>
            {s.desc && <span style={{ fontSize: 11.5, color: MUTED }}>{s.desc}</span>}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Sortable DataTable (shared primitive) ───────────────────────────────────
// Lightweight machined table for module screens: milled .pmTable plate, chrome
// header band, brand-08 row hover — with tri-state column sorting built in.
// Zero deps (the TanStack table at components/DataTable.tsx is untouched; this
// is the premium-kit primitive hand-rolled tables migrate to). Sorting is
// numeric-aware (TEXT-money columns like "$1,234.56" compare as numbers),
// ISO-date-aware, and stable. Pass `tableId` to persist the user's chosen sort
// in localStorage under 'sag_sort_' + tableId.

export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir } | null;

export type DataTableColumn<T> = {
  /** Unique column id — also the row property read when no accessor is given. */
  key: string;
  header: React.ReactNode;
  /** Raw value used for sorting (and default rendering). Defaults to row[key]. */
  accessor?: (row: T) => unknown;
  /** Custom cell renderer. Sorting still uses accessor/row[key]. */
  render?: (row: T, index: number) => React.ReactNode;
  /** Default: true when the column's values are string/number/Date/boolean. */
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
};

// Numeric parse that survives the TEXT-typed money columns: strips currency
// symbols, thousands commas and a trailing %, then trusts Number().
function numericOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const cleaned = s.replace(/[$€£,\s]/g, '').replace(/%$/, '');
  if (!cleaned || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ISO-ish date strings ("2026-08-23", "2026-08-23T10:00:00Z", "2026-08") → ms.
const ISOISH_DATE = /^\d{4}-\d{2}(-\d{2})?([T ].*)?$/;
function dateMsOf(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v !== 'string' || !ISOISH_DATE.test(v.trim())) return null;
  const t = Date.parse(v.trim());
  return Number.isNaN(t) ? null : t;
}

/** Ascending compare for two non-empty cell values: numbers when both parse
 *  (money strings included), then ISO-ish dates, then locale text. */
export function compareSortValues(a: unknown, b: unknown): number {
  const an = numericOf(a);
  const bn = numericOf(b);
  if (an != null && bn != null) return an === bn ? 0 : an < bn ? -1 : 1;
  const ad = dateMsOf(a);
  const bd = dateMsOf(b);
  if (ad != null && bd != null) return ad === bd ? 0 : ad < bd ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Stable sort of rows by a SortState. Empty values (null/undefined/'') always
 *  sink to the bottom regardless of direction; ties keep source order. For
 *  hand-rolled tables: `const sorted = useSortedRows(rows, sort);`. */
export function useSortedRows<T>(
  rows: T[],
  sort: SortState,
  getValue?: (row: T, key: string) => unknown,
): T[] {
  return React.useMemo(() => {
    if (!sort || !Array.isArray(rows) || rows.length < 2) return rows;
    const get = getValue ?? ((row: T, key: string) => (row as Record<string, unknown> | null | undefined)?.[key]);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const av = get(a.row, sort.key);
        const bv = get(b.row, sort.key);
        const ae = av == null || av === '';
        const be = bv == null || bv === '';
        if (ae !== be) return ae ? 1 : -1; // empties last, both directions
        const c = ae ? 0 : compareSortValues(av, bv);
        return c !== 0 ? c * dir : a.i - b.i; // explicit stability
      })
      .map((x) => x.row);
  }, [rows, sort, getValue]);
}

const colValue = <T,>(col: DataTableColumn<T>, row: T): unknown =>
  col.accessor ? col.accessor(row) : (row as Record<string, unknown> | null | undefined)?.[col.key];

// sortable default: true when the first non-empty value is a primitive we can
// order (string/number/Date/boolean); an empty table stays sortable-ready.
function isColSortable<T>(col: DataTableColumn<T>, rows: T[]): boolean {
  if (col.sortable != null) return col.sortable;
  for (const row of rows) {
    const v = colValue(col, row);
    if (v == null || v === '') continue;
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date;
  }
  return true;
}

function defaultCell(v: unknown): React.ReactNode {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (v instanceof Date) return v.toLocaleDateString();
  return String(v);
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'No records',
  defaultSort,
  tableId,
  style,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: React.ReactNode;
  /** Initial sort when the user hasn't chosen one (or no tableId is given). */
  defaultSort?: { key: string; dir: SortDir };
  /** Persist the user's sort as 'sag_sort_' + tableId in localStorage. */
  tableId?: string;
  style?: React.CSSProperties;
}) {
  const [sort, setSort] = React.useState<SortState>(defaultSort ?? null);

  // Load the persisted choice after mount (not in the initializer) so server
  // and first client render agree — no hydration mismatch.
  React.useEffect(() => {
    if (!tableId) return;
    try {
      const raw = window.localStorage.getItem('sag_sort_' + tableId);
      if (raw == null) return;
      const parsed = JSON.parse(raw) as SortState;
      if (parsed === null) setSort(null); // user explicitly cycled back to none
      else if (parsed && typeof parsed.key === 'string' && (parsed.dir === 'asc' || parsed.dir === 'desc')) setSort(parsed);
    } catch {
      /* corrupt entry — keep defaultSort */
    }
  }, [tableId]);

  const cycleSort = (key: string) => {
    setSort((prev) => {
      const next: SortState =
        !prev || prev.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null;
      if (tableId) {
        try {
          window.localStorage.setItem('sag_sort_' + tableId, JSON.stringify(next));
        } catch {
          /* storage unavailable — sort still applies for this session */
        }
      }
      return next;
    });
  };

  const byKey = React.useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const getValue = React.useCallback(
    (row: T, key: string) => {
      const col = byKey.get(key);
      return col ? colValue(col, row) : (row as Record<string, unknown> | null | undefined)?.[key];
    },
    [byKey],
  );
  const sorted = useSortedRows(rows, sort, getValue);

  return (
    <div className="pmTable" style={style}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col, i) => {
                const sortable = isColSortable(col, rows);
                const active = sortable && sort?.key === col.key ? sort.dir : null;
                return (
                  <th
                    key={col.key}
                    className={sortable ? 'pmSortTh' : undefined}
                    aria-sort={sortable ? (active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none') : undefined}
                    onClick={sortable ? () => cycleSort(col.key) : undefined}
                    style={{
                      padding: `9px ${i === columns.length - 1 ? 16 : 12}px 9px ${i === 0 ? 16 : 12}px`,
                      background: 'rgba(255,255,255,0.05)',
                      borderBottom: `1px solid ${BORDER}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                      textAlign: col.align || 'left',
                      fontSize: 12,
                      fontWeight: 700,
                      color: FAINT,
                      letterSpacing: 'normal',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      width: col.width,
                    }}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleSort(col.key);
                        }}
                        style={{
                          all: 'unset',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          cursor: 'pointer',
                          font: 'inherit',
                          color: 'inherit',
                          letterSpacing: 'inherit',
                          textTransform: 'inherit',
                        }}
                      >
                        {col.header}
                        <span className="pmSortGlyph" aria-hidden>
                          {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '32px 16px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row, rowIndex) => {
                const isLast = rowIndex === sorted.length - 1;
                return (
                  <tr
                    key={rowKey ? rowKey(row, rowIndex) : rowIndex}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={{ cursor: onRowClick ? 'pointer' : 'default', background: 'transparent', transition: 'background .12s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-primary-08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {columns.map((col, cIdx) => (
                      <td
                        key={col.key}
                        style={{
                          padding: `9px ${cIdx === columns.length - 1 ? 16 : 12}px 9px ${cIdx === 0 ? 16 : 12}px`,
                          borderBottom: isLast ? 'none' : `1px solid rgba(255,255,255,0.05)`,
                          fontSize: 13,
                          // Row title = first column, in the one title color (owner 2026-10-03).
                          color: cIdx === 0 ? 'var(--title-color, var(--brand-primary))' : 'var(--text-primary)',
                          fontWeight: cIdx === 0 ? 700 : undefined,
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                          textAlign: col.align || 'left',
                        }}
                      >
                        {col.render ? col.render(row, rowIndex) : defaultCell(colValue(col, row))}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Label/value row for context rails and snapshot cards. */
export function InsightRow({ label, value, accent, strong }: {
  label: React.ReactNode; value: React.ReactNode; accent?: string; strong?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5.5px 0' }}>
      <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: strong ? 15 : 12.5, fontWeight: strong ? 800 : 700, color: accent || WHITE, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}
