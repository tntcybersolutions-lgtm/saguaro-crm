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
/* Nothing open is good news, so it reads green like Procore's health table;
   gray is kept for "does not apply" (no daily log on a job still bidding). */
const STATE_VAR: Record<ItemSummary['state'], string> = { none: 'var(--success)', ok: 'var(--success)', soon: 'var(--warning)', late: 'var(--danger)', na: 'var(--text-tertiary)' };

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
  if (it.state === 'na') return `${name}: not started`;
  if (it.state === 'none') return `${name}: none open`;
  const parts = [`${it.open} open`];
  if (it.overdue) parts.push(`${it.overdue} overdue`);
  if (it.dueSoon) parts.push(`${it.dueSoon} due this week`);
  return `${name}: ${parts.join(', ')}`;
}

export function ItemDot({ label, item, value, text: given }: { label: string; item: ItemSummary | undefined; value?: string; text?: string }) {
  const it = item || { open: 0, dueSoon: 0, overdue: 0, state: 'na' as const };
  const text = given || dotText(label, it);
  return (
    <span className="jh-dot" data-state={it.state} title={text} aria-label={text}>
      <i style={{ background: STATE_VAR[it.state] }} />
      <em>{value ?? (it.state === 'na' ? '—' : String(it.open))}</em>
      <small className="jh-dot-l">{label}</small>
    </span>
  );
}

/** The six past-due signals, in Procore's order: RFIs, submittals, change orders, punch, daily log, safety. */
export const ITEM_COLUMNS = ['RFIs', 'Submittals', 'COs', 'Punch', 'Daily log', 'Safety'] as const;

export function ItemDots({ health }: { health: JobHealth | null | undefined }) {
  const log = health?.dailyLog;
  const logValue = !log || log.state === 'na' ? '—' : log.daysSince == null ? 'None' : log.daysSince === 0 ? 'Today' : `${log.daysSince}d`;
  const logText = !log || log.state === 'na' ? 'Daily log: not started'
    : log.daysSince == null ? 'Daily log: none filed yet'
    : `Daily log: last filed ${log.daysSince === 0 ? 'today' : `${log.daysSince} day${log.daysSince === 1 ? '' : 's'} ago`}`;
  const inc = health?.incidents;
  const incText = !inc ? 'Safety: not available' : inc.open > 0 ? `Safety: ${inc.open} open incident${inc.open === 1 ? '' : 's'} in the last 30 days`
    : inc.dueSoon > 0 ? `Safety: ${inc.dueSoon} closed incident${inc.dueSoon === 1 ? '' : 's'} in the last 30 days` : 'Safety: no incidents in 30 days';
  return (
    <span className="jh-dots">
      <ItemDot label="RFIs" item={health?.rfis} />
      <ItemDot label="Submittals" item={health?.submittals} />
      <ItemDot label="COs" item={health?.changeOrders} text={health ? dotText('Change orders', health.changeOrders) : undefined} />
      <ItemDot label="Punch" item={health?.punch} />
      <ItemDot label="Daily log" item={log} value={logValue} text={logText} />
      <ItemDot label="Safety" item={inc} text={incText} />
    </span>
  );
}

/** Budget less cost at completion: green when under, red when over, exact to the cent. */
export function OverUnder({ health }: { health: JobHealth | null | undefined }) {
  const b = health?.budget;
  if (!b || b.revised <= 0 || b.forecast <= 0) return <span className="jh-ou" data-tone="na"><b>—</b><small>No budget yet</small></span>;
  const diff = Math.round((b.revised - b.forecast) * 100) / 100;
  const tone = diff < 0 ? 'bad' : 'good';
  const pct = Math.abs(b.overPct ?? 0);
  return (
    <span className="jh-ou" data-tone={tone} title={`Budget ${fmtMoneyExact(b.revised)} · cost at completion ${fmtMoneyExact(b.forecast)}`}>
      <b>{diff < 0 ? '−' : '+'}{fmtMoneyExact(Math.abs(diff))}</b>
      <small>{diff < 0 ? `${pct}% over` : diff === 0 ? 'On budget' : `${pct}% under`}</small>
    </span>
  );
}

const STAGE_VAR: Record<string, string> = { bidding: 'var(--mod-sales)', building: 'var(--mod-field)', complete: 'var(--text-tertiary)', closed: 'var(--text-tertiary)' };
export function StagePill({ stage, label }: { stage: string; label: string }) {
  return <span className="jh-stage" style={{ ['--st' as string]: STAGE_VAR[stage] || 'var(--text-tertiary)' }}>{label}</span>;
}

