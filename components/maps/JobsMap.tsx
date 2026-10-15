'use client';
/**
 * JobsMap — every active job as a pin (components/maps/ClusterMap). A pin
 * shows the job's cover photo, whole, ringed green while building and amber
 * while bidding; jobs close together merge into one pin with a count. The
 * popup: cover photo, name, status, contract, % complete, and a link in.
 *
 * Client-only: load it with next/dynamic(() => import(...), { ssr: false }).
 */
import React, { useCallback } from 'react';
import Link from 'next/link';
import ClusterMap, { escHtml } from '@/components/maps/ClusterMap';
import { Badge, type BadgeTone } from '@/components/ui/kit';
import { fmtMoneyShort } from '@/lib/job-page';
import type { JobPin } from '@/lib/job-map';
import type { PointCluster } from '@/lib/photo-views';

const STAGE_TONE: Record<JobPin['stage'], BadgeTone> = { building: 'ongoing', bidding: 'lead', complete: 'completed', closed: 'closed' };
const PIN_TONE: Record<JobPin['stage'], 'good' | 'warn' | 'muted'> = { building: 'good', bidding: 'warn', complete: 'muted', closed: 'muted' };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '•';

const CSS = `
.jmPop { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.jmCover { width: 100%; aspect-ratio: 16 / 10; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-solid); overflow: hidden; }
.jmCover img { width: 100%; height: 100%; object-fit: contain; display: block; }
.jmName { font-size: 15px; font-weight: 800; color: var(--text-primary); overflow-wrap: anywhere; }
.jmAddr { font-size: 12px; color: var(--text-tertiary); }
.jmFacts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.jmFacts > div { display: flex; flex-direction: column; gap: 2px; }
.jmFacts b { font-size: 16px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.jmFacts span { font-size: 12px; color: var(--text-tertiary); }
.jmBar { height: 6px; border-radius: 3px; background: var(--bg-surface-2); overflow: hidden; }
.jmBar > i { display: block; height: 100%; background: var(--success); }
.jmGo { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary) !important; font-size: 13px; font-weight: 800; text-decoration: none; align-self: flex-start; }
.jmGo:hover { border-color: var(--border-strong); }
.jmList { display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow-y: auto; }
.jmList a { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; padding: 4px 6px; border-radius: 6px; color: var(--text-primary) !important; text-decoration: none; font-weight: 700; }
.jmList a:hover { background: var(--bg-surface-2); }
.jmList small { color: var(--text-tertiary); font-weight: 600; font-size: 12px; white-space: nowrap; }
`;

function OneJob({ j }: { j: JobPin }) {
  return (
    <div className="jmPop">
      {j.cover_url && (
        <div className="jmCover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={j.cover_url} alt={`${j.name} cover photo`} />
        </div>
      )}
      <div className="jmName">{j.name}</div>
      <div><Badge tone={STAGE_TONE[j.stage]} dot>{j.status}</Badge></div>
      {j.address && <div className="jmAddr">{j.address}</div>}
      <div className="jmFacts">
        <div><b>{j.contract != null ? fmtMoneyShort(j.contract) : '—'}</b><span>Contract</span></div>
        <div><b>{j.pct_complete != null ? `${j.pct_complete}%` : '—'}</b><span>Complete</span></div>
      </div>
      {j.pct_complete != null && <div className="jmBar" aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, j.pct_complete))}%` }} /></div>}
      <Link className="jmGo" href={`/app/projects/${j.id}/overview`}>Open Job</Link>
    </div>
  );
}

export default function JobsMap({ pins }: { pins: JobPin[] }) {
  const geoOf = useCallback((j: JobPin) => ({ lat: j.lat, lng: j.lng }), []);
  const pinHtml = useCallback((c: PointCluster<JobPin>) => {
    const lead = c.items.find((j) => j.cover_url) || c.items[0];
    const inner = lead.cover_url ? `<img src="${escHtml(lead.cover_url)}" alt="" loading="lazy">` : `<em>${escHtml(initials(lead.name))}</em>`;
    return `<i>${inner}</i>${c.items.length > 1 ? `<b>${c.items.length}</b>` : ''}`;
  }, []);
  const pinLabel = useCallback((c: PointCluster<JobPin>) => (c.items.length === 1 ? `${c.items[0].name} — ${c.items[0].status}` : `${c.items.length} jobs here`), []);
  const popup = useCallback((c: PointCluster<JobPin>) => {
    if (c.items.length === 1) return <OneJob j={c.items[0]} />;
    return (
      <div className="jmPop">
        <div className="jmName">{c.items.length} jobs here</div>
        <div className="jmList">
          {c.items.map((j) => (
            <Link key={j.id} href={`/app/projects/${j.id}/overview`}>
              <span>{j.name}</span>
              <small>{[j.status, j.pct_complete != null ? `${j.pct_complete}%` : ''].filter(Boolean).join(' · ')}</small>
            </Link>
          ))}
        </div>
      </div>
    );
  }, []);
  /* Ring colour from the stage; a mixed cluster rings green when any job in it is building. */
  const pinTone = useCallback((c: PointCluster<JobPin>) => {
    const stages = new Set(c.items.map((j) => j.stage));
    return stages.size === 1 ? PIN_TONE[c.items[0].stage] : stages.has('building') ? 'good' : 'warn';
  }, []);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <ClusterMap items={pins} geoOf={geoOf} pinHtml={pinHtml} pinTone={pinTone} pinLabel={pinLabel} popup={popup} fitKey={pins.map((p) => p.id).join(',')} ariaLabel="Jobs map" height="clamp(300px, 46vh, 520px)" />
    </>
  );
}
