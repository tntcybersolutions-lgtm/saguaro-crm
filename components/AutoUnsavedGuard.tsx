'use client';
/**
 * AutoUnsavedGuard — the app-wide unsaved-changes gate and draft keeper,
 * mounted once in the app shell (app/app/layout.tsx). Every screen gets it,
 * desktop and phone (the iPhone app is this same /app); no page wires anything.
 *
 * KEEPS A DRAFT. While the user changes a field in a form or dialog, or types
 * text on the page (see lib/autoGuard for exactly what counts), the changed
 * fields are copied to this device ~800ms after they stop (lib/autoDraft).
 * Leave, reload, crash or lose signal and come back: the form fills itself
 * back in — "Draft restored from 2:14 PM" with Undo / Discard. A successful
 * save or Discard removes the copy; sign-out wipes them all. Passwords, card
 * numbers and [data-no-draft] fields are never kept.
 *
 * ASKS BEFORE LEAVING. Trying to leave with unsaved changes — a link, the
 * sidebar, a bottom tab, the job picker, the top bar's Back, the browser's
 * back/forward, or closing the dialog (its Cancel / × button, a tap outside,
 * Escape) — asks:
 *
 *     Leave without saving?          [Keep editing] [Discard changes] [Save and leave]
 *
 * Save and leave presses the form's own Save button and leaves only when that
 * save succeeds; if it fails (or the form wants a required field) the prompt
 * closes on the form so the user sees why. Closing or reloading the tab gets
 * the browser's own "Leave site?" prompt (and the draft is already kept).
 *
 * A page with its own useUnsavedGuard (drafts, custom saves) keeps it — this
 * one stands aside whenever a page guard is dirty, and keeps no automatic
 * draft on a screen whose guard keeps its own (lib/navGuard).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { registerNavGuard, isPageGuardDirty, isNavGuarded, requestNavigation, runUnguarded, pageOwnsDrafts, justConfirmedLeave } from '@/lib/navGuard';
import { SCOPE_SELECTOR, IGNORE_SELECTOR, isGuardableField, isLooseWorkField, pickSaveButton, isSaveRequest, isCloseLabel, formNoun } from '@/lib/autoGuard';
import {
  type DraftStore, DRAFT_DEBOUNCE_MS, draftKey, draftKeysForRoute, clearRouteDrafts, saveDraft, readDraft, removeDraft,
  isSecretField, fieldBase, numberKeys, formIdOf, restorePlan, restoredLabel, canKeepDrafts,
} from '@/lib/autoDraft';
import { step, hasStatusCenter } from '@/lib/ui/status';
import { inRetryPress } from '@/lib/ui/status-fetch';
import type { UnsavedGuardApi } from '@/lib/useUnsavedGuard';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
type Arm = { scope: Element | null; at: number };
type Waiter = { scope: Element | null; started: boolean; onDone: (ok: boolean) => void };

const ARM_WINDOW_MS = 10_000;
const NO_START_MS = 4_000;
const SAVE_TIMEOUT_MS = 20_000;
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], .k-modal, [aria-modal="true"]';

/* ── Module state: one shell, one gate ─────────────────────────────────── */
const baseline = new WeakMap<Element, string>();
const dirty = new Set<Field>();
let arm: Arm | null = null;
let waiter: Waiter | null = null;
/** Reads in flight — a restore waits for the form's own data to land first. */
let inflightReads = 0;

function valueOf(el: Field): string {
  if (el instanceof HTMLInputElement) return el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value;
  if (el instanceof HTMLSelectElement) return el.multiple ? [...el.selectedOptions].map((o) => o.value).join('\u0001') : el.value;
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent || '';
}

function scopeOf(el: Element): Element | null {
  return el.closest(SCOPE_SELECTOR);
}

/** Same container, or one inside the other (a form inside a dialog). */
function related(a: Element | null, b: Element | null): boolean {
  return !!a && !!b && (a === b || a.contains(b) || b.contains(a));
}

