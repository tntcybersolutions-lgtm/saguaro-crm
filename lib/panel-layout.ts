/**
 * A page's panels in the order one person chose, minus the ones they hid.
 * Pure helpers shared by the layout API and the pages.
 */
export type PanelLayout = { order: string[]; hidden: string[] };

export const LAYOUT_SCOPE = /^[a-z0-9:_-]{1,40}$/;
const KEY = /^[a-z0-9_-]{1,30}$/;

/** Lists of panel keys only; anything else is refused (null). */
export function cleanLayout(v: unknown): PanelLayout | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { order?: unknown; hidden?: unknown };
  const list = (x: unknown) => (Array.isArray(x) && x.length <= 40 && x.every((k) => typeof k === 'string' && KEY.test(k)) ? Array.from(new Set(x as string[])) : null);
  const order = list(o.order ?? []);
  const hidden = list(o.hidden ?? []);
  return order && hidden ? { order, hidden } : null;
}

/**
 * The panels to show, in order: the person's order first (only keys the page
 * still has), then any panel the page added since they arranged it, in the
 * page's default place; hidden ones dropped.
 */
export function arrange(defaults: string[], layout: PanelLayout | null | undefined): string[] {
  const known = new Set(defaults);
  const mine = (layout?.order || []).filter((k) => known.has(k));
  const rest = defaults.filter((k) => !mine.includes(k));
  const merged = [...mine];
  for (const k of rest) {
    // Put a new panel after the panel it follows by default.
    const i = defaults.indexOf(k);
    const before = defaults.slice(0, i).reverse().find((x) => merged.includes(x));
    merged.splice(before ? merged.indexOf(before) + 1 : 0, 0, k);
  }
  const hidden = new Set(layout?.hidden || []);
  return merged.filter((k) => !hidden.has(k));
}

/** Move one panel up (-1) or down (+1) among the full list (hidden included). */
export function move(all: string[], key: string, dir: -1 | 1): string[] {
  const i = all.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return all;
  const next = [...all];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
