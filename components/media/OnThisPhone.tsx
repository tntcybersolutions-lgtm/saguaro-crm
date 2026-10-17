'use client';
/**
 * Photos and video taken with no signal, shown on the job's Photos page until
 * they reach the server — each with its own picture and an "On This Phone"
 * mark, so a super can see exactly what is still waiting. They upload by
 * themselves when the signal is back (lib/offline/outbox); one that the server
 * keeps refusing stops retrying, says why, and can be retried or removed here.
 */
import React, { useEffect, useState } from 'react';
import { CloudArrowUp, FilmStrip, ArrowClockwise, Trash } from '@phosphor-icons/react';
import { MAX_ATTEMPTS, outboxFile, type OutboxItem } from '@/lib/offline/outbox';
import { Badge, Button, Card } from '@/components/ui/kit';
import { fmtBytes, titleFromFileName } from '@/lib/media-upload';

const CSS = `
.otp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; padding: 16px; }
.otp-tile { display: flex; flex-direction: column; min-width: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-surface-2); border: 1px dashed var(--brand-primary-35); }
.otp-thumb { position: relative; width: 100%; aspect-ratio: 4 / 3; background: var(--bg-solid); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.otp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: .85; }
.otp-body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.otp-name { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.otp-meta { font-size: var(--fs-xs); color: var(--text-tertiary); overflow-wrap: anywhere; }
.otp-meta[data-tone="bad"] { color: var(--c-red); }
.otp-acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 6px; }
.otp-acts .k-btn { width: 100%; min-height: 44px; justify-content: center; }
@media (max-width: 640px) { .otp-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); padding: 12px; } }
`;

export default function OnThisPhone({ items, online, syncing, onRetry, onRemove }: {
  items: OutboxItem[];
  online: boolean;
  syncing: boolean;
  onRetry: (item: OutboxItem) => void;
  onRemove: (item: OutboxItem) => void;
}) {
  // The picture each waiting photo will become, drawn from the copy on this phone.
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const made: Record<string, string> = {};
    for (const it of items) {
      if (it.kind !== 'image') continue;
      try { made[it.id] = URL.createObjectURL(outboxFile(it)); } catch { /* no preview — the tile shows the name */ }
    }
    setUrls(made);
    return () => { Object.values(made).forEach((u) => URL.revokeObjectURL(u)); };
  }, [items]);

  if (!items.length) return null;
  const n = items.length;
  const stuck = items.filter((i) => i.attempts >= MAX_ATTEMPTS).length;
  const subtitle = stuck
    ? `${stuck} couldn't upload — each says why. The rest go by themselves.`
    : !online
      ? `${n === 1 ? 'It uploads' : 'They upload'} by itself when you're back online.`
      : syncing ? 'Uploading now…' : `${n === 1 ? 'It uploads' : 'They upload'} by itself in a moment.`;

  return (
    <div style={{ margin: '12px 0' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Card
        flush
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CloudArrowUp size={18} weight="bold" aria-hidden style={{ color: 'var(--c-orange)' }} />{n === 1 ? '1 photo or video on this phone' : `${n} photos and videos on this phone`}</span>}
        subtitle={subtitle}
      >
        <div className="otp-grid" role="list" aria-label="Saved on this phone, waiting to upload">
          {items.map((it) => {
            const failed = it.attempts >= MAX_ATTEMPTS;
            return (
              <div key={it.id} className="otp-tile" role="listitem" data-outbox-id={it.id}>
                <div className="otp-thumb">
                  {urls[it.id]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={urls[it.id]} alt={titleFromFileName(it.name)} />
                    : it.kind === 'video' ? <FilmStrip size={28} aria-hidden /> : null}
                </div>
                <div className="otp-body">
                  <div className="otp-name" title={it.name}>{titleFromFileName(it.name)}</div>
                  <div><Badge tone={failed ? 'overdue' : 'gold'}>{failed ? "Couldn't Send" : 'Waiting for Signal'}</Badge></div>
                  <div className="otp-meta" data-tone={failed ? 'bad' : undefined}>
                    {failed ? it.lastError || 'The server refused it.' : `${it.kind === 'video' ? 'Video' : 'Photo'} · ${fmtBytes(it.size)}${it.lastError ? ` · last try: ${it.lastError}` : ''}`}
                  </div>
                  <div className="otp-acts">
                    {failed && <Button size="sm" icon={<ArrowClockwise size={15} />} onClick={() => onRetry(it)}>Retry</Button>}
                    <Button size="sm" variant="ghost" icon={<Trash size={15} />} aria-label={`Remove ${titleFromFileName(it.name)} from this phone`} onClick={() => onRemove(it)}>Remove</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