function guardable(t: EventTarget | null): Field | null {
  if (!(t instanceof HTMLElement)) return null;
  const el = (t.isContentEditable ? t.closest('[contenteditable="true"],[contenteditable=""]') : t) as HTMLElement | null;
  if (!el || el.closest(IGNORE_SELECTOR)) return null;
  // In a form or dialog any field is work; on the page itself only typed text is.
  const inScope = !!scopeOf(el);
  if (!inScope && !el.closest('.main-content-area')) return null;
  const ok = (inScope ? isGuardableField : isLooseWorkField)({
    tag: el.isContentEditable ? 'textarea' : el.tagName,
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    id: el.id,
    placeholder: el.getAttribute('placeholder'),
    ariaLabel: el.getAttribute('aria-label'),
    role: el.isContentEditable ? 'textbox' : el.getAttribute('role'),
    readOnly: (el as HTMLInputElement).readOnly,
    disabled: (el as HTMLInputElement).disabled,
  });
  return ok ? (el as Field) : null;
}

/** Fields that still differ from where they started and are still on the page. */
function liveDirty(): Field[] {
  for (const el of [...dirty]) {
    if (!el.isConnected || valueOf(el) === baseline.get(el)) dirty.delete(el);
  }
  return [...dirty];
}

function labelOf(b: Element): string {
  return (b.getAttribute('aria-label') || b.textContent || (b as HTMLInputElement).value || '').trim();
}

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function saveIn(root: Element, saveOnly: boolean): HTMLElement | null {
  const buttons = [...root.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]')]
    .filter((b) => visible(b) && !(b as HTMLButtonElement).disabled && !b.closest(IGNORE_SELECTOR));
  const labels = buttons.map(labelOf);
  const i = pickSaveButton(labels, buttons.map((b) => (b as HTMLButtonElement).type === 'submit'));
  if (i < 0 || (saveOnly && !/^save\b/i.test(labels[i]))) return null;
  return buttons[i];
}

/**
 * The form's own Save button and the container it saves, or null when the
 * gate cannot tell which button saves. Looks in the field's form, then any
 * dialog around it (its footer), then the page itself for a "Save…" button.
 */
function findSave(field: Element | undefined): { btn: HTMLElement; scope: Element } | null {
  let s: Element | null = field ? scopeOf(field) : null;
  while (s) {
    const btn = saveIn(s, false);
    if (btn) return { btn, scope: s };
    s = s.parentElement ? s.parentElement.closest(SCOPE_SELECTOR) : null;
  }
  const page = document.querySelector('.main-content-area') || document.body;
  const btn = field ? saveIn(page, true) : null;
  return btn ? { btn, scope: document.body } : null;
}

/* ── Drafts on this device (lib/autoDraft holds the rules) ─────────────── */
let applying = 0; // our own restore/undo is filling fields — not the user typing
const pendingDraft = new Set<Element>();
/** The screen the pending copies belong to — a copy is never written under another screen's name. */
let pendingRoute = '';
let draftTimer = 0;
/** Draft container → its storage key, so a form that closed can still drop its draft. */
const keyOfScope = new WeakMap<Element, string>();
const handledScopes = new WeakSet<Element>();
let handledLooseRoute: string | null = null;

function store(): DraftStore | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

function draftsOn(): boolean {
  return !pageOwnsDrafts() && !!store();
}

/** The outermost form/dialog around a field — one draft per dialog, not per inner <form>. */
function draftScopeOf(el: Element): Element | null {
  let s: Element | null = el.closest(SCOPE_SELECTOR);
  let top: Element | null = null;
  while (s) {
    top = s;
    s = s.parentElement ? s.parentElement.closest(SCOPE_SELECTOR) : null;
  }
  return top;
}

function textOf(el: Element | null | undefined): string {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

/** A form's title: its aria-label, the text it is labelled by, or its first heading. */
function titleOf(scope: Element | null): string {
  if (!scope) return textOf(document.querySelector('.main-content-area h1'));
  const own = scope.getAttribute('aria-label');
  if (own) return own.trim();
  const by = scope.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(' ').trim();
    if (t) return t;
  }
  return textOf(scope.querySelector('[data-draft-title], .k-modal-title, .k-dialog-title, h1, h2, h3, legend'));
}

function scopeKind(scope: Element): string {
  if (scope.matches(DIALOG_SELECTOR)) return 'dialog';
  return scope.tagName === 'FORM' ? 'form' : 'block';
}

function baseIdOf(scope: Element): string {
  const id = scope.id && !/^(:r|«)|\d{6,}/.test(scope.id) ? scope.id : '';
  return formIdOf({ explicit: scope.getAttribute('data-draft-key'), kind: scopeKind(scope), title: titleOf(scope), name: scope.getAttribute('name') || id });
}

