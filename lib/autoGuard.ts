/**
 * autoGuard — the pure half of the app-wide unsaved-changes gate
 * (components/AutoUnsavedGuard.tsx mounts the DOM half once, in the app shell).
 *
 * Chad, 2026-10-11: "add gates asking … are u sure and ask save and exit or
 * discard … fully site wide". 46 pages already carry their own
 * useUnsavedGuard; the rest (~180 screens with forms) had nothing. Rather than
 * wire each one, the shell watches what the user types into any form or
 * dialog and, on the way out, asks Save and exit / Discard / Keep editing.
 *
 * What counts as "unsaved work" (kept narrow so the gate never nags):
 *   - any field the user changed inside a <form>, a dialog, a .k-modal or a
 *     [data-guard] block;
 *   - on the page itself (outside those), only text the user typed — a note,
 *     a message, a name (isLooseWorkField). A dropdown, date or checkbox on
 *     the page is a filter far more often than work, so it never arms it;
 *   - never a search box, filter, sort, the top bar, the menus, the tab bar,
 *     Sage's chat or the ⌘K palette;
 *   - whose value differs from what it held when the user first focused it
 *     (typing then deleting it again is not a change).
 * A form that closes (its fields leave the page) or saves successfully is
 * clean again. Opt a block out with data-no-guard, in with data-guard.
 */

/** Containers whose fields hold work worth guarding. */
export const SCOPE_SELECTOR = 'form, [role="dialog"], [role="alertdialog"], .k-modal, [data-guard]';

/** Never guarded: navigation chrome, Sage, the palette, explicit opt-outs. */
export const IGNORE_SELECTOR =
  '[data-no-guard], .sag-topbar, .sag-tabbar, nav, aside, [data-ai-panel], [role="search"], [role="toolbar"]';

/** Input types that are never "work" (or save themselves the moment they change). */
const IGNORED_TYPES = new Set(['hidden', 'search', 'file', 'button', 'submit', 'reset', 'image']);

const SEARCHY = /\b(search|filter|find|sort|query|jump to|look ?up)\b/i;

export interface FieldInfo {
  tag: string;
  type?: string | null;
  name?: string | null;
  id?: string | null;
  placeholder?: string | null;
  ariaLabel?: string | null;
  role?: string | null;
  readOnly?: boolean;
  disabled?: boolean;
}

/** True when a field's own attributes make it guardable (scope is checked separately). */
export function isGuardableField(f: FieldInfo): boolean {
  const tag = f.tag.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && f.role !== 'textbox') return false;
  if (f.readOnly || f.disabled) return false;
  if (tag === 'input' && IGNORED_TYPES.has(String(f.type || 'text').toLowerCase())) return false;
  if (f.role === 'searchbox' || f.role === 'combobox') return false;
  const words = [f.name, f.id, f.placeholder, f.ariaLabel].filter(Boolean).join(' ');
  return !SEARCHY.test(words);
}

const LOOSE_TYPES = new Set(['', 'text', 'email', 'tel', 'url']);

/** Outside a form or dialog, only typed text counts as work (see the header). */
export function isLooseWorkField(f: FieldInfo): boolean {
  if (!isGuardableField(f)) return false;
  const tag = f.tag.toLowerCase();
  if (tag === 'textarea' || f.role === 'textbox') return true;
  return tag === 'input' && LOOSE_TYPES.has(String(f.type || '').toLowerCase());
}

/** Labels of a form's save action. */
const SAVE_RE = /^(save|update|submit|create|add|send|post|publish|record|log|done|apply|confirm|finish|upload|request|issue|approve|book|schedule|invite)\b/i;
/** Never treat these as the save action, even when the words overlap. */
const NOT_SAVE_RE = /\b(cancel|close|discard|delete|remove|back|clear|reset|archive|draft only|preview)\b/i;

/**
 * Which of a container's buttons saves it: index into `labels`, or -1.
 * `submit[i]` is true for type=submit buttons. A plain "Save…" wins over other
 * matches; among equals the LAST one wins (the primary sits at the end of a
 * form's action row).
 */
export function pickSaveButton(labels: string[], submit: boolean[] = []): number {
  let best = -1;
  let bestRank = 0;
  labels.forEach((raw, i) => {
    const label = raw.replace(/\s+/g, ' ').trim();
    if (!label) return;
    const saveFirst = /^save\b/i.test(label);
    // "Save & close" saves; "Cancel", "Delete", "Close" never do.
    if (saveFirst ? /\b(cancel|discard|delete|remove)\b/i.test(label) : NOT_SAVE_RE.test(label)) return;
    let rank = 0;
    if (saveFirst) rank = 3;
    else if (SAVE_RE.test(label)) rank = 2;
    else if (submit[i]) rank = 1;
    if (rank && rank >= bestRank) { best = i; bestRank = rank; }
  });
  return best;
}

/** Buttons that close a form or dialog without saving it (an explicit "Discard" is the user's answer already). */
const CLOSE_RE = /^(cancel|close|dismiss|not now|never mind|nevermind|×|✕|✖)$/i;

/** True when a button's label or aria-label says it closes the form without saving. */
export function isCloseLabel(label: string, ariaLabel?: string | null): boolean {
  const a = String(ariaLabel || '').replace(/\s+/g, ' ').trim();
  if (a && /^(close|cancel|dismiss)\b/i.test(a)) return true;
  const l = String(label || '').replace(/\s+/g, ' ').trim();
  return !!l && CLOSE_RE.test(l);
}

/**
 * The thing a form edits, for the leave prompt: "New RFI" → "RFI",
 * "Edit Punch Item" → "punch item", "Add a change order" → "change order".
 * Empty when the title says nothing a sentence can use.
 */
export function formNoun(title: string | null | undefined): string {
  let t = String(title || '').replace(/\s+/g, ' ').replace(/\s*[#:·—–|(].*$/, '').trim();
  t = t.replace(/^(new|edit|add|create|update)\s+(an?\s+|the\s+)?/i, '').replace(/[.…]+$/, '').trim();
  if (!t || t.length > 32 || !/[a-z]/i.test(t)) return '';
  const words = t.split(' ');
  // "Log a delivery", "Send invite" — a sentence, not a thing; "Edit details" — not "this details".
  if (/^(log|record|start|request|send|invite|upload|schedule|book|take|choose|pick|set|enter|review|sign|share|move|copy|assign)$/i.test(words[0])) return '';
  const last = words[words.length - 1];
  if (/[a-z]s$/.test(last) && !/(ss|us|is)$/i.test(last)) return '';
  // Title Case words read as ordinary words in a sentence; acronyms (RFI, COI) stay.
  return words.map((w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w)).join(' ');
}

/** The leave prompt's sentence. `noun` is what the form edits ("RFI"), when known. */
export function leaveMessage(noun: string | undefined, hasDraft: boolean): string {
  const what = noun ? `Your changes to this ${noun} haven't been saved.` : "Your changes haven't been saved.";
  return hasDraft ? `${what} A draft is kept on this device.` : what;
}

/** Background requests that are never a form's save. */
const BACKGROUND_API = /^\/api\/(sage|ai|analytics|telemetry|log|logs|push|presence|heartbeat|track|events|notifications\/(read|seen))/i;

/** True for a request that could be a form saving: same-origin /api, a writing method, not background. */
export function isSaveRequest(method: string, pathname: string): boolean {
  if (!/^(POST|PUT|PATCH)$/i.test(method)) return false;
  if (!pathname.startsWith('/api/')) return false;
  return !BACKGROUND_API.test(pathname);
}
