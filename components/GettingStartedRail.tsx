'use client';
/**
 * GettingStartedRail — the GC Guided Journey.
 *
 * A new GC signs in and follows Step 1 -> completion without training. Eight
 * steps, each auto-checked from LIVE data (/api/projects/list + the
 * /api/project-context snapshot) and deep-linked into the module that
 * completes it. Renders inside a SectionCard as a numbered gold pipeline
 * (FlowSteps anatomy — inlined here so every step row can be a <Link>, which
 * FlowSteps' string-only props can't host). Collapsible, persisted in
 * localStorage ('sag_journey_collapsed'); hides entirely once all 8 are done.
 *
 * FREE MOVEMENT (owner rule): no step is ever locked or forward-only. The
 * current step carries the "you are here" band; every other row — completed or
 * upcoming — stays a live link with an explicit Review / Open affordance, so a
 * GC sitting on step 3 can walk back to step 1, check it, and come forward.
 * Mirrors the mobile GettingStartedRail exactly.
 */
import React, { useState, useEffect } from 'react';
import { normalisePhase, stepsForPhase, stepsDone } from '@/lib/project-phase';
import { isClosedStatus } from '@/lib/project-lifecycle';
import Link from 'next/link';
import { Compass, CaretDown, CaretUp, Check, ArrowRight } from '@phosphor-icons/react';
import { SectionCard } from '@/components/ui/premium';
import { useProjects } from '@/lib/hooks/useProjects';
import { useProjectContext } from '@/lib/hooks/useProjectContext';

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'var(--text-secondary)';
/* Versioned on purpose.
   The collapse preference is remembered forever, and a hard refresh does not
   clear localStorage — so anybody who had ever expanded this rail kept the old
   behavior and never saw the new default. The screen looked identical after a
   deploy that had definitely shipped, which is indistinguishable from nothing
   having changed. Bumping the key hands everyone the new default once; their
   next explicit toggle is remembered from then on. */
const LS_KEY = 'sag_journey_collapsed_v2';
const LS_PROJECT_KEY = 'sag_journey_project';

interface JourneyStep { title: string; desc: string; done: boolean; href?: string }

/**
 * compact — the project home's form (Pass 3): smaller margins, every text
 * size at 12px or above, folds sooner once the job is moving, and the
 * "Next:" link is outlined instead of filled so the page header keeps the
 * one filled primary action. The dashboard (no prop) is unchanged.
 */
