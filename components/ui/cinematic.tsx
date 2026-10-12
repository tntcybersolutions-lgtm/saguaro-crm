'use client';

/**
 * components/ui/cinematic.tsx — the premium "cinematic" presentational kit.
 *
 * Navy page, slate cards (12px), yellow only on the primary action and the
 * selected item: a clear headline, slate cards with a quiet icon chip, gentle
 * motion, generous spacing. No glows, gradients or blobs behind text.
 *
 * PURELY PRESENTATIONAL. No data, no logic, no routing — drop these around existing
 * content to lift a flat workspace page to the cinematic bar. Reads the brand and
 * surface tokens from app/globals.css and the status family from
 * lib/status-colors.ts.
 *
 * All animation is disabled under prefers-reduced-motion.
 */
import React from 'react';
import { ScribbleNote } from '@/components/Scribble';

/* ── Palette — jet black + glass + neon yellow (COPY-STYLE §7) ── */
export const CIN = {
  gold: 'var(--brand-primary)',
  goldHi: 'var(--brand-primary-strong)',
  goldSoft: '#FFF7A8',
  amber: 'var(--brand-primary)',
  green: 'var(--success)',
  red: 'var(--danger)',
  blue: 'var(--warning)',
  bg: 'var(--bg-base)',
  text: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
  faint: 'var(--text-tertiary)',
  border: 'var(--border-default)',
  borderGold: 'var(--border-default)',
  surface: 'var(--bg-surface)',
} as const;

/* ── Cinematic FX — keyframes + interaction classes, injected once per page ── */
const FX = `
@keyframes sgRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes sgPop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes sgFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes sgAur1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(7%,5%) scale(1.14)}}
@keyframes sgAur2{0%,100%{transform:translate(0,0) scale(1.06)}50%{transform:translate(-8%,6%) scale(1)}}
@keyframes sgAur3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(5%,-7%) scale(1.16)}}
@keyframes sgGridPan{from{background-position:0 0}to{background-position:34px 34px}}
@keyframes sgShimmer{from{background-position:180% 0}to{background-position:-180% 0}}
.sgShine{background-size:200% 100%;animation:sgShimmer 3.6s linear infinite}
.sgLift{transition:border-color .15s ease,background-color .15s ease}
a .sgLift:hover,.sgLift[data-interactive]:hover{border-color:var(--border-strong)!important;background:var(--bg-row-hover)!important}
/* Icon chips are quiet slate; the colour a page passes to the icon is overridden
   so yellow stays on the actions and the selected item. */
.sgIcon svg{fill:var(--text-secondary)}
.sgBtn{transition:filter .15s ease,background-color .15s ease}
.sgBtn:hover{filter:brightness(1.06)}
.sgBtn:focus-visible{outline:2px solid var(--brand-primary);outline-offset:2px}
/* Beat the global h1/h2 !important size caps (globals.css) with higher specificity */
h1.sgHeroTitle{font-size:clamp(28px,4.2vw,46px)!important;font-weight:900!important;line-height:1.04!important;letter-spacing:-0.03em!important;margin:0!important}
h2.sgSectionTitle{font-size:clamp(16px,1.7vw,19px)!important;font-weight:800!important;line-height:1.2!important;letter-spacing:-0.01em!important;margin:0!important}
@media (prefers-reduced-motion: reduce){
  .sgRoot, .sgRoot *{animation:none!important;transition:none!important}
  .sgLift:hover,.sgBtn:hover{transform:none!important}
}
`;

/* ── Aurora — kept so callers keep compiling. The page is plain navy now: no
 * sheen, blobs or grid behind text. ─────────────────────────────────────────── */
export function Aurora({ soft = false }: { soft?: boolean }) {
  return <div aria-hidden data-soft={soft || undefined} style={{ display: 'none' }} />;
}

/* ── CinematicPage — relative container with the aurora backdrop + FX keyframes,
 * plus a centered, comfortably-padded content column on top. ─────────────────── */
export function CinematicPage({
  children,
  maxWidth = 1200,
  soft = false,
  minHeight = 'calc(100vh - 56px)',
}: {
  children: React.ReactNode;
  maxWidth?: number;
  soft?: boolean;
  minHeight?: string;
}) {
  return (
    <div className="sgRoot" style={{ position: 'relative', overflow: 'hidden', minHeight, background: CIN.bg, color: CIN.text }}>
      <style>{FX}</style>
      <Aurora soft={soft} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth, margin: '0 auto', padding: '30px 24px 72px' }}>
        {children}
      </div>
    </div>
  );
}

