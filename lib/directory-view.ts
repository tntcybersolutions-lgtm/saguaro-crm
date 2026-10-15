/**
 * Directory view logic — pure, shared by the job Directory and Team screens.
 *
 *   monoToken(name)        deterministic accent token for a monogram tile, so
 *                          a company keeps the same color on every screen
 *   groupByCompany(...)    contacts + the job's sub companies → one group per
 *                          company (people inside), sorted, "No company" last
 *   telHref / mailHref     safe quick-action links (null when unusable)
 */

/* Accent tokens only (app/globals.css). Blue / cyan accents are left out on
   purpose — they read as links. */
export const MONO_TOKENS = [
  '--mod-core', '--mod-sales', '--mod-precon', '--mod-money',
  '--mod-docs', '--mod-people', '--success', '--warning',
] as const;

/** "Ana María López" → "AL"; "Desert Steel LLC" → "DS"; "" → "". */
export function initialsOf(name: string | null | undefined): string {
  const s = String(name || '').trim().replace(/@.*$/, '');
  if (!s) return '';
  const words = s.split(/[\s._-]+/).filter((w) => /[A-Za-z0-9]/.test(w));
  const skip = /^(llc|inc|co|corp|ltd|the|and|&)$/i;
  const parts = words.filter((w) => !skip.test(w));
  const use = parts.length ? parts : words;
  if (use.length === 0) return '';
  if (use.length === 1) return use[0].slice(0, 2).toUpperCase();
  return (use[0][0] + use[1][0]).toUpperCase();
}

/** Stable 32-bit FNV-1a over the lower-cased, trimmed name. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** `var(--mod-…)` for a name; the same name always gets the same token. */
export function monoToken(name: string | null | undefined): string {
  const k = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k) return 'var(--text-tertiary)';
  return `var(${MONO_TOKENS[hash(k) % MONO_TOKENS.length]})`;
}

export type DirContact = {
  id?: string;
  name: string;
  role?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  trade?: string | null;
};

export type DirCompany = {
  id: string;
  name: string;
  trade?: string | null;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  status?: string | null;
  kind?: 'sub';
};

export type DirGroup = {
  key: string;
  /** Company name; '' for people with no company. */
  name: string;
  trade: string | null;
  /** On the job as a subcontractor. */
  isSub: boolean;
  phone: string | null;
  email: string | null;
  people: DirContact[];
};

const keyOf = (s: string | null | undefined) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * One group per company. A sub company with no contact rows still shows,
 * with its own contact person (from the sub record) when it has one.
 */
export function groupByCompany(contacts: DirContact[] | null | undefined, companies: DirCompany[] | null | undefined = []): DirGroup[] {
  const groups = new Map<string, DirGroup>();
  const get = (name: string) => {
    const k = keyOf(name);
    let g = groups.get(k);
    if (!g) { g = { key: k || '__none', name: name.trim(), trade: null, isSub: false, phone: null, email: null, people: [] }; groups.set(k, g); }
    return g;
  };
  for (const c of Array.isArray(companies) ? companies : []) {
    if (!c || !String(c.name || '').trim()) continue;
    const g = get(c.name);
    g.isSub = true;
    g.trade = g.trade || c.trade || null;
    g.phone = g.phone || c.phone || null;
    g.email = g.email || c.email || null;
  }
  for (const p of Array.isArray(contacts) ? contacts : []) {
    if (!p || !String(p.name || '').trim()) continue;
    const g = get(String(p.company || ''));
    g.people.push(p);
    if (!g.trade && p.trade) g.trade = p.trade;
  }
  /* The sub's own contact person, when no directory row names them already. */
  for (const c of Array.isArray(companies) ? companies : []) {
    const nm = String(c?.contactName || '').trim();
    if (!nm) continue;
    const g = groups.get(keyOf(c.name));
    if (!g || g.people.some((p) => keyOf(p.name) === keyOf(nm))) continue;
    g.people.push({ name: nm, role: 'Primary contact', company: c.name, email: c.email || null, phone: c.phone || null, trade: c.trade || null });
  }
  for (const g of groups.values()) g.people.sort((a, b) => a.name.localeCompare(b.name));
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.name !== !b.name) return a.name ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** tel: link with only dialable characters; null when there are under 7 digits. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`;
}

/** mailto: link for a plausible address; null otherwise. */
export function mailHref(email: string | null | undefined): string | null {
  const e = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}
