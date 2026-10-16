'use client';
import { useEffect, useRef } from 'react';

/**
 * `?new=1` on a screen's link opens its "new" form once the screen is ready —
 * the Photo sheet's field shortcuts (Daily Log, Punch Item, RFI) land straight
 * in the form instead of on the list one tap short. The flag is taken off the
 * address so a reload or Back doesn't open it again.
 */
export function useOpenOnNew(open: () => void, ready: boolean): void {
  const done = useRef(false);
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    if (done.current || !ready) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('new') !== '1') return;
    done.current = true;
    url.searchParams.delete('new');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    latest.current();
  }, [ready]);
}

/**
 * `?open=<id>` on a screen's link opens that record once the list has loaded —
 * a search hit lands on the exact RFI, submittal, change order, punch item or
 * sub, not on the list one tap short. Same rules as `?new=1`: runs once, and
 * the flag comes off the address so a reload or Back doesn't reopen it.
 */
export function useOpenRecord(open: (id: string) => void, ready: boolean): void {
  const done = useRef(false);
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    if (done.current || !ready) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('open');
    if (!id) return;
    done.current = true;
    url.searchParams.delete('open');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    latest.current(id);
  }, [ready]);
}
