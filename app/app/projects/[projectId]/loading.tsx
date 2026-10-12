'use client';
/**
 * While any screen inside a job loads: a title, a line under it and flat
 * rows — the outline every job screen shares. Never a blank screen and never a
 * grid of grey boxes. Covers every route under the job
 * (the nested segments have no boundary of their own between here and them).
 */
import React from 'react';
import { FlatStyles, RowSkeleton } from '@/components/ui/flat';

export default function JobLoading() {
  return (
    <div className="k-frame" aria-busy="true" aria-label="Loading" style={{ background: 'var(--bg-base)', minHeight: '60vh' }}>
      <FlatStyles />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="jbl-head">
        <i style={{ width: '62%', height: 18 }} />
        <i style={{ width: '44%', height: 11, marginTop: 10 }} />
      </div>
      <RowSkeleton rows={9} />
    </div>
  );
}

const CSS = `
.jbl-head{padding:0 0 10px;border-bottom:1px solid var(--fl-line)}
.jbl-head i{display:block;border-radius:5px;background:var(--fl-line);animation:jbl-pulse 1.2s ease-in-out infinite}
@keyframes jbl-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.jbl-head i{animation:none}}
`;
