/**
 * Job colours — one muted desert tone per project so jobs listed next to each
 * other can be told apart at a glance. Professional, not a rainbow: eight
 * swatches close in lightness, none of them the brand yellow or a status colour.
 *
 * This is the ONLY file that knows the hex values. Every screen calls
 * projectColor(); nothing else carries a job colour literal.
 *
 * Where the colour goes (and nowhere else):
 *   1. the "Choose a Job" picker — an 8px dot before the name
 *   2. the project header — a 36px initials tile (18% fill, full-colour border + initials)
 *   3. multi-job lists and tables — a 3px left edge on the row or card
 *   4. schedule / Gantt / calendar bars — 25% fill with a full-colour 3px left edge
 *   5. the sidebar inside a job — a small dot next to the job name
 * Never as a page or card background, as text, on a button, or to mean status.
 *
 * Storage: projects.color (text, one of the eight hexes). New projects take
 * the next swatch in order per tenant (nextJobColor); existing rows were
 * backfilled the same way. A project with no stored colour falls back to a
 * stable hash of its id, so it never flickers between renders.
 */

import type { CSSProperties } from 'react';

export interface JobColor { key: string; name: string; hex: string }

export const JOB_COLORS: readonly JobColor[] = [
  { key: 'copper',    name: 'Copper',    hex: '#D98B4E' },
  { key: 'sandstone', name: 'Sandstone', hex: '#D9B98C' },
  { key: 'sage',      name: 'Sage',      hex: '#9DBF8F' },
  { key: 'agave',     name: 'Agave',     hex: '#5FB8A5' },
  { key: 'mesa-rose', name: 'Mesa Rose', hex: '#D98C9C' },
  { key: 'plum',      name: 'Plum',      hex: '#B48CC8' },
  { key: 'clay',      name: 'Clay',      hex: '#C07A5E' },
  { key: 'ironwood',  name: 'Ironwood',  hex: '#A3A08C' },
] as const;

const HEXES = new Set(JOB_COLORS.map((c) => c.hex.toUpperCase()));

export function isJobColor(hex: unknown): hex is string {
  return typeof hex === 'string' && HEXES.has(hex.toUpperCase());
}

/** Stable hash → swatch index, for a project that has no stored colour yet. */
function hashIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 31) % 997;
  return h % JOB_COLORS.length;
}

type ProjectLike = { id?: string | null; color?: string | null } | string | null | undefined;

/** The job's colour: its stored swatch, else a stable hash of its id. */
export function projectColor(p: ProjectLike): string {
  if (!p) return JOB_COLORS[0].hex;
  if (typeof p === 'string') return JOB_COLORS[hashIndex(p)].hex;
  if (isJobColor(p.color)) return p.color.toUpperCase();
  return p.id ? JOB_COLORS[hashIndex(p.id)].hex : JOB_COLORS[0].hex;
}

export function jobColorName(hex: string): string {
  return JOB_COLORS.find((c) => c.hex.toUpperCase() === hex.toUpperCase())?.name ?? 'Job colour';
}

/** Round-robin for a new project: the tenant's Nth project (0-based) takes swatch N mod 8. */
export function nextJobColor(existingCount: number): string {
  return JOB_COLORS[Math.max(0, existingCount) % JOB_COLORS.length].hex;
}

/* ── the five treatments, as styles ────────────────────────────────────── */

const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/** 1 + 5. The 8px dot that sits before a job name. */
export const jobDotStyle = (hex: string): CSSProperties => ({
  display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: hex, flexShrink: 0,
  boxShadow: `0 0 0 1px ${alpha(hex, 0.35)}`,
});

/** 2. The 36px initials tile in the project header. */
export const jobTileStyle = (hex: string): CSSProperties => ({
  display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, flexShrink: 0,
  background: alpha(hex, 0.18), border: `1px solid ${hex}`, color: hex,
  fontSize: 12.5, fontWeight: 900, letterSpacing: '.02em',
});

/** 3. The 3px left edge on a row or card. Background stays the card colour. */
export const jobStripeStyle = (hex: string): CSSProperties => ({
  boxShadow: `inset 3px 0 0 ${hex}`,
});

/** 4. A schedule / Gantt / calendar bar: 25% fill, full-colour left edge. */
export const jobBarStyle = (hex: string): CSSProperties => ({
  background: alpha(hex, 0.25), borderLeft: `3px solid ${hex}`,
});

/** CSS custom property for tables that stripe via the kit (.k-table tr[style*=--row-stripe]). */
export const jobRowVar = (hex: string): CSSProperties => ({ ['--row-stripe' as string]: hex } as CSSProperties);
