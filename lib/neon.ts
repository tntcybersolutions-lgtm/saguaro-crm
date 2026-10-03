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

const BRAND = '#FFE600';

export const NEON = { yellow: BRAND } as const;

/** Single entry on purpose — index-based callers all get the brand accent. */
export const NEON_CYCLE: string[] = [BRAND];

/** Always the brand accent (kept for call-site compatibility). */
export function neonFor(_key?: string | null): string {
  return BRAND;
}

/** Raised professional card: subtle lift, thin accent top edge, no glow. */
export function neonCard(color: string = BRAND): {
  background: string; borderTop: string; boxShadow: string;
} {
  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.03) 100%)',
    borderTop: `2px solid color-mix(in srgb, ${color} 80%, transparent)`,
    boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 28px -18px rgba(0,0,0,0.9)',
  };
}

/** Plain colored text, no glow. Figures should pass white; names pass brand. */
export function neonText(color: string): { color: string; textShadow: string } {
  return { color, textShadow: 'none' };
}

/** Bold white for metric values. */
export const FIGURE_COLOR = '#FFFFFF';