/** The form's identity on this screen; two alike get #2, #3 in page order. */
function formIdFor(scope: Element | null): string {
  if (!scope) return 'page';
  const base = baseIdOf(scope);
  const alike = [...document.querySelectorAll(SCOPE_SELECTOR)].filter((s) => draftScopeOf(s) === s && baseIdOf(s) === base);
  const n = alike.indexOf(scope);
  return n > 0 ? `${base}#${n + 1}` : base;
}

function keyFor(scope: Element | null): string {
  return draftKey(window.location.pathname, formIdFor(scope));
}

function draftable(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
  if (!guardable(el)) return false;
  return !isSecretField({
    tag: el.tagName,
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    id: el.id,
    placeholder: el.getAttribute('placeholder'),
    ariaLabel: el.getAttribute('aria-label'),
    autocomplete: el.getAttribute('autocomplete'),
    noDraft: !!el.closest('[data-no-draft]'),
  });
}

function labelTextOf(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const l = el.labels?.[0];
  if (l) return textOf(l);
  const by = el.getAttribute('aria-labelledby');
  return by ? by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(' ') : '';
}

/** Every keepable field of a form (or, for null, the page's own loose fields), by its key. */
function keyedFields(scope: Element | null): Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  const root = scope || document.querySelector('.main-content-area');
  const out = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
  if (!root) return out;
  const els = [...root.querySelectorAll('input, textarea, select')]
    .filter((el) => (scope ? true : !draftScopeOf(el)))
    .filter(draftable);
  const keys = numberKeys(els.map((el) => fieldBase({
    tag: el.tagName, type: el.getAttribute('type'), name: el.getAttribute('name'), id: el.id,
    placeholder: el.getAttribute('placeholder'), ariaLabel: el.getAttribute('aria-label'),
    label: labelTextOf(el), value: (el as HTMLInputElement).value,
  })));
  keys.forEach((k, i) => out.set(k, els[i]));
  return out;
}

/** Copy what the user changed in one form to this device (or drop the copy when nothing is left). */
function writeDraftFor(scope: Element | null) {
  const s = store();
  if (!s || pageOwnsDrafts()) return;
  if (scope && !scope.isConnected) return; // closed: its last copy stands until a save or Discard
  const key = keyFor(scope);
  keyOfScope.set(scope || document.body, key);
  const fields: Record<string, string> = {};
  for (const [k, el] of keyedFields(scope)) {
    if (dirty.has(el) && valueOf(el) !== baseline.get(el)) fields[k] = valueOf(el);
  }
  saveDraft(s, key, fields, titleOf(scope) || undefined);
}

function flushDrafts() {
  if (draftTimer) { window.clearTimeout(draftTimer); draftTimer = 0; }
  const list = [...pendingDraft];
  pendingDraft.clear();
  if (pendingRoute !== window.location.pathname) return; // that screen is gone; its last copy stands
  for (const sc of list) writeDraftFor(sc === document.body ? null : sc);
}

function scheduleDraft(el: Element) {
  if (applying || !draftsOn() || !draftable(el)) return;
  if (pendingRoute !== window.location.pathname) { pendingDraft.clear(); pendingRoute = window.location.pathname; }
  pendingDraft.add(draftScopeOf(el) || document.body);
  if (draftTimer) window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(flushDrafts, DRAFT_DEBOUNCE_MS);
}

/** After a save (or Discard) in `scope`: rewrite that form's copy from what is still unsaved — usually nothing, so it goes. */
function refreshDraft(scope: Element | null) {
  const s = store();
  if (!s) return;
  if (!scope || scope === document.body) { clearRouteDrafts(s, window.location.pathname); return; }
  const ds = draftScopeOf(scope);
  if (!ds) { writeDraftFor(null); return; } // a loose field saved itself
  if (!ds.isConnected) {
    const k = keyOfScope.get(ds);
    if (k) removeDraft(s, k);
    return;
  }
  writeDraftFor(ds);
}

/** Drop the copies of every form holding these fields (Discard). */
function dropDraftsOf(fields: Element[]) {
  const s = store();
  if (!s) return;
  const scopes = new Set<Element | null>(fields.map((f) => draftScopeOf(f)));
  for (const sc of scopes) {
    const k = sc ? (sc.isConnected ? keyFor(sc) : keyOfScope.get(sc)) : keyFor(null);
    if (k) removeDraft(s, k);
  }
}

