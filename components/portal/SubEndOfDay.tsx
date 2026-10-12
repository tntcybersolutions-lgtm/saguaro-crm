'use client';
/**
 * Sub portal → End of Day. A sub (or the foreman they hand the portal link to)
 * sends the day's photos and video from the job site in three taps:
 *
 *   1. where it goes — Post to the job  |  Send to the GC only
 *   2. an optional line about the day
 *   3. Take Photo / Record Video / Choose (many at once), any size
 *
 * Files go straight to storage (no size cap below the bucket's 500 MB). When a
 * batch finishes the GC gets ONE notification for it, and the list underneath
 * shows each upload's state — waiting for the GC, seen, or on the job — so the
 * sub knows it landed without having to call.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Eye, PaperPlaneTilt, Buildings, Play, Clock } from '@phosphor-icons/react';
import MediaUploadPanel from '@/components/media/MediaUploadPanel';
import ZoomLightbox, { type LightboxItem } from '@/components/media/ZoomLightbox';
import { useUploadQueue } from '@/lib/useUploadQueue';
import { uploadSubMedia, fmtDuration } from '@/lib/media-upload';

type Dest = 'project' | 'gc';

interface SentItem {
  id: string;
  batch_id: string | null;
  kind: 'image' | 'video';
  file_name: string;
  url: string | null;
  thumbnail_url: string | null;
  destination: Dest;
  status: 'new' | 'seen' | 'added' | 'dismissed';
  note: string | null;
  created_at: string;
  duration_seconds: number | null;
}

function newBatchId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && 'randomUUID' in c) return c.randomUUID();
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const CSS = `
.eod { display: flex; flex-direction: column; gap: 18px; max-width: 760px; margin: 0 auto; color: var(--text-primary); }
.eodHead h2 { margin: 0; font-size: 22px; font-weight: 800; line-height: 1.2; }
.eodHead p { margin: 6px 0 0; font-size: 14px; color: var(--text-secondary); }
.eodStep { font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px; }
.eodDest { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.eodOpt { display: flex; gap: 12px; align-items: flex-start; text-align: left; min-height: 76px; padding: 14px; border-radius: 14px; border: 1px solid var(--border-default); background: rgba(255,255,255,0.03); color: var(--text-primary); font: inherit; cursor: pointer; }
.eodOpt:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.eodOpt[aria-checked="true"] { border-color: var(--brand-primary); background: var(--brand-primary-08, rgba(255,224,0,0.08)); box-shadow: 0 0 0 1px var(--brand-primary); }
.eodOpt svg { flex: 0 0 auto; margin-top: 2px; color: var(--brand-primary); }
.eodOpt b { display: block; font-size: 15px; font-weight: 800; }
.eodOpt small { display: block; margin-top: 3px; font-size: 12.5px; line-height: 1.4; color: var(--text-tertiary); }
.eodNote { width: 100%; min-height: 72px; resize: vertical; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border-default); background: var(--bg-solid); color: var(--text-primary); font: inherit; font-size: 15px; box-sizing: border-box; }
.eodNote:focus { outline: 2px solid var(--brand-primary); outline-offset: 1px; }
.eodSent h3 { margin: 0 0 10px; font-size: 16px; font-weight: 800; }
.eodGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.eodTile { position: relative; padding: 0; border: 1px solid var(--border-default); border-radius: 10px; overflow: hidden; background: var(--bg-solid); cursor: pointer; color: inherit; font: inherit; text-align: left; }
.eodTile:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
.eodTile .im { aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.eodTile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.eodTile .st { display: flex; align-items: center; gap: 5px; padding: 6px 8px; font-size: 11.5px; font-weight: 700; color: var(--text-secondary); }
.eodTile .st { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.eodTile .st[data-s="ok"] { color: var(--c-green); }
.eodTile .st[data-s="new"] { color: var(--text-tertiary); }
.eodDur { position: absolute; right: 6px; top: 6px; padding: 1px 6px; border-radius: 6px; background: rgba(8,9,12,0.8); color: var(--text-primary); font-size: 11px; font-weight: 700; }
.eodPlay { position: absolute; top: 8px; left: 8px; width: 26px; height: 26px; border-radius: 50%; background: rgba(8,9,12,0.75); display: inline-flex; align-items: center; justify-content: center; color: var(--text-primary); }
.eodEmpty { font-size: 13px; color: var(--text-tertiary); }
@media (max-width: 520px) { .eodDest { grid-template-columns: minmax(0, 1fr); } .eodNote { font-size: 16px; } }
`;

function statusLabel(it: SentItem): string {
  if (it.status === 'added') return 'On the job';
  if (it.status === 'seen') return it.destination === 'project' ? 'On job · GC saw it' : 'GC saw it';
  return it.destination === 'project' ? 'On the job' : 'Waiting for GC';
}

export default function SubEndOfDay({ token, jobName, onToast }: { token: string; jobName?: string | null; onToast?: (m: string) => void }) {
  const [dest, setDest] = useState<Dest>('project');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<SentItem[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [view, setView] = useState<number | null>(null);
  const batch = useRef(newBatchId());
  const opts = useRef({ dest, note });
  opts.current = { dest, note };

  const load = useCallback(async () => {
    try {
      setLoadErr('');
      const r = await fetch(`/api/portal/sub/media?token=${encodeURIComponent(token)}`, { headers: { 'x-portal-token': token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'load failed');
      setSent((j.items || []) as SentItem[]);
    } catch {
      setLoadErr("Couldn't load what you've sent. Pull to refresh or try again.");
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const queue = useUploadQueue(
    async (file, kind, onProgress) => {
      const dest = opts.current.dest;
      const item = await uploadSubMedia(file, kind, {
        token, destination: dest, note: opts.current.note.trim(), batchId: batch.current, onProgress,
      });
      return {
        thumb: (item.thumbnail_url as string) || (kind === 'image' ? (item.url as string) : null) || null,
        doneLabel: dest === 'gc' ? 'Sent to the GC' : 'Posted to the job',
      };
    },
    {
      onDrained: async ({ done, failed }) => {
        const finished = batch.current;
        batch.current = newBatchId();
        if (done) {
          // One heads-up to the GC for the whole batch.
          fetch(`/api/portal/sub/media/done?token=${encodeURIComponent(token)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-token': token }, body: JSON.stringify({ batchId: finished }),
          }).catch(() => undefined);
          onToast?.(opts.current.dest === 'gc'
            ? `Sent ${done} to the GC.${failed ? ` ${failed} didn't upload — tap Retry.` : ''}`
            : `Posted ${done} to the job.${failed ? ` ${failed} didn't upload — tap Retry.` : ''}`);
          setNote('');
        } else if (failed) {
          onToast?.(`${failed} didn't upload — tap Retry.`);
        }
        load();
      },
    },
  );

  const addFiles = (files: FileList | File[]) => {
    const skipped = queue.add(files);
    if (skipped) onToast?.(`${skipped} file${skipped === 1 ? '' : 's'} skipped — only photos and videos go here.`);
  };

  const visible = sent.filter((s) => s.status !== 'dismissed');
  const lightbox: LightboxItem[] = visible.map((s) => ({ id: s.id, url: s.url || '', kind: s.kind, title: s.file_name, poster: s.thumbnail_url, thumb: s.kind === 'image' ? s.thumbnail_url : null }));

  return (
    <div className="eod">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="eodHead">
        <h2>End-of-day photos &amp; video</h2>
        <p>{jobName ? <>For <b>{jobName}</b>. </> : null}Snap the day&apos;s work and send it in one go — any size, as many as you like.</p>
      </div>

      <div>
        <div className="eodStep">1 · Where should it go?</div>
        <div className="eodDest" role="radiogroup" aria-label="Where should it go?">
          <button type="button" role="radio" aria-checked={dest === 'project'} className="eodOpt" onClick={() => setDest('project')}>
            <Buildings size={24} weight="duotone" />
            <span><b>Post to the job</b><small>Goes straight into the job&apos;s photos. The GC&apos;s team sees it there.</small></span>
          </button>
          <button type="button" role="radio" aria-checked={dest === 'gc'} className="eodOpt" onClick={() => setDest('gc')}>
            <PaperPlaneTilt size={24} weight="duotone" />
            <span><b>Send to the GC only</b><small>Only the GC sees it until they add it to the job.</small></span>
          </button>
        </div>
      </div>

      <div>
        <div className="eodStep"><label htmlFor="eod-note">2 · Anything to say? (optional)</label></div>
        <textarea id="eod-note" className="eodNote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="e.g. Rough-in done on level 2, waiting on inspection" />
      </div>

      <div>
        <div className="eodStep">3 · Add photos &amp; video</div>
        <MediaUploadPanel
          inline
          open
          onClose={() => undefined}
          title="End-of-day photos & video"
          items={queue.items}
          onFiles={addFiles}
          onRetry={queue.retry}
          onRemove={queue.remove}
          hint={dest === 'gc' ? 'Sending to the GC only · photos any size, videos up to 500 MB.' : 'Posting to the job · photos any size, videos up to 500 MB.'}
        />
      </div>

      <div className="eodSent">
        <h3>What you&apos;ve sent</h3>
        {loadErr ? <div className="eodEmpty">{loadErr}</div>
          : visible.length === 0 ? <div className="eodEmpty">Nothing yet. What you send shows up here, with whether the GC has seen it.</div>
          : (
            <div className="eodGrid">
              {visible.map((s, i) => (
                <button key={s.id} type="button" className="eodTile" onClick={() => s.url && setView(i)} aria-label={`Open ${s.file_name}`}>
                  <div className="im">
                    {s.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.thumbnail_url} alt="" loading="lazy" />
                      : s.kind === 'video' ? <Play size={22} weight="fill" /> : null}
                  </div>
                  {s.kind === 'video' && <span className="eodPlay"><Play size={12} weight="fill" /></span>}
                  {s.kind === 'video' && s.duration_seconds ? <span className="eodDur">{fmtDuration(s.duration_seconds)}</span> : null}
                  <div className="st" data-s={s.destination === 'gc' && s.status === 'new' ? 'new' : 'ok'}>
                    {s.destination === 'gc' && s.status === 'new' ? <Clock size={13} /> : s.status === 'seen' ? <Eye size={13} /> : <CheckCircle size={13} weight="fill" />}
                    <span>{statusLabel(s)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>

      {view != null && lightbox[view] && (
        <ZoomLightbox items={lightbox} index={view} onIndex={setView} onClose={() => setView(null)} onMediaError={() => load()} />
      )}
    </div>
  );
}
