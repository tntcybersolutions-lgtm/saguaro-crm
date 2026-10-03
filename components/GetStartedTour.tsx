'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ScribbleNote, ScribbleArrow } from './Scribble';

/**
 * GetStartedTour — an animated walkthrough of the real first-run flow.
 *
 * Every screen here mirrors what the product actually does, verified against
 * app/signup/page.tsx and app/onboarding/step-{1..4}/page.tsx. The field
 * labels, the placeholder values and the order of the steps are the ones a
 * new customer will actually see. If that flow changes, this has to change
 * with it — a tour that teaches a flow the product no longer has is worse
 * than no tour.
 *
 * Motion: fields type themselves in and the step auto-advances. Under
 * prefers-reduced-motion every field is already filled, nothing types, and
 * the tour waits for the viewer to press a step.
 */

const GOLD = 'var(--brand-primary)';
const GOLD_SOFT = 'var(--brand-primary-12)';
const GREEN = '#34C759';
const TEXT = '#FFFFFF';
const DIM = '#CBD5E1';
const MUTED = 'rgba(203,213,225,0.55)';
const CARD = 'var(--bg-surface)';
const LINE = 'rgba(255,255,255,0.12)';

type Field = { label: string; value: string; half?: boolean };
type Step = {
  n: number;
  nav: string;
  title: string;
  plain: string;
  screen: string;
  fields?: Field[];
  chips?: string[];
  cta: string;
  done?: string;
  note?: string;
};

/* Transcribed from the live flow — not invented. */
const STEPS: Step[] = [
  {
    n: 1,
    nav: 'Sign Up',
    title: 'Create Your Account',
    plain:
      'Name, email, company. That is the whole form — about thirty seconds, and no credit card anywhere in it.',
    screen: 'saguarocontrol.net/signup',
    fields: [
      { label: 'Your Full Name', value: 'John Smith' },
      { label: 'Work Email', value: 'john@acmeconstruction.com' },
      { label: 'Password', value: '••••••••••' },
      { label: 'Company Name', value: 'Acme Construction LLC' },
      { label: 'State', value: 'Arizona', half: true },
      { label: 'Team Size', value: '11–50', half: true },
    ],
    cta: 'Start Free Trial',
    note: 'No credit card',
  },
  {
    n: 2,
    nav: 'Company',
    title: 'Set Up Your Company',
    plain:
      'Your license number goes here once. After that it prints itself on every pay application, lien waiver and certified payroll report the platform generates.',
    screen: 'Step 2 of 4 — Set Up Your Company',
    fields: [
      { label: 'Company Name', value: 'Acme Construction LLC' },
      { label: 'License Number', value: 'ROC 123456' },
    ],
    cta: 'Continue',
    note: 'Type it once',
  },
  {
    n: 3,
    nav: 'First Project',
    title: 'Add Your First Project',
    plain:
      'A name and an address is enough to start. Everything else — budget, schedule, drawings, crews — hangs off this and can be filled in whenever you get to it.',
    screen: 'Step 3 of 4 — Add Your First Project',
    fields: [
      { label: 'Project Name', value: 'Mesa Library Expansion' },
      { label: 'Address', value: '123 Main St, Mesa AZ 85201' },
    ],
    cta: 'Continue',
    note: 'Two fields',
  },
  {
    n: 4,
    nav: 'Your Crew',
    title: 'Invite Your Team',
    plain:
      'Add everyone — project managers, estimators, the whole field crew. Users are unlimited and nobody costs extra, so there is no reason to leave anyone out.',
    screen: 'Step 4 of 4 — Invite Your Team',
    fields: [
      { label: 'Teammate', value: 'maria@acmeconstruction.com' },
      { label: 'Teammate', value: 'dave@acmeconstruction.com' },
      { label: 'Teammate', value: 'foreman@acmeconstruction.com' },
    ],
    cta: 'Send Invites',
    note: 'Unlimited users',
  },
  {
    n: 5,
    nav: 'Run the Job',
    title: "You're Running",
    plain:
      'That is the setup done. Upload a blueprint and the takeoff prices the job; open the radio and talk to the crew. Everything after this is the actual work.',
    screen: 'app.saguaro.build',
    chips: [
      'Takeoff Studio',
      'Bid Jackets',
      'Daily Logs',
      'T&M Tickets',
      'Saguaro Radio',
      'Crew Map',
    ],
    cta: 'Open the Platform',
    done: "You're All Set",
  },
];

const STEP_MS = 5200;

