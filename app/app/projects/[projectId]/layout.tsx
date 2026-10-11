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
 *   desktop  the same back row on tool pages, plus the job's phases
 *            (Overview · Preconstruction · … · Closeout) as lit pills with their
 *            icons — bright and easy to find (Chad, 2026-10-11) — the one you
 *            are in filled solid yellow. The full tool list sits in the app's
 *            left rail (components/AppSidebar, from lib/project-nav).
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
.pjx-bar{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 8px 0 4px;border-bottom:1px solid var(--fl-line,var(--border-default));min-width:0}
.pjx-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px 0 8px;color:var(--brand-primary);font-size:15px;font-weight:600;text-decoration:none;min-width:0;flex:0 1 auto;-webkit-tap-highlight-color:transparent}
.pjx-back>span:first-child{font-size:22px;line-height:1;margin-top:-2px}
.pjx-back-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(60vw,420px)}
.pjx-tabs{display:none}
@media (max-width:767px){
  .pjx-bar[data-on-job]{display:none}
}
@media (min-width:768px){
  .pjx-bar{padding:0 clamp(8px,1.2vw,20px) 0 4px}
  .pjx-bar{min-height:60px}
  .pjx-tabs{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0;overflow-x:auto;scrollbar-width:none;padding:8px 2px}
  .pjx-tabs::-webkit-scrollbar{display:none}
  .pjx-tab{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 15px;border-radius:999px;
    border:1px solid color-mix(in srgb,var(--brand-primary) 45%,transparent);
    background:linear-gradient(180deg,color-mix(in srgb,var(--brand-primary) 16%,transparent),color-mix(in srgb,var(--brand-primary) 6%,transparent));
    box-shadow:0 0 14px color-mix(in srgb,var(--brand-primary) 14%,transparent);
    color:var(--text-primary);font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;flex:0 0 auto;
    transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease}
  .pjx-tab svg{color:var(--brand-primary);flex:none}
  .pjx-tab:hover{border-color:var(--brand-primary);background:color-mix(in srgb,var(--brand-primary) 24%,transparent);box-shadow:0 0 20px color-mix(in srgb,var(--brand-primary) 30%,transparent);transform:translateY(-1px)}
  .pjx-tab:focus-visible{outline:2px solid var(--brand-primary);outline-offset:2px}
  .pjx-tab[data-active]{background:var(--brand-primary);border-color:var(--brand-primary);color:var(--on-brand,var(--c-on-brand));font-weight:800;
    box-shadow:0 0 0 1px color-mix(in srgb,var(--brand-primary) 60%,transparent),0 0 24px color-mix(in srgb,var(--brand-primary) 55%,transparent)}
  .pjx-tab[data-active] svg{color:var(--on-brand,var(--c-on-brand))}
  @media (prefers-reduced-motion:reduce){.pjx-tab{transition:none}.pjx-tab:hover{transform:none}}
  .pjx-bar[data-on-job] .pjx-tabs{margin-left:0}
}
`;
