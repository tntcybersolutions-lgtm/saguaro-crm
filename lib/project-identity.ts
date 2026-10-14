/**
 * Project identity accents — the curated theme template for project titles.
 *
 * One brand accent for every project title (uniform, app-wide). A project's accent is DETERMINISTIC (hashed from
 * its id) so it is stable forever, identical on web and mobile, and never
 * "willy-nilly rainbow": same palette, controlled touchpoints only — project
 * title, monogram chip, accent rules. Body text and backgrounds never change.
 *
 * MIRROR: D:/Saguaro-Field/lib/project-identity.ts must keep the identical
 * palette + hash so both surfaces always agree on a project's color.
 */

export interface ProjectAccent {
  name: string;
  hex: string;        // title / monogram ink
  soft: string;       // 12% tint for chip fills
  ring: string;       // 45% tint for chip rings / underlines
}

const A = (hex: string, name: string): ProjectAccent => ({
  name,
  hex,
  soft: hex + '1F',   // ~12% alpha
  ring: hex + '73',   // ~45% alpha
});

export const PROJECT_ACCENTS: ProjectAccent[] = [
  // One professional accent for every project (owner 2026-10-03: no rainbow).
  // Array kept so the hash/override API stays the same.
  A('#E8FF2A', 'Brand Yellow'),
];

/** Stable hash: same project id -> same accent, on every surface, forever. */
export function accentForProject(projectId?: string | null, overrideIndex?: number | null): ProjectAccent {
  if (overrideIndex != null && overrideIndex >= 0 && overrideIndex < PROJECT_ACCENTS.length) {
    return PROJECT_ACCENTS[overrideIndex];
  }
  if (!projectId) return PROJECT_ACCENTS[0];
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h + projectId.charCodeAt(i) * 31) % 997;
  return PROJECT_ACCENTS[h % PROJECT_ACCENTS.length];
}

/** Two-letter monogram for the project chip (e.g. "Chandler Tech" -> "CT"). */
export function projectMonogram(name?: string | null): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PR';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
