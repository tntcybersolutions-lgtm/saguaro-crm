'use client';
/**
 * navGuard — the router-level half of the unsaved-work guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * `useUnsavedGuard` (lib/useUnsavedGuard.ts) intercepts in-app navigation with a
 * capture-phase click listener that looks for `<a href>`. That covers the main
 * `/app` sidebar, which renders every module link as a Next `<Link>` (a real
 * anchor).
 *
 * It does NOT cover navigation that never touches an anchor:
 *   • app/field/layout.tsx — the ENTIRE field shell (desktop rail, phone bottom
 *     nav, slide-out module menu, breadcrumb, hardware back) is
 *     `<button onClick={() => router.push(...)}>`. No anchor, no interception:
 *     a foreman mid-form who tapped a different module icon lost the form.
 *   • AppTopBar back button + notification bell, NotificationBell /
 *     NotificationCenter row taps, ProjectSwitcher, CommandPalette (⌘K),
 *     GlobalShortcuts.
 *
 * There are no cancellable route events in the App Router, so the fix is to put
 * the check in front of the navigation call itself: nav surfaces call
 * `useGuardedRouter()` instead of `useRouter()`, and any mounted dirty form
 * gets to intercept before the push happens.
 *
 * RULE FOR NEW NAV CODE: anything in the app shell that navigates on a click
 * handler (rather than an <a>/<Link>) must use `useGuardedRouter()`. Feature
 * pages navigating after their own save are fine on plain `useRouter()` — they
 * are not "leaving with unsaved work".
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

export interface NavGuardEntry {
  /** True while the registering form holds unsaved work. */
  isDirty: () => boolean;
  /** Open the Save / Discard / Stay confirm; run `proceed` if the user leaves. */
  intercept: (proceed: () => void, href: string | null) => void;
  /** The app shell's automatic gate (components/AutoUnsavedGuard): asked only
   *  when no page's own guard is dirty, since a page's guard knows how to save. */
  fallback?: boolean;
}

const entries = new Set<NavGuardEntry>();
let bypassDepth = 0;

/** Register a dirty-form guard. Returns the unregister function. */
export function registerNavGuard(entry: NavGuardEntry): () => void {
  entries.add(entry);
  return () => {
    entries.delete(entry);
  };
}

/** Run a navigation without re-entering the guard (used to resume after confirm). */
export function runUnguarded<T>(fn: () => T): T {
  bypassDepth++;
  try {
    return fn();
  } finally {
    bypassDepth--;
  }
}

function dirtyOf(e: NavGuardEntry): boolean {
  try {
    return e.isDirty();
  } catch {
    return false; /* a broken predicate must never wedge navigation */
  }
}

/** Page guards first, then the shell's fallback. */
function ordered(): NavGuardEntry[] {
  const all = [...entries];
  return [...all.filter((e) => !e.fallback), ...all.filter((e) => e.fallback)];
}

/** True when a page's own guard (not the shell fallback) holds unsaved work. */
export function isPageGuardDirty(): boolean {
  for (const e of entries) if (!e.fallback && dirtyOf(e)) return true;
  return false;
}

/** True when some mounted form currently holds unsaved work. */
export function isNavGuarded(): boolean {
  if (bypassDepth > 0) return false;
  for (const e of entries) {
    try {
      if (e.isDirty()) return true;
    } catch {
      /* a broken predicate must never wedge navigation */
    }
  }
  return false;
}

/**
 * Ask the armed guard (if any) for permission to navigate.
 * Returns true when the move was intercepted — the caller must NOT navigate;
 * `proceed` runs later if the user chooses to leave.
 */
export function requestNavigation(proceed: () => void, href: string | null = null): boolean {
  if (bypassDepth > 0) return false;
  for (const e of ordered()) {
    if (!dirtyOf(e)) continue;
    e.intercept(() => runUnguarded(proceed), href);
    return true;
  }
  return false;
}

/** Same-page moves (query/hash only) are not "leaving" — never guard them. */
function isSamePath(href: string): boolean {
  if (typeof window === 'undefined') return false;
  if (href.startsWith('#')) return true;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    return url.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

export interface GuardedRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

/**
 * Drop-in replacement for `useRouter()` on app-shell navigation surfaces.
 * `push` / `replace` / `back` route through any armed unsaved-work guard;
 * `refresh` / `prefetch` / `forward` pass straight through.
 */
export function useGuardedRouter(): GuardedRouter {
  const router = useRouter();
  return useMemo<GuardedRouter>(
    () => ({
      push: (href: string) => {
        const go = () => router.push(href);
        if (isSamePath(href) || !requestNavigation(go, href)) go();
      },
      replace: (href: string) => {
        const go = () => router.replace(href);
        if (isSamePath(href) || !requestNavigation(go, href)) go();
      },
      back: () => {
        const go = () => router.back();
        if (!requestNavigation(go, null)) go();
      },
      forward: () => router.forward(),
      refresh: () => router.refresh(),
      prefetch: (href: string) => {
        try {
          router.prefetch(href);
        } catch {
          /* prefetch is best-effort */
        }
      },
    }),
    [router]
  );
}
