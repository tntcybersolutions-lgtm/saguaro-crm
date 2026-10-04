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
 *
 * PHONES. The strip is one short line — the phase you are in and its step
 * number — that opens the full list on tap. The seven tabs never scroll
 * sideways under a thumb.
 */
import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { CaretDown, List, ArrowRight } from '@phosphor-icons/react';
import { PROJECT_PHASES, phaseForPath } from '@/lib/project-nav';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { normalisePhase, stepsDone, stepsForPhase } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';

const BORDER = 'rgba(255,255,255,0.09)';

/* Each phase its own color so the section tabs read as a colorful headline row
   you can scan at a glance — the one you're in is filled and lit, the rest
   carry a tint of their color so every section still stands out. Same bright
   neon-on-black family as lib/status-colors (docs/COPY-STYLE.md §7). */
const PHASE_COLORS: Record<string, string> = {
  overview:  '#A3ACBB', // grey
  precon:    '#FF8A00', // blue
  execution: '#FFE600', // amber
  field:     '#2CFF7A', // green
  financial: '#FF8A00', // orange
  docs:      '#FF8A00', // violet
  closeout:  '#2EDBD0', // teal
};

type PhaseProgress = 'done' | 'progress' | 'todo';

/**
 * WHERE THE JOB ACTUALLY IS — not where the user is standing.
 *
 * Progress comes from the same completion data as the rail checklist and the
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
  const [open, setOpen] = React.useState(false);
  // A new route closes the phone list — the tap that got you there is done.
  React.useEffect(() => { setOpen(false); }, [pathname]);
  if (!validId) return null;

  const base = `/app/projects/${projectId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  const activeKey = phaseForPath(rel);
  const activeIdx = Math.max(0, PROJECT_PHASES.findIndex(p => p.key === activeKey));
  const active = PROJECT_PHASES[activeIdx];
  const activeColor = PHASE_COLORS[active?.key] || '#A3ACBB';
  const ActiveIcon = active?.icon;
  /* The same status the sidebar pill and the next-step bar read, so one job
     never shows three different stages on one screen. */
  const closed = isClosedStatus(ctx?.project?.status);
  const activeState = progress[active?.key] ?? 'todo';
  const stateText = closed ? 'Closed job' : activeState === 'done' ? 'Done' : activeState === 'progress' ? 'In progress' : `Step ${activeIdx + 1} of ${PROJECT_PHASES.length}`;
  /* The next step, computed exactly as NextStepBar does — on phones this bar
     carries it, because the next-step bar is hidden there. */
  const nextStep = (() => {
    if (!ctx) return null;
    const phase = normalisePhase(ctx?.project?.phase);
    const steps = stepsForPhase(phase);
    const d = stepsDone(ctx, ctx?.money, isClosedStatus);
    const i = steps.findIndex((st) => !d[st.key]);
    if (i === -1) return { title: closed ? 'Open the closeout record' : 'Every stage of this job is done', href: `${base}/closeout`, done: true };
    const st = steps[i];
    return { title: st.title, href: base + (st.href || ''), done: false };
  })();

  return (
    <div style={{ background: 'rgba(255,255,255,0.035)', borderBottom: `1px solid ${BORDER}` }}>
      {/* dangerouslySetInnerHTML, not a text child: the attribute-selector
          quote would otherwise be escaped to &quot; and break the CSS (the
          repo's check:style-escapes build guard enforces this). */}
      <style dangerouslySetInnerHTML={{ __html: 'nav[aria-label="Project phase"]::-webkit-scrollbar{display:none}' }} />

      {/* Phone: ONE bar for the job — the module menu, the phase you are in, and
          the next step on tap. Hidden on desktop. */}
      <div className="sag-phase-summary" style={{ display: 'none', alignItems: 'center', gap: 6, minHeight: 44, padding: '4px 8px 4px 6px' }}>
        <button
          type="button"
          aria-label="Open project modules"
          onClick={() => window.dispatchEvent(new Event('saguaro:project-menu'))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
        >
          <List size={16} weight="bold" color="var(--brand-primary)" /> Modules
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="sag-phase-nav"
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, minHeight: 40, padding: '0 6px', background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', textAlign: 'left' }}
        >
          {ActiveIcon && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: activeColor }}>
              <ActiveIcon size={14} weight="fill" color="#0A0A0A" />
            </span>
          )}
          <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2, overflow: 'hidden' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: activeColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active?.label} <span style={{ color: '#A9B4C4', fontWeight: 600 }}>· {stateText}</span></span>
            {nextStep && <span style={{ fontSize: 11, color: '#A9B4C4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Next: {nextStep.title}</span>}
          </span>
          <CaretDown size={14} weight="bold" color="#A9B4C4" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>
      {open && nextStep && (
        <Link href={nextStep.href} className="sag-phase-next" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 10px 6px', minHeight: 44, padding: '8px 12px', borderRadius: 10, textDecoration: 'none', background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-35)', color: '#FFFFFF' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--brand-primary)', flexShrink: 0 }}>{nextStep.done ? 'ALL DONE' : 'NEXT STEP'}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextStep.title}</span>
          <ArrowRight size={14} weight="bold" color="var(--brand-primary)" />
        </Link>
      )}

      <nav
        id="sag-phase-nav"
        aria-label="Project phase"
        className="sag-phase-nav"
        data-open={open ? 'true' : 'false'}
        style={{
          display: 'flex', alignItems: 'stretch', gap: 6,
          padding: '10px 14px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
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
                  display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0, minHeight: 44,
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
    </div>
  );
}
