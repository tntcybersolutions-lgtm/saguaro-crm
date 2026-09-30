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
 * Gold on the job side, blue on the sales side — the same two colours the
 * rails and the sidebar zones already use, so the half of the product you are
 * in is readable before any word is.
 */
import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { ArrowRight, MapPin, CheckCircle } from '@phosphor-icons/react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { normalisePhase, stepsForPhase, stepsDone, PHASE_LABEL } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';
import { SALES_STEPS, salesStepsDone, type SalesSignals } from '@/lib/sales-journey';

const GOLD = '#F59E0B';
const GOLD_HI = '#FBBF24';
const BLUE = '#3B82F6';
const BLUE_HI = '#60A5FA';
const TEXT = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.62)';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

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

  const { ctx } = useProjectContext(projectId);
  const { data: salesData } = useSWR<{ signals: SalesSignals }>(
    inProject ? null : '/api/sales-journey',
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

  let tone = BLUE;
  let toneHi = BLUE_HI;
  let side = 'Sales';
  let here = '';
  let next = '';
  let href = '';
  let cta = '';
  let complete = false;
  let position = '';

  if (inProject) {
    tone = GOLD; toneHi = GOLD_HI;
    if (!ctx) return null; // nothing to say until the job's own data is in
    const phase = normalisePhase(ctx?.project?.phase);
    const steps = stepsForPhase(phase);
    const done = stepsDone(ctx, ctx?.money, isClosedStatus);
    const i = steps.findIndex((s) => !done[s.key]);
    side = PHASE_LABEL[phase];
    const base = `/app/projects/${projectId}`;
    if (i === -1) {
      complete = true;
      here = 'Every stage of this job is done';
      next = 'Nothing is outstanding. Open the closeout record or go back to your portfolio.';
      href = `${base}/closeout`;
      cta = 'Open closeout';
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
    if (!salesData?.signals) return null;
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
        background: `linear-gradient(90deg, ${tone}1A, rgba(0,0,0,0) 65%)`,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: `1px solid ${tone}33`,
        minWidth: 0,
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        color: toneHi, fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {complete
          ? <CheckCircle size={13} weight="fill" color={toneHi} />
          : <MapPin size={13} weight="fill" color={toneHi} />}
        You are here
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
        flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
        color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap',
      }}>
        {side} · {position}
      </span>

      <Link
        href={href}
        className="pmBtn"
        style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 13px', borderRadius: 8, textDecoration: 'none',
          background: `linear-gradient(180deg, ${toneHi}, ${tone})`,
          color: inProject ? '#241500' : '#04121F',
          fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap',
          boxShadow: `0 2px 10px ${tone}44`,
        }}
      >
        {cta} <ArrowRight size={12} weight="bold" color={inProject ? '#241500' : '#04121F'} />
      </Link>
    </div>
  );
}