export default function GettingStartedRail({ projectId, compact = false }: { projectId?: string; compact?: boolean }) {
  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  /* True until the GC toggles it themselves; while true the rail decides for
     itself whether to be open, based on how far along the job is. */
  const [autoCollapse, setAutoCollapse] = useState(false);

  // Live data from the shared SWR caches (W-2/W-4): the dashboard and the
  // projects page fill the same keys, so the rail costs zero extra requests.
  const { projects, loading: listLoading, error: listError, degraded } = useProjects();
  // On the dashboard (no projectId prop) the journey tracks the most recent
  // project — the list is already created_at desc.
  /* On a project page the prop wins. On the dashboard, the last project the GC
     deliberately picked wins over "whatever is newest", and either way the card
     names it — a path to first payment is per-job, so an unlabelled one is just
     a mystery. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  useEffect(() => {
    if (projectId) return;
    try { setPickedId(localStorage.getItem(LS_PROJECT_KEY)); } catch { /* private mode */ }
  }, [projectId]);

  const pickedStillExists = pickedId && projects.some((p: { id: string }) => p.id === pickedId);
  const activeId = projectId || (pickedStillExists ? pickedId : projects[0]?.id);
  const activeProject = projects.find((p: { id: string }) => p.id === activeId) ?? null;

  const chooseProject = (id: string) => {
    setPickedId(id);
    try { localStorage.setItem(LS_PROJECT_KEY, id); } catch { /* private mode */ }
  };
  const { ctx, loading: ctxLoading } = useProjectContext(activeId || null);
  // Never flash a wrong journey: wait for the list (and for the snapshot when
  // a project exists); a degraded list route never shows a false "0 of N".
  const loaded = !listLoading && !listError && !degraded && (!activeId || !!ctx || !ctxLoading);

  // Read the persisted collapse state after mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored !== null) setCollapsed(stored === '1');
      else setAutoCollapse(true); // no explicit choice yet — decide from progress
    } catch { setAutoCollapse(true); }
    setHydrated(true);
  }, []);

  const money = ctx?.money;
  const pLink = (suffix: string) => (activeId ? `/app/projects/${activeId}/${suffix}` : undefined);

  /* TWO JOURNEYS, NOT ONE.
   *
   * This list used to be a single nine-step run from "create your project"
   * to "get paid" — and its THIRD step was "Set contract & budget: confirm
   * the contract sum". A GC chasing a bid has no contract to confirm, so
   * the product's own guidance walked them into a step that could not apply
   * to them. That is what "where do we start" was really about.
   *
   * The sequence now comes from lib/project-phase, which the NAVIGATION
   * also reads, so the numbered steps in the rail and the numbered items in
   * the menu are the same list and cannot drift apart again.
   *
   * MONEY rule: DB numerics can round-trip as strings — Number(x)||0 before math. */
  const phase = normalisePhase(ctx?.project?.phase);
  /* Answered by lib/project-phase, not here. The always-on "you are here" bar
     asks the same question, and two copies of this map would eventually tell
     one user two different things about the same job. */
  const done = stepsDone(ctx as any, money as any, isClosedStatus);

  const steps: JourneyStep[] = [
    /* "Create your project" appears ONLY while there is not one yet.
       Once a project exists this step is permanently ticked and, worse, it
       pushed every following number along by one — so the rail said
       "step 3: send bid packages" while the menu said "3 Bid Packages"
       about a different step. Dropping it once it is done makes the two
       lists literally the same list. */
    ...(projects.length === 0
      ? [{
          title: 'Create Your Project',
          desc: 'Name, address, owner — everything else builds on this.',
          done: false,
          href: '/app/projects/new',
        }]
      : []),
    ...stepsForPhase(phase).map((st) => ({
      title: st.title,
      desc: st.desc,
      done: !!done[st.key],
      href: pLink(st.href.startsWith('/') ? st.href.slice(1) : st.href),
    })),
  ];
  const doneCount = steps.filter(s => s.done).length;
  const next = steps.find(s => !s.done);
  // "You are here" — the first unfinished step. Marks, never gates.
  const curIdx = steps.findIndex(s => !s.done);

  if (!loaded || !hydrated) return null; // never flash a wrong journey
  /* steps.length, not a literal. This read `=== 8` while the list held nine —
     "Price the drawings" was added and the two hardcoded counts were not — so
     the rail vanished with "Get paid" still open and the bar could read over
     100%. The header beside it already used steps.length, which is how the
     mismatch was visible: "8 of 9 steps" next to a full bar. */
  if (doneCount >= steps.length) return null;   // journey complete — get out of the way

  /* Open for a job that still needs the guidance; folded once it is moving.
     Three steps done means the project exists, the plans are priced and the
     money is set — past that the overview should be about the project, not a
     checklist. An explicit toggle overrides this for good. */
  /* Folded once the job is moving. On the dashboard the bar is lower still —
     the live signals above it are worth more than a checklist about one
     project, and a GC with work in flight is not being onboarded any more. */
  const autoThreshold = compact ? 2 : projectId ? 3 : 2;
  /* Type sizes: compact never drops below 12px (Pass 3 global rule). */
  const fs = { title: 14, desc: 13, verb: 13 };
  const showCollapsed = autoCollapse ? doneCount >= autoThreshold : collapsed;

  function toggle() {
    setAutoCollapse(false); // an explicit choice always wins from here on
    setCollapsed(c => {
      const n = !c;
      try { localStorage.setItem(LS_KEY, n ? '1' : '0'); } catch { /* private mode */ }
      return n;
    });
  }

  return (
    <div data-tour="getting-started" style={{ marginBottom: compact ? 0 : 24 }}>
      <SectionCard
        title="Path to First Payment"
        subtitle={
          activeProject
            ? `${activeProject.name}${next ? ` · next up: ${next.title}` : ''}`
            : next ? `Next up: ${next.title}` : undefined
        }
        flush={showCollapsed}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{doneCount} of {steps.length}</span>
            <button
              onClick={toggle}
              aria-label={showCollapsed ? 'Expand getting started' : 'Collapse getting started'}
              className={compact ? 'pmBtn gsr-toggle' : 'pmBtn'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 44, borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: 0,
              }}
            >
              {showCollapsed ? <CaretDown size={13} weight="bold" color={MUTED} /> : <CaretUp size={13} weight="bold" color={MUTED} />}
            </button>
          </div>
        }
      >
        {showCollapsed ? null : (
          <>
            {!projectId && projects.length > 1 && (
              <select
                value={activeId ?? ''}
                onChange={(e) => chooseProject(e.target.value)}
                aria-label="Which project this path is for"
                style={{
                  maxWidth: '100%', minHeight: 44, padding: '0 10px', marginBottom: 12, borderRadius: 8, cursor: 'pointer',
                  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                  color: TEXT, fontSize: 16, fontWeight: 600,
                }}
              >
                {projects.map((p: { id: string; name: string }) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            {/* Progress */}
            <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-surface-2)', overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ height: '100%', width: `${(doneCount / steps.length) * 100}%`, background: 'var(--success)', borderRadius: 999, transition: 'width .4s ease' }} />
            </div>

            {/* The pipeline — FlowSteps anatomy, every row deep-linked */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 10, top: 10, bottom: 16, width: 1, background: 'var(--border-default)' }} />
              {steps.map((s, i) => {
                const isCur = i === curIdx;
                // Every row with an href is reachable — done rows say "Review",
                // the current one says "Resume", future ones say "Open".
                const verb = s.done ? 'Review' : isCur ? 'Resume' : 'Open';
                const base = 'transparent';
                const row = (
                  <div
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative',
                      padding: '10px 8px', margin: '0 -8px', borderRadius: 10, minHeight: 44,
                      background: base,
                      transition: 'background .15s ease',
                    }}
                    onMouseEnter={e => { if (s.href) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = base; }}
                  >
                    <div style={{
                      width: 21, height: 21, borderRadius: 999, flexShrink: 0, zIndex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: s.done ? 'var(--success)' : 'var(--bg-base)',
                      border: s.done ? 'none' : `1px solid ${isCur ? 'var(--text-primary)' : 'var(--border-strong)'}`,
                      color: s.done ? 'var(--on-brand)' : isCur ? TEXT : MUTED, fontSize: 12, fontWeight: 900,
                    }}>
                      {s.done ? <Check size={12} weight="bold" color="var(--on-brand)" /> : i + 1}
                    </div>
                    <div style={{ minWidth: 0, paddingTop: 1, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ fontSize: fs.title, fontWeight: 800, color: s.done ? MUTED : TEXT, lineHeight: 1.35, minWidth: 0 }}>{s.title}</span>
                      </div>
                      {isCur && <div style={{ fontSize: fs.desc, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>{s.desc}</div>}
                    </div>
                    {s.href && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2,
                        color: isCur ? TEXT : MUTED, fontSize: fs.verb, fontWeight: 700, whiteSpace: 'nowrap',
                      }}>
                        {verb} <ArrowRight size={12} weight="bold" />
                      </span>
                    )}
                  </div>
                );
                return s.href
                  ? <Link key={i} href={s.href} aria-current={isCur ? 'step' : undefined} aria-label={`${s.title} — ${s.done ? 'completed, open to review' : isCur ? 'current step' : 'upcoming step'}`} style={{ textDecoration: 'none', display: 'block' }}>{row}</Link>
                  : <div key={i}>{row}</div>;
              })}
            </div>

            {/* The next incomplete step. Outlined: the page's one yellow is its own header action. */}
            {next?.href && (
              <Link href={next.href} className="pmBtn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, minHeight: 44, padding: '0 14px',
                borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent',
                color: TEXT, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>
                Next: {next.title} <ArrowRight size={14} weight="bold" color="var(--text-secondary)" />
              </Link>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
