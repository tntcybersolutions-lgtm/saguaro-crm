'use client';

/**
 * components/ui/cinematic.tsx — the premium "cinematic" presentational kit.
 *
 * Jet black page, glass cards, neon-yellow brand accent (docs/COPY-STYLE.md
 * §6–§7): big gradient headline, glass cards with an icon chip + hover lift,
 * tasteful motion, generous spacing. No warm glows or blobs behind text.
 *
 * PURELY PRESENTATIONAL. No data, no logic, no routing — drop these around existing
 * content to lift a flat workspace page to the cinematic bar. Reads the brand and
 * surface tokens from app/globals.css and the status family from
 * lib/status-colors.ts.
 *
 * All animation is disabled under prefers-reduced-motion.
 */
import React from 'react';
import { neonCard, neonFor, neonText } from '@/lib/neon';
import { ScribbleNote } from '@/components/Scribble';

/* ── Palette — jet black + glass + neon yellow (COPY-STYLE §7) ── */
export const CIN = {
  gold: 'var(--brand-primary)',
  goldHi: 'var(--brand-primary-strong)',
  goldSoft: '#FFF7A8',
  amber: '#FFE600',
  green: '#2CFF7A',
  red: '#FF3B30',
  blue: '#FF8A00',
  bg: 'var(--bg-base)',
  text: '#FFFFFF',
  muted: '#D7DEE8',
  faint: '#A9B4C4',
  border: 'rgba(255,255,255,0.09)',
  borderGold: 'var(--brand-primary-25)',
  surface: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03))',
} as const;
const GLASS_BLUR = 'blur(16px) saturate(140%)';

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
.sgLift{transition:transform .2s cubic-bezier(.2,.7,.3,1),box-shadow .2s ease,border-color .2s ease,background .2s ease}
.sgLift:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.22)}
.sgLift:hover .sgIcon{box-shadow:0 0 0 3px var(--brand-primary-12)}
.sgBtn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}
.sgBtn:hover{transform:translateY(-2px);filter:brightness(1.06)}
/* Beat the global h1/h2 !important size caps (globals.css) with higher specificity */
h1.sgHeroTitle{font-size:clamp(28px,4.2vw,46px)!important;font-weight:900!important;line-height:1.04!important;letter-spacing:-0.03em!important;margin:0!important}
h2.sgSectionTitle{font-size:clamp(16px,1.7vw,19px)!important;font-weight:800!important;line-height:1.2!important;letter-spacing:-0.01em!important;margin:0!important}
@media (prefers-reduced-motion: reduce){
  .sgRoot, .sgRoot *{animation:none!important;transition:none!important}
  .sgLift:hover,.sgBtn:hover{transform:none!important}
}
`;

/* ── Aurora — jet black (COPY-STYLE §6). The animated gold blobs, blueprint grid
 * and vignette sat behind text; all that remains is one faint, static, COOL
 * sheen at the top. Name and props kept so callers keep compiling. ─────────── */
export function Aurora({ soft = false }: { soft?: boolean }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 60% at 50% -12%, rgba(170,195,255,${soft ? 0.035 : 0.05}), transparent 60%)` }} />
    </div>
  );
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
        padding: '6px 14px', borderRadius: 999,
        background: 'var(--brand-primary-12)',
        border: '1px solid var(--brand-primary-35)',
        color: CIN.gold, fontSize: 12.5, fontWeight: 700,
        letterSpacing: 'normal',
      }}
    >
      {icon}
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
                  width: 52, height: 52, borderRadius: 15,
                  background: 'linear-gradient(150deg, var(--brand-primary-18), var(--brand-primary-08))',
                  border: '1px solid var(--brand-primary-35)',
                  transition: 'box-shadow .2s',
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
                  <span
                    className="sgShine"
                    style={{
                      background: `linear-gradient(100deg, ${CIN.gold} 8%, ${CIN.goldHi} 42%, ${CIN.goldSoft} 58%, ${CIN.gold} 92%)`,
                      WebkitBackgroundClip: 'text', backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent', color: 'transparent',
                    }}
                  >
                    {accent}
                  </span>
                </>
              )}
            </h1>
          </div>
          {subtitle && (
            <p style={{ animation: 'sgRise .6s ease .1s both', color: CIN.muted, fontSize: 14.5, margin: '12px 0 0', lineHeight: 1.55, maxWidth: 620 }}>
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
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 800,
    letterSpacing: '0.01em', cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap', border: 'none',
    fontFamily: 'inherit', opacity: disabled ? 0.55 : 1,
  };
  const skin: React.CSSProperties =
    variant === 'primary'
      ? { background: `linear-gradient(135deg, ${CIN.gold}, ${CIN.goldHi})`, color: 'var(--on-brand)', boxShadow: '0 10px 30px -12px var(--brand-primary-35)' }
      : { background: 'rgba(255,255,255,0.07)', backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR, color: CIN.text, border: '1px solid rgba(255,255,255,0.14)' };
  const style = { ...base, ...skin };
  if (href && !disabled) {
    return <a href={href} className="sgBtn" style={style}>{icon}{children}</a>;
  }
  return (
    <button onClick={onClick} disabled={disabled} className={disabled ? undefined : 'sgBtn'} style={style}>
      {icon}{children}
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
  /* Neon by default (owner 2026-10-03): a caller's accent wins, otherwise a
     stable neon from the label — no more flat dark tiles. */
  const lit = accentColor || neonFor(label);
  const glow = neonCard(lit);
  const inner = (
    <div
      className="sgLift"
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        animation: `sgRise .5s ease ${delay.toFixed(2)}s both`,
        background: `${glow.background}, ${CIN.surface}`,
        backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
        border: `1px solid ${CIN.border}`,
        borderTop: glow.borderTop,
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: glow.boxShadow,
        cursor: interactive ? 'pointer' : 'default',
        height: '100%',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${lit}, transparent)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {icon && (
          <span
            className="sgIcon"
            style={{
              flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(150deg, var(--brand-primary-18), var(--brand-primary-08))',
              border: '1px solid var(--brand-primary-25)',
              transition: 'box-shadow .2s',
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 750, color: CIN.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: 25, fontWeight: 900, color: valueColor || '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: CIN.faint, marginTop: 6 }}>{sub}</div>}
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
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--title-color, var(--brand-primary))', lineHeight: 1.3, paddingBottom: 6, display: 'inline-block', background: `linear-gradient(90deg, ${neonFor(typeof title === 'string' ? title : '')}, transparent) left bottom / 44px 2px no-repeat` }}>
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
        backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
        border: `1px solid ${CIN.border}`,
        /* 16 and this shadow are the platform's card, shared with premium.tsx.
           Three implementations each picked their own radius and drop, which is
           the main reason two screens side by side did not look like one app. */
        borderRadius: 16,
        boxShadow: '0 24px 48px -32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: `1px solid ${CIN.border}` }}>
          {icon && (
            <span
              style={{
                flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 10,
                background: 'linear-gradient(150deg, var(--brand-primary-18), var(--brand-primary-08))',
                border: '1px solid var(--brand-primary-25)',
              }}
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
    <a href={href} style={{ fontSize: 12, fontWeight: 700, color: CIN.goldHi, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
        textAlign: 'center', padding: '52px 32px',
        background: CIN.surface,
        backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR,
        border: `1px solid ${CIN.border}`,
        borderRadius: 20,
        boxShadow: '0 20px 50px -30px rgba(0,0,0,0.8)',
      }}
    >
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 84, height: 84, borderRadius: '50%', marginBottom: 20,
          background: 'radial-gradient(circle, var(--brand-primary-18), var(--brand-primary-08))',
          border: '1px solid var(--brand-primary-35)',
          animation: 'sgFloat 5s ease-in-out infinite',
        }}
      >
        {icon}
      </div>
      <div style={{ color: CIN.text, fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em' }}>{title}</div>
      {description && <p style={{ color: CIN.muted, fontSize: 13.5, maxWidth: 440, margin: '10px 0 0', lineHeight: 1.6 }}>{description}</p>}
      {actionLabel && (
        <button
          onClick={handle}
          className="sgBtn"
          style={{
            marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg, ${CIN.gold}, ${CIN.goldHi})`, color: 'var(--on-brand)',
            fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
            boxShadow: '0 10px 30px -12px var(--brand-primary-35)',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
