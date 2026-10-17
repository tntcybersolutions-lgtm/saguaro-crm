/**
 * autoDraft — the pure half of the app-wide draft keeper
 * (components/AutoUnsavedGuard.tsx is the DOM half, mounted once in the shell).
 *
 * Chad, 2026-10-17: "build in toast messages end to end so users don't lose
 * progress. Must auto save …". While someone types into any form or dialog,
 * the fields they changed are copied to this device about 800ms after they
 * stop. Leave, reload, crash or lose signal and come back: the form fills
 * itself back in and says "Draft restored from 2:14 PM" with Undo / Discard.
 * A successful save, or Discard, removes the copy. Sign-out wipes them all.
 *
 * One key per screen and form: `sag_draft:auto:<path>|<form>`. Page-owned
 * drafts (lib/useUnsavedGuard) live under the same `sag_draft:` prefix, so one
 * wipe on sign-out covers both.
 *
 * Never kept: passwords, card numbers and codes (isSecretField /
 * looksLikeCardNumber), and anything inside [data-no-draft].
 */

export const DRAFT_PREFIX = 'sag_draft:';
export const AUTO_PREFIX = `${DRAFT_PREFIX}auto:`;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_DEBOUNCE_MS = 800;

/** The slice of Storage this module uses (localStorage, or a fake in tests). */
export interface DraftStore {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface StoredDraft {
  /** When it was last written (ms). */
  t: number;
  /** The form's own title, when it has one ("New RFI"). */
  title?: string;
  /** Field key → value as typed (checkboxes: "true" / "false"). */
  fields: Record<string, string>;
}

/* ── What is never written down ────────────────────────────────────────── */

export interface DraftFieldInfo {
  tag: string;
  type?: string | null;
  name?: string | null;
  id?: string | null;
  placeholder?: string | null;
  ariaLabel?: string | null;
  autocomplete?: string | null;
  /** The field or a block around it carries data-no-draft. */
  noDraft?: boolean;
}

const SECRET_WORDS = /pass ?word|passcode|\bpin\b|\bcvc\b|\bcvv\b|\bcsc\b|card ?(number|no)|\bccn\b|security code|\bssn\b|social security|routing|account ?(number|no)|\biban\b|secret|api ?key|access ?token|\bone[- ]time\b|\botp\b|verification code/i;
const SECRET_AUTOCOMPLETE = /^(cc-|current-password|new-password|one-time-code)/i;

/** True for a field whose value must never be kept on the device. */
export function isSecretField(f: DraftFieldInfo): boolean {
  if (f.noDraft) return true;
  if (String(f.type || '').toLowerCase() === 'password') return true;
  const ac = String(f.autocomplete || '').trim().toLowerCase();
  if (ac && ac.split(/\s+/).some((t) => SECRET_AUTOCOMPLETE.test(t))) return true;
  const words = [f.name, f.id, f.placeholder, f.ariaLabel].filter(Boolean).join(' ').replace(/[_-]+/g, ' ');
  return SECRET_WORDS.test(words);
}

/** A value that reads as a payment card (13–19 digits passing Luhn) is never kept, whatever the field says. */
export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/* ── Keys ──────────────────────────────────────────────────────────────── */

/** "/app/projects/1/rfis/?tab=open#x" → "/app/projects/1/rfis". */
export function routeOf(path: string): string {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return p || '/';
}

/** The storage key for one form on one screen. */
export function draftKey(route: string, formId: string): string {
  return `${AUTO_PREFIX}${routeOf(route)}|${formId}`;
}

/** Ids the framework makes up per render (React useId, Radix) say nothing about the field. */
const GENERATED_ID = /^(:r|«|radix-|headlessui-|mui-|react-select-)|^[0-9a-f]{8}-[0-9a-f]{4}-|\d{6,}/i;

function clip(s: string | null | undefined, n = 60): string {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

/**
 * A field's name inside its form: its name, a stable id, its label words or
 * placeholder — whatever is steady across visits. Index-free; the caller adds
 * "#n" when two fields share one name. Radio buttons add their value.
 */
export function fieldBase(f: DraftFieldInfo & { label?: string | null; value?: string | null }): string {
  const tag = f.tag.toLowerCase();
  const type = tag === 'input' ? String(f.type || 'text').toLowerCase() : tag;
  const id = f.id && !GENERATED_ID.test(f.id) ? f.id : '';
  const who = clip(f.name) || id || clip(f.ariaLabel) || clip(f.label) || clip(f.placeholder) || '';
  const radio = type === 'radio' ? `=${clip(f.value, 40)}` : '';
  return `${type}:${who}${radio}`;
}

/** Give repeated bases an occurrence number: ["a","b","a"] → ["a","b","a#2"]. */
export function numberKeys(bases: string[]): string[] {
  const seen = new Map<string, number>();
  return bases.map((b) => {
    const n = (seen.get(b) || 0) + 1;
    seen.set(b, n);
    return n === 1 ? b : `${b}#${n}`;
  });
}

/** A form's identity on its screen: an explicit data-draft-key, else its kind and title. */
export function formIdOf(o: { explicit?: string | null; kind: string; title?: string | null; name?: string | null }): string {
  if (o.explicit) return `k:${clip(o.explicit, 120)}`;
  return `${o.kind}:${clip(o.title) || clip(o.name) || '-'}`;
}

/* ── The store ─────────────────────────────────────────────────────────── */

/** Keep what was typed. No fields → the draft goes (nothing left unsaved). */
export function saveDraft(store: DraftStore, key: string, fields: Record<string, string>, title?: string, now = Date.now()): boolean {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string' || looksLikeCardNumber(v)) continue;
    clean[k] = v;
  }
  try {
    if (!Object.keys(clean).length) { store.removeItem(key); return false; }
    const d: StoredDraft = { t: now, fields: clean };
    if (title) d.title = clip(title, 80);
    store.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false; // storage full or switched off — the form still works, it just isn't kept
  }
}

export function readDraft(store: DraftStore, key: string, now = Date.now()): StoredDraft | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    if (!d || typeof d.t !== 'number' || !d.fields || typeof d.fields !== 'object') { store.removeItem(key); return null; }
    if (now - d.t > DRAFT_TTL_MS) { store.removeItem(key); return null; }
    return d;
  } catch {
    try { store.removeItem(key); } catch { /* storage off */ }
    return null;
  }
}

