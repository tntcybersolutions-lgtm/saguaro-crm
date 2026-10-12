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
import { Check } from '@phosphor-icons/react';
import { moduleAccent } from '@/lib/module-identity';
import { STATUS_COLORS } from '@/lib/status-colors';

// Brand hooks (white-label re-themes these via WhiteLabelProvider) ------------
const GOLD = 'var(--brand-primary)';        // #FFE000 — the primary action / selected item
const ON_GOLD = 'var(--on-brand)';             // dark text/icons on a yellow fill
// Brand alpha steps — tokens, so a white-label override re-themes them too.
const A12 = 'var(--brand-primary-12)';
const A30 = 'var(--brand-primary-25)';
const A45 = 'var(--brand-primary-35)';
const BORDER = 'var(--border-subtle)';
const WHITE = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';

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
/* Flat (2026-10-10): nothing lifts on hover and nothing glows. A tappable
   surface answers with a faint wash; a button with a step darker fill. */
.pmHover{transition:background .15s ease,border-color .15s ease}
.pmHover:hover{background-color:rgba(255,255,255,0.03)}
.pmBtn{transition:background .15s ease,filter .15s ease,opacity .15s ease}
.pmBtn:hover{filter:brightness(1.05)}
.pmBtn:active{transform:none;opacity:.85}
/* Buttons: one solid brand fill for the primary, a hairline outline for the
   rest. Class-based so :active and :disabled read the same everywhere. */
.pmGold{background:var(--brand-primary);color:var(--on-brand);border:none;box-shadow:none;transition:background .15s ease,opacity .15s ease}
.pmGold:hover{background:var(--brand-primary-hover)}
.pmGold:active{transform:none;opacity:.85}
.pmGhost{background:var(--bg-surface-2);color:var(--c-text);border:1px solid var(--border-default);box-shadow:none;transition:background .15s ease,border-color .15s ease}
.pmGhost:hover{background:var(--bg-hover);border-color:var(--border-strong)}
.pmGhost:active{transform:none;background:var(--bg-hover)}
.pmDanger{background:none;color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 50%,transparent);box-shadow:none;transition:background .15s ease}
.pmDanger:hover{background:color-mix(in srgb,var(--danger) 10%,transparent)}
.pmDanger:active{transform:none;background:color-mix(in srgb,var(--danger) 16%,transparent)}
.pmGold:disabled,.pmGhost:disabled,.pmDanger:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none;box-shadow:none}
.pmHover:active{transform:none}
.pmTile{transition:background .15s ease}
/* The flat section, header, figure-strip and empty-state rules live in
   app/globals.css (FLAT SHARED PARTS) so they apply on every page, not only
   under a <PremiumSurface>. */
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
h1.pmH1{font-size:22px!important;font-weight:700!important;line-height:1.2!important;letter-spacing:-0.015em!important;margin:0!important}
@media (max-width:767px){h1.pmH1{font-size:20px!important}} /* page-title scale: 22 desktop, 20 phone (flat header) */
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
// Flat (2026-10-10): the page is one solid ground. The faint sheen that was
// left of the old aurora is gone too; the name and props stay so every caller
// keeps compiling.
export function Aurora(_props: { soft?: boolean }) {
  return null;
}

// ─── PremiumSurface ──────────────────────────────────────────────────────────
// The page wrapper: the shared FX stylesheet, a max width, and the page
// padding — the caller's on desktop, a 16px gutter on a phone (.pmPage).
export function PremiumSurface({
  children,
  maxWidth = 2200,
  pad = '20px 24px 48px',
}: {
  children: React.ReactNode;
  maxWidth?: number;
  /** Kept for callers; the surface is flat either way. */
  soft?: boolean;
  pad?: string;
}) {
  return (
    <div className="pmRoot" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 56px)' }}>
      <PremiumFX />
      <div className="pmPage" style={{ position: 'relative', maxWidth, margin: '0 auto', ['--pm-pad' as string]: pad }}>
        {children}
      </div>
    </div>
  );
}

// ─── ModuleHero ──────────────────────────────────────────────────────────────
/**
 * The page header — compact (flat UI, 2026-10-10): a 20–22px title, one line
 * under it, the actions on the right. No eyebrow pill, no gradient accent
 * word, no module bar, no margin scribble. On a phone the actions are one
 * row under the title that scrolls sideways inside itself.
 *
 * Every prop is still accepted so no caller breaks: `accent` reads as the
 * rest of the title in the same colour; `eyebrow`, `eyebrowIcon`,
 * `accentColor` and `note` are decoration the flat header leaves out; `aux`
 * (a live control or badge) stays, under the subtitle.
 */
