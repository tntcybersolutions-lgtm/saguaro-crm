'use client';
/**
 * "From your subs" — the GC's review inbox on a job's Photos page.
 *
 * Each end-of-day send from a sub's portal is one batch: who sent it, when,
 * their note, the thumbnails, and where they sent it — posted to the job, or
 * sent to the GC only. Opening a batch marks it seen (that clears the Home
 * alert). A GC-only batch can be added to the job photos in one tap, or
 * dismissed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, Eye, X } from '@phosphor-icons/react';
import { Card, Badge, Button } from '@/components/ui/kit';
import { getAuthHeaders } from '@/lib/supabase-browser';
import ZoomLightbox, { type LightboxItem } from '@/components/media/ZoomLightbox';

interface Item {
  id: string;
  batch_id: string | null;
  kind: 'image' | 'video';
  file_name: string;
  url: string | null;
  thumbnail_url: string | null;
  destination: 'project' | 'gc';
  status: 'new' | 'seen' | 'added' | 'dismissed';
  note: string | null;
  sender_company: string | null;
  sender_name: string | null;
  created_at: string;
  photo_id: string | null;
  file_id: string | null;
}

interface Batch { key: string; items: Item[]; at: string; who: string; note: string | null; toGc: boolean; fresh: number; held: number }

const CSS = `
.sx { display: flex; flex-direction: column; gap: 14px; }
.sxBatch { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); }
.sxBatch[data-new="true"] { border-color: var(--brand-primary-35, rgba(232,255,42,0.35)); }
.sxTop { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.sxWho { font-size: var(--fs-md, 15px); font-weight: 800; color: var(--text-primary); }
.sxWhen { font-size: var(--fs-xs, 12px); color: var(--text-tertiary); }
.sxNote { font-size: var(--fs-sm, 13px); color: var(--text-secondary); line-height: 1.5; overflow-wrap: anywhere; }
.sxThumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.sxT { position: relative; aspect-ratio: 1; padding: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-default); background: var(--bg-solid); cursor: zoom-in; color: var(--text-tertiary); display: flex; align-items: center; justify-content: center; }
.sxT img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sxT:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.sxT .pl { position: absolute; left: 6px; top: 6px; width: 22px; height: 22px; border-radius: 50%; background: rgba(8,9,12,0.78); color: var(--text-primary); display: inline-flex; align-items: center; justify-content: center; }
.sxT .on { position: absolute; right: 4px; bottom: 4px; padding: 1px 5px; border-radius: 5px; background: rgba(8,9,12,0.8); color: var(--c-green); font-size: 12px; font-weight: 800; }
.sxActs { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 640px) { .sxActs .k-btn { min-height: 44px; flex: 1 1 auto; } .sxThumbs { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
`;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SubInbox({
  projectId, focus, onChanged, onToast,
}: {
  projectId: string;
  /** Opened from a notification (?inbox=1): scroll here. */
  focus?: boolean;
  /** Something was added to the job — reload the gallery. */
  onChanged?: () => void;
  onToast?: (m: string, tone?: 'bad') => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<{ batch: Batch; index: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/projects/${projectId}/sub-media`, { headers: h });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setItems((j.items || []) as Item[]);
    } catch {
      // The inbox is extra: if it can't load, the gallery under it still works.
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (focus && loaded && items.length && ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, loaded, items.length]);

  const batches = useMemo<Batch[]>(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const k = it.batch_id || it.id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return Array.from(m.entries()).map(([key, list]) => ({
      key,
      items: list,
      at: list[0].created_at,
      who: (list[0].sender_company || list[0].sender_name || 'Subcontractor').trim(),
      note: list.find((i) => i.note)?.note || null,
      toGc: list.some((i) => i.destination === 'gc'),
      fresh: list.filter((i) => i.status === 'new').length,
      held: list.filter((i) => i.destination === 'gc' && !i.photo_id && !i.file_id).length,
    }));
  }, [items]);

  const act = async (b: Batch, action: 'seen' | 'add' | 'dismiss', ids?: string[]) => {
    setBusy(`${b.key}:${action}`);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/projects/${projectId}/sub-media`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids || b.items.map((i) => i.id), action }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403) throw new Error('You need Documents edit access for that.');
      if (!r.ok) throw new Error(j?.error || 'That didn’t work. Try again.');
      if (action === 'add') {
        onToast?.(j.failed?.length ? `${j.added} added, ${j.failed.length} didn’t — try again.` : `${j.added} added to the job photos.`, j.failed?.length ? 'bad' : undefined);
        onChanged?.();
      } else if (action === 'dismiss') {
        onToast?.('Dismissed.');
      }
      await load();
    } catch (e: unknown) {
      onToast?.(e instanceof Error ? e.message : 'That didn’t work.', 'bad');
    } finally {
      setBusy(null);
    }
  };

  const open = (b: Batch, index: number) => {
    setView({ batch: b, index });
    if (b.fresh) act(b, 'seen', b.items.filter((i) => i.status === 'new').map((i) => i.id));
  };

  if (!loaded || !batches.length) return null;
  const newTotal = batches.reduce((s, b) => s + b.fresh, 0);
  const shown = showAll ? batches : batches.slice(0, 3);
  const lb: LightboxItem[] = view ? view.batch.items.map((i) => ({ id: i.id, url: i.url || '', kind: i.kind, title: `${view.batch.who} · ${i.file_name}`, poster: i.thumbnail_url, thumb: i.kind === 'image' ? i.thumbnail_url : null })) : [];

  return (
    <div ref={ref} id="from-subs" style={{ scrollMarginTop: 84 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Card
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>From your subs {newTotal > 0 && <Badge tone="gold" dot>{newTotal} new</Badge>}</span>}
        subtitle="End-of-day photos and video sent from the sub portal."
        actions={batches.length > 3 ? <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${batches.length}`}</Button> : undefined}
      >
        <div className="sx">
          {shown.map((b) => {
            const photos = b.items.filter((i) => i.kind === 'image').length;
            const videos = b.items.length - photos;
            return (
              <div key={b.key} className="sxBatch" data-new={b.fresh ? 'true' : undefined}>
                <div className="sxTop">
                  <span className="sxWho">{b.who}</span>
                  <span className="sxWhen">{ago(b.at)} · {[photos && `${photos} photo${photos === 1 ? '' : 's'}`, videos && `${videos} video${videos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                  {b.toGc
                    ? <Badge tone={b.held ? 'lead' : 'ongoing'}>{b.held ? 'Sent to you' : 'Added to job'}</Badge>
                    : <Badge tone="ongoing">Posted to job</Badge>}
                  {b.fresh > 0 && <Badge tone="gold" dot>New</Badge>}
                </div>
                {b.note && <div className="sxNote">“{b.note}”</div>}
                <div className="sxThumbs">
                  {b.items.map((i, idx) => (
                    <button key={i.id} type="button" className="sxT" onClick={() => open(b, idx)} aria-label={`Open ${i.file_name}`}>
                      {i.thumbnail_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={i.thumbnail_url} alt="" loading="lazy" />
                        : <Play size={20} weight="fill" />}
                      {i.kind === 'video' && i.thumbnail_url && <span className="pl"><Play size={11} weight="fill" /></span>}
                      {i.destination === 'gc' && (i.photo_id || i.file_id) && <span className="on">ON JOB</span>}
                    </button>
                  ))}
                </div>
                <div className="sxActs">
                  {b.held > 0 && (
                    <Button variant="primary" size="sm" icon={<Plus size={14} weight="bold" />} disabled={!!busy} onClick={() => act(b, 'add', b.items.filter((i) => !i.photo_id && !i.file_id).map((i) => i.id))}>
                      {busy === `${b.key}:add` ? 'Adding…' : `Add ${b.held === 1 ? 'it' : `all ${b.held}`} to job photos`}
                    </Button>
                  )}
                  {b.fresh > 0 && (
                    <Button size="sm" icon={<Eye size={14} />} disabled={!!busy} onClick={() => act(b, 'seen', b.items.filter((i) => i.status === 'new').map((i) => i.id))}>
                      Mark seen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<X size={14} />} disabled={!!busy} onClick={() => act(b, 'dismiss')}
                    title={b.held ? 'Removes what only you received; nothing is on the job yet' : 'Hides it here; the photos stay on the job'}>
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {view && lb[view.index] && (
        <ZoomLightbox items={lb} index={view.index} onIndex={(i) => setView((v) => (v ? { ...v, index: i } : v))} onClose={() => setView(null)} onMediaError={() => load()} />
      )}
    </div>
  );
}
