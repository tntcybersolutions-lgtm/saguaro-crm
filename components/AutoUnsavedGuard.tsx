'use client';
/**
 * AutoUnsavedGuard — the app-wide unsaved-changes gate, mounted once in the
 * app shell (app/app/layout.tsx). Every screen gets it; no page wires anything.
 *
 * While the user has changed a field in a form or dialog, or typed text on the
 * page (see lib/autoGuard for exactly what counts), and tries to leave — a link, the sidebar, a bottom
 * tab, the top bar's Back — it asks:
 *
 *     Unsaved changes        [Discard]  [Keep editing]  [Save and exit]
 *
 * Save and exit presses the form's own Save button and leaves only when that
 * save succeeds; if it fails (or the form wants a required field) the dialog
 * closes on the form so the user sees why. Closing or reloading the tab gets
 * the browser's own "Leave site?" prompt.
 *
 * A page with its own useUnsavedGuard (46 of them: drafts, custom saves) keeps
 * it — this one stands aside whenever a page guard is dirty (lib/navGuard).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { registerNavGuard, isPageGuardDirty, runUnguarded } from '@/lib/navGuard';
import { SCOPE_SELECTOR, IGNORE_SELECTOR, isGuardableField, isLooseWorkField, pickSaveButton, isSaveRequest } from '@/lib/autoGuard';
import type { UnsavedGuardApi } from '@/lib/useUnsavedGuard';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
type Arm = { scope: Element | null; at: number };
type Waiter = { scope: Element | null; started: boolean; onDone: (ok: boolean) => void };

const ARM_WINDOW_MS = 10_000;
const NO_START_MS = 4_000;
const SAVE_TIMEOUT_MS = 20_000;

/* ── Module state: one shell, one gate ─────────────────────────────────── */
const baseline = new WeakMap<Element, string>();
const dirty = new Set<Field>();
let arm: Arm | null = null;
let waiter: Waiter | null = null;

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

/** Mark a container's fields (or every field) saved: their current values are the new baseline. */
function markClean(scope: Element | null) {
  for (const el of [...dirty]) {
    if (!scope || scope === document.body || scope.contains(el)) {
      baseline.set(el, valueOf(el));
      dirty.delete(el);
    }
  }
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

/* ── Which save request belongs to which form ──────────────────────────── */
function hookFetch() {
  const w = window as Window & { __sagFetchHooked?: boolean };
  if (w.__sagFetchHooked || typeof w.fetch !== 'function') return;
  w.__sagFetchHooked = true;
  const original = w.fetch.bind(w);
  w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let mine: Arm | null = null;
    try {
      const req = input instanceof Request ? input : null;
      const method = String(init?.method || req?.method || 'GET');
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (req as Request).url, window.location.href);
      if (url.origin === window.location.origin && isSaveRequest(method, url.pathname) && arm && Date.now() - arm.at < ARM_WINDOW_MS) {
        mine = arm;
        if (waiter && related(waiter.scope, mine.scope)) waiter.started = true;
      }
    } catch {
      mine = null; /* an unparseable request is never a form save */
    }
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
      if (mine && waiter && related(waiter.scope, mine.scope)) waiter.onDone(false);
      throw e;
    }
  };
}

export default function AutoUnsavedGuard() {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const proceedRef = useRef<(() => void) | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const ask = useCallback((proceed: () => void) => {
    const fields = liveDirty();
    proceedRef.current = proceed;
    setCanSave(!!findSave(fields[0]));
    setOpen(true);
  }, []);

  /* Track what the user changes, and which button press a save belongs to. */
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
      // A toggle or picker that saves itself the moment it changes.
      if (e.type === 'change' && (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && /checkbox|radio/.test(el.type)))) {
        arm = { scope: scopeOf(el), at: Date.now() };
      }
    };
    const onPress = (e: MouseEvent) => {
      if (!e.isTrusted) return;
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
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('click', onPress, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('focusout', onLeaveField, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusout', onLeaveField, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('click', onPress, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  /* Leaving: links, the browser's own exits, and router moves through useGuardedRouter. */
  useEffect(() => {
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
      if (!liveDirty().length) return;
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('click', onLink, true);
    window.addEventListener('beforeunload', onUnload);
    const unregister = registerNavGuard({ isDirty: () => liveDirty().length > 0, intercept: (proceed) => ask(proceed), fallback: true });
    return () => {
      document.removeEventListener('click', onLink, true);
      window.removeEventListener('beforeunload', onUnload);
      unregister();
    };
  }, [ask, router]);

  const leave = useCallback(() => {
    setOpen(false);
    const go = proceedRef.current;
    proceedRef.current = null;
    go?.();
  }, []);

  const stay = useCallback(() => {
    setOpen(false);
    proceedRef.current = null;
  }, []);

  const discard = useCallback(() => {
    dirty.clear();
    leave();
  }, [leave]);

  const saveAndLeave = useCallback(() => {
    const fields = liveDirty();
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
        showToast("Couldn't save yet — check the form, then try again.", 'error');
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
  }, [leave, saving, showToast, stay]);

  const api: UnsavedGuardApi = {
    confirmOpen: open,
    pendingHref: null,
    saving,
    canSave,
    hasDraft: false,
    stay,
    discard,
    saveAndLeave,
    keepDraftAndLeave: discard,
    clearDraft: () => {},
    requestLeave: (href: string) => (liveDirty().length ? ask(() => runUnguarded(() => router.push(href))) : router.push(href)),
    requestClose: (action: () => void) => (liveDirty().length ? ask(action) : action()),
  };
  return <UnsavedGuardModal guard={api} />;
}
