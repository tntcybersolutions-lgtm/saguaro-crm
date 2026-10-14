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
 * Links whose click a page cancels (an unsaved-changes guard, a menu) never
 * start the bar — it starts only once the click is still live after every
 * handler has run.
 */

import { useEffect, useRef, useState } from 'react';
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
  const [busy, setBusy] = useState(false);
  const pressed = useRef<HTMLElement | null>(null);
  const prefetched = useRef<Set<string>>(new Set());
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    setBusy(false);
    if (pressed.current) { pressed.current.removeAttribute('data-nav-pressed'); pressed.current = null; }
    if (safety.current) { clearTimeout(safety.current); safety.current = null; }
  };

  // New page on screen → done.
  useEffect(() => { clear(); }, [pathname]);

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
      if (!hit || prefetched.current.has(hit.path)) return;
      prefetched.current.add(hit.path);
      try { router.prefetch(hit.path); } catch (err) { console.warn('prefetch', err); }
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const hit = internalHref(e.target);
      if (!hit) return;
      const here = window.location.pathname + window.location.search;
      if (hit.path === here) return;
      clear();
      pressed.current = hit.a;
      hit.a.setAttribute('data-nav-pressed', '');
      setBusy(true);
      safety.current = setTimeout(clear, 12_000);
    };

    // Rows, cards and buttons that move with router.push (not a link) get the
    // same instant bar: the shell's router is the one object every page's
    // useRouter() returns, so wrapping push here covers them all.
    const r = router as unknown as { push: (href: string, o?: unknown) => void };
    const originalPush = r.push;
    r.push = function wrappedPush(href: string, o?: unknown) {
      try {
        const url = new URL(href, window.location.href);
        const here = window.location.pathname + window.location.search;
        if (url.origin === window.location.origin && url.pathname + url.search !== here) {
          clear();
          setBusy(true);
          safety.current = setTimeout(clear, 12_000);
        }
      } catch { /* not a URL we can read — navigate without the bar */ }
      return originalPush.call(this, href, o);
    };

    document.addEventListener('touchstart', prefetch, { capture: true, passive: true });
    document.addEventListener('pointerenter', prefetch, { capture: true, passive: true });
    document.addEventListener('focusin', prefetch, true);
    // Bubble phase: runs after the page's own handlers, so a cancelled click is seen as cancelled.
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('touchstart', prefetch, true);
      document.removeEventListener('pointerenter', prefetch, true);
      document.removeEventListener('focusin', prefetch, true);
      document.removeEventListener('click', onClick);
      r.push = originalPush;
      if (safety.current) clearTimeout(safety.current);
    };
  }, [router]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="nav-accel" data-on={busy ? '1' : '0'} aria-hidden="true"><span /></div>
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
