/**
 * Saguaro CRM — Centralized Design Tokens
 * BRIGHT & CLEAN theme — Procore-grade professional.
 * Sidebar stays dark (brand), content area is white/light.
 */

/* ── Colors ────────────────────────────────────────────────────────── */
export const colors = {
  /* Brand gold — stays the same */
  gold:       '#C8960F',
  goldLight:  '#E5B020',
  goldDim:    'rgba(200,150,15,.08)',
  goldBorder: 'rgba(200,150,15,.25)',
  goldHover:  'rgba(200,150,15,.12)',
  goldActive: 'rgba(200,150,15,.18)',

  /* Sidebar (dark) */
  sidebarBg:     '#1a1f2e',
  sidebarBorder: '#2a3244',
  sidebarText:   '#c8cdd8',
  sidebarDim:    '#6b7a94',

  /* Content area (bright) */
  pageBg:     '#F8F9FB',
  white:      '#ffffff',
  surface:    '#ffffff',
  raised:     '#F3F4F6',
  raisedAlt:  '#E5E7EB',

  /* Borders (light) */
  border:     '#E2E5EA',
  borderDim:  '#EEF0F3',

  /* Text (dark on light) */
  text:       '#111827',
  textMuted:  '#6B7280',
  textDim:    '#9CA3AF',
  textFaint:  '#D1D5DB',

  /* Status colors */
  green:      '#16A34A',
  red:        '#DC2626',
  orange:     '#EA580C',
  blue:       '#2563EB',

  /* Legacy compat — map old dark names to new bright equivalents */
  dark:       '#1a1f2e',
  darkAlt:    '#1a1f2e',
  black:      '#000000',
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
  family: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, system-ui, sans-serif',
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

/* ── Shadows (lighter for bright theme) ────────────────────────────── */
export const shadow = {
  sm:   '0 1px 2px rgba(0,0,0,.06)',
  md:   '0 4px 12px rgba(0,0,0,.08)',
  lg:   '0 8px 24px rgba(0,0,0,.1)',
  xl:   '0 16px 40px rgba(0,0,0,.12)',
  glow: '0 0 16px rgba(200,150,15,.2)',
  card: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
} as const;

/* ── Sidebar ───────────────────────────────────────────────────────── */
export const sidebar = {
  width: 240,
  widthCollapsed: 64,
  headerHeight: 56,
  itemHeight: 38,
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