/* ── HeroBadge — the little Title Case pill above a hero headline ────────────── */
export function HeroBadge({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      style={{
        animation: 'sgRise .5s ease both',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 12px', borderRadius: 999,
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
        letterSpacing: 'normal',
      }}
    >
      {icon && <span className="sgIcon" style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </span>
  );
}

/* ── ModuleHero — cinematic page header: eyebrow pill, big gradient headline,
 * subtitle, and an actions slot on the right. ────────────────────────────────── */
export function ModuleHero({
  eyebrow,
  eyebrowIcon,
  icon,
  title,
  accent,
  subtitle,
  note,
  actions,
  children,
}: {
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  accent?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Handwritten margin note. Plain text, one short line. */
  note?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          {eyebrow && <div style={{ marginBottom: 14 }}><HeroBadge icon={eyebrowIcon}>{eyebrow}</HeroBadge></div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, animation: 'sgRise .55s ease .05s both' }}>
            {icon && (
              <span
                className="sgIcon"
                style={{
                  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 48, height: 48, borderRadius: 12,
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {icon}
              </span>
            )}
            <h1 className="sgHeroTitle" style={{ color: CIN.text }}>
              {title}
              {accent && (
                <>
                  {' '}
                  <span style={{ color: CIN.text }}>{accent}</span>
                </>
              )}
            </h1>
          </div>
          {subtitle && (
            <p style={{ animation: 'sgRise .6s ease .1s both', color: CIN.muted, fontSize: 15, margin: '10px 0 0', lineHeight: 1.55, maxWidth: 620 }}>
              {subtitle}
            </p>
          )}
          {/* Same margin note as the premium hero — the bit the official
              subtitle leaves out, in a super's handwriting. */}
          {note && (
            <div style={{ margin: '9px 0 0' }}>
              <ScribbleNote size={15} rotate={-3}>{note}</ScribbleNote>
            </div>
          )}
        </div>
        {actions && (
          <div style={{ animation: 'sgRise .6s ease .12s both', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── HeroButton — matched premium buttons for the hero actions slot ──────────── */
export function HeroButton({
  children,
  onClick,
  href,
  variant = 'primary',
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44, padding: '0 18px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap', border: '1px solid transparent',
    fontFamily: 'inherit',
  };
  // Disabled is slate with dim text, never a faded yellow (which reads as olive).
  const skin: React.CSSProperties = disabled
    ? { background: 'var(--bg-surface-2)', color: 'var(--text-tertiary)', borderColor: 'var(--border-default)' }
    : variant === 'primary'
      ? { background: 'var(--brand-primary)', color: 'var(--on-brand)' }
      : { background: 'var(--bg-surface-2)', color: CIN.text, borderColor: 'var(--border-default)' };
  const style = { ...base, ...skin };
  if (href && !disabled) {
    return <a href={href} className="sgBtn" style={style}>{icon}{children}</a>;
  }
  return (
    <button onClick={onClick} disabled={disabled} className={disabled ? 'sgBtnOff' : 'sgBtn'} style={style}>
      <span style={{ display: 'inline-flex', opacity: disabled ? 0.6 : 1 }}>{icon}</span>{children}
    </button>
  );
}

/* ── StatCard — glass metric tile: icon chip, Title Case label, big value,
 * subline, a brand left-edge accent bar and a hover lift. ──────────────────── */
export function StatCard({
  icon,
  label,
  value,
  sub,
  valueColor,
  accentColor,
  delay = 0,
  href,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueColor?: string;
  accentColor?: string;
  delay?: number;
  href?: string;
  onClick?: () => void;
}) {
  const interactive = !!(href || onClick);
  // A slate tile. The value carries the status colour the caller passes; the
  // accent no longer paints a glow or an edge bar (accentColor kept for callers).
  void accentColor;
  const inner = (
    <div
      className="sgLift"
      data-interactive={interactive || undefined}
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        animation: `sgRise .5s ease ${delay.toFixed(2)}s both`,
        background: CIN.surface,
        border: `1px solid ${CIN.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: interactive ? 'pointer' : 'default',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {icon && (
          <span
            className="sgIcon"
            style={{
              flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-default)',
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: CIN.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: valueColor || 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: CIN.faint, marginTop: 6 }}>{sub}</div>}
    </div>
  );
  if (href) {
    return <a href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{inner}</a>;
  }
  return inner;
}

/* ── SectionCard — premium content panel: gradient surface, rounded corners,
 * subtle border + inner glow, an icon-chip header and an action slot. ────────── */
export function SectionCard({
  title,
  subtitle,
  icon,
  action,
  children,
  noPad = false,
  flat = false,
  delay = 0,
  style,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
  /**
   * Content on the page rather than an object on a tray.
   *
   * Nine of these stacked on the project overview, each with its own surface,
   * border, 18px radius and drop shadow. When everything is raised nothing is:
   * elevation stops meaning "this is a thing you act on" and becomes wallpaper,
   * and the eye has no way to rank what it is looking at.
   *
   * flat keeps the header — the small label is still how you find your way down
   * a long page — and drops the tray: no fill, no border, no shadow, a hairline
   * rule instead. The raised form is reserved for what you would point at and
   * name: something you act on, or a distinct object like a table or a form.
   */
  flat?: boolean;
  delay?: number;
  style?: React.CSSProperties;
}) {
  if (flat) {
    return (
      <div style={{ position: 'relative', animation: `sgRise .5s ease ${delay.toFixed(2)}s both`, ...style }}>
        {(title || action) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 9, marginBottom: 14, borderBottom: `1px solid ${CIN.border}` }}>
            {icon && <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.85 }}>{icon}</span>}
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && (
                /* Neon section title (owner 2026-10-03): bright, with a lit
                   underline in a stable neon per title — not grey-on-black. */
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.3, display: 'inline-block' }}>
                  {title}
                </div>
              )}
              {subtitle && <div style={{ fontSize: 12, color: CIN.faint, marginTop: 3 }}>{subtitle}</div>}
            </div>
            {action && <div style={{ flexShrink: 0 }}>{action}</div>}
          </div>
        )}
        <div>{children}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        animation: `sgRise .5s ease ${delay.toFixed(2)}s both`,
        background: CIN.surface,
        border: `1px solid ${CIN.border}`,
        /* 12, slate, no drop shadow: the platform's card, shared with kit.tsx
           (.k-card) and premium.tsx, so two screens side by side look like one app. */
        borderRadius: 12,
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: `1px solid ${CIN.border}` }}>
          {icon && (
            <span
              style={{
                flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-default)',
              }}
              className="sgIcon"
            >
              {icon}
            </span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <h2 className="sgSectionTitle" style={{ color: CIN.text }}>{title}</h2>}
            {subtitle && <div style={{ fontSize: 12, color: CIN.faint, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      <div style={noPad ? undefined : { padding: 20 }}>{children}</div>
    </div>
  );
}

/* ── SectionLink — the small brand "View All →" link used in section headers ─── */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ fontSize: 14, fontWeight: 600, color: 'var(--link)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44 }}>
      {children}
    </a>
  );
}

/* ── EmptyStatePremium — cinematic empty/error state: brand icon halo on a
 * glass surface. Drop-in compatible with the shared EmptyState API. ───────── */
export function EmptyStatePremium({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}) {
  const handle = () => {
    if (onAction) onAction();
    else if (actionHref) window.location.href = actionHref;
  };
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        animation: 'sgPop .5s ease both',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '44px 24px',
        background: CIN.surface,
        border: `1px solid ${CIN.border}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 64, height: 64, borderRadius: '50%', marginBottom: 16,
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-default)',
        }}
        className="sgIcon"
      >
        {icon}
      </div>
      <div style={{ color: CIN.text, fontWeight: 800, fontSize: 18 }}>{title}</div>
      {description && <p style={{ color: CIN.muted, fontSize: 14, maxWidth: 440, margin: '8px 0 0', lineHeight: 1.6 }}>{description}</p>}
      {actionLabel && (
        <button
          onClick={handle}
          className="sgBtn"
          style={{
            marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8,
            minHeight: 44, padding: '0 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--brand-primary)', color: 'var(--on-brand)',
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
