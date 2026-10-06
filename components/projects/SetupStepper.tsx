'use client';
import React from 'react';
import { Check } from '@phosphor-icons/react';

/**
 * SetupStepper — the three steps of starting a job, with depth.
 *
 * A GC should be able to glance at the top of the screen and know where they
 * are, what is left, and that nothing is hiding. That is what "professional"
 * means on a setup screen — not decoration, but never having to wonder.
 *
 * Built from CSS and SVG rather than WebGL on purpose. This screen is used on
 * jobsite laptops and tablets, the takeoff page has already frozen a renderer
 * once today at 168 rows, and a stepper that stutters is worse than a plain
 * one. Everything here is layered gradients, a lit rail and a spring on the
 * active pip — depth without a canvas.
 */

const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';

export interface SetupStep {
  n: number;
  title: string;
  hint: string;
  done: boolean;
}

export default function SetupStepper({ steps, active }: { steps: SetupStep[]; active: number }) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = steps.length > 1 ? (doneCount / steps.length) * 100 : 0;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        padding: '18px 22px',
        marginBottom: 18,
        background: 'var(--bg-surface)',
        border: '1px solid var(--brand-primary-25)',
        boxShadow: '0 18px 40px -24px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Blueprint grid, very faint — the surface reads as a drawing, not a form. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(circle at 18% 0%, #000, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 18% 0%, #000, transparent 72%)',
        }}
      />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap' }}>
        {steps.map((s, i) => {
          const isActive = s.n === active;
          const state: 'done' | 'active' | 'todo' = s.done ? 'done' : isActive ? 'active' : 'todo';
          return (
            <React.Fragment key={s.n}>
              <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', flex: '1 1 210px', minWidth: 190 }}>
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12.5,
                    fontWeight: 900,
                    transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s',
                    transform: isActive ? 'scale(1.12)' : 'scale(1)',
                    background:
                      state === 'done'
                        ? `linear-gradient(150deg, ${GOLD_HI}, ${GOLD})`
                        : state === 'active'
                          ? 'var(--brand-primary-18)'
                          : 'rgba(255,255,255,0.05)',
                    border:
                      state === 'todo'
                        ? '1px solid rgba(255,255,255,0.16)'
                        : `1px solid ${GOLD}`,
                    color: state === 'done' ? 'var(--on-brand)' : state === 'active' ? GOLD_HI : 'rgba(255,255,255,0.45)',
                    boxShadow: isActive ? `0 0 0 4px var(--brand-primary-12)` : 'none',
                  }}
                >
                  {s.done ? <Check size={15} weight="bold" color="var(--on-brand)" /> : s.n}
                </span>

                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13.5,
                      fontWeight: 800,
                      lineHeight: 1.3,
                      color: state === 'todo' ? 'rgba(255,255,255,0.55)' : 'var(--text-primary)',
                    }}
                  >
                    {s.title}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.44)', marginTop: 2 }}>
                    {s.hint}
                  </span>
                </span>
              </div>

              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  style={{
                    flex: '0 1 34px',
                    minWidth: 16,
                    height: 2,
                    alignSelf: 'center',
                    marginTop: -14,
                    borderRadius: 2,
                    background: s.done
                      ? `linear-gradient(90deg, ${GOLD}, var(--brand-primary-25))`
                      : 'rgba(255,255,255,0.10)',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* One honest progress rail rather than a percentage nobody asked for. */}
      <div style={{ position: 'relative', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginTop: 16 }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${GOLD}, ${GOLD_HI})`,
            boxShadow: `0 0 12px -2px ${GOLD}`,
            transition: 'width .35s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </div>
    </div>
  );
}
