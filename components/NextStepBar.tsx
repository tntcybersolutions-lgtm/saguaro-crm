'use client';
/**
 * NextStepBar — "You are here. Do this next."
 *
 * One strip, the same place on every screen, that never hides itself.
 *
 * WHY IT EXISTS. The product already had two good guided journeys — the sales
 * rail and the build rail — plus numbered steps in the navigation. Three
 * things counting your progress, all of them on a page you had to scroll to,
 * and both rails deliberately vanish once their steps are done. So the one
 * thing telling a user where they stood disappeared exactly when they stopped
 * being mid-task, and nothing was in a fixed place they could learn.
 *
 * This is that fixed place. It states two things and nothing else: the stage
 * you are standing in, and the single next action, as a button.
 *
 * BOTH HALVES OF THE PRODUCT. Inside a job it reads the build phase from
 * lib/project-phase. Everywhere else it reads the sales journey from
 * lib/sales-journey. Same bar, same position, same two sentences — a
 * salesperson and a project manager learn one thing, not two.
 *
 * IT NEVER RETURNS NULL once it has data. When every stage is behind you it
 * says so and still offers the sensible next move. A guide that removes itself
 * the moment you are competent is a guide you cannot hand to a new hire.
 *
 * Gold on the job side, blue on the sales side — the same two colors the
 * rails and the sidebar zones already use, so the half of the product you are
 * in is readable before any word is.
 */
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { ArrowRight, MapPin, CheckCircle } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useProjects } from '@/lib/hooks/useProjects';
import { normalisePhase, stepsForPhase, stepsDone, PHASE_LABEL } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';
import { SALES_STEPS, salesStepsDone, type SalesSignals } from '@/lib/sales-journey';

/* The same key GettingStartedRail writes when the GC picks which job the
   journey follows. Read here so the bar and the rail name the same job — two
   widgets tracking "the current project" by different rules is how they end up
   disagreeing on screen. */
const LS_PROJECT_KEY = 'sag_journey_project';

/* Literal hexes (not CSS vars) because the tone is suffixed with hex alpha
   below (`${tone}14`). Brand neon yellow for a job, Lead blue for sales. */
const GOLD = '#FFE600';
const GOLD_HI = '#FFF04A';
const BLUE = '#FF8A00';
const BLUE_HI = '#7CC4FF';
const TEXT = '#FFFFFF';
const MUTED = '#D4D4D8';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

/* THE BAR'S HEIGHT IS RESERVED BEFORE ITS DATA ARRIVES.
   This strip sits in the fixed header and publishes its height as
   --sag-nextstep-h, which the page's top padding reads. It used to render
   nothing until /api/project-context (or /api/sales-journey) answered, then
   appear — so a few hundred milliseconds after every page load the whole
   page jumped down by the bar's height. A click aimed at a button in that
   window landed where the button USED to be: mousedown on one spot, the
   page moves, mouseup somewhere else, no click. That is the "first click is
   ignored, second one works" report on Daily Logs "Auto-fill Today" and
   Closeout "Generate G706". Reserving the same height while loading means
   the page never moves when the bar fills in. */
const BAR_H = 48; // 9px padding x2 + 1px borders x2 + the 28px CTA row

