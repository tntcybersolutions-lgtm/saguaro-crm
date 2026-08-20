/**
 * Saguaro CRM — Premium Design Token System
 * Dark-only Bloomberg-grade design language.
 * Every color, shadow, gradient, animation in one file.
 */

/* ── Colors ────────────────────────────────────────────────────────── */
export const colors = {
  /* Brand gold */
  gold:       '#C8960F',
  goldLight:  '#E5B020',
  goldDim:    'rgba(200,150,15,.08)',
  goldBorder: 'rgba(200,150,15,.25)',
  goldHover:  'rgba(200,150,15,.12)',
  goldActive: 'rgba(200,150,15,.18)',

  /* Desert Warmth accent */
  orangeWarm: '#D4781A',
  warmBg:     '#0F1419',
  warmBorder: 'rgba(255,255,255,0.08)',

  /* Sidebar */
  sidebarBg:     '#0d1117',
  sidebarBorder: '#21262d',
  sidebarText:   '#F0F4FF',
  sidebarDim:    '#8B9DB8',

  /* Surfaces (dark) */
  pageBg:     '#0d1117',
  white:      '#ffffff',
  surface:    '#161b22',
  raised:     '#1c2128',
  raisedAlt:  '#21262d',

  /* Borders (dark) */
  border:     '#30363d',
  borderDim:  '#21262d',

  /* Text (light on dark) */
  text:       '#F0F4FF',
  textMuted:  '#8B9DB8',
  textDim:    '#8b949e',
  textFaint:  '#6e7681',

  /* Status */
  green:      '#2ea043',
  red:        '#f85149',
  orange:     '#d29922',
  blue:       '#58a6ff',

  /* Sage AI purple */
  purple:     '#a855f7',
  purpleDim:  'rgba(168,85,247,.08)',
  purpleBorder: 'rgba(168,85,247,.3)',
  purpleGlow: 'rgba(168,85,247,.15)',

  /* Dark palette */
  dark:       '#0d1117',
  darkAlt:    '#161b22',
  black:      '#000000',
  card:       '#161b22',
  cardHover:  '#1c2128',
} as const;

/* ── Gradients ─────────────────────────────────────────────────────── */
export const gradient = {
  goldShimmer:  'linear-gradient(135deg, #C8960F 0%, #E5B020 50%, #C8960F 100%)',
  goldSubtle:   'linear-gradient(135deg, rgba(200,150,15,.08) 0%, rgba(200,150,15,.02) 100%)',
  purpleGlow:   'linear-gradient(135deg, rgba(168,85,247,.12) 0%, rgba(168,85,247,.04) 100%)',
  purpleShimmer:'linear-gradient(135deg, #a855f7 0%, #c084fc 50%, #a855f7 100%)',
  greenSuccess: 'linear-gradient(135deg, rgba(46,160,67,.12) 0%, rgba(46,160,67,.04) 100%)',
  redAlert:     'linear-gradient(135deg, rgba(248,81,73,.12) 0%, rgba(248,81,73,.04) 100%)',
  cardSurface:  'linear-gradient(180deg, #1c2128 0%, #161b22 100%)',
  headerDark:   'linear-gradient(180deg, #161b22 0%, #0d1117 100%)',
  sageThinking: 'conic-gradient(from 0deg, #a855f7, #c084fc, #a855f7)',
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
    '5xl': '36px',
    hero: '42px',
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
  '3xl': 16,
  full: 9999,
} as const;

/* ── Shadows (dark theme) ──────────────────────────────────────────── */
export const shadow = {
  sm:   '0 1px 3px rgba(0,0,0,.3)',
  md:   '0 4px 12px rgba(0,0,0,.4)',
  lg:   '0 8px 24px rgba(0,0,0,.5)',
  xl:   '0 16px 40px rgba(0,0,0,.6)',
  glow: '0 0 16px rgba(200,150,15,.2)',
  card: '0 2px 8px rgba(0,0,0,.3)',
  goldGlow:   '0 0 20px rgba(200,150,15,.25)',
  purpleGlow: '0 0 20px rgba(168,85,247,.25)',
  greenGlow:  '0 0 20px rgba(46,160,67,.25)',
  cardHover:  '0 4px 16px rgba(0,0,0,.5)',
  float:      '0 8px 32px rgba(0,0,0,.6)',
} as const;

/* ── Animations (CSS keyframe names + durations) ───────────────────── */
export const animation = {
  countUp:     'countUp 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
  fadeIn:      'fadeIn 0.3s ease',
  fadeInUp:    'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  slideRight:  'slideRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  pulse:       'pulse 2s ease-in-out infinite',
  shimmer:     'shimmer 1.5s infinite',
  sageGlow:    'sageGlow 3s ease-in-out infinite',
  sageDots:    'sageDots 1.4s ease-in-out infinite',
  cardLift:    'cardLift 0.2s ease',
  progressBar: 'progressBar 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
  spin:        'spin 1s linear infinite',
} as const;

/* ── Keyframes (inject via <style> tag in layout) ──────────────────── */
export const keyframes = `
  @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideRight { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes sageGlow { 0%, 100% { box-shadow: 0 0 12px rgba(168,85,247,.15); } 50% { box-shadow: 0 0 24px rgba(168,85,247,.3); } }
  @keyframes sageDots { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
  @keyframes cardLift { from { transform: translateY(0); } to { transform: translateY(-1px); } }
  @keyframes progressBar { from { width: 0; } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes healthPulse { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
`;

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
