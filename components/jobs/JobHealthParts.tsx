'use client';
/**
 * Job health visuals — the health ring, the schedule bar and the RFI /
 * submittal / change-order dots, read from lib/job-health (computed on the
 * server in /api/projects/list). Shared by the Jobs list, the job page header
 * and Home so the same job always shows the same signal.
 *
 * Green / yellow / red only ever mean on track / at risk / in trouble; the
 * neon-yellow action color is never used for status.
 */
import React from 'react';
import type { JobHealth, ItemSummary } from '@/lib/job-health';

const TONE_VAR: Record<JobHealth['tone'], string> = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' };
const STATE_VAR: Record<ItemSummary['state'], string> = { none: 'var(--text-tertiary)', ok: 'var(--success)', soon: 'var(--warning)', late: 'var(--danger)' };

export function HealthRing({ health, size = 44 }: { health: JobHealth | null | undefined; size?: number }) {
  const stroke = Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  if (!health) {
    return (
      <span className="jh-ring" style={{ width: size, height: size }} aria-label="Health not available">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
        </svg>
        <b style={{ fontSize: Math.round(size * 0.3) }}>—</b>
      </span>
    );
  }
  const color = TONE_VAR[health.tone];
  const label = `Health ${health.score} of 100. ${health.reasons.join('. ')}`;
  return (
    <span className="jh-ring" style={{ width: size, height: size }} role="img" aria-label={label} title={health.reasons.join('\n')}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(c * health.score) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b style={{ fontSize: Math.round(size * 0.32), color }}>{health.score}</b>
    </span>
  );
}

/** Work done (solid) against time used (marker); the part of the time used beyond the work done turns red. */
export function ScheduleBar({ health }: { health: JobHealth | null | undefined }) {
  const s = health?.schedule;
  const work = s?.workPct ?? null;
  const time = s?.timePct ?? null;
  if (work == null && time == null) return <span className="jh-bar jh-bar-empty" aria-label="No schedule dates" />;
  const w = work ?? 0;
  const lagging = time != null && work != null && time > work;
  const late = (s?.daysLate || 0) > 0;
  const text = [
    work != null ? `${work}% done` : null,
    time != null ? `${time}% of schedule used` : null,
    late ? `${s!.daysLate} days late` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span className="jh-bar" role="img" aria-label={text} title={text}>
      <span className="jh-bar-done" style={{ width: `${w}%`, background: s?.behind ? 'var(--danger)' : 'var(--success)' }} />
      {lagging && <span className="jh-bar-over" style={{ left: `${w}%`, width: `${(time as number) - w}%` }} />}
      {time != null && <span className="jh-bar-now" style={{ left: `calc(${time}% - 1px)` }} />}
    </span>
  );
}

function dotText(name: string, it: ItemSummary): string {
  if (it.state === 'none') return `${name}: none open`;
  const parts = [`${it.open} open`];
  if (it.overdue) parts.push(`${it.overdue} overdue`);
  if (it.dueSoon) parts.push(`${it.dueSoon} due this week`);
  return `${name}: ${parts.join(', ')}`;
}

export function ItemDot({ label, item }: { label: string; item: ItemSummary | undefined }) {
  const it = item || { open: 0, dueSoon: 0, overdue: 0, state: 'none' as const };
  const text = dotText(label, it);
  return (
    <span className="jh-dot" data-state={it.state} title={text} aria-label={text}>
      <i style={{ background: STATE_VAR[it.state] }} />
      <em>{it.open > 0 ? it.open : '0'}</em>
    </span>
  );
}

export function ItemDots({ health }: { health: JobHealth | null | undefined }) {
  return (
    <span className="jh-dots">
      <ItemDot label="RFIs" item={health?.rfis} />
      <ItemDot label="Submittals" item={health?.submittals} />
      <ItemDot label="Change orders" item={health?.changeOrders} />
    </span>
  );
}

/** Exact money with cents, e.g. $447,932.00. */
export function fmtMoneyExact(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const JOB_HEALTH_CSS = `
.jh-ring{position:relative;display:inline-grid;place-items:center;flex:none}
.jh-ring svg{position:absolute;inset:0}
.jh-ring b{position:relative;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1}
.jh-bar{position:relative;display:block;height:8px;border-radius:999px;background:color-mix(in srgb,var(--border-default) 70%,transparent);overflow:hidden;min-width:80px}
.jh-bar-empty{opacity:.5}
.jh-bar-done{position:absolute;left:0;top:0;bottom:0;border-radius:999px}
.jh-bar-over{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--danger) 75%,transparent) 0 4px,color-mix(in srgb,var(--danger) 40%,transparent) 4px 8px)}
.jh-bar-now{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--text-primary);border-radius:2px}
.jh-dots{display:inline-flex;gap:14px;align-items:center}
.jh-dot{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--text-secondary);font-variant-numeric:tabular-nums}
.jh-dot i{width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 0%,transparent)}
.jh-dot[data-state=late] i{box-shadow:0 0 8px color-mix(in srgb,var(--danger) 70%,transparent)}
.jh-dot[data-state=soon] i{box-shadow:0 0 8px color-mix(in srgb,var(--warning) 60%,transparent)}
.jh-dot em{font-style:normal}
.jh-dot[data-state=none] em{color:var(--text-tertiary);font-weight:600}
`;
