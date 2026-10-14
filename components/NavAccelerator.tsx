'use client';

/**
 * NavAccelerator — makes every tap in the app answer instantly.
 *
 * Before: tapping a link or row showed nothing until the next page's code and
 * data had arrived (0.5–2s on a phone). The screen looked frozen, then the new
 * page painted all at once.
 *
 * Two things, mounted once in the app shell:
 *  1. Preload on intent. The moment a finger lands on (touchstart) or a mouse
 *     rests on (pointerenter) an in-app link, its page is prefetched — the
 *     100–300ms between touch and release is spent loading, not waiting.
 *  2. Instant feedback. On the click itself a thin bar runs across the top of
 *     the screen and the tapped item dims slightly, so the app visibly answers
 *     at once. Both clear the moment the new page is on screen (or after 12s).
 *
 * A move an unsaved-changes guard cancels never reaches router.push, so it
 * never starts the bar.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function internalHref(target: EventTarget | null): { a: HTMLAnchorElement; path: string } | null {
  const a = target instanceof Element ? (target.closest('a[href]') as HTMLAnchorElement | null) : null;
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
  const raw = a.getAttribute('href') || '';
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return null;
  let url: URL;
  try { url = new URL(raw, window.location.href); } catch { return null; }
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/app')) return null;
  return { a, path: url.pathname + url.search };
}

export default function NavAccelerator() {
  const router = useRouter();
  const pathname = usePathname();
  // The bar is driven straight on the DOM, not through React state: Next runs
  // every navigation inside startTransition, so a state update made there is
  // held back and painted together with the new page — the feedback would
  // only appear once it was no longer needed.
  const bar = useRef<HTMLDivElement | null>(null);
  const pressed = useRef<HTMLElement | null>(null);
  const lastTap = useRef<{ a: HTMLAnchorElement; at: number } | null>(null);
  const prefetched = useRef<Set<string>>(new Set());
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    bar.current?.setAttribute('data-on', '0');
    if (pressed.current) { pressed.current.removeAttribute('data-nav-pressed'); pressed.current = null; }
    if (safety.current) { clearTimeout(safety.current); safety.current = null; }
  }, []);

  const start = useCallback(() => {
    clear();
    bar.current?.setAttribute('data-on', '1');
    const tap = lastTap.current;
    if (tap && Date.now() - tap.at < 1000 && tap.a.isConnected) {
      pressed.current = tap.a;
      tap.a.setAttribute('data-nav-pressed', '');
    }
    safety.current = setTimeout(clear, 12_000);
  }, [clear]);

  // New page on screen → done.
  useEffect(() => { clear(); }, [pathname, clear]);

  // A visitor who came in through a marketing page (ad tags loaded there) and
  // then signed in keeps those tags in memory; switch them off for the app so
  // they stop re-firing on every page change. (gtag honors ga-disable-<id>.)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    for (const id of [process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, process.env.NEXT_PUBLIC_GOOGLE_ADS_ID]) {
      if (id) w[`ga-disable-${id}`] = true;
    }
  }, []);

  useEffect(() => {
    const prefetch = (e: Event) => {
      const hit = internalHref(e.target);
      if (!hit) return;
      if (e.type === 'touchstart' || e.type === 'pointerdown') lastTap.current = { a: hit.a, at: Date.now() };
      if (prefetched.current.has(hit.path)) return;
      prefetched.current.add(hit.path);
      try { router.prefetch(hit.path); } catch (err) { console.warn('prefetch', err); }
    };

    // Every in-app move goes through router.push — <Link> clicks included (Next
    // calls the shell's router object), and rows, cards and buttons that
    // navigate in code. Wrapping it here gives all of them the instant bar.
    // A click an unsaved-changes guard cancels never reaches push, so a
    // cancelled move never starts the bar.
    const r = router as unknown as { push: (href: string, o?: unknown) => void };
    const originalPush = r.push;
    r.push = function wrappedPush(href: string, o?: unknown) {
      try {
        const url = new URL(href, window.location.href);
        const here = window.location.pathname + window.location.search;
        if (url.origin === window.location.origin && url.pathname + url.search !== here) start();
      } catch (err) { console.warn('nav bar', err); }
      return originalPush.call(this, href, o);
    };

    document.addEventListener('touchstart', prefetch, { capture: true, passive: true });
    document.addEventListener('pointerdown', prefetch, { capture: true, passive: true });
    document.addEventListener('pointerenter', prefetch, { capture: true, passive: true });
    document.addEventListener('focusin', prefetch, true);
    return () => {
      document.removeEventListener('touchstart', prefetch, true);
      document.removeEventListener('pointerdown', prefetch, true);
      document.removeEventListener('pointerenter', prefetch, true);
      document.removeEventListener('focusin', prefetch, true);
      r.push = originalPush;
      if (safety.current) clearTimeout(safety.current);
    };
  }, [router, start]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={bar} className="nav-accel" data-on="0" aria-hidden="true"><span /></div>
    </>
  );
}

const CSS = `
.nav-accel{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483000;pointer-events:none;opacity:0;transition:opacity .15s}
.nav-accel[data-on="1"]{opacity:1}
.nav-accel span{display:block;height:100%;width:0;background:var(--brand-primary);box-shadow:0 0 8px var(--brand-primary)}
.nav-accel[data-on="1"] span{animation:navAccelRun 8s cubic-bezier(.1,.7,.2,1) forwards}
@keyframes navAccelRun{0%{width:0}10%{width:45%}40%{width:75%}100%{width:94%}}
[data-nav-pressed]{opacity:.65;transition:opacity .08s}
@media (prefers-reduced-motion: reduce){.nav-accel[data-on="1"] span{animation:none;width:70%}}
`;
