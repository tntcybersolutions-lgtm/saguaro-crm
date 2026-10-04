'use client';

/**
 * NextAction — workflow guidance, shown ONCE per job (on the overview).
 *
 * Replaces three things that said the same thing in three places: the
 * "You Are Here" banner, the sidebar's numbered checklist and the "Your Path
 * to First Payment" rail. One compact component:
 *   current phase · actual progress · the next required action ·
 *   ONE primary button · an expandable checklist for the supporting steps.
 *
 * Every value comes from real workflow state (lib/project-phase reads the
 * project-context snapshot), the same source the old pieces read, so the
 * guidance cannot drift from the data.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CaretDown, Check, Ruler, Trophy } from '@phosphor-icons/react';
import { useProjectContext, refreshProjectContext } from '@/lib/hooks/useProjectContext';
import { normalisePhase, stepsForPhase, stepsDone, PHASE_LABEL } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';
import { mutate as swrMutate } from 'swr';

export default function NextAction({ projectId }: { projectId: string }) {
  const { ctx, loading } = useProjectContext(projectId);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const base = `/app/projects/${projectId}`;

  if (loading && !ctx) {
    return <section className="pj-next pj-next-skel" aria-busy="true" aria-label="Loading the next step" />;
  }
  if (!ctx) return null;

  const closed = isClosedStatus(ctx?.project?.status);
  const phase = normalisePhase(ctx?.project?.phase);
  const steps = stepsForPhase(phase);
  const done = stepsDone(ctx as any, (ctx as any)?.money, isClosedStatus);
  const doneCount = steps.filter((s) => !!done[s.key]).length;
  const nextIdx = steps.findIndex((s) => !done[s.key]);
  const next = nextIdx >= 0 ? steps[nextIdx] : null;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const phaseLabel = closed ? 'Closed' : PHASE_LABEL[phase];
  const phaseTone = closed ? 'closed' : phase === 'bidding' ? 'lead' : 'ongoing';

  const primary = closed
    ? { href: `${base}/closeout`, label: 'Open Closeout' }
    : next
      ? { href: base + (next.href || ''), label: next.title }
      : { href: `${base}/closeout`, label: 'Open Closeout' };
  const secondary = !closed && phase === 'bidding' && next?.key !== 'takeoff'
    ? { href: `${base}/takeoff`, label: 'Open Takeoff', icon: <Ruler size={14} weight="bold" /> }
    : null;

  const switchPhase = async () => {
    const to = phase === 'building' ? 'bidding' : 'building';
    setSwitching(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/phase`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: to }) });
      if (r.ok) { await refreshProjectContext(projectId); void swrMutate('/api/projects/list'); }
    } finally { setSwitching(false); }
  };

  return (
    <section className="pj-next" aria-labelledby="pj-next-h">
      <div className="pj-next-head">
        <span className="k-badge" data-phase={phaseTone}>{phaseLabel}</span>
        <span className="pj-next-progress" aria-label={`${doneCount} of ${steps.length} steps done`}>
          <span className="pj-next-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></span>
          <span className="pj-next-count">{doneCount} of {steps.length}</span>
        </span>
      </div>
      <div className="pj-next-body">
        <div className="pj-next-text">
          <span className="pj-next-eyebrow">{closed ? 'Job closed' : next ? 'Next action' : 'All steps done'}</span>
          <h2 id="pj-next-h" className="pj-next-title">{closed ? 'Nothing is outstanding on this job.' : next ? next.title : 'Every step on this job is done.'}</h2>
          {!closed && next?.desc && <p className="pj-next-desc">{next.desc}</p>}
        </div>
        <div className="pj-next-actions">
          <Link href={primary.href} className="k-btn k-btn-primary">{primary.label} <ArrowRight size={14} weight="bold" /></Link>
          {secondary && <Link href={secondary.href} className="k-btn k-btn-secondary">{secondary.icon} {secondary.label}</Link>}
        </div>
      </div>
      <button type="button" className="pj-next-toggle" aria-expanded={open} aria-controls="pj-next-list" onClick={() => setOpen((v) => !v)}>
        <CaretDown size={14} weight="bold" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
        {open ? 'Hide the steps' : `All ${steps.length} steps`}
      </button>
      {open && (
        <ol id="pj-next-list" className="pj-next-list">
          {steps.map((s, i) => {
            const isDone = !!done[s.key];
            const isNext = i === nextIdx;
            return (
              <li key={s.key} data-done={isDone ? 'true' : undefined} data-next={isNext ? 'true' : undefined}>
                <span className="pj-next-num" aria-hidden>{isDone ? <Check size={11} weight="bold" /> : i + 1}</span>
                <Link href={base + (s.href || '')} className="pj-next-step">
                  <strong>{s.title}</strong>
                  <span>{s.desc}</span>
                </Link>
              </li>
            );
          })}
          {!closed && (
            <li className="pj-next-switch">
              <button type="button" className="k-btn k-btn-ghost k-btn-sm" onClick={() => void switchPhase()} disabled={switching} title={phase === 'building' ? 'Move this job back to bidding' : 'Mark this job won and move it to building'}>
                {phase === 'building' ? '← Back to Bidding' : <><Trophy size={14} weight="bold" /> We Won It</>}
              </button>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