/** Put a value into a field the way typing would, so the page's own state follows. */
function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const want = v === 'true';
    if (el.checked !== want && (want || el.type === 'checkbox')) el.click();
    return;
  }
  if (el instanceof HTMLSelectElement && el.multiple) {
    const want = new Set(v.split('\u0001'));
    for (const o of el.options) o.selected = want.has(o.value);
  } else {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyAll(pairs: Array<[HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string]>) {
  applying++;
  try {
    for (const [el, v] of pairs) {
      if (!el.isConnected) continue;
      if (!baseline.has(el)) baseline.set(el, valueOf(el)); // where it started, so Undo reads as clean
      try { setFieldValue(el, v); } catch (e) { console.error('[draft] could not fill a field', e); }
    }
  } finally { applying--; }
}

function announce(message: string, actions: Array<{ label: string; run: () => void }>, toast: (m: string, t: 'success', o: { actions: typeof actions }) => void) {
  if (hasStatusCenter()) step(message, { state: 'done', note: true, actions });
  else toast(message, 'success', { actions });
}

/** Fill a form back in from its copy. Never over what the user is typing now. */
function restoreInto(scope: Element | null, key: string, toast: Parameters<typeof announce>[2]) {
  const s = store();
  if (!s) return;
  const d = readDraft(s, key);
  if (!d) return;
  const fields = keyedFields(scope);
  // Focus alone is not typing (dialogs focus their first field); a changed field is.
  if ([...fields.values()].some((el) => dirty.has(el))) return;
  const current: Record<string, string> = {};
  for (const [k, el] of fields) current[k] = valueOf(el);
  const plan = restorePlan(d, current);
  if (!plan.length) {
    // Every kept value is already on the form: it was saved. (A field not drawn yet keeps the copy.)
    if (Object.keys(d.fields).every((k) => k in current)) removeDraft(s, key);
    return;
  }
  keyOfScope.set(scope || document.body, key);
  const before: Array<[HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string]> = [];
  const filled = new Set<string>();
  const fill = (map: typeof fields) => {
    const pairs: Array<[HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string]> = [];
    for (const [k, v] of plan) {
      const el = map.get(k);
      if (!el || filled.has(k)) continue;
      filled.add(k);
      before.push([el, valueOf(el)]);
      pairs.push([el, v]);
    }
    applyAll(pairs);
  };
  fill(fields);
  // A choice can bring more fields on screen ("Other" → a text box): one more pass for those.
  window.setTimeout(() => { if (!scope || scope.isConnected) fill(keyedFields(scope)); }, 350);
  const undo = () => applyAll([...before].reverse());
  announce(restoredLabel(d.t), [
    { label: 'Undo', run: undo }, // the copy stays on this device for next time
    { label: 'Discard', run: () => { undo(); removeDraft(s, key); } },
  ], toast);
}

/** Find forms on screen with a copy waiting, once each. */
function scanRestore(toast: Parameters<typeof announce>[2]) {
  const s = store();
  if (!s || pageOwnsDrafts()) return;
  const route = window.location.pathname;
  const waiting = new Set(draftKeysForRoute(s, route));
  if (!waiting.size) return;
  const scopes = [...document.querySelectorAll(SCOPE_SELECTOR)].filter((sc) => draftScopeOf(sc) === sc && !handledScopes.has(sc) && !sc.closest(IGNORE_SELECTOR) && visible(sc));
  for (const sc of scopes) {
    if (!keyedFields(sc).size) continue; // its fields have not drawn yet
    handledScopes.add(sc);
    const key = keyFor(sc);
    if (waiting.has(key)) restoreInto(sc, key, toast);
  }
  if (handledLooseRoute !== route && keyedFields(null).size) {
    handledLooseRoute = route;
    const key = keyFor(null);
    if (waiting.has(key)) restoreInto(null, key, toast);
  }
}

/* ── Which save request belongs to which form ──────────────────────────── */
function hookFetch() {
  const w = window as Window & { __sagFetchHooked?: boolean };
  if (w.__sagFetchHooked || typeof w.fetch !== 'function') return;
  w.__sagFetchHooked = true;
  const original = w.fetch.bind(w);
  w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let mine: Arm | null = null;
    let read = false;
    try {
      const req = input instanceof Request ? input : null;
      const method = String(init?.method || req?.method || 'GET');
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (req as Request).url, window.location.href);
      if (url.origin === window.location.origin && isSaveRequest(method, url.pathname) && arm && Date.now() - arm.at < ARM_WINDOW_MS) {
        mine = arm;
        if (waiter && related(waiter.scope, mine.scope)) waiter.started = true;
      }
      read = /^GET$/i.test(method) && (url.origin === window.location.origin ? url.pathname.startsWith('/api/') : url.pathname.startsWith('/rest/v1/'));
    } catch {
      mine = null; /* an unparseable request is never a form save */
    }
    if (read) inflightReads++;
    try {
      const res = await original(input, init);
      if (mine) {
        if (res.ok) {
          markClean(mine.scope);
          if (waiter && related(waiter.scope, mine.scope)) waiter.onDone(true);
        } else if (waiter && related(waiter.scope, mine.scope)) {
          waiter.onDone(false);
        }
      }
      return res;
    } catch (e) {
      if (mine) {
        if (waiter && related(waiter.scope, mine.scope)) waiter.onDone(false);
        // No signal, and the form closed itself anyway: the page kept it on the
        // phone (the offline outbox) — its draft would only come back as a copy.
        const sc = mine.scope;
        window.setTimeout(() => { if (sc && !sc.isConnected) refreshDraft(sc); }, 1500);
      }
      throw e;
    } finally {
      if (read) inflightReads = Math.max(0, inflightReads - 1);
    }
  };
}

