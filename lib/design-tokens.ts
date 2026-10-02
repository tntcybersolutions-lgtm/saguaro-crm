/**
 * Saguaro Control Systems — Centralized Design Tokens
 * Import these instead of hardcoding colors/spacing in every file.
 */

/* ── Colors ────────────────────────────────────────────────────────── */
export const colors = {
  // Brand gold — resolves through the --brand-primary CSS variable (defined in
  // globals.css, default = Saguaro #C8881C) so a tenant's white-label color
  // override reskins every component that uses these tokens. Used only in CSS
  // contexts (style props / template strings), never as SVG fill/stroke attrs.
  gold:       'var(--brand-primary)',
  goldLight:  'var(--brand-primary-strong)',
  goldDim:    'var(--brand-primary-12)',
  goldBorder: 'var(--brand-primary-25)',
  goldHover:  'var(--brand-primary-18)',
  goldActive: 'var(--brand-primary-25)',

  // Sonoran DARK ramp (Rob's direction 2026-07-22) — matches the dark mobile
  // field app: navy page background #0a0a0a with slate cards/panels. Naming kept
  // (`dark` = page bg, `surface`/`raised` = cards) so existing token consumers
  // re-theme without renames.
  dark:       '#0d1117', // page background — matches --bg-base
  darkAlt:    '#151b23', // card / panel — matches --bg-surface
  raised:     '#151b23', // raised card
  raisedAlt:  '#1c232d', // grouped inset / input — matches --bg-surface-2
  surface:    '#151b23', // surface / card

  border:     'rgba(255,255,255,0.12)',
  borderDim:  'rgba(255,255,255,0.06)',

  text:       '#FFFFFF',
  textMuted:  '#CBD5E1',
  textDim:    '#8094B0',
  textFaint:  '#5B677A',

  green:      '#22C55E',
  red:        '#EF4444',
  orange:     '#F59E0B',
  blue:       '#F59E0B',

  white:      '#ffffff',
  black:      '#000000',
} as const;

/* ── Brand palette — sampled directly from the Saguaro logo artwork ────
 * Use these for brand moments (hero accents, sunset gradients, PDF
 * letterheads, section dividers, the dark field-app surfaces). The neutral
 * UI chrome stays on `colors` above; `brand` is the desert identity layer. */
export const brand = {
  gold:       '#E8B84B', // wordmark / primary highlight
  sunset:     '#F2A93B', // bright sun
  ember:      '#E8732B', // sunset orange
  terracotta: '#A8431C', // canyon rock
  canyon:     '#4A1E08', // deep shadow / dark text on warm fills
  cactus:     '#2E8B3D', // saguaro green (positive / accent, sparing)
  night:      '#0a0a0a', // field-app dark surface
  sand:       '#F7F2E8', // warm light surface
} as const;

/* ── Spacing (4px grid) ────────────────────────────────────────────── */
export const space = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

/* ── Typography ────────────────────────────────────────────────────── */
export const font = {
  family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"SF Mono", "Fira Code", "Cascadia Code", monospace',

  size: {
    xs:  '11px',
    sm:  '12px',
    md:  '13px',
    lg:  '14px',
    xl:  '16px',
    '2xl': '18px',
    '3xl': '22px',
    '4xl': '28px',
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 800,
  },
} as const;

/* ── Radius ────────────────────────────────────────────────────────── */
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  '2xl': 12,
  full: 9999,
} as const;

/* ── Shadows ───────────────────────────────────────────────────────── */
export const shadow = {
  sm:   '0 1px 2px rgba(0,0,0,.06)',
  md:   '0 4px 14px rgba(0,0,0,.08)',
  lg:   '0 16px 44px rgba(0,0,0,.10)',
  xl:   '0 24px 60px rgba(0,0,0,.12)',
  glow: `0 0 20px rgba(200,136,28,.15)`,
} as const;

/* ── Sidebar ───────────────────────────────────────────────────────── */
export const sidebar = {
  width: 240,
  widthCollapsed: 64,
  headerHeight: 56,
  itemHeight: 36,
  sectionGap: 24,
} as const;

/* ── Breakpoints ───────────────────────────────────────────────────── */
export const breakpoint = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
  wide: 1536,
} as const;

/* ── Z-Index Scale ─────────────────────────────────────────────────── */
export const z = {
  sidebar: 50,
  topbar: 60,
  dropdown: 100,
  modal: 200,
  overlay: 250,
  toast: 300,
  tooltip: 400,
} as const;