type PortfolioJob = { id: string; name?: string | null; contract: number; billed: number | null; health?: JobHealth | null };

function Donut({ good, warn, bad }: { good: number; warn: number; bad: number }) {
  const total = good + warn + bad;
  const size = 132, stroke = 16, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = ([['good', good], ['warn', warn], ['bad', bad]] as const).filter(([, n]) => n > 0).map(([tone, n]) => {
    const len = (c * n) / total;
    const seg = { tone, len, offset };
    offset += len;
    return seg;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${good} on track, ${warn} at risk, ${bad} in trouble`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
      {segs.map((s) => (
        <circle key={s.tone} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE_VAR[s.tone]} strokeWidth={stroke}
          strokeDasharray={`${Math.max(0, s.len - (segs.length > 1 ? 3 : 0))} ${c}`} strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      ))}
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fill="var(--text-primary)" fontSize="30" fontWeight="800">{total}</text>
      <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" fill="var(--text-secondary)" fontSize="12" fontWeight="600">{total === 1 ? 'job' : 'jobs'}</text>
    </svg>
  );
}

/**
 * Portfolio health — the band over the Jobs table, modeled on Procore's Health
 * Dashboard: how many jobs are on track / at risk / in trouble, the money
 * (contract, billed, budget, cost at completion, over/under) and a
 * budget-vs-cost bar per job. Every figure is summed from the same rows the
 * table shows, so the band and the table can never disagree.
 */
export function PortfolioBand({ jobs }: { jobs: PortfolioJob[] }) {
  const counts = { good: 0, warn: 0, bad: 0 };
  let contract = 0, billed = 0, budget = 0, forecast = 0;
  for (const j of jobs) {
    if (j.health) counts[j.health.tone]++;
    contract += j.contract;
    billed += j.billed || 0;
    const b = j.health?.budget;
    if (b && b.revised > 0 && b.forecast > 0) { budget += b.revised; forecast += b.forecast; }
  }
  const billedPctAll = contract > 0 ? Math.min(100, Math.round((billed / contract) * 100)) : 0;
  const diff = Math.round((budget - forecast) * 100) / 100;
  const diffPct = budget > 0 ? Math.round((Math.abs(diff) / budget) * 1000) / 10 : 0;
  const budgeted = jobs.filter((j) => (j.health?.budget.revised || 0) > 0 && (j.health?.budget.forecast || 0) > 0)
    .sort((a, b) => (b.health!.budget.revised) - (a.health!.budget.revised)).slice(0, 6);
  const scale = Math.max(1, ...budgeted.map((j) => Math.max(j.health!.budget.revised, j.health!.budget.forecast)));
  return (
    <section className="pf" aria-label="Portfolio health">
      <div className="pf-mix">
        <Donut good={counts.good} warn={counts.warn} bad={counts.bad} />
        <ul className="pf-legend">
          <li><i style={{ background: TONE_VAR.good }} /><b>{counts.good}</b> On track</li>
          <li><i style={{ background: TONE_VAR.warn }} /><b>{counts.warn}</b> At risk</li>
          <li><i style={{ background: TONE_VAR.bad }} /><b>{counts.bad}</b> In trouble</li>
        </ul>
      </div>
      <dl className="pf-kpis">
        <div><dt>Contract value</dt><dd>{fmtMoneyExact(contract)}</dd></div>
        <div>
          <dt>Billed to date</dt><dd>{fmtMoneyExact(billed)}</dd>
          <span className="pf-bar" aria-label={`${billedPctAll}% of contract billed`}><span style={{ width: `${billedPctAll}%` }} /></span>
          <small>{billedPctAll}% of contract</small>
        </div>
        <div><dt>Projected budget</dt><dd>{budget > 0 ? fmtMoneyExact(budget) : '—'}</dd></div>
        <div><dt>Cost at completion</dt><dd>{forecast > 0 ? fmtMoneyExact(forecast) : '—'}</dd></div>
        <div data-tone={budget > 0 ? (diff < 0 ? 'bad' : 'good') : 'na'}>
          <dt>Over / under</dt>
          <dd>{budget > 0 ? `${diff < 0 ? '−' : '+'}${fmtMoneyExact(Math.abs(diff))}` : '—'}</dd>
          {budget > 0 && <small>{diff < 0 ? `${diffPct}% over budget` : `${diffPct}% under budget`}</small>}
        </div>
      </dl>
      <div className="pf-chart">
        <h2 className="pf-h">Projects by budget</h2>
        {budgeted.length === 0 ? <p className="pf-empty">No job has a budget yet.</p> : (
          <ul>
            {budgeted.map((j) => {
              const b = j.health!.budget;
              const over = b.forecast > b.revised;
              return (
                <li key={j.id} title={`Budget ${fmtMoneyExact(b.revised)} · cost at completion ${fmtMoneyExact(b.forecast)}`}>
                  <span className="pf-name">{j.name || 'Untitled job'}</span>
                  <span className="pf-track">
                    <span className="pf-budget" style={{ width: `${(b.revised / scale) * 100}%` }} />
                    <span className="pf-cost" data-over={over ? 'true' : undefined} style={{ width: `${(b.forecast / scale) * 100}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="pf-key"><i className="k-b" /> Budget <i className="k-c" /> Cost at completion <i className="k-o" /> Over</p>
      </div>
    </section>
  );
}

/** Exact money with cents, e.g. $447,932.00. */
export function fmtMoneyExact(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const JOB_HEALTH_CSS = `
.jh-dot-l{display:none}
.jh-ou{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-variant-numeric:tabular-nums}
.jh-ou b{font-size:14px;font-weight:700;white-space:nowrap}
.jh-ou small{font-size:12px;color:var(--text-secondary);white-space:nowrap}
.jh-ou[data-tone=good] b{color:var(--success)}.jh-ou[data-tone=bad] b{color:var(--danger)}.jh-ou[data-tone=na] b{color:var(--text-tertiary)}
.jh-stage{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:700;color:var(--st);background:color-mix(in srgb,var(--st) 14%,transparent);white-space:nowrap}
.jh-stage::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--st)}
.pf{display:grid;grid-template-columns:auto minmax(0,1.5fr) minmax(0,1fr);gap:28px;align-items:center;padding:18px 0 22px;margin-bottom:16px;border-bottom:1px solid var(--fl-line)}
.pf-mix{display:flex;align-items:center;gap:18px}
.pf-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;font-size:13px;color:var(--text-secondary);white-space:nowrap}
.pf-legend li{display:flex;align-items:center;gap:8px}
.pf-legend i{width:10px;height:10px;border-radius:50%}
.pf-legend b{min-width:18px;font-size:18px;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums}
.pf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px 24px;margin:0}
.pf-kpis>div{display:flex;flex-direction:column;gap:4px;min-width:0}
.pf-kpis dt{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-tertiary)}
.pf-kpis dd{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.pf-kpis small{font-size:12px;color:var(--text-secondary)}
.pf-kpis [data-tone=good] dd{color:var(--success)}.pf-kpis [data-tone=bad] dd{color:var(--danger)}
.pf-bar{display:block;height:6px;border-radius:999px;background:color-mix(in srgb,var(--border-default) 70%,transparent);overflow:hidden;margin-top:2px}
.pf-bar span{display:block;height:100%;border-radius:999px;background:var(--success)}
.pf-h{margin:0 0 10px;font-size:12px !important;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-tertiary) !important;-webkit-text-fill-color:currentColor}
.pf-chart ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.pf-chart li{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr);gap:10px;align-items:center}
.pf-name{font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-track{position:relative;height:14px}
.pf-budget{position:absolute;left:0;top:0;height:6px;border-radius:3px;background:color-mix(in srgb,var(--text-tertiary) 70%,transparent)}
.pf-cost{position:absolute;left:0;top:8px;height:6px;border-radius:3px;background:var(--success)}
.pf-cost[data-over=true]{background:var(--danger)}
.pf-empty{margin:0;font-size:13px;color:var(--text-tertiary)}
.pf-key{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:10px 0 0;font-size:12px;color:var(--text-tertiary)}
.pf-key i{width:10px;height:4px;border-radius:2px;margin-left:6px}.pf-key i:first-child{margin-left:0}
.pf-key .k-b{background:var(--text-tertiary)}.pf-key .k-c{background:var(--success)}.pf-key .k-o{background:var(--danger)}
@media (max-width:1180px){.pf{grid-template-columns:auto minmax(0,1fr)}.pf-chart{grid-column:1 / -1}}
@media (max-width:640px){.pf{grid-template-columns:1fr;gap:20px}.pf-mix{justify-content:flex-start}.pf-kpis{grid-template-columns:1fr 1fr}.pf-kpis dd{font-size:18px}}
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
