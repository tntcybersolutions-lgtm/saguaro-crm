/**
 * Saguaro Field — Centralized Design Tokens (Dark Theme)
 *
 * SINGLE SOURCE OF TRUTH for every field page and field component.
 * Import as: import { F } from '@/lib/field-tokens';
 *
 * Rules:
 *  1. NEVER declare color constants locally in a field page.
 *  2. Always reference F.gold, F.raised, F.border, etc.
 *  3. If you need a new token, add it here — not inline.
 */

export const F = {
  /* ── Brand ──────────────────────────────────────────────────── */
  gold:       '#C8960F',
  goldLight:  '#F59E0B',
  goldDim:    'rgba(200,150,15,.08)',
  goldBorder: 'rgba(212,160,23,.35)',
  goldGlow:   'rgba(212,160,23,.25)',

  /* ── Surfaces ───────────────────────────────────────────────── */
  dark:       '#0d1117',       // page background
  raised:     '#0D1D2E',       // cards, panels, modals
  raisedAlt:  '#161B22',       // header, nav chrome (one step up from dark)
  surface:    '#0F2336',       // input backgrounds, hover states

  /* ── Borders ────────────────────────────────────────────────── */
  border:     '#1E3A5F',       // primary border (dark navy)
  borderDim:  'rgba(30,58,95,.5)',  // subtle separators
  borderLight:'rgba(255,255,255,.08)', // very subtle dividers

  /* ── Text ───────────────────────────────────────────────────── */
  text:       '#F0F4FF',       // primary text (near-white)
  dim:        '#8BAAC8',       // secondary text (muted blue)
  dimAlt:     '#8B9DB8',       // tertiary text (warmer muted)
  faint:      '#4A6A8A',       // placeholder text, disabled

  /* ── Status Colors ──────────────────────────────────────────── */
  green:      '#22C55E',
  red:        '#EF4444',
  blue:       '#3B82F6',
  amber:      '#F59E0B',
  purple:     '#8B5CF6',
  orange:     '#F97316',
  cyan:       '#06B6D4',

  /* ── Semantic Status Backgrounds ────────────────────────────── */
  greenBg:    'rgba(34,197,94,.12)',
  redBg:      'rgba(239,68,68,.12)',
  blueBg:     'rgba(59,130,246,.12)',
  amberBg:    'rgba(245,158,11,.12)',
  purpleBg:   'rgba(139,92,246,.12)',

  /* ── Glass / Overlay ─────────────────────────────────────────── */
  card:       'rgba(13,29,46,.85)',     // glass card overlay
  cardSolid:  '#0D1D2E',               // opaque card

  /* ── Shadows ────────────────────────────────────────────────── */
  shadow:     '0 2px 12px rgba(0,0,0,.25)',
  shadowLg:   '0 8px 32px rgba(0,0,0,.45)',
  shadowCard: '0 2px 8px rgba(0,0,0,.3)',

  /* ── Radii ──────────────────────────────────────────────────── */
  radius:     14,
  radiusSm:   8,
  radiusLg:   20,
  radiusFull: 9999,

  /* ── Touch Targets (Apple HIG: 44px minimum) ────────────────── */
  touchMin:   44,

  /* ── Font Sizes (iOS 16px minimum to prevent auto-zoom) ────── */
  fontXs:     11,
  fontSm:     12,
  fontMd:     13,
  fontLg:     14,
  fontXl:     16,
  font2xl:    18,
  font3xl:    22,
  font4xl:    28,
} as const;

/** Status → color mapping for badges, dots, and indicators */
export const STATUS_COLOR: Record<string, string> = {
  open:              F.red,
  in_progress:       F.amber,
  ready_to_inspect:  F.blue,
  complete:          F.green,
  closed:            F.green,
  draft:             F.dim,
  pending:           F.amber,
  sent:              F.blue,
  paid:              F.green,
  overdue:           F.red,
  not_started:       F.dim,
  delayed:           F.red,
  on_hold:           F.amber,
  approved:          F.green,
  rejected:          F.red,
  critical:          F.red,
  high:              F.amber,
  medium:            F.blue,
  low:               F.dim,
  active:            F.green,
  inactive:          F.dim,
  good:              F.green,
  caution:           F.amber,
  stop:              F.red,
};

/** Priority → color mapping */
export const PRIORITY_COLOR: Record<string, string> = {
  Critical: F.red,
  High:     F.amber,
  Medium:   F.blue,
  Low:      F.dim,
};

export type FieldToken = typeof F;
