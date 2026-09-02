'use client';

/**
 * useLiveStatus — a table's rows, kept current, and a note of what just moved.
 *
 * The status system is only half the promise. A pill that is accurate when the
 * page loaded and wrong ten minutes later is still a system of record: the GC
 * has to refresh to find out the owner signed. This subscribes to the table so
 * the status changes on screen, and reports WHICH rows changed so the pill can
 * flash rather than silently swapping colour while nobody is looking.
 *
 * Built on lib/useRealtime's connection — one websocket for the whole app,
 * already in use by the drawing viewer and the radio console. This adds a
 * generic subscription rather than a thirteenth bespoke hook.
 *
 *   const { changed, isLive } = useLiveStatus('pay_applications', `project_id=eq.${id}`, reload);
 *   …
 *   <LifecycleRail module="pay_applications" status={pa.status}
 *                  since={pa.updated_at} changed={changed.has(pa.id)} />
 *
 * Realtime has to be enabled per table on the Supabase side. When it is not,
 * `isLive` stays false and the page behaves exactly as it did before — the
 * status is simply as fresh as the last load. Nothing breaks, and the caller
 * can say so honestly rather than implying live data it does not have.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

/* One socket for the app. Mirrors lib/useRealtime's client so the two share a
   connection rather than opening a second. */
let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!_client) _client = createClient(url, key);
  return _client;
}

/** How long a changed row stays flagged as "just changed". */
const FLASH_MS = 4000;

export interface LiveStatus {
  /** Row ids that changed in the last few seconds. */
  changed: Set<string>;
  /** True once the subscription is actually connected. */
  isLive: boolean;
  /** Clear the flash early — e.g. the reader navigated away from the table. */
  clear: () => void;
}

export function useLiveStatus(
  table: string,
  /** Postgres filter, e.g. `project_id=eq.<uuid>`. Omit to watch the table. */
  filter: string | undefined,
  /** Called when anything changes, so the caller can refetch. */
  onChange: () => void,
  enabled = true,
): LiveStatus {
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [isLive, setIsLive] = useState(false);

  /* Kept in a ref so re-subscribing is not triggered by a new closure every
     render — the caller almost never memoises this. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const timers = useRef<Map<string, number>>(new Map());

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.clear();
    setChanged(new Set());
  }, []);

  useEffect(() => {
    if (!enabled || !table) return;
    const supabase = getClient();
    if (!supabase) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    channel = supabase
      .channel(`live-status:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => {
          if (cancelled) return;
          const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
          const id = typeof row.id === 'string' ? row.id : null;

          if (id) {
            setChanged((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            /* Drop the flag after the flash so a row does not glow forever. */
            const existing = timers.current.get(id);
            if (existing) window.clearTimeout(existing);
            timers.current.set(id, window.setTimeout(() => {
              timers.current.delete(id);
              setChanged((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }, FLASH_MS));
          }

          onChangeRef.current();
        },
      )
      .subscribe((status) => {
        if (!cancelled) setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      cancelled = true;
      setIsLive(false);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
      if (channel) supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);

  return { changed, isLive, clear };
}