export function ModuleHero({
  aux,
  title,
  accent,
  subtitle,
  actions,
  align = 'left',
  style,
}: {
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  aux?: React.ReactNode;
  title: React.ReactNode;
  accent?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Handwritten margin note — not drawn in the flat header. */
  note?: string;
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /** Module accent — not drawn in the flat header. */
  accentColor?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="pmHead" data-align={align === 'center' ? 'center' : undefined} style={style}>
      <div className="pmHeadText">
        <h1 className="pmH1">
          {title}
          {accent != null && accent !== '' && <>{' '}{accent}</>}
        </h1>
        {subtitle && <p className="pmHeadSub" title={typeof subtitle === 'string' ? subtitle : undefined}>{subtitle}</p>}
        {aux && <div className="pmHeadAux">{aux}</div>}
      </div>
      {actions && <div className="pmHeadActs">{actions}</div>}
    </div>
  );
}

// ─── IconChip ────────────────────────────────────────────────────────────────
// A slate tile with a hairline border. With `vivid` (a module-identity hue) it
// takes a low tint of that hue and a matching ring — flat, no gradient, no
// glow — for a white (#F8FAFC) glyph.
export function IconChip({ children, size = 40, vivid }: { children: React.ReactNode; size?: number; vivid?: string }) {
  return (
    <span
      className="pmChip"
      style={{
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        background: vivid ? `color-mix(in srgb, ${vivid} 22%, var(--bg-surface-2))` : 'var(--bg-surface-2)',
        border: `1px solid ${vivid ? `color-mix(in srgb, ${vivid} 50%, transparent)` : 'var(--border-default)'}`,
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
/**
 * One figure — flat (2026-10-10): value 17px bold over an 11px label, a
 * hairline on its left, no tile, no icon chip, no glow, no big padding. Laid
 * out several to a row by the caller's own grid, they read as the number
 * strip on Home.
 *
 * Kept: `href` / `onClick` (it opens or filters something — a › says so),
 * `active` (the filter it applies is on — a brand underline and ✓), `tone`
 * and `accent` (the value's colour: red, amber, green or a status hue).
 * `icon` and `delay` are accepted and not drawn.
 */
export function StatCard({
  label,
  value,
  sub,
  accent,
  onClick,
  href,
  interactive: forceInteractive,
  active = false,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  /** Colours the value: 'bad' for a count that must be zero, 'warn', 'good'. */
  tone?: 'bad' | 'warn' | 'good';
  onClick?: () => void;
  href?: string;
  interactive?: boolean;
  /** Selected state — e.g. a figure acting as the active filter on a list. */
  active?: boolean;
  delay?: number;
}) {
  const interactive = !!(onClick || href || forceInteractive);
  const toneColor = tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warning)' : tone === 'good' ? 'var(--success)' : null;
  const valueColor = toneColor || accent || undefined;
  const body = (
    <span className="pmFigIn">
      <span className="pmFigV" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      <span className="pmFigText">
        <span className="pmFigL">
          <span>{label}</span>
          {interactive && <span className="pmFigGo" aria-hidden>{active ? '✓' : '›'}</span>}
        </span>
        {sub != null && <span className="pmFigS">{sub}</span>}
      </span>
    </span>
  );
  if (href) {
    // A plain <a> keeps the kit routing-agnostic; callers wrap with <Link> if they need to.
    return <a className="pmFig pmFigSolo" href={href} onClick={onClick} aria-current={active ? 'true' : undefined}>{body}</a>;
  }
  if (onClick) {
    // A figure that runs code (a filter, a tab switch) is a button to keyboards and screen readers.
    return <button type="button" className="pmFig pmFigSolo" onClick={onClick} aria-pressed={active}>{body}</button>;
  }
  return <div className="pmFig pmFigSolo">{body}</div>;
}

// ─── SectionCard ─────────────────────────────────────────────────────────────
/**
 * A section of a page — flat by default (2026-10-10): the content sits on the
 * page under a small caps label and a hairline. No tray, no gradient, no
 * glow, no radius, no shadow, no hover lift. The body keeps the page's own
 * inset (16px on a phone, set by the page), so nothing is double-padded.
 *
 * `tray` is the opt-in for the rare thing that must stay raised — a dialog
 * body, a picker: a solid surface with a hairline border, still no glow.
 *
 * Every existing prop still works: `flat` is now the default and a no-op,
 * `flush` drops the tray's body padding, `accent` is accepted and not drawn,
 * `icon` sits small beside the label on a tray only.
 */
export function SectionCard({
  title,
  subtitle,
  icon,
  action,
  children,
  flush = false,
  tray = false,
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
  /** Kept for callers — flat is the default now. */
  flat?: boolean;
  /** The rare raised surface (dialogs, pickers): solid fill + hairline border. */
  tray?: boolean;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  const hasHead = !!(title || subtitle || action);
  return (
    <div className={tray ? 'pmSec pmSecTray' : 'pmSec'} style={style}>
      {hasHead && (
        <div className="pmSecHead">
          {tray && icon && <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--sg-text-3)' }}>{icon}</span>}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <div className="pmSecTitle" role="heading" aria-level={2}>{title}</div>}
            {subtitle && <div className="pmSecSub">{subtitle}</div>}
          </div>
          {action && <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: tray && !flush ? 14 : 0, minWidth: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

// ─── PremiumEmpty ────────────────────────────────────────────────────────────
/**
 * Nothing here yet — flat (2026-10-10): one plain line and one action. No
 * medallion, no halo, no ring. The title leads the line in the body colour
 * (red for an error); the description finishes it.
 */
export function PremiumEmpty({
  title,
  description,
  action,
  tone = 'default',
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: 'default' | 'error';
  compact?: boolean;
}) {
  const t = title.trim();
  const joiner = /[.!?…]$/.test(t) ? ' ' : '. ';
  return (
    <div className="pmEmpty" data-tone={tone === 'error' ? 'error' : undefined} role={tone === 'error' ? 'alert' : undefined} style={compact ? { padding: '8px 0' } : undefined}>
      <p className="pmEmptyLine"><b>{t}</b>{description ? <>{joiner}{description}</> : null}</p>
      {action && <div className="pmEmptyActs">{action}</div>}
    </div>
  );
}

// ─── PremiumButton (link-agnostic) ───────────────────────────────────────────
// The brand primary CTA. Renders as a <button> unless the caller wraps it.
// Flat (2026-10-10): one solid fill — no gradient, no glow.
export const goldButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: GOLD, color: ON_GOLD,
  fontWeight: 700, fontSize: 13.5, letterSpacing: '0.01em', textDecoration: 'none',
  boxShadow: 'none',
};

export const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
  /* The quietest tier: a hairline outline on the page, no fill, no blur. */
  background: 'none',
  color: 'var(--sg-text)',
  border: '1px solid var(--sg-border-strong)',
  boxShadow: 'none',
  fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
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
 * Flat (2026-10-10): a hairline outline in the brand colour, no fill.
 */
export const goldOutlineButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
  background: 'none',
  color: GOLD,
  border: `1px solid ${A30}`,
  boxShadow: 'none',
  fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
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
    neutral: { bg: STATUS_COLORS.closed.bg, fg: 'var(--text-secondary)', bd: STATUS_COLORS.closed.border },
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
      borderRadius: 999, background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.4)',
      color: 'var(--link)', fontSize: 11, fontWeight: 700, letterSpacing: 'normal',
      verticalAlign: 'middle', lineHeight: 1.6,
    }}>{label}</span>
  );
}

/** A row of figures — flat (2026-10-10): the number strip from Home. Value
 *  17px bold over an 11px label, hairlines between, no tiles, no icon chips,
 *  no glow. Wraps to two or three across on a phone. A figure that opens
 *  something carries a ›; one acting as the list's current filter is
 *  underlined in the brand colour with a ✓ (its `sub` says how to clear it). */
export function StatStrip({ items }: {
  items: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string; icon?: React.ReactNode; href?: string; onClick?: () => void; active?: boolean }[];
}) {
  return (
    <div className="pmStrip">
      <div className="pmStripGrid">
        {items.map((it, i) => {
          const clickable = !!(it.href || it.onClick);
          const body = (
            <>
              <span className="pmFigV" style={it.accent ? { color: it.accent } : undefined}>{it.value}</span>
              <span className="pmFigL">
                <span>{it.label}</span>
                {clickable && <span className="pmFigGo" aria-hidden>{it.active ? '✓' : '›'}</span>}
              </span>
              {it.sub && <span className="pmFigS">{it.sub}</span>}
            </>
          );
          if (it.href) {
            return <a key={i} href={it.href} className="pmFig pmStripLink" aria-current={it.active ? 'true' : undefined}>{body}</a>;
          }
          if (it.onClick) {
            // A figure that runs code (a filter) is a real button to keyboards and screen readers.
            return <button key={i} type="button" className="pmFig" onClick={it.onClick} aria-pressed={it.active != null ? it.active : undefined}>{body}</button>;
          }
          return <div key={i} className="pmFig">{body}</div>;
        })}
      </div>
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
        <div style={{ position: 'absolute', left: 10, top: 8, bottom: 14, width: 1, background: 'var(--border-default)' }} />
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i === steps.length - 1 ? 0 : 16, position: 'relative' }}>
            <div style={{
              width: 21, height: 21, borderRadius: 999, flexShrink: 0, zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? 'var(--success)' : 'var(--bg-surface-2)',
              border: s.done ? 'none' : '1px solid var(--border-default)',
              color: s.done ? ON_GOLD : 'var(--text-secondary)', fontSize: 10, fontWeight: 800,
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
    // .pmFlowStrip (globals.css): on a phone the steps stack as a numbered list —
    // wrapped, the arrows used to land on lines of their own.
    <div className="pmFlowStrip" style={{
      // Flat (2026-10-10): a hairline above and below, no tinted band.
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px',
      padding: '10px 0',
      borderTop: '1px solid var(--sg-border)', borderBottom: '1px solid var(--sg-border)',
      ...style,
    }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden className="pmFlowArrow" style={{ color: FAINT, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>&rarr;</span>}
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