function Reserve({ boxRef }: { boxRef: React.MutableRefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={boxRef}
      aria-hidden
      style={{
        minHeight: BAR_H, boxSizing: 'border-box',
        background: 'var(--bg-base, #000000)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    />
  );
}

/** /app/projects/<id>/... — the id, or null anywhere else. `new` is the
 *  creation form, not a project, and must not be treated as one. */
function projectIdFromPath(pathname: string): string | null {
  const m = /^\/app\/projects\/([^/]+)/.exec(pathname || '');
  if (!m) return null;
  return m[1] === 'new' ? null : m[1];
}

export default function NextStepBar() {
  const pathname = usePathname() || '';
  const projectId = projectIdFromPath(pathname);
  const inProject = Boolean(projectId);

  /* OUTSIDE A JOB, "SALES" IS ONLY THE ANSWER UNTIL THERE IS A JOB.
     This read `inProject ? build : sales`, so on /app the bar always announced
     a sales step. GettingStartedRail on that same screen announces the BUILD
     step for the GC's current project — so a tenant with one project was told
     "You are here: Take the lead in" by the bar and "YOU ARE HERE: Take off
     the drawings" by the rail, a foot apart, at the same moment.
     This component's own header says it exists because three things were
     counting progress at once. It was added as a fourth rather than replacing
     them, and nothing made it agree with the other three.
     It now resolves the same job the rail does, by the same rule and the same
     remembered choice, and speaks for the build journey whenever one exists. */
  const { projects } = useProjects();
  const [picked, setPicked] = React.useState<string | null>(null);
  useEffect(() => {
    if (inProject) return;
    try { setPicked(localStorage.getItem(LS_PROJECT_KEY)); } catch { /* private mode */ }
  }, [inProject]);

  const pickedExists = picked && projects.some((p: { id: string }) => p.id === picked);
  /* ONLY ON THE DASHBOARD. The rule above exists so the bar agrees with
     GettingStartedRail, and that rail lives on /app. On every other
     company-level screen (People, Settings, CRM...) there is no job on the
     page and the header picker says "Choose a job" — a bar announcing
     "YOU ARE HERE: Send bid packages" for some job the user is not in
     contradicted it. Off the dashboard and outside a job, the bar speaks for
     the company-level sales journey instead. */
  /* The rail moved with the old dashboard to /app/classic. The new role-based
     home at /app shows no journey strip at all: it is company scope, and the
     spec keeps one job's onboarding out of the company work queue. */
  const onHome = pathname === '/app' || pathname === '/app/';
  const onDashboard = pathname === '/app/classic';
  const dashboardProjectId = inProject || !onDashboard ? null : ((pickedExists ? picked : projects[0]?.id) ?? null);
  const journeyId = projectId ?? dashboardProjectId;
  /* Gold whenever a job is driving the bar, whether or not we are standing on
     that job's page — the color states which half of the product is speaking,
     and it would be lying if the bar said "build" in blue. */
  const onBuildJourney = Boolean(journeyId);

  const { ctx, error: ctxError } = useProjectContext(journeyId);
  const { data: salesData, error: salesError } = useSWR<{ signals: SalesSignals }>(
    onBuildJourney || onHome ? null : '/api/sales-journey',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );

  /* Publish our height the way HeaderMessages does, so the page moves down
     instead of being covered by a fixed strip. */
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    const set = (h: number) => document.documentElement.style.setProperty('--sag-nextstep-h', `${h}px`);
    if (!el) { set(0); return; }
    set(el.offsetHeight);
    const ro = new ResizeObserver(() => set(el.offsetHeight));
    ro.observe(el);
    return () => { ro.disconnect(); set(0); };
  });

  if (onHome) return null;

  let tone = BLUE;
  let toneHi = BLUE_HI;
  let side = 'Sales';
  let here = '';
  let next = '';
  let href = '';
  let cta = '';
  let complete = false;
  let position = '';

  if (onBuildJourney) {
    tone = GOLD; toneHi = GOLD_HI;
    if (!ctx) return ctxError ? null : <Reserve boxRef={boxRef} />; // nothing to say until the job's own data is in
    const phase = normalisePhase(ctx?.project?.phase);
    const steps = stepsForPhase(phase);
    const done = stepsDone(ctx, ctx?.money, isClosedStatus);
    const i = steps.findIndex((s) => !done[s.key]);
    /* Off the job's own pages (the dashboard), name the job — a step with no
       job attached reads as if it were about whatever screen you are on. */
    const jobName = !inProject ? String(ctx?.project?.name || '').trim() : '';
    side = jobName ? `${jobName} · ${PHASE_LABEL[phase]}` : PHASE_LABEL[phase];
    const base = `/app/projects/${journeyId}`;
    if (i === -1) {
      complete = true;
      here = 'Every stage of this job is done';
      next = 'Nothing is outstanding. Open the closeout record or go back to your portfolio.';
      href = `${base}/closeout`;
      cta = 'Open Closeout';
      position = `${steps.length} of ${steps.length}`;
    } else {
      const s = steps[i];
      here = s.title;
      next = s.desc;
      href = base + (s.href || '');
      cta = s.title;
      position = `${i + 1} of ${steps.length}`;
    }
  } else {
    if (!salesData?.signals) return salesError || salesData ? null : <Reserve boxRef={boxRef} />;
    const done = salesStepsDone(salesData.signals);
    const i = SALES_STEPS.findIndex((s) => !done[s.key]);
    if (i === -1) {
      complete = true;
      here = 'Every stage of the sales process is in use';
      next = 'Keep the pipeline moving — the follow-ups falling due are on My Work.';
      href = '/app/my-work';
      cta = 'Open My Work';
      position = `${SALES_STEPS.length} of ${SALES_STEPS.length}`;
    } else {
      const s = SALES_STEPS[i];
      here = s.title;
      next = s.desc;
      href = s.href;
      cta = s.title;
      position = `${i + 1} of ${SALES_STEPS.length}`;
    }
  }

  return (
    <div
      ref={boxRef}
      data-tour="next-step"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '9px 18px',
        /* The tone tint must sit on a SOLID base. It used to fade to
           rgba(0,0,0,0), leaving the right ~65% of this fixed bar transparent,
           so scrolled page content (hero titles, tables) bled straight through
           it — the garbled overlap on every screen. Layer the gradient over the
           page base so the bar is fully opaque and nothing shows through. */
        background: `linear-gradient(90deg, ${tone}14, rgba(0,0,0,0) 55%), var(--bg-base, #000000)`,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderBottom: `1px solid ${tone}40`,
        minWidth: 0,
        minHeight: BAR_H, boxSizing: 'border-box',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        color: tone, fontSize: 12.5, fontWeight: 800,
      }}>
        {complete
          ? <CheckCircle size={14} weight="fill" color={tone} />
          : <MapPin size={14} weight="fill" color={tone} />}
        You Are Here
      </span>

      <span aria-hidden style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

      <span style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, whiteSpace: 'nowrap' }}>{here}</span>
        <span style={{
          fontSize: 12, color: MUTED, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{next}</span>
      </span>

      <span style={{
        flexShrink: 0, fontSize: 11.5, fontWeight: 700,
        color: '#A9B4C4', whiteSpace: 'nowrap',
        maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={`${side} · ${position}`}>
        {side} · {position}
      </span>

      <Link
        href={href}
        className="pmBtn"
        style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 13px', borderRadius: 8, textDecoration: 'none',
          background: `linear-gradient(180deg, ${toneHi}, ${tone})`,
          color: onBuildJourney ? '#0A0A00' : '#04121F',
          fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
          boxShadow: `0 2px 10px ${tone}44`,
        }}
      >
        {cta} <ArrowRight size={12} weight="bold" color={onBuildJourney ? '#0A0A00' : '#04121F'} />
      </Link>
    </div>
  );
}
