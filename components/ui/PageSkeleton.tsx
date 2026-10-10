'use client';
import React from 'react';
import { Skeleton, SkeletonKPI } from './Skeleton';
import { FlatStyles, RowSkeleton } from './flat';

/**
 * ModuleSkeleton — layout-true first paint for a module screen, flat
 * (2026-10-10): the compact header, a thin strip of figures, then rows on
 * hairlines — the same shape as the flat page it stands in for, so nothing
 * jumps when the data lands. Drop it where a page used to show a spinner or
 * a "Loading…" line.
 */
export function ModuleSkeleton({ hero = true, kpis = 4, rows = 5 }: { hero?: boolean; kpis?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <FlatStyles />
      {hero && (
        <div style={{ marginBottom: 16 }}>
          <Skeleton width={220} height={20} style={{ marginBottom: 8, maxWidth: '70%' }} />
          <Skeleton width={340} height={11} style={{ maxWidth: '85%' }} />
        </div>
      )}
      {kpis > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', borderTop: '1px solid var(--sg-border)', borderBottom: '1px solid var(--sg-border)', marginBottom: 16, overflow: 'hidden' }}>
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? -1 : 0 }}><SkeletonKPI /></div>
          ))}
        </div>
      )}
      {rows > 0 && (
        <div style={{ borderTop: '1px solid var(--sg-border)', margin: '0 -16px' }}>
          <RowSkeleton rows={rows} />
        </div>
      )}
    </div>
  );
}

/**
 * RouteSkeleton — what a route's loading.tsx paints the instant you tap into
 * it: the page's own name where its header will be, a strip of figures and
 * rows on hairlines. Never a blank black screen while the page's code loads.
 */
export function RouteSkeleton({ title, figures = 4, rows = 7 }: { title?: string; figures?: number; rows?: number }) {
  return (
    <div className="sag-route-skel" aria-busy="true" aria-label={title ? `Loading ${title}` : 'Loading'}>
      <FlatStyles />
      <style dangerouslySetInnerHTML={{ __html: ROUTE_SKEL_CSS }} />
      <div className="sag-route-skel-head">
        {title
          ? <div className="sag-route-skel-title">{title}</div>
          : <Skeleton width={200} height={20} style={{ maxWidth: '60%' }} />}
        <Skeleton width={300} height={11} style={{ marginTop: 9, maxWidth: '80%' }} />
      </div>
      {figures > 0 && (
        <div className="sag-route-skel-strip">
          {Array.from({ length: figures }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
      )}
      <div className="sag-route-skel-rows">
        <RowSkeleton rows={rows} />
      </div>
    </div>
  );
}

const ROUTE_SKEL_CSS = `
.sag-route-skel{max-width:2200px;margin:0 auto;padding:20px 24px 48px}
.sag-route-skel-head{margin-bottom:14px}
.sag-route-skel-title{font-size:22px;font-weight:700;line-height:1.2;letter-spacing:-0.015em;color:var(--sg-text)}
.sag-route-skel-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));border-top:1px solid var(--sg-border);border-bottom:1px solid var(--sg-border);overflow:hidden;margin-bottom:16px}
.sag-route-skel-strip>div{margin-left:-1px}
.sag-route-skel-rows{border-top:1px solid var(--sg-border);margin:0 -24px}
@media (max-width:767px){
  .sag-route-skel{padding:14px 16px 24px}
  .sag-route-skel-title{font-size:20px}
  .sag-route-skel-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sag-route-skel-rows{margin:0 -16px}
}
`;