/** Mark a container's fields (or every field) saved: their current values are the new baseline. */
function markClean(scope: Element | null) {
  for (const el of [...dirty]) {
    if (!scope || scope === document.body || scope.contains(el)) {
      baseline.set(el, valueOf(el));
      dirty.delete(el);
    }
  }
  refreshDraft(scope);
}

/* ── Browser back / forward ───────────────────────────────────────────────
 * The App Router moves on popstate before any page can object, so each history
 * entry gets a position (__sagIdx). Back with unsaved work: step forward again
 * at once — the work never leaves the screen — and ask. Leave → go after all. */
const IDX_KEY = 'sag_hist_idx';
let curIdx = 0;
let popIgnore = 0;
let popBypass = 0;

function idxOf(state: unknown): number | null {
  const v = state && typeof state === 'object' ? (state as { __sagIdx?: unknown }).__sagIdx : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function rememberIdx() {
  try { sessionStorage.setItem(IDX_KEY, String(curIdx)); } catch { /* storage off: back still works, unguarded */ }
}
function withIdx(data: unknown, i: number): unknown {
  if (data == null) return { __sagIdx: i };
  return typeof data === 'object' ? { ...(data as object), __sagIdx: i } : data;
}

function installHistoryIndex() {
  const w = window as Window & { __sagHistIdx?: boolean };
  if (w.__sagHistIdx) return;
  w.__sagHistIdx = true;
  const h = window.history;
  const push = h.pushState;
  const replace = h.replaceState;
  let saved: number | null = null;
  try { const v = sessionStorage.getItem(IDX_KEY); saved = v != null && v !== '' ? Number(v) : null; } catch { saved = null; }
  curIdx = idxOf(h.state) ?? (saved != null && Number.isFinite(saved) ? saved : 0);
  try { replace.call(h, withIdx(h.state, curIdx), ''); } catch { /* a frozen history is fine */ }
  rememberIdx();
  h.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    curIdx += 1;
    rememberIdx();
    return push.call(this, withIdx(data, curIdx), unused, url);
  };
  h.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    return replace.call(this, withIdx(data, curIdx), unused, url);
  };
}

