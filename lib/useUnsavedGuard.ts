'use client';
/**
 * useUnsavedGuard — reusable unsaved-work protection for form pages.
 *
 * The owner mandate: nothing may let a GC back out of a form page and silently
 * lose their work. This hook provides three layers of protection:
 *
 *   1. HARD EXITS (tab close / refresh / external link): a native
 *      `beforeunload` prompt while the form is dirty.
 *   2. IN-APP NAVIGATION (sidebar / any <a> click): the App Router has no
 *      router events to cancel, so a capture-phase click listener intercepts
 *      internal anchor clicks while dirty and opens the house
 *      Save / Discard / Stay confirm (<UnsavedGuardModal guard={guard} />).
 *   3. DRAFT AUTOSAVE: dirty form data is debounced into localStorage
 *      (`sag_draft:u:<signed-in user>:<key>` — one person's draft never comes back
 *      for another on a shared device), flushed synchronously on pagehide/popstate, and
 *      restored with a "Draft restored from 2:14 PM" toast (Undo / Discard) on return. Cleared on save or
 *      explicit discard. This also covers the browser BACK button, which the
 *      App Router handles before any guard can cancel it — the work is never
 *      lost, it comes back as a draft.
 *
 * Usage:
 *   const guard = useUnsavedGuard({
 *     dirty: isDirty,
 *     draftKey: `invoice:${id}`,          // per route + record
 *     draftData: form,                    // serializable snapshot
 *     restoreDraft: (d) => setForm(d),    // also open the composer if needed
 *     draftEnabled: !loading,             // gate until initial data loaded
 *     onSave: async () => saveForm(),     // return true on success
 *   });
 *   ...
 *   <UnsavedGuardModal guard={guard} />   // from '@/components/UnsavedGuardModal'
 *   ...
 *   guard.clearDraft();                   // after your own successful save
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { registerNavGuard } from '@/lib/navGuard';
import { formNoun } from '@/lib/autoGuard';
import { restoredLabel, pageDraftKey, getDraftOwner, subscribeDraftOwner } from '@/lib/autoDraft';

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // drafts older than 7 days are dropped
const AUTOSAVE_DEBOUNCE_MS = 800;

export interface UnsavedGuardOptions<T = unknown> {
  /** The page's dirty predicate — guard layers arm only while true. */
  dirty: boolean;
  /** Unique per route + record (e.g. 'invoice-create', `invoice:${id}`). Enables draft autosave. */
  draftKey?: string;
  /** Serializable snapshot of the form; autosaved (debounced) while dirty. */
  draftData?: T;
  /** Called once with the stored draft on return; set your form state (and open the form) here. */
  restoreDraft?: (draft: T) => void;
  /** Gate the one-shot restore until the page's initial data has loaded. Default true. */
  draftEnabled?: boolean;
  /** Save handler for "Save & leave". Return true on success (navigation proceeds). */
  onSave?: () => boolean | Promise<boolean>;
  /** What the form edits, for the leave prompt ("RFI", "New daily log"). */
  formName?: string;
}

export interface UnsavedGuardApi {
  /** True while the Save / Discard / Stay confirm should be shown. */
  confirmOpen: boolean;
  /** Where the user was headed when intercepted. */
  pendingHref: string | null;
  /** True while onSave is running from "Save & leave". */
  saving: boolean;
  /** Whether an onSave handler was provided (modal hides the save button otherwise). */
  canSave: boolean;
  /** Whether draft autosave is active (a draftKey was provided). */
  hasDraft: boolean;
  /** What the form edits, in a sentence ("RFI"), when known. */
  formName?: string;
  /** Keep editing — close the confirm, stay on the page. */
  stay: () => void;
  /** Leave without saving — clears the draft and navigates. */
  discard: () => void;
  /** Run onSave; on success clear the draft and navigate. */
  saveAndLeave: () => void;
  /** Flush the draft to this device and navigate — for pages with no direct
   *  save handler (e.g. the estimate workspace). */
  keepDraftAndLeave: () => void;
  /** Clear the stored draft (call after your own successful save). */
  clearDraft: () => void;
  /** Programmatic navigation through the guard (e.g. custom Back buttons). */
  requestLeave: (href: string) => void;
  /** Gate a non-navigation dismissal (Cancel / Close / X buttons) through the
   *  same confirm. Runs the action immediately when clean; on Discard the
   *  draft is cleared first (Cancel means cancel). */
  requestClose: (action: () => void) => void;
}

/* ── Dirty detection helpers ────────────────────────────────────────────────
 * Most module pages are "open a composer, type, save". Hand-enumerating every
 * field in a dirty predicate does not scale to 100+ forms and rots the moment
 * a field is added, so these compare the live form against the state it had
 * when the composer opened. Anything the user typed shows up; a composer they
 * only looked at does not.
 */

