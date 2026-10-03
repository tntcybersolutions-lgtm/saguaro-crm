'use client';
/**
 * ProjectPhaseBar — the job lifecycle as a left-to-right flow across the top of
 * every project screen.
 *
 * WHY. A GC does not think in forty-nine tools; they think in four or five
 * phases — win it, set it up, build it, bill it, close it. Every competitor
 * keeps the tools in a vertical rail (so do we), but none of them show the one
 * thing a contractor actually holds in their head: where this job is in its
 * life. This strip is that, read left to right, with the phase you are standing
 * in lit. Click a phase and you land on its first tool; the rail beneath is the
 * detail. It reads the same order as PROJECT_NAV_SECTIONS so the two never
 * disagree.
 */
import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { PROJECT_PHASES, phaseForPath } from '@/lib/project-nav';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { normalisePhase, stepsDone } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';

const BORDER = 'rgba(255,255,255,0.09)';

/* Each phase its own color so the section tabs read as a colorful headline row
   you can scan at a glance — the one you're in is filled and lit, the rest
   carry a tint of their color so every section still stands out. Same bright
   neon-on-black family as lib/status-colors (docs/COPY-STYLE.md §7). */
const PHASE_COLORS: Record<string, string> = {
  overview:  '#A3ACBB', // grey
  precon:    '#3DA9FF', // blue
  execution: '#FFC53D', // amber
  field:     '#2EE59D', // green
  financial: '#FF8A3D', // orange
  docs:      '#B08CFF', // violet
  closeout:  '#2EDBD0', // teal
};

type PhaseProgress = 'done' | 'progress' | 'todo';

/**
 * WHERE THE JOB ACTUALLY IS — not where the user is standing.
 *
 * This bar used to mark every phase to the LEFT of the current page "Done",
 * so opening Docs & Comms on day one announced Preconstruction, Execution,
 * Field and Financials all finished. Page position is not progress. Progress
 * comes from the same completion data as the rail checklist and the
 * next-step bar (lib/project-phase stepsDone), so the three never disagree:
 *
 *   precon     bidding: in progress until takeoff, estimate, bid packages
 *              and proposal are all done. building: done — the bid was won.
 *   execution  building: done once subs are awarded AND a schedule exists,
 *              otherwise in progress. bidding: not started.
 *   field      building: in progress (done only when the job is closed).
 *   financial  building: in progress (done only when the job is closed).
 *   closeout   done when the job is closed.
 *   overview / docs  continuous — never "done", never "in progress".
 *
 * A closed job marks every working phase done. Until the snapshot loads,
 * nothing claims anything: every phase reads its step number.
 */
function phaseProgress(ctx: any): Record<string, PhaseProgress> {
  const out: Record<string, PhaseProgress> = {};
  if (!ctx) return out;
  const closed = isClosedStatus(ctx?.project?.status);
  const building = normalisePhase(ctx?.project?.phase) === 'building';
  const d = stepsDone(ctx, ctx?.money, isClosedStatus);
  if (closed) {
    for (const k of ['precon', 'execution', 'field', 'financial', 'closeout']) out[k] = 'done';
    return out;
  }
  out.precon = building || (d.takeoff && d.estimate && d['bid-packages'] && d.proposal) ? 'done' : 'progress';
  out.execution = building ? (d.subs && d.schedule ? 'done' : 'progress') : 'todo';
  out.field = building ? 'progress' : 'todo';
  out.financial = building ? 'progress' : 'todo';
  out.closeout = 'todo';
  return out;
}

export default function ProjectPhaseBar() {
  const pathname = usePathname() || '';
  const params = useParams();
  const projectId = (params?.['projectId'] as string) || '';
  const validId = Boolean(projectId) && projectId !== 'new';
  /* Same SWR key the layout, rail and next-step bar read — no extra request. */
  const { ctx } = useProjectContext(validId ? projectId : null);
  const progress = React.useMemo(() => phaseProgress(ctx), [ctx]);
  if (!validId) return null;

  const base = `/app/projects/${projectId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const activeKey = phaseForPath(rel);
  const activeIdx = Math.max(0, PROJECT_PHASES.findIndex(p => p.key === activeKey));

  return (
    <nav
      aria-label="Project phase"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 6,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.035)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        borderBottom: `1px solid ${BORDER}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {/* dangerouslySetInnerHTML, not a text child: the attribute-selector
          quote would otherwise be escaped to &quot; and break the CSS (the
          repo's check:style-escapes build guard enforces this). */}
      <style dangerouslySetInnerHTML={{ __html: 'nav[aria-label="Project phase"]::-webkit-scrollbar{display:none}' }} />
      {PROJECT_PHASES.map((ph, i) => {
        const Icon = ph.icon;
        const isActive = i === activeIdx;
        const state = progress[ph.key] ?? 'todo';
        const isDone = state === 'done';
        const inProgress = state === 'progress';
        const href = base + ph.href;
        const c = PHASE_COLORS[ph.key] || '#A3ACBB';
        const tintBg = `color-mix(in srgb, ${c} 14%, transparent)`;
        return (
          <React.Fragment key={ph.key}>
            {i > 0 && (
              <span aria-hidden style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.28)', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>→</span>
            )}
            <Link
              href={href}
              data-tour={`project-phase-${ph.key}`}
              title={ph.tagline}
              aria-current={isActive ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
                padding: '7px 13px', borderRadius: 10, textDecoration: 'none',
                // Active = filled in the phase's color. Otherwise a tint of it,
                // so every tab still shows its own color and the name stands out.
                background: isActive ? `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 82%, #000))` : tintBg,
                border: `1px solid ${isActive ? c : `color-mix(in srgb, ${c} 40%, transparent)`}`,
                boxShadow: isActive ? `0 4px 18px -6px ${c}` : 'none',
                transition: 'background .15s ease, border-color .15s ease',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = `color-mix(in srgb, ${c} 26%, transparent)`; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = tintBg; }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                background: isActive ? 'rgba(0,0,0,0.18)' : 'transparent',
              }}>
                <Icon size={15} weight={isActive ? 'fill' : 'bold'} color={isActive ? '#0A0A0A' : c} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: isActive ? 'rgba(0,0,0,0.68)' : '#A9B4C4', whiteSpace: 'nowrap',
                }}>
                  {isActive ? 'You Are Here' : isDone ? 'Done' : inProgress ? 'In Progress' : `Step ${i + 1}`}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
                  color: isActive ? '#0A0A0A' : c,
                }}>
                  {ph.label}
                </span>
              </span>
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
