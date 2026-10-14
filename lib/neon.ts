/**
 * Card accent system — PROFESSIONAL single-accent palette.
 *
 * Owner decision 2026-10-03 (revised the same day): no multi-color rainbow.
 * One brand accent (neon yellow) used with restraint; cards are a clean raised
 * charcoal with a thin accent edge; figures are bold white; status colors
 * (lib/status-colors.ts) stay reserved for real status.
 *
 * The exported names are kept so existing call sites keep working; every
 * "cycle" now resolves to the single brand accent.
 */

const BRAND = '#E8FF2A';

export const NEON = { yellow: BRAND } as const;

/** Single entry on purpose — index-based callers all get the brand accent. */
export const NEON_CYCLE: string[] = [BRAND];

/** Always the brand accent (kept for call-site compatibility). */
export function neonFor(_key?: string | null): string {
  return BRAND;
}

/** Raised card in the premium system (owner concept, 6 Oct 2026): layered
 *  raised→card surface with an inset highlight. No accent top edge — yellow is
 *  for titles, the one primary action and hero numbers, not card borders. The
 *  color argument is kept for call-site compatibility. */
export function neonCard(_color: string = BRAND): {
  background: string; borderTop: string; boxShadow: string;
} {
  return {
    background: 'linear-gradient(180deg, var(--c-raised) 0%, var(--c-card) 100%)',
    borderTop: '1px solid var(--border-subtle)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 40px -24px rgba(0,0,0,0.9)',
  };
}

/** Plain colored text, no glow. Figures should pass white; names pass brand. */
export function neonText(color: string): { color: string; textShadow: string } {
  return { color, textShadow: 'none' };
}

/** Metric values read champagne in the premium system, not white. */
export const FIGURE_COLOR = 'var(--c-text)';