export function removeDraft(store: DraftStore, key: string): void {
  try { store.removeItem(key); } catch { /* storage off — nothing kept */ }
}

function keys(store: DraftStore, prefix: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
  } catch { /* storage off */ }
  return out;
}

/** Every automatic draft kept for one screen. */
export function draftKeysForRoute(store: DraftStore, route: string): string[] {
  return keys(store, `${AUTO_PREFIX}${routeOf(route)}|`);
}

/** A page-level save (one Save for the whole screen): every draft on it goes. */
export function clearRouteDrafts(store: DraftStore, route: string): void {
  for (const k of draftKeysForRoute(store, route)) removeDraft(store, k);
}

/** Sign-out: no draft of this person's survives for the next one on the device. */
export function wipeDrafts(store: DraftStore): number {
  const all = keys(store, DRAFT_PREFIX);
  for (const k of all) removeDraft(store, k);
  return all.length;
}

/** Whether this device can keep a draft at all (private windows can refuse). */
export function canKeepDrafts(store: DraftStore | null | undefined): boolean {
  if (!store) return false;
  try {
    const k = `${DRAFT_PREFIX}__probe`;
    store.setItem(k, '1');
    store.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Which kept fields differ from what the form shows now — the ones a restore would change. */
export function restorePlan(draft: StoredDraft, current: Record<string, string | undefined>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(draft.fields)) {
    if (!(k in current)) continue; // that field is not on this form any more
    if (current[k] !== v) out.push([k, v]);
  }
  return out;
}

/* ── Words ─────────────────────────────────────────────────────────────── */

/** "Draft restored from 2:14 PM" (today) / "… from Oct 15, 2:14 PM" (another day). */
export function restoredLabel(t: number, now = Date.now(), timeZone?: string): string {
  const at = new Date(t);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) };
  const day = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', ...(timeZone ? { timeZone } : {}) });
  const time = at.toLocaleTimeString('en-US', opts);
  if (day(at) === day(new Date(now))) return `Draft restored from ${time}`;
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) });
  return `Draft restored from ${date}, ${time}`;
}
