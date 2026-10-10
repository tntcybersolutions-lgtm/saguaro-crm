'use client';
/**
 * The frame around every screen inside a job.
 *
 * The job page (./overview) IS the job's navigation now — every tool, grouped,
 * with its count — so nothing here repeats it:
 *
 *   phone    no tab strip, no card grid, no module drawer. A tool page gets one
 *            thin "‹ <Job>" row that goes back to the job's tool list; the job
 *            page itself gets nothing (the app's bar and tab bar already lead
 *            to Jobs).
 *   desktop  the same back row on tool pages, plus a compact flat row of the
 *            job's phases (Overview · Preconstruction · … · Closeout) as text
 *            tabs, the active one underlined. The full tool list sits in the
 *            app's left rail (components/AppSidebar, from lib/project-nav).
 *
 * The bar carries `data-job-bar` so the app frame can hide it if its own top
 * bar starts naming the job.
 */
import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useProject } from '@/lib/hooks/useProjects';
import { PROJECT_PHASES, phaseForPath } from '@/lib/project-nav';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const params = useParams();
  const projectId = String(params?.projectId || '');
  const base = `/app/projects/${projectId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const onJobPage = rel === '' || rel === '/' || rel.startsWith('/overview');
  const real = !!projectId && projectId !== 'new';

  /* Same SWR key as the job page's aggregate — opening a job costs one request. */
  const { project } = useProject(real ? projectId : null);
  const name = String((project as { name?: string } | null)?.name || '');
  const activeKey = onJobPage ? 'overview' : phaseForPath(rel);

  return (
    <div className="pjx" style={{ minWidth: 0, background: 'var(--bg-base)', minHeight: 'calc(100vh - 56px)' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {real && (
        <nav className="pjx-bar" data-job-bar="" data-on-job={onJobPage || undefined} aria-label="Job">
          {!onJobPage && (
            <Link href={`${base}/overview`} className="pjx-back" aria-label={`Back to ${name || 'the job'}`}>
              <span aria-hidden="true">‹</span><span className="pjx-back-name">{name || 'Job'}</span>
            </Link>
          )}
          <div className="pjx-tabs">
            {PROJECT_PHASES.map((ph) => {
              const active = ph.key === activeKey;
              return (
                <Link
                  key={ph.key}
                  href={base + (ph.key === 'overview' ? '/overview' : ph.href)}
                  className="pjx-tab"
                  data-active={active || undefined}
                  aria-current={active ? 'page' : undefined}
                  title={ph.tagline}
                >
                  {ph.label}
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
.pjx-bar{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 8px 0 4px;border-bottom:1px solid var(--sg-border,var(--border-default));min-width:0}
.pjx-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px 0 8px;color:var(--brand-primary);font-size:15px;font-weight:600;text-decoration:none;min-width:0;flex:0 1 auto;-webkit-tap-highlight-color:transparent}
.pjx-back>span:first-child{font-size:22px;line-height:1;margin-top:-2px}
.pjx-back-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(60vw,420px)}
.pjx-tabs{display:none}
@media (max-width:767px){
  .pjx-bar[data-on-job]{display:none}
}
@media (min-width:768px){
  .pjx-bar{padding:0 clamp(8px,1.2vw,20px) 0 4px}
  .pjx-tabs{display:flex;align-items:stretch;gap:2px;margin-left:auto;min-width:0;overflow-x:auto;scrollbar-width:none}
  .pjx-tabs::-webkit-scrollbar{display:none}
  .pjx-tab{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;border-bottom:2px solid transparent;color:var(--sg-text-2,var(--text-secondary));font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
  .pjx-tab:hover{color:var(--sg-text,var(--text-primary))}
  .pjx-tab[data-active]{color:var(--sg-text,var(--text-primary));border-bottom-color:var(--brand-primary)}
  .pjx-bar[data-on-job] .pjx-tabs{margin-left:0}
}
`;
