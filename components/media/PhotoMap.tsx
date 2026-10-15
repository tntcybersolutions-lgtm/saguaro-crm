'use client';
/**
 * PhotoMap — a job's GPS-stamped photos on a real map (components/maps/ClusterMap).
 * Each pin is the photo's own thumbnail, whole; photos close together merge
 * into one pin with a count. A popup shows the pictures at that spot and a
 * tap opens the page's full-screen viewer.
 *
 * Client-only: load it with next/dynamic(() => import(...), { ssr: false }).
 */
import React, { useCallback } from 'react';
import ClusterMap, { escHtml } from '@/components/maps/ClusterMap';
import { photoGeo, photoDate, type PhotoLike, type PointCluster } from '@/lib/photo-views';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Photo = PhotoLike & Record<string, any>;

const thumbOf = (p: Photo): string | null => p.thumbnail_url || (p.media === 'video' ? null : p.url) || null;
const fmt = (d: Date | null) => (d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

const CSS = `
.pmPop { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.pmPop strong { font-size: 14px; font-weight: 800; color: var(--text-primary); overflow-wrap: anywhere; }
.pmPop small { font-size: 12px; color: var(--text-tertiary); }
.pmOne { display: block; width: 100%; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-solid); cursor: zoom-in; overflow: hidden; aspect-ratio: 4 / 3; }
.pmOne img, .pmGrid img { width: 100%; height: 100%; object-fit: contain; display: block; }
.pmGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; max-height: 260px; overflow-y: auto; }
.pmGrid button { padding: 0; aspect-ratio: 1; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-solid); cursor: zoom-in; overflow: hidden; color: var(--text-tertiary); font: inherit; font-size: 12px; }
.pmGrid button:hover, .pmOne:hover { border-color: var(--border-strong); }
.pmOpen { align-self: flex-start; min-height: 40px; padding: 0 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.pmOpen:hover { border-color: var(--border-strong); }
`;

export default function PhotoMap({ photos, onOpen, fitKey }: { photos: Photo[]; onOpen: (p: Photo) => void; fitKey?: string }) {
  const geoOf = useCallback((p: Photo) => photoGeo(p), []);
  const pinHtml = useCallback((c: PointCluster<Photo>) => {
    const cover = c.items.find(thumbOf) || null;
    const src = cover ? thumbOf(cover) : null;
    const inner = src ? `<img src="${escHtml(src)}" alt="" loading="lazy">` : `<em>${c.items.length}</em>`;
    return `<i>${inner}</i>${c.items.length > 1 ? `<b>${c.items.length}</b>` : ''}`;
  }, []);
  const pinLabel = useCallback((c: PointCluster<Photo>) => (
    c.items.length === 1 ? (c.items[0].title || 'Photo') : `${c.items.length} photos here`
  ), []);
  const popup = useCallback((c: PointCluster<Photo>, close: () => void) => {
    const open = (p: Photo) => { close(); onOpen(p); };
    if (c.items.length === 1) {
      const p = c.items[0];
      const src = thumbOf(p);
      return (
        <div className="pmPop">
          <button type="button" className="pmOne" onClick={() => open(p)} aria-label={`Open ${p.title || 'photo'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt={p.title || 'Photo'} /> : null}
          </button>
          <strong>{p.title || 'Untitled'}</strong>
          <small>{[fmt(photoDate(p)), p.taken_by].filter(Boolean).join(' · ')}</small>
          <button type="button" className="pmOpen" onClick={() => open(p)}>Open Photo</button>
        </div>
      );
    }
    const dates = c.items.map(photoDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const span = dates.length ? (fmt(dates[0]) === fmt(dates[dates.length - 1]) ? fmt(dates[0]) : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`) : '';
    return (
      <div className="pmPop">
        <strong>{c.items.length} photos here</strong>
        {span && <small>{span}</small>}
        <div className="pmGrid">
          {c.items.map((p) => {
            const src = thumbOf(p);
            return (
              <button key={String(p.id)} type="button" onClick={() => open(p)} aria-label={`Open ${p.title || 'photo'}`} title={p.title || 'Photo'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt="" loading="lazy" /> : 'Video'}
              </button>
            );
          })}
        </div>
      </div>
    );
  }, [onOpen]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <ClusterMap items={photos} geoOf={geoOf} pinHtml={pinHtml} pinLabel={pinLabel} popup={popup} fitKey={fitKey} ariaLabel="Photo map" />
    </>
  );
}
