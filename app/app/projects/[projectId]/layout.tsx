'use client';
/**
 * The frame around every screen inside a job.
 *
 * The job page (./overview) IS the job's navigation now — every tool, grouped,
 * with its count — so nothing here repeats it:
 *
 *   both     the job's phases (Overview · Preconstruction · … · Closeout) as
 *            lit pills with their icons — bright and easy to find (Chad,
 *            2026-10-11) — the one you are in filled solid yellow.
 *   phone    the pills are one row you swipe sideways (Chad: "on iOS when you
 *            pick a project you can't see the horizontal nav menu at all"),
 *            the current one scrolled into view, the edge faded so it reads
 *            as more to swipe. On a tool page (…/budget) the app's top bar
 *            already reads "‹ <Job>", so no second back row; one level deeper
 *            (…/rfis/<id>) the top bar goes back to the list, so this bar adds
 *            one thin "‹ <Job>" row above the pills.
 *   desktop  the same back row when it is needed; the pills wrap to a second
 *            row rather than run off the edge. The full tool list sits in the
 *            app's left rail (components/AppSidebar, from lib/project-nav).
 */
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { PROJECT_PHASES, phaseForPath } from '@/lib/project-nav';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const params = useParams();
  const projectId = String(params?.projectId || '');
  const base = `/app/projects/${projectId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const onJobPage = rel === '' || rel === '/' || rel.startsWith('/overview');
  const real = !!projectId && projectId !== 'new';

  const activeKey = onJobPage ? 'overview' : phaseForPath(rel);

  /* Phone: keep the current phase in view in the swipe row (no page scroll). */
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabsRef.current;
    const on = row?.querySelector<HTMLElement>('[data-active]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
  }, [activeKey]);

  return (
    <div className="pjx" style={{ minWidth: 0, background: 'var(--bg-base)', minHeight: 'calc(100vh - 56px)' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* No separate "‹ Job" link: the Overview tab is the way back to the job,
          so the tab row sits in the same place on every job page. */}
      {real && (
        <nav className="pjx-bar" data-job-bar="" aria-label="Job">
          <div className="pjx-tabs" ref={tabsRef}>
            {PROJECT_PHASES.map((ph) => {
              const active = ph.key === activeKey;
              const Icon = ph.icon;
              return (
                <Link
                  key={ph.key}
                  href={base + (ph.key === 'overview' ? '/overview' : ph.href)}
                  className="pjx-tab"
                  data-active={active || undefined}
                  aria-current={active ? 'page' : undefined}
                  title={ph.tagline}
                >
                  <Icon size={16} weight={active ? 'fill' : 'bold'} aria-hidden="true" />
                  <span>{ph.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      {children}
    </div>
  );
}

/* Theme variables only; injected with dangerouslySetInnerHTML so the server
   and client text match (tools/check-style-escapes.mjs). */
const CSS = `
.pjx-bar{display:flex;flex-wrap:wrap;align-items:center;gap:0 8px;min-height:44px;padding:0 8px 0 4px;border-bottom:1px solid var(--fl-line,var(--border-default));min-width:0}
/* Phase tabs: slate pills; the phase you are in is the one yellow pill. */
.pjx-tab{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 15px;border-radius:10px;flex:0 0 auto;white-space:nowrap;text-decoration:none;
  border:1px solid var(--border-default);background:var(--bg-surface-2);color:var(--text-primary);font-size:14px;font-weight:600;
  -webkit-tap-highlight-color:transparent;transition:background-color .15s ease,border-color .15s ease}
.pjx-tab svg{color:var(--text-secondary);flex:none}
.pjx-tab:hover{background:var(--bg-hover);border-color:var(--border-strong)}
.pjx-tab:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.pjx-tab[data-active]{background:var(--brand-primary);border-color:var(--brand-primary);color:var(--on-brand);font-weight:700}
.pjx-tab[data-active] svg{color:var(--on-brand)}
@media (prefers-reduced-motion:reduce){.pjx-tab{transition:none}}
@media (max-width:767px){
  .pjx-bar{padding:0}
  .pjx-tabs{display:flex;flex-wrap:nowrap;gap:8px;width:100%;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none;padding:8px 12px;
    -webkit-mask-image:linear-gradient(90deg,black calc(100% - 28px),transparent);mask-image:linear-gradient(90deg,black calc(100% - 28px),transparent)}
  .pjx-tabs::-webkit-scrollbar{display:none}
  .pjx-tab{padding:0 13px;scroll-snap-align:start}
}
@media (min-width:768px){
  .pjx-bar{padding:0 clamp(8px,1.2vw,20px) 0 4px;min-height:60px}
  .pjx-tabs{display:flex;flex-wrap:wrap;justify-content:flex-start;align-items:center;gap:8px;min-width:0;padding:8px 2px}
  .pjx-tab{min-height:40px}
}
`;
