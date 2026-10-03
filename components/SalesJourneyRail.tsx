'use client';
/**
 * SalesJourneyRail — how a deal becomes a job.
 *
 * GettingStartedRail teaches the build: it opens at "Create your project" and
 * runs to first payment. That is one stage too late for anybody in sales. A
 * lead arrives, somebody works it, it qualifies, it becomes a customer, it
 * gets priced, and only then is there a project. This rail is that stage, in
 * the order it actually happens, and it hands over to the build rail at the
 * end.
 *
 * Deliberately a SEPARATE rail rather than six more steps on the existing one.
 * GettingStartedRail's sequence comes from lib/project-phase, which the
 * NAVIGATION also reads, so its numbers and the menu's numbers are the same
 * list — an alignment that was broken once and fixed by dropping a step. Six
 * prepended rows would break it again.
 *
 * Blue, not gold: the build journey is gold, and a GC should be able to tell
 * at a glance which half of the product they are standing in.
 *
 * FREE MOVEMENT, same owner rule as the build rail: no step is ever locked or
 * forward-only. Every row stays a live link whether it is done, current or
 * still ahead.
 */
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Handshake, CaretDown, CaretUp, Check, ArrowRight } from '@phosphor-icons/react';
import { SectionCard } from '@/components/ui/premium';
import { SALES_STEPS, salesStepsDone, type SalesSignals } from '@/lib/sales-journey';

const BLUE = '#3B82F6';
const BLUE_HI = '#60A5FA';
const TEXT = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.42)';

/* Versioned like the build rail's key, and for the same reason: the collapse
   preference is remembered forever and a hard refresh does not clear
   localStorage, so a later change to the default would otherwise never reach
   anybody who had ever toggled it. */
const LS_KEY = 'sag_sales_journey_collapsed_v1';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

export default function SalesJourneyRail() {
  const { data } = useSWR<{ signals: SalesSignals }>('/api/sales-journey', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });

  const [collapsed, setCollapsed] = useState(false);
  const [autoCollapse, setAutoCollapse] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v !== null) { setCollapsed(v === '1'); setAutoCollapse(false); }
    } catch { /* private mode */ }
    setHydrated(true);
  }, []);

  const signals = data?.signals ?? null;
  const done = salesStepsDone(signals);
  const steps = SALES_STEPS.map((s) => ({ ...s, done: done[s.key] }));
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  /* "You are here" — the first unfinished step. Marks, never gates. */
  const curIdx = steps.findIndex((s) => !s.done);

  // Never flash a wrong journey: wait for both localStorage and the signals.
  if (!hydrated || !signals) return null;

  /* This rail FOLDS when every step is done; it does not vanish, and that is
     the one place it deliberately differs from GettingStartedRail.
     That rail is per-project and genuinely finishes: a job gets built, gets
     paid, and the checklist has nothing left to say. Sales never finishes —
     a new lead arrives next week and the same six steps run again. Removing
     the only place the product states the order, the moment somebody has
     followed it once, would take the map away from exactly the people about to
     hand the work to somebody new.
     Folded once they are clearly under way. Two steps in means leads are
     coming in and being worked, which is past the point of being onboarded. */
  const complete = doneCount >= steps.length;
  const showCollapsed = autoCollapse ? (complete || doneCount >= 2) : collapsed;

  function toggle() {
    setAutoCollapse(false); // an explicit choice wins from here on
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem(LS_KEY, n ? '1' : '0'); } catch { /* private mode */ }
      return n;
    });
  }

  return (
    <div data-tour="sales-journey" style={{ marginBottom: 24 }}>
      <SectionCard
        title="How a Deal Becomes a Job"
        subtitle={next ? `Next up: ${next.title}` : 'Every stage in use — expand for the order'}
        icon={<Handshake size={17} weight="duotone" color={BLUE} />}
        flush={showCollapsed}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, whiteSpace: 'nowrap' }}>
              {doneCount} of {steps.length}
            </span>
            <button
              onClick={toggle}
              aria-label={showCollapsed ? 'Expand the sales journey' : 'Collapse the sales journey'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {showCollapsed ? <CaretDown size={13} weight="bold" color={MUTED} /> : <CaretUp size={13} weight="bold" color={MUTED} />}
            </button>
          </div>
        }
      >
        {showCollapsed ? null : (
          <>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ height: '100%', width: `${(doneCount / steps.length) * 100}%`, background: `linear-gradient(90deg,${BLUE},${BLUE_HI})`, borderRadius: 999, transition: 'width .4s ease' }} />
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 10, top: 10, bottom: 16, width: 1, background: 'linear-gradient(180deg, rgba(59,130,246,0.45), rgba(255,255,255,0.08))' }} />
              {steps.map((s, i) => {
                const isCur = i === curIdx;
                const verb = s.done ? 'Review' : isCur ? 'Resume' : 'Open';
                const base = isCur ? 'rgba(59,130,246,0.07)' : 'transparent';
                return (
                  <Link
                    key={s.key}
                    href={s.href}
                    aria-current={isCur ? 'step' : undefined}
                    aria-label={`${s.title} — ${s.done ? 'completed, open to review' : isCur ? 'current step' : 'upcoming step'}`}
                    style={{ textDecoration: 'none', display: 'block' }}
                  >
                    <div
                      style={{
                        display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative',
                        padding: '7px 8px', margin: '0 -8px', borderRadius: 10,
                        background: base,
                        border: isCur ? '1px solid rgba(59,130,246,0.32)' : '1px solid transparent',
                        transition: 'background .15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = base; }}
                    >
                      <div style={{
                        width: 21, height: 21, borderRadius: 999, flexShrink: 0, zIndex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: s.done ? `linear-gradient(180deg,${BLUE_HI},${BLUE})` : '#101011',
                        border: s.done ? 'none' : `1px solid rgba(59,130,246,${isCur ? 0.85 : 0.45})`,
                        boxShadow: isCur ? '0 0 12px rgba(59,130,246,0.45)' : undefined,
                        color: s.done ? '#04121F' : BLUE_HI, fontSize: 10, fontWeight: 900,
                      }}>
                        {s.done ? <Check size={12} weight="bold" color="#04121F" /> : i + 1}
                      </div>
                      <div style={{ minWidth: 0, paddingTop: 1, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: s.done ? MUTED : TEXT, lineHeight: 1.35, minWidth: 0 }}>{s.title}</span>
                          {isCur && (
                            <span style={{
                              padding: '1px 7px', borderRadius: 999, flexShrink: 0,
                              background: 'rgba(59,130,246,0.16)', border: '1px solid rgba(59,130,246,0.45)',
                              color: BLUE_HI, fontSize: 9, fontWeight: 900, letterSpacing: '0.08em',
                            }}>You Are Here</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: s.done ? FAINT : MUTED, lineHeight: 1.5, marginTop: 2 }}>{s.desc}</div>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2,
                        color: isCur ? BLUE_HI : FAINT, fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap',
                      }}>
                        {verb} <ArrowRight size={12} weight="bold" color={isCur ? BLUE_HI : FAINT} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 11.5, color: FAINT, lineHeight: 1.5 }}>
              Once the job is open, <span style={{ color: MUTED, fontWeight: 700 }}>Your Path to First Payment</span> below picks it up — takeoff, budget, subs, schedule, the field and billing.
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