export default function AutoUnsavedGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [formName, setFormName] = useState<string | undefined>(undefined);
  const proceedRef = useRef<(() => void) | null>(null);
  /** When the prompt is for closing one dialog/form: that container. */
  const closingRef = useRef<Element | null>(null);
  const openRef = useRef(false);
  openRef.current = open;
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const ask = useCallback((proceed: () => void, closing: Element | null = null) => {
    const fields = liveDirty().filter((f) => !closing || closing.contains(f));
    proceedRef.current = proceed;
    closingRef.current = closing;
    setCanSave(!!findSave(fields[0]));
    // "A draft is kept on this device" only when it truly is: write it now and look.
    let kept = false;
    const s = store();
    if (s && draftsOn() && canKeepDrafts(s)) {
      const scopes = new Set<Element | null>(fields.filter(draftable).map((f) => draftScopeOf(f)));
      for (const sc of scopes) {
        writeDraftFor(sc);
        if (readDraft(s, keyFor(sc))) kept = true;
      }
    }
    setHasDraft(kept);
    const first = fields[0];
    setFormName(formNoun(titleOf(first ? draftScopeOf(first) : null)) || undefined);
    setOpen(true);
  }, []);

  /* Track what the user changes, keep drafts, and which button press a save belongs to. */
  useEffect(() => {
    hookFetch();
    const onFocus = (e: FocusEvent) => {
      const el = guardable(e.target);
      if (el && !baseline.has(el)) baseline.set(el, valueOf(el));
    };
    const onEdit = (e: Event) => {
      // Not limited to trusted events: the phone select sheet and voice
      // dictation change fields from code on the user's behalf.
      const el = guardable(e.target);
      if (!el) return;
      if (!baseline.has(el)) baseline.set(el, '\u0000'); // changed before we saw it start
      if (valueOf(el) !== baseline.get(el)) dirty.add(el);
      else dirty.delete(el);
      scheduleDraft(el);
      // A toggle or picker that saves itself the moment it changes.
      if (!applying && e.type === 'change' && (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && /checkbox|radio/.test(el.type)))) {
        arm = { scope: scopeOf(el), at: Date.now() };
      }
    };
    const onPress = (e: MouseEvent) => {
      if (!e.isTrusted && !inRetryPress()) return;
      const t = e.target instanceof Element ? e.target.closest('button, input[type="submit"], [role="button"]') : null;
      if (!t || t.closest(IGNORE_SELECTOR)) return;
      const scope = scopeOf(t);
      // Inside a form/dialog any button may be its save; outside one, only a "Save…" button
      // (a page-level save) counts, and it covers every field on the page.
      if (scope) arm = { scope, at: Date.now() };
      else if (pickSaveButton([labelOf(t)]) === 0) arm = { scope: document.body, at: Date.now() };
    };
    // On the page itself (no form around it) a field may save itself when you
    // leave it or press Enter — an inline edit, a message box. Inside a form
    // that is the form's own Save / submit, armed above.
    const armLoose = (t: EventTarget | null) => {
      const el = guardable(t);
      if (el && dirty.has(el) && !scopeOf(el)) arm = { scope: el, at: Date.now() };
    };
    const onLeaveField = (e: FocusEvent) => armLoose(e.target);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) armLoose(e.target);
    };
    const onSubmit = (e: Event) => {
      if (!(e.target instanceof HTMLFormElement)) return;
      if (arm && Date.now() - arm.at < 1000 && related(arm.scope, e.target)) return; // already armed by its button
      arm = { scope: e.target, at: Date.now() };
    };
    // The copy is written the moment the page is going away, not 800ms later.
    const onHide = () => flushDrafts();
    const onVis = () => { if (document.visibilityState === 'hidden') flushDrafts(); };
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('click', onPress, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('focusout', onLeaveField, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('focusout', onLeaveField, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('click', onPress, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* Coming back: forms with a copy waiting fill themselves in once their own data has landed. */
  useEffect(() => {
    let timer = 0;
    let waited = 0;
    const run = () => {
      timer = 0;
      const s = store();
      if (!s || !draftKeysForRoute(s, window.location.pathname).length) return; // nothing kept for this screen
      if (inflightReads > 0 && waited < 6000) { waited += 300; timer = window.setTimeout(run, 300); return; }
      waited = 0;
      try { scanRestore((m, t, o) => toastRef.current(m, t, o)); } catch (e) { console.error('[draft] restore', e); }
    };
    const later = (ms = 450) => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(run, ms); };
    const mo = new MutationObserver(() => later());
    // A dialog kept in the page and only shown (hidden / open flips) counts as appearing too.
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'data-open', 'aria-hidden'] });
    later(700);
    return () => { mo.disconnect(); if (timer) window.clearTimeout(timer); };
  }, [pathname]);

  /* Leaving: links, the browser's own exits, history, and router moves through useGuardedRouter. */
  useEffect(() => {
    installHistoryIndex();
    const onLink = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (openRef.current || isPageGuardDirty()) return; // a page's own guard answers for itself
      const a = e.target instanceof Element ? (e.target.closest('a[href]') as HTMLAnchorElement | null) : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const raw = a.getAttribute('href') || '';
      if (!raw || raw.startsWith('#')) return;
      let url: URL;
      try { url = new URL(raw, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!liveDirty().length) return;
      // Capture on document runs before React's delegated handlers: this stops Next's <Link>.
      e.preventDefault();
      e.stopPropagation();
      const href = url.pathname + url.search + url.hash;
      ask(() => runUnguarded(() => router.push(href)));
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      flushDrafts();
      if (!liveDirty().length) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Registered before the App Router's own listener, and on capture: this runs first.
    const onPop = (e: PopStateEvent) => {
      const to = idxOf(e.state);
      if (popIgnore > 0) { popIgnore--; e.stopImmediatePropagation(); return; } // our own step back to the work
      if (popBypass > 0) { popBypass--; if (to != null) { curIdx = to; rememberIdx(); } return; } // they chose to leave
      flushDrafts();
      if (to == null) return; // an entry from before this page loaded: let it go (the draft is kept)
      const delta = curIdx - to;
      if (!delta) return;
      // Not guarded, or a Back the user already confirmed (the top bar's Back after "Discard changes").
      if (!isNavGuarded() || justConfirmedLeave()) { curIdx = to; rememberIdx(); return; }
      e.stopImmediatePropagation();
      popIgnore++;
      // A move that never lands must not swallow the next real Back.
      window.setTimeout(() => { popIgnore = 0; }, 1500);
      window.history.go(delta);
      requestNavigation(() => {
        popBypass++;
        window.setTimeout(() => { popBypass = 0; }, 1500);
        window.history.go(-delta);
      }, null);
    };
    document.addEventListener('click', onLink, true);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('popstate', onPop, true);
    const unregister = registerNavGuard({ isDirty: () => liveDirty().length > 0, intercept: (proceed) => ask(proceed), fallback: true });
    return () => {
      document.removeEventListener('click', onLink, true);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('popstate', onPop, true);
      unregister();
    };
  }, [ask, router]);

  /* Closing a dialog or form with unsaved changes: Cancel / × buttons, a tap outside, Escape. */
  useEffect(() => {
    let replaying = 0;
    const replay = (fn: () => void) => {
      // After the prompt has gone (a dialog's own Escape handler only acts when it is the top one).
      window.setTimeout(() => { replaying++; try { fn(); } finally { replaying--; } }, 0);
    };
    const workIn = (container: Element) => liveDirty().filter((f) => container.contains(f));
    const skip = (e: Event) => replaying > 0 || openRef.current || !e.isTrusted || isPageGuardDirty();

    const onCloseButton = (e: MouseEvent) => {
      if (skip(e) || e.defaultPrevented || e.button !== 0) return;
      const t = e.target instanceof Element ? e.target.closest<HTMLElement>('button, [role="button"]') : null;
      if (!t || t.closest('[data-no-guard]') || !scopeOf(t)) return;
      if (!isCloseLabel(t.textContent || (t as HTMLInputElement).value || '', t.getAttribute('aria-label'))) return;
      const container = draftScopeOf(t) || scopeOf(t);
      if (!container || !workIn(container).length) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      ask(() => replay(() => { if (t.isConnected) t.click(); }), container);
    };

    let heldBackdrop: HTMLElement | null = null;
    const onBackdrop = (e: MouseEvent) => {
      if (skip(e) || e.button !== 0) return;
      const t = e.target;
      if (!(t instanceof HTMLElement) || t === document.body || t === document.documentElement) return;
      if (t.closest(SCOPE_SELECTOR) || t.closest('[data-no-guard]')) return; // inside the form: not outside it
      if (e.type === 'click' && heldBackdrop && heldBackdrop !== t) { heldBackdrop = null; return; }
      // A backdrop: fixed, covering the screen, holding a dialog (or a page's own form panel).
      const dlg = t.querySelector<HTMLElement>(DIALOG_SELECTOR) || t.querySelector<HTMLElement>('form');
      if (!dlg || !workIn(dlg).length || getComputedStyle(t).position !== 'fixed') return;
      const r = t.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9 || t.querySelector('.main-content-area')) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.type === 'mousedown') { heldBackdrop = t; return; } // ask on the click that follows
      heldBackdrop = null;
      ask(() => replay(() => {
        if (!t.isConnected) return;
        for (const type of ['mousedown', 'mouseup', 'click']) t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      }), dlg);
    };

    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || skip(e)) return;
      const t = e.target instanceof Element ? e.target : null;
      // Escape in an open dropdown closes the dropdown, not the form.
      if (t && (t.closest('[role="listbox"], [role="menu"]') || t.getAttribute('aria-expanded') === 'true')) return;
      const modals = [...document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)].filter(visible);
      const top = modals[modals.length - 1];
      if (!top || top.closest('[data-no-guard]') || !workIn(top).length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = t && top.contains(t) ? t : top;
      ask(() => replay(() => {
        if (target.isConnected) target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      }), top);
    };

    document.addEventListener('click', onCloseButton, true);
    document.addEventListener('mousedown', onBackdrop, true);
    document.addEventListener('click', onBackdrop, true);
    window.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('click', onCloseButton, true);
      document.removeEventListener('mousedown', onBackdrop, true);
      document.removeEventListener('click', onBackdrop, true);
      window.removeEventListener('keydown', onEscape, true);
    };
  }, [ask]);

  const leave = useCallback(() => {
    setOpen(false);
    const go = proceedRef.current;
    proceedRef.current = null;
    closingRef.current = null;
    go?.();
  }, []);

  const stay = useCallback(() => {
    setOpen(false);
    proceedRef.current = null;
    closingRef.current = null;
  }, []);

  /** The fields this prompt is about: one dialog's, or every unsaved one. */
  const fieldsInPlay = useCallback(() => {
    const c = closingRef.current;
    return liveDirty().filter((f) => !c || c.contains(f));
  }, []);

  const discard = useCallback(() => {
    const fields = fieldsInPlay();
    dropDraftsOf(fields);
    for (const f of fields) dirty.delete(f);
    leave();
  }, [fieldsInPlay, leave]);

  const keepDraftAndLeave = useCallback(() => {
    flushDrafts();
    for (const f of fieldsInPlay()) dirty.delete(f);
    leave();
  }, [fieldsInPlay, leave]);

  const saveAndLeave = useCallback(() => {
    const fields = fieldsInPlay();
    const found = findSave(fields[0]);
    if (!found || saving) return;
    const { btn, scope } = found;
    setSaving(true);
    const t0 = Date.now();
    let done = false;
    let timer = 0;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      waiter = null;
      setSaving(false);
      if (ok) {
        markClean(scope);
        leave();
      } else {
        stay();
        showToast("Couldn't save yet — check the form, then try again. Your draft is still on this device.", 'error');
        (liveDirty()[0] as HTMLElement | undefined)?.focus?.();
      }
    };
    waiter = {
      scope,
      started: false,
      onDone: (ok) => {
        // A failed request the page handled by closing the form (e.g. queued offline) still counts as saved.
        if (ok) finish(true);
        else window.setTimeout(() => finish(!fields.some((f) => f.isConnected)), 1500);
      },
    };
    arm = { scope, at: t0 };
    btn.click();
    timer = window.setInterval(() => {
      if (!fields.some((f) => f.isConnected)) return finish(true); // the form closed itself after saving
      const w = waiter;
      if (w && !w.started && Date.now() - t0 > NO_START_MS) return finish(false); // validation stopped it
      if (Date.now() - t0 > SAVE_TIMEOUT_MS) finish(false);
    }, 250);
  }, [fieldsInPlay, leave, saving, showToast, stay]);

  const api: UnsavedGuardApi = {
    confirmOpen: open,
    pendingHref: null,
    saving,
    canSave,
    hasDraft,
    formName,
    stay,
    discard,
    saveAndLeave,
    keepDraftAndLeave,
    clearDraft: () => {},
    requestLeave: (href: string) => (liveDirty().length ? ask(() => runUnguarded(() => router.push(href))) : router.push(href)),
    requestClose: (action: () => void) => (liveDirty().length ? ask(action) : action()),
  };
  return <UnsavedGuardModal guard={api} />;
}