/** Treat '', null, undefined, [], {} and NaN as "nothing typed here". */
function isBlank(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (typeof v === 'number') return Number.isNaN(v);
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Date) return false;
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(isBlank);
  return false;
}

/** Structural equality that ignores blank-vs-absent differences. */
export function formValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isBlank(a) && isBlank(b)) return true;
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : a;
    const bt = b instanceof Date ? b.getTime() : b;
    return at === bt;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => formValuesEqual(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      if (!formValuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
}

/**
 * True once the user has changed anything in an open composer.
 *
 * Snapshots `value` on the first render where the composer is open (and, if
 * given, `ready` — use it to wait out an async record load on edit forms so a
 * late-arriving record is not mistaken for typing). Resets when it closes.
 *
 *   const dirty = useComposerDirty(showCreate, form);
 *   const dirty = useComposerDirty(!!editing, form, !loadingRecord);
 */
export function useComposerDirty<T>(open: boolean, value: T, ready = true): boolean {
  const baselineRef = useRef<{ open: boolean; snapshot: T } | null>(null);
  if (!open || !ready) {
    if (baselineRef.current && !open) baselineRef.current = null;
  } else if (!baselineRef.current) {
    baselineRef.current = { open: true, snapshot: value };
  }
  if (!open || !ready || !baselineRef.current) return false;
  return !formValuesEqual(value, baselineRef.current.snapshot);
}

function readDraft<T>(key: string): { t: number; data: T } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t?: number; data?: T };
    if (!parsed || typeof parsed.t !== 'number' || parsed.data === undefined) return null;
    if (Date.now() - parsed.t > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { t: parsed.t, data: parsed.data };
  } catch {
    return null;
  }
}

function writeDraft(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* storage full / unavailable — best-effort */
  }
}

function removeDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useUnsavedGuard<T = unknown>(opts: UnsavedGuardOptions<T>): UnsavedGuardApi {
  const { dirty, draftKey: pageKey, draftData, restoreDraft, draftEnabled = true, onSave, formName } = opts;
  // Kept under the signed-in user's name; nothing is kept until the shell knows who that is.
  const owner = useSyncExternalStore(subscribeDraftOwner, getDraftOwner, () => null);
  const draftKey = pageKey && owner ? pageDraftKey(owner, pageKey) : undefined;
  const router = useRouter();
  const { showToast } = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Latest values in refs so document-level listeners never go stale.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const draftDataRef = useRef(draftData);
  draftDataRef.current = draftData;
  const confirmOpenRef = useRef(confirmOpen);
  confirmOpenRef.current = confirmOpen;
  const restoredRef = useRef(false);

  /* ── Layer 1: hard exits (close tab / refresh / external nav) ─────────── */
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Flush the draft first — even if they leave anyway, the work survives.
      if (draftKey && draftDataRef.current !== undefined) writeDraft(draftKey, draftDataRef.current);
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, draftKey]);

  /* ── Layer 2: in-app link clicks (sidebar, breadcrumbs, any <a>) ──────── */
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (confirmOpenRef.current) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const rawHref = anchor.getAttribute('href') || '';
      if (!rawHref || rawHref.startsWith('#')) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(rawHref, window.location.href);
      } catch {
        return;
      }
      // External destinations fall through to the beforeunload prompt.
      if (url.origin !== window.location.origin) return;
      // Same-page (query/hash only) moves are not "leaving".
      if (url.pathname === window.location.pathname) return;
      // Capture phase on document runs before React's delegated handlers, so
      // stopPropagation reliably blocks Next.js <Link> client navigation.
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
      setConfirmOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  /* ── Layer 3a: browser back / pagehide — synchronous draft flush ──────── */
  // The App Router processes popstate before a guard can cancel it, so the
  // back button can't show the modal — instead the draft is flushed the
  // instant it fires, and the work comes back via "Draft restored" on return.
  useEffect(() => {
    if (!draftKey) return;
    const flush = () => {
      if (dirtyRef.current && draftDataRef.current !== undefined) writeDraft(draftKey, draftDataRef.current);
    };
    window.addEventListener('popstate', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('popstate', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [draftKey]);

  /* ── Layer 3b: debounced draft autosave while dirty ───────────────────── */
  useEffect(() => {
    if (!draftKey || !dirty || !draftEnabled || draftData === undefined) return;
    const t = setTimeout(() => writeDraft(draftKey, draftData), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draftKey, dirty, draftEnabled, draftData]);

  /* ── Layer 3c: one-shot draft restore on return ───────────────────────── */
  useEffect(() => {
    if (!draftKey || !draftEnabled || restoredRef.current || !restoreDraft) return;
    restoredRef.current = true;
    const stored = readDraft<T>(draftKey);
    if (stored === null) return;

    /* NEVER OVERWRITE WHAT THE USER HAS ALREADY TYPED.
     *
     * This restored unconditionally and announced it afterwards with a toast,
     * so a form the user had already started filling could be silently
     * replaced by an older draft — and the field would then hold text the
     * user never typed, at a caret position they did not choose. A project
     * called
     *
     *   ZZ TEST - Upload Verification (dele⟨ZZ TEST 2 - Speed Check (delete me)⟩te me)
     *
     * reached production that way: the second name landed at offset 35 of the
     * first instead of replacing it.
     *
     * If the form is already dirty the user's own input wins. The draft is
     * left on disk rather than dropped, so nothing is lost either way — it is
     * simply not forced over live typing. */
    if (dirtyRef.current) {
      showToast('You have unsaved changes here, so an older draft was left alone.', 'info');
      return;
    }

    try {
      // What the form held before — Undo / Discard put it back.
      const before = draftDataRef.current;
      restoreDraft(stored.data);
      const putBack = () => {
        if (before === undefined) return;
        try { restoreDraft(before); } catch (e) { console.error('[draft] undo', e); }
      };
      showToast(restoredLabel(stored.t), 'success', {
        actions: [
          { label: 'Undo', run: putBack },
          { label: 'Discard', run: () => { putBack(); removeDraft(draftKey); } },
        ],
      });
    } catch {
      /* corrupt draft — drop it rather than crash the form */
      removeDraft(draftKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, draftEnabled]);

  /* ── Modal actions ────────────────────────────────────────────────────── */
  // A pending non-navigation dismissal (Cancel / Close button) intercepted
  // while dirty; runs on Discard / after a successful Save instead of a push.
  const pendingActionRef = useRef<(() => void) | null>(null);

  const stay = useCallback(() => {
    setConfirmOpen(false);
    setPendingHref(null);
    pendingActionRef.current = null;
  }, []);

  const clearDraft = useCallback(() => {
    if (draftKey) removeDraft(draftKey);
  }, [draftKey]);

  const proceed = useCallback((href: string | null) => {
    setConfirmOpen(false);
    setPendingHref(null);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) action();
    else if (href) router.push(href);
  }, [router]);

  const discard = useCallback(() => {
    if (draftKey) removeDraft(draftKey);
    proceed(pendingHref);
  }, [draftKey, pendingHref, proceed]);

  const saveAndLeave = useCallback(async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      const ok = await onSave();
      if (ok) {
        if (draftKey) removeDraft(draftKey);
        proceed(pendingHref);
      }
      // On failure: stay open — the page surfaces its own error state.
    } finally {
      setSaving(false);
    }
  }, [onSave, saving, draftKey, pendingHref, proceed]);

  const keepDraftAndLeave = useCallback(() => {
    if (draftKey && draftDataRef.current !== undefined) writeDraft(draftKey, draftDataRef.current);
    proceed(pendingHref);
  }, [draftKey, pendingHref, proceed]);

  const requestLeave = useCallback((href: string) => {
    if (!dirtyRef.current) {
      router.push(href);
      return;
    }
    pendingActionRef.current = null;
    setPendingHref(href);
    setConfirmOpen(true);
  }, [router]);

  const requestClose = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setPendingHref(null);
    setConfirmOpen(true);
  }, []);

  /* ── Layer 2b: router-driven navigation (buttons, ⌘K, hardware back) ───── */
  // The field shell and several app-shell controls navigate with router.push()
  // from a click handler, never through an <a> — the capture-phase listener
  // above can't see those. Those surfaces call useGuardedRouter() (lib/navGuard),
  // which asks every mounted dirty form here before it moves.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const ownsDraftsRef = useRef(!!pageKey);
  ownsDraftsRef.current = !!pageKey;
  useEffect(() => {
    return registerNavGuard({
      isDirty: () => dirtyRef.current,
      intercept: (proceed) => requestCloseRef.current(proceed),
      // This page keeps its own draft; the shell's automatic one stays out.
      ownsDrafts: () => ownsDraftsRef.current,
    });
  }, []);

  return {
    confirmOpen,
    pendingHref,
    saving,
    canSave: !!onSave,
    hasDraft: !!draftKey,
    formName: formNoun(formName) || undefined,
    stay,
    discard,
    saveAndLeave,
    keepDraftAndLeave,
    clearDraft,
    requestLeave,
    requestClose,
  };
}
