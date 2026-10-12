/**
 * Saguaro Control Systems — Centralized Design Tokens
 * Import these instead of hardcoding colors/spacing in every file.
 */

/* ── Colors ────────────────────────────────────────────────────────── */
/* ── THE PALETTE — typed mirror of the `--c-*` variables in app/globals.css.
 * Use `palette.*` (a CSS variable) in style props; use `paletteHex.*` only
 * where a real hex is unavoidable (canvas, SVG export, PDF, charts). */
export const paletteHex = {
  bg: '#101722', card: '#1B2636', raised: '#243247', border: '#334155',
  text: '#F8FAFC', text2: '#CBD5E1', text3: '#94A3B8', text4: '#64748B',
  yellow: '#FFE000', yellowHi: '#FFE94D', yellowHover: '#F2D500', onBrand: '#101722',
  blue: '#38BDF8', orange: '#FBBF24', green: '#4ADE80', red: '#F87171', gray: '#94A3B8',
} as const;
export const palette = {
  bg: 'var(--c-bg)', card: 'var(--c-card)', raised: 'var(--c-raised)', border: 'var(--border-subtle)',
  text: 'var(--c-text)', text2: 'var(--c-text-2)', text3: 'var(--c-text-3)', text4: 'var(--c-text-4)',
  yellow: 'var(--c-yellow)', yellowHi: 'var(--c-yellow-hi)', yellowHover: 'var(--c-yellow-hover)', onBrand: 'var(--c-on-brand)',
  blue: 'var(--c-blue)', orange: 'var(--c-orange)', green: 'var(--c-green)', red: 'var(--c-red)', gray: 'var(--c-gray)',
} as const;
export type PaletteKey = keyof typeof palette;

export const colors = {
  // Brand accent (historically "gold", now yellow #FFE000 — the primary action
  // and the selected item only) — resolves through the --brand-primary CSS variable defined in
  // globals.css, so a tenant's white-label color
  // override reskins every component that uses these tokens. Used only in CSS
  // contexts (style props / template strings), never as SVG fill/stroke attrs.
  gold:       'var(--brand-primary)',
  goldLight:  'var(--brand-primary-strong)',
  goldDim:    'var(--brand-primary-12)',
  goldBorder: 'var(--brand-primary-25)',
  goldHover:  'var(--brand-primary-18)',
  goldActive: 'var(--brand-primary-25)',
  // Text / icons drawn ON a brand-yellow fill.
  onGold:     'var(--on-brand)',

  // NAVY / SLATE (owner-approved reference, 12 Oct 2026). `dark` is the page;
  // the card tokens are the solid slate surfaces. Naming kept (`dark` = page
  // bg, `surface`/`raised` = cards) so consumers re-theme without renames.
  dark:       '#101722', // page background — matches --bg-base
  darkAlt:    '#1B2636', // card / panel — matches --bg-surface
  raised:     '#1B2636', // raised card
  raisedAlt:  '#243247', // raised panel / secondary control — matches --bg-surface-2
  surface:    '#1B2636', // surface / card
  glass:      'var(--bg-surface)',   // card (solid — the name is historical)
  glass2:     'var(--bg-surface-2)', // raised (headers, secondary controls)
  glassBlur:  'none',

  border:     '#334155',
  borderDim:  '#334155',

  // Same values as the --c-text* variables in globals.css.
  text:       '#F8FAFC',
  textMuted:  '#CBD5E1',
  textDim:    '#94A3B8',
  textFaint:  '#64748B',

  // Semantic — the same family as lib/status-colors.ts.
  green:      '#4ADE80',
  red:        '#F87171',
  orange:     '#FBBF24',
  amber:      '#FBBF24',
  blue:       '#38BDF8',

  white:      '#ffffff',
  black:      '#000000',
} as const;

/* ── Brand palette — sampled directly from the Saguaro logo artwork ────
 * Use these for brand moments (hero accents, sunset gradients, PDF
 * letterheads, section dividers, the dark field-app surfaces). The neutral
 * UI chrome stays on `colors` above; `brand` is the desert identity layer. */
export const brand = {
  gold:       '#FFE000', // brand yellow (was the wordmark gold)
  sunset:     '#F2A93B', // bright sun
  ember:      '#E8732B', // sunset orange
  terracotta: '#A8431C', // canyon rock
  canyon:     '#4A1E08', // deep shadow / dark text on warm fills
  cactus:     '#2E8B3D', // saguaro green (positive / accent, sparing)
  night:      '#101722', // navy app surface
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
  glow: 'none', // no glow on the navy/slate theme
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

/* ── Layout contract ───────────────────────────────────────────────────
 * The geometry the app-wide redesign is held to (CLAUDE_MASTER_INSTRUCTIONS
 * §3 geometry, §4 full-width contract, §7 data grid). One source so the shell,
 * page header, toolbar, data table and forms all align. Reconciled from
 * saguaro-visual-tokens.reference.css — values kept, the champagne accent and
 * the Inter font default dropped: the brand stays NEON YELLOW (--brand-primary)
 * and the type stays on the native system stack (`font.family` above). */
export const layout = {
  gutter:        'clamp(16px, 1.67vw, 32px)', // desktop page gutter → 32 on wide
  gutterMobile:  16,
  gap:           24,   // standard block gap between page sections
  gapMobile:     16,
  topbarHeight:  60,
  navWidth:      256,  // expanded rail (current sidebar.width stays 240 until the shell migrates)
  navWidthCollapsed: 72,
  controlHeight:       40, // desktop buttons/inputs
  controlHeightMobile: 44, // touch target
  rowHeight:        44,    // data-table default row
  rowHeightCompact: 36,    // optional dense mode
  formMaxWidth:    760,    // editable field groups stay 640–800px, never full-bleed
  readingMaxWidth: '75ch', // long-form text line length
  detailRailMin:   320,    // metadata/action rail on detail pages
  detailRailMax:   384,
} as const;
