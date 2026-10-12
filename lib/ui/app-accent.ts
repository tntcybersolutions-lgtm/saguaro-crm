/**
 * The module accent inside the app — the approved palette's version of
 * lib/module-identity.
 *
 * lib/module-identity.ts mirrors the marketing site byte for byte and keeps the
 * marketing look there. Its uniform accent (a #FFE600 glyph on an #FF8A00 chip)
 * is not in the approved palette, so in-app screens read their accent from here
 * instead: every module wears the concept's icon tile — a light slate glyph
 * (text-secondary #CBD5E1) on the elevated slate ground (#243247) with the
 * border colour (#334155). Yellow stays for primary actions and selection only.
 *
 * Literal hexes, not CSS variables, because callers append alpha suffixes
 * (`accent.hex + '33'`) and pass them to canvas and SVG attributes.
 */
import { moduleAccent as identity, type ModuleAccent } from '@/lib/module-identity';

const ICON = '#CBD5E1';
const TILE = '#243247';
const BORDER = '#334155';

/** Accent for a module key, in the approved palette. Key and name are the module's own. */
export function moduleAccent(key?: string | null): ModuleAccent {
  const { key: k, name } = identity(key);
  return { key: k, name, hex: ICON, soft: TILE, ring: BORDER, vivid: TILE };
}
