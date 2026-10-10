'use client';
/**
 * While the Jobs list (or a job opened from it) loads: the list's own outline —
 * a title, the search line and flat rows. The rows paint at once; a page of
 * grey boxes is what the live walk caught here before.
 */
import React from 'react';
import { FlatStyles, RowSkeleton } from '@/components/ui/flat';

export default function JobsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading jobs" style={{ background: 'var(--bg-base)', minHeight: '60vh' }}>
      <FlatStyles />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="jsl-head"><i style={{ width: 96, height: 20 }} /><i style={{ width: '100%', height: 44, marginTop: 14, borderRadius: 10 }} /></div>
      <RowSkeleton rows={8} />
    </div>
  );
}

const CSS = `
.jsl-head{padding:14px 16px 12px;border-bottom:1px solid var(--fl-line)}
.jsl-head i{display:block;border-radius:5px;background:var(--fl-line);animation:jsl-pulse 1.2s ease-in-out infinite}
@keyframes jsl-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.jsl-head i{animation:none}}
`;
