/**
 * Neon accent palette — owner decision 2026-10-03: "neon bright colors", no
 * flat dark boxes, project names in neon, no generic black-and-white type.
 *
 * These are DECORATIVE accents, chosen to sit apart from the status palette
 * (lib/status-colors.ts: red overdue, amber warning, green done), so color on
 * a card never reads as a status it doesn't have.
 */

export const NEON = {
  yellow:  '#FFE600',
  cyan:    '#22E5FF',
  magenta: '#FF4FD8',
  violet:  '#B388FF',
  sky:     '#5AC8FF',
  lime:    '#C6FF3D',
} as const;

export const NEON_CYCLE: string[] = [NEON.yellow, NEON.cyan, NEON.magenta, NEON.violet, NEON.sky, NEON.lime];

/** Stable color for any key (project id, label…): same key → same neon. */
export function neonFor(key: string | null | undefined): string {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return NEON_CYCLE[h % NEON_CYCLE.length];
}

/** Lit-card treatment: neon top edge, tinted glass, soft outer glow. */
export function neonCard(color: string): {
  background: string; borderTop: string; boxShadow: string;
} {
  return {
    background: `linear-gradient(165deg, color-mix(in srgb, ${color} 16%, transparent) 0%, color-mix(in srgb, ${color} 4%, transparent) 55%, rgba(255,255,255,0.03) 100%)`,
    borderTop: `2px solid ${color}`,
    boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 22%, transparent), 0 10px 32px -14px color-mix(in srgb, ${color} 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)`,
  };
}

/** Neon text with a faint glow — for project names and key figures. */
export function neonText(color: string): { color: string; textShadow: string } {
  return { color, textShadow: `0 0 14px color-mix(in srgb, ${color} 45%, transparent)` };
}
