'use client';

/**
 * StatusPill and LifecycleRail — one status treatment for the whole platform.
 *
 * The rail started as an inline primitive on the pay applications table, with
 * a comment explaining that the shared component library was deliberately left
 * alone. It was the best status display in the product and it existed on
 * exactly one screen. This is that treatment, generalised, driven by
 * lib/status-system.
 *
 * Three things on screen, in order of how often they matter:
 *
 *   the pill    what state, in a color that means the same thing everywhere
 *   the rail    how far through, and what the next stage is called
 *   the nudge   what to do about it — and, when it has gone quiet in somebody
 *               else's court, for how long
 *
 * The nudge is the part a system of record does not do. "Submitted" is a fact.
 * "Owner has had it 9 days" is a reason to pick up the phone.
 */

import React, { useEffect, useRef, useState } from 'react';
import { MODULES, resolveStatus, staleDays, TONES, type Tone } from '@/lib/status-system';

/* ── pill ───────────────────────────────────────────────────────────────── */

export interface StatusPillProps {
  /** Table name — 'pay_applications', 'rfis', … */
  module: string;
  status: string | null | undefined;
  size?: 'sm' | 'md';
  /** Flash briefly — the row just changed under you. */
  changed?: boolean;
  style?: React.CSSProperties;
  /** Replace the module's label with specific words ("Expired Sep 3", "14d left"); tone and glyph stay. */
  label?: string;
  /** A glyph in place of the dot — a check for on file, an X for missing, etc. */
  icon?: React.ReactNode;
}

export function StatusPill({ module, status, size = 'md', changed, style, label, icon }: StatusPillProps) {
  const r0 = resolveStatus(module, status);
  const r = label ? { ...r0, label } : r0;
  const pad = size === 'sm' ? '2px 7px' : '3px 9px';
  const fs = size === 'sm' ? 11 : 12;

  return (
    <span
      title={r.action ? `${r.label} — ${r.action}` : `${r.label} — ${TONES[r.tone].meaning}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: pad, borderRadius: 999,
        fontSize: fs, fontWeight: 700, letterSpacing: 'normal',
        whiteSpace: 'nowrap',
        color: r.style.fg,
        background: r.style.bg,
        border: `1px solid ${r.style.border}`,
        boxShadow: changed ? `0 0 0 3px ${r.style.bg}` : 'none',
        animation: changed ? 'sagStatusFlash 1.6s ease-out 2' : undefined,
        ...style,
      }}
    >
      {icon ? (
        <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 5, height: 5, borderRadius: 999, background: r.style.fg,
            boxShadow: `0 0 6px ${r.style.fg}`, flexShrink: 0,
          }}
        />
      )}
      {r.label}
    </span>
  );
}

/* ── rail ───────────────────────────────────────────────────────────────── */

export interface LifecycleRailProps {
  module: string;
  status: string | null | undefined;
  /**
   * When this record last moved. Drives the "sitting for N days" nudge — pass
   * updated_at, or the timestamp of the step it is waiting on.
   */
  since?: string | Date | null;
  /** Show the one-line instruction under the pill. */
  showAction?: boolean;
  /** Flash — this row changed while you were looking at it. */
  changed?: boolean;
  compact?: boolean;
  style?: React.CSSProperties;
}

export function LifecycleRail({
  module, status, since, showAction = true, changed, compact, style,
}: LifecycleRailProps) {
  const r = resolveStatus(module, status);
  const mod = MODULES[module];

  /* Rendered on the client only. Comparing against `new Date()` during render
     would differ between the server pass and the first client pass and trip
     hydration, so the clock starts after mount. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const stale = now ? staleDays(module, status, since, now) : null;
  const hasRail = (mod?.stages.length ?? 0) > 1;

  return (
    <div style={{ minWidth: compact ? 0 : 150, ...style }}>
      {hasRail && (
        <div
          style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}
          title={`${mod.stages.join(' → ')} — now ${r.label}`}
        >
          {mod.stages.map((label, i) => {
            /* An off-path status (rejected, failed) has no stage: nothing is
               filled, because it did not get further along — it stopped. */
            const reached = r.stage !== null && r.stage >= i;
            const isNow = r.stage === i;
            const last = i === mod.stages.length - 1;
            const dot = reached ? (last ? TONES.done.fg : r.style.fg) : 'transparent';
            return (
              <React.Fragment key={label}>
                {i > 0 && (
                  <div style={{
                    width: compact ? 10 : 16, height: 2, flexShrink: 0,
                    background: reached ? r.style.border : 'rgba(255,255,255,0.14)',
                  }} />
                )}
                <div
                  title={label}
                  style={{
                    width: 9, height: 9, borderRadius: 999, flexShrink: 0, boxSizing: 'border-box',
                    background: dot,
                    border: reached ? 'none' : '1.5px solid rgba(255,255,255,0.28)',
                    boxShadow: isNow ? `0 0 0 3px ${r.style.bg}, 0 0 8px ${r.style.fg}` : 'none',
                    transition: 'background .25s ease, box-shadow .25s ease',
                  }}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <StatusPill module={module} status={status} size={compact ? 'sm' : 'md'} changed={changed} />
        {stale !== null && (
          <span
            title={`No movement for ${stale} days`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 700,
              color: TONES.warn.fg, whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: TONES.warn.fg, boxShadow: `0 0 6px ${TONES.warn.fg}` }} />
            {stale}d — chase it
          </span>
        )}
      </div>

      {showAction && r.action && !compact && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.35 }}>
          {r.action}
        </div>
      )}
    </div>
  );
}

/* ── the flash keyframes ────────────────────────────────────────────────── */

/**
 * Mounted once by the app shell. A row that changes under you should catch the
 * eye without a toast covering the thing you were reading.
 */
export function StatusFlashStyles() {
  return (
    <style>{`
      @keyframes sagStatusFlash {
        0%   { filter: brightness(1.9); }
        60%  { filter: brightness(1.15); }
        100% { filter: brightness(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes sagStatusFlash { 0%,100% { filter: none; } }
      }
    `}</style>
  );
}

/* ── legend ─────────────────────────────────────────────────────────────── */

/**
 * What the colors mean. Worth showing once on a status-heavy screen — a
 * color system nobody explained is decoration.
 */
export function StatusLegend({ tones }: { tones?: Tone[] }) {
  const show = tones ?? (['active', 'waiting', 'good', 'warn', 'bad'] as Tone[]);
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      {show.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-text-2)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: TONES[t].fg, boxShadow: `0 0 6px ${TONES[t].fg}` }} />
          {TONES[t].meaning}
        </span>
      ))}
    </div>
  );
}