export default function GetStartedTour() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [typed, setTyped] = useState(0); // 0..1 progress through the current screen
  const raf = useRef<number | null>(null);
  const started = useRef<number>(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setPlaying(false);
        setTyped(1);
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /* One rAF loop drives both the typing and the auto-advance, so they can
     never drift apart or double-fire on a re-render. */
  useEffect(() => {
    if (!playing || reduced) return;
    started.current = performance.now();
    const tick = (now: number) => {
      const t = (now - started.current) / STEP_MS;
      if (t >= 1) {
        setActive(a => (a + 1) % STEPS.length);
        started.current = now;
        setTyped(0);
      } else {
        // fields finish typing in the first 62% of the step, then it holds
        setTyped(Math.min(1, t / 0.62));
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, reduced, active]);

  const go = useCallback((i: number) => {
    setActive(i);
    setTyped(reduced ? 1 : 0);
    started.current = performance.now();
  }, [reduced]);

  const step = STEPS[active];
  const fieldCount = step.fields?.length ?? 0;

  /* Each field gets its own slice of the typing window, so they fill in
     sequence the way a person would actually complete the form. */
  const sliceFor = (i: number) => {
    if (reduced || !fieldCount) return 1;
    const per = 1 / fieldCount;
    return Math.max(0, Math.min(1, (typed - i * per) / per));
  };

  const progress = useMemo(() => (reduced ? 1 : typed), [reduced, typed]);

  return (
    <section
      id="get-started"
      aria-labelledby="get-started-h"
      style={{ padding: '84px max(24px, 4vw)', background: 'var(--bg-base)' }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* ── heading ─────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span
            style={{
              display: 'inline-block', fontSize: 11, fontWeight: 700, color: GOLD,
              background: GOLD_SOFT, padding: '5px 14px', borderRadius: 20,
            }}
          >
            Getting Started
          </span>
        </div>
        <h2
          id="get-started-h"
          className="landing-display gst-h2"
          style={{
            textAlign: 'center', margin: '0 0 10px', color: TEXT,
            textWrap: 'balance' as const,
          }}
        >
          From signup to your first project.
        </h2>
        <p className="landing-lede" style={{ textAlign: 'center', color: DIM, margin: '0 auto 12px', maxWidth: 660 }}>
          Five screens, start to finish. This is the real flow — the same fields
          in the same order you will see when you sign up.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 34 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ScribbleNote color="var(--brand-primary-strong)" size={15} rotate={-4}>No sales call</ScribbleNote>
            <ScribbleArrow direction="right" width={40} color="var(--brand-primary-strong)" style={{ transform: 'rotate(5deg)' }} />
          </span>
        </div>

        {/* ── tour ────────────────────────────────────────────────── */}
        <div className="gst-grid">
          {/* step rail */}
          <ol className="gst-rail" aria-label="Setup steps">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.n}>
                  <button
                    onClick={() => go(i)}
                    aria-current={on ? 'step' : undefined}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%',
                      minHeight: 44, textAlign: 'left', cursor: 'pointer',
                      background: on ? 'var(--brand-primary-08)' : 'transparent',
                      border: '1px solid ' + (on ? 'var(--brand-primary-35)' : 'transparent'),
                      borderRadius: 12, padding: '12px 14px',
                      transition: 'background .2s, border-color .2s',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        flex: '0 0 auto', width: 26, height: 26, borderRadius: 999,
                        display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                        background: on ? GOLD : 'rgba(255,255,255,0.07)',
                        color: on ? '#0A0A00' : MUTED,
                        border: '1px solid ' + (on ? GOLD : LINE),
                      }}
                    >
                      {s.n}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 650, color: on ? TEXT : DIM }}>
                        {s.nav}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                        {s.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}

            <li style={{ marginTop: 6, paddingLeft: 14 }}>
              <button
                onClick={() => setPlaying(p => !p)}
                disabled={reduced}
                style={{
                  minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: '1px solid ' + LINE, borderRadius: 10,
                  padding: '0 14px', color: reduced ? MUTED : DIM, fontSize: 12.5, fontWeight: 600,
                  cursor: reduced ? 'not-allowed' : 'pointer',
                }}
              >
                {reduced ? 'Animation off' : playing ? '❚❚  Pause' : '▶  Play'}
              </button>
            </li>
          </ol>

          {/* screen */}
          <div>
            <div
              style={{
                background: CARD, border: '1px solid ' + LINE, borderRadius: 16,
                overflow: 'hidden', boxShadow: '0 24px 60px -30px rgba(0,0,0,0.9)',
              }}
            >
              {/* chrome */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid ' + LINE }}>
                <span aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
                  {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
                    <i key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c, display: 'block' }} />
                  ))}
                </span>
                <span style={{ fontSize: 12, color: MUTED, fontFamily: 'ui-monospace, monospace' }}>{step.screen}</span>
              </div>

              {/* body */}
              <div style={{ padding: '26px 26px 30px', minHeight: 318 }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: GOLD }}>
                  Step {step.n} of {STEPS.length}
                </p>
                <h3 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>
                  {step.done ?? step.title}
                </h3>

                {step.fields && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                    {step.fields.map((f, i) => {
                      const p = sliceFor(i);
                      const shown = f.value.slice(0, Math.round(f.value.length * p));
                      const filled = p >= 1;
                      return (
                        <div key={f.label + i} style={{ flex: f.half ? '1 1 44%' : '1 1 100%', minWidth: 0 }}>
                          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: MUTED, marginBottom: 6 }}>
                            {f.label}
                          </label>
                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid ' + (filled ? 'rgba(52,199,89,0.4)' : p > 0 ? 'color-mix(in srgb, var(--brand-primary) 50%, transparent)' : LINE),
                              borderRadius: 9, padding: '10px 12px', minHeight: 40,
                              transition: 'border-color .25s',
                            }}
                          >
                            <span style={{ fontSize: 13.5, color: shown ? TEXT : MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {shown || ' '}
                            </span>
                            {p > 0 && p < 1 && (
                              <span aria-hidden="true" style={{ width: 1.5, height: 15, background: GOLD, animation: 'gst-caret .9s steps(1) infinite' }} />
                            )}
                            {filled && (
                              <svg aria-hidden="true" width={15} height={15} viewBox="0 0 20 20" fill={GREEN} style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
                                <path d="M10 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.3 7.7-5 5a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4L8.6 10.6l4.3-4.3a1 1 0 0 1 1.4 1.4z" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {step.chips && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                    {step.chips.map((c, i) => {
                      const on = reduced || typed > (i + 0.4) / step.chips!.length;
                      return (
                        <span
                          key={c}
                          style={{
                            fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 999,
                            border: '1px solid ' + (on ? 'var(--brand-primary-35)' : LINE),
                            background: on ? GOLD_SOFT : 'transparent',
                            color: on ? GOLD : MUTED,
                            opacity: on ? 1 : 0.45,
                            transform: on ? 'none' : 'translateY(4px)',
                            transition: 'opacity .35s, transform .35s, background .35s, border-color .35s, color .35s',
                          }}
                        >
                          {c}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 20px',
                      borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                      background: progress >= 1 ? GOLD : 'var(--brand-primary-25)',
                      color: progress >= 1 ? '#0A0A00' : 'rgba(10,10,0,0.7)',
                      transition: 'background .3s, color .3s',
                    }}
                  >
                    {step.cta}
                  </span>
                  {step.note && (
                    <ScribbleNote color="var(--brand-primary-strong)" size={14} rotate={-5} style={{ opacity: progress >= 1 ? 0.95 : 0 , transition: 'opacity .4s' }}>
                      {step.note}
                    </ScribbleNote>
                  )}
                </div>
              </div>

              {/* step progress */}
              <div aria-hidden="true" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: GOLD, transition: reduced ? 'none' : 'width .12s linear' }} />
              </div>
            </div>

            {/* plain-English caption */}
            <p className="gst-caption" style={{ margin: '18px 2px 0', color: DIM, minHeight: 74 }}>
              {step.plain}
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
              <Link
                href="/signup"
                className="btn-gold"
                style={{ textDecoration: 'none', fontSize: 14, padding: '11px 24px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              >
                Start Free Trial
              </Link>
              <Link
                href="/how-to-get-started"
                style={{
                  display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 20px',
                  border: '1px solid ' + LINE, borderRadius: 9, color: DIM, fontSize: 14,
                  fontWeight: 600, textDecoration: 'none',
                }}
              >
                Read the Full Guide
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* .landing-display maxes at 82px, tuned for three-word statements. This
           headline is a sentence, so it takes the same opt-out one tier down. */
        [data-landing] .gst-h2 { font-size: clamp(27px, 3.4vw, 45px) !important; line-height: 1.08 !important; }
        [data-landing] .gst-caption { font-size: 15.5px !important; line-height: 1.6 !important; }
        .gst-grid { display: grid; grid-template-columns: 268px 1fr; gap: 34px; align-items: start; }
        .gst-rail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 74px; }
        @keyframes gst-caret { 50% { opacity: 0; } }
        @media (max-width: 900px) {
          .gst-grid { grid-template-columns: 1fr; gap: 22px; }
          .gst-rail { position: static; flex-direction: row; overflow-x: auto; gap: 8px; padding-bottom: 4px; }
          .gst-rail li { flex: 0 0 auto; }
          .gst-rail li button { white-space: nowrap; }
        }
        @media (prefers-reduced-motion: reduce) {
          .gst-grid * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </section>
  );
}
