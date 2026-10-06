'use client';
/**
 * A small upload queue: add many files at once, two upload side by side, each
 * row shows its own progress, a failed row can be retried or dropped without
 * touching the rest. The queue lives in the page (not the panel), so closing
 * the panel doesn't stop what is uploading.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaKindOf, type MediaKind } from '@/lib/media-upload';

export type QueueStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface QueueItem {
  id: string;
  file: File;
  kind: MediaKind;
  status: QueueStatus;
  progress: number;
  error?: string;
  /** The saved record's small image, once the server has one. */
  thumb?: string | null;
}

export type Uploader = (file: File, kind: MediaKind, onProgress: (f: number) => void) => Promise<{ thumb?: string | null } | void>;

const CONCURRENCY = 2;

export function useUploadQueue(uploader: Uploader, opts: { onItemDone?: () => void; onDrained?: (n: { done: number; failed: number }) => void } = {}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const running = useRef(new Set<string>());
  const uploaderRef = useRef(uploader);
  uploaderRef.current = uploader;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const wasBusy = useRef(false);

  const patch = useCallback((id: string, p: Partial<QueueItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  /** Returns how many files were skipped because they aren't photos or videos. */
  const add = useCallback((files: FileList | File[] | null | undefined): number => {
    const arr = Array.from(files || []);
    let skipped = 0;
    const next: QueueItem[] = [];
    for (const file of arr) {
      const kind = mediaKindOf(file);
      if (!kind) { skipped++; continue; }
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, file, kind, status: 'waiting', progress: 0 });
    }
    if (next.length) setItems((list) => [...list, ...next]);
    return skipped;
  }, []);

  const retry = useCallback((id: string) => patch(id, { status: 'waiting', progress: 0, error: undefined }), [patch]);
  const remove = useCallback((id: string) => setItems((list) => list.filter((it) => it.id !== id || it.status === 'uploading')), []);
  const clearFinished = useCallback(() => setItems((list) => list.filter((it) => it.status !== 'done')), []);

  // Pump: start waiting items until CONCURRENCY are in flight.
  useEffect(() => {
    const free = CONCURRENCY - running.current.size;
    if (free <= 0) return;
    const ready = items.filter((it) => it.status === 'waiting' && !running.current.has(it.id)).slice(0, free);
    for (const it of ready) {
      running.current.add(it.id);
      patch(it.id, { status: 'uploading', progress: 0.02 });
      uploaderRef.current(it.file, it.kind, (f) => patch(it.id, { progress: Math.max(0.02, Math.min(1, f)) }))
        .then((res) => {
          patch(it.id, { status: 'done', progress: 1, thumb: (res && res.thumb) || null });
          optsRef.current.onItemDone?.();
        })
        .catch((e: unknown) => {
          patch(it.id, { status: 'failed', error: e instanceof Error && e.message ? e.message : 'Upload failed' });
        })
        .finally(() => {
          running.current.delete(it.id);
          // Nudge the pump: a state change re-runs this effect.
          setItems((list) => [...list]);
        });
    }
  }, [items, patch]);

  const busy = items.some((it) => it.status === 'waiting' || it.status === 'uploading');
  useEffect(() => {
    if (wasBusy.current && !busy) {
      optsRef.current.onDrained?.({
        done: items.filter((i) => i.status === 'done').length,
        failed: items.filter((i) => i.status === 'failed').length,
      });
    }
    wasBusy.current = busy;
  }, [busy, items]);

  // Leaving the page mid-upload would drop it — ask first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const counts = {
    total: items.length,
    done: items.filter((i) => i.status === 'done').length,
    failed: items.filter((i) => i.status === 'failed').length,
    active: items.filter((i) => i.status === 'waiting' || i.status === 'uploading').length,
  };
  const overall = items.length ? items.reduce((s, i) => s + (i.status === 'failed' ? 0 : i.progress), 0) / Math.max(1, items.length - counts.failed) : 0;

  return { items, add, retry, remove, clearFinished, busy, counts, overall };
}
