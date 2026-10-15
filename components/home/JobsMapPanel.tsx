'use client';
/**
 * Home's "Jobs map" panel — every active job on a map (GET /api/projects/map,
 * drawn by components/maps/JobsMap, client-only). Jobs the map can't place
 * (no address, or the geocoder found no match yet) are counted under it with
 * a link to fix them — never dropped at a guessed spot.
 */
import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import useSWR from 'swr';
import { SectionLabel } from '@/components/ui/flat';
import type { JobPin } from '@/lib/job-map';
import { SectionFailed, SectionEmpty } from './HomeSections';

const JobsMap = dynamic(() => import('@/components/maps/JobsMap'), {
  ssr: false,
  loading: () => <div className="jmp-wait" aria-busy="true">Loading map…</div>,
});

interface MapPayload { pins: JobPin[]; unplaced: { id: string; name: string; reason: 'no address' | 'not found' | 'pending' }[] }

const fetcher = async (url: string): Promise<MapPayload> => {
  const r = await fetch(url, { cache: 'no-store' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error || `Couldn't load the jobs map (${r.status}).`);
  return body as MapPayload;
};

const CSS = `
.jmp-wait{display:flex;align-items:center;justify-content:center;height:clamp(300px,46vh,520px);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:var(--bg-solid);color:var(--text-tertiary);font-size:13px}
.jmp-legend{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:8px 0 0;font-size:13px;color:var(--text-secondary)}
.jmp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;border:2px solid;margin-right:6px;vertical-align:-1px}
.jmp-legend [data-k=b]{border-color:var(--success)} .jmp-legend [data-k=p]{border-color:var(--warning)}
.jmp-legend a{color:var(--text-primary);font-weight:700}
`;

export default function JobsMapPanel() {
  const { data, error, isLoading, mutate } = useSWR<MapPayload>('/api/projects/map', fetcher, { revalidateOnFocus: false });
  const pins = data?.pins || [];
  const unplaced = data?.unplaced || [];
  const pending = unplaced.filter((u) => u.reason === 'pending').length;
  const building = pins.filter((p) => p.stage === 'building').length;
  const bidding = pins.filter((p) => p.stage === 'bidding').length;

  let body: React.ReactNode;
  if (error && !data) body = <SectionFailed name="the jobs map" onRetry={() => { void mutate(); }} />;
  else if (isLoading && !data) body = <div className="jmp-wait" aria-busy="true">Loading map…</div>;
  else if (!pins.length && !unplaced.length) body = <SectionEmpty text="No active jobs yet." action={{ label: 'New job', href: '/app/projects/new' }} />;
  else if (!pins.length) body = <SectionEmpty text={`None of your ${unplaced.length} active job${unplaced.length === 1 ? '' : 's'} has an address the map can find.`} action={{ label: 'Jobs', href: '/app/projects' }} />;
  else body = <JobsMap pins={pins} />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SectionLabel id="fh-map" action={pins.length ? { label: `All ${pins.length + unplaced.length}`, href: '/app/projects' } : undefined}>
        Jobs map{pins.length > 0 && <small> · {pins.length} on the map</small>}
      </SectionLabel>
      {body}
      {pins.length > 0 && (
        <p className="jmp-legend">
          {building > 0 && <span><i data-k="b" />{building} building</span>}
          {bidding > 0 && <span><i data-k="p" />{bidding} bidding</span>}
          {unplaced.length - pending > 0 && (
            <span>{unplaced.length - pending} without a findable address · <Link href="/app/projects">Fix in Jobs</Link></span>
          )}
          {pending > 0 && <span>{pending} more placing — <button type="button" className="fl-sec-act" onClick={() => { void mutate(); }}>Refresh</button></span>}
        </p>
      )}
    </>
  );
}
