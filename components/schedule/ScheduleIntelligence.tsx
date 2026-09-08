'use client';
import React, { useMemo } from 'react';
import { Path, Clock, WarningCircle, Flag } from '@phosphor-icons/react';
import HealthPanel, { type PanelFinding } from '@/components/ui/HealthPanel';
import { assessSchedule } from '@/lib/schedule-health';
import { makeCalendar, type CpmTask } from '@/lib/schedule-cpm';

const GOLD = '#F59E0B', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF';
const GREEN = '#45B37D', RED = '#E0644E', AMBER = '#F0A63C';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/**
 * The critical path, the float, and whether the schedule means anything.
 *
 * `schedule_tasks` has carried es, ef, ls, lf, total_float and is_critical
 * since the table was created and nothing ever computed them — es was null on
 * every one of 42 live tasks while is_critical was set on five. This is the
 * first thing that runs the passes and the first thing that says out loud when
 * a schedule has no logic to run them on.
 */
export default function ScheduleIntelligence({
  tasks, holidays = [], dataDate,
}: {
  tasks: CpmTask[];
  holidays?: string[];
  dataDate?: string | null;
}) {
  const health = useMemo(
    () => assessSchedule(tasks, { calendar: makeCalendar([1, 2, 3, 4, 5], holidays), dataDate }),
    [tasks, holidays, dataDate],
  );
  const { network, forecast, totals } = health;
  /* The forecast, not the plan-if-it-all-ran-again. Float and the finish date
     belong to the pass that honours what has actually been built — the logic
     network is free to schedule September's work back into February, and on
     live data the two disagreed by ten weeks. */
  const dated = forecast.network;
  const slipped = forecast.projectFinish.from && forecast.projectFinish.to
    ? Math.round((Date.parse(forecast.projectFinish.to) - Date.parse(forecast.projectFinish.from)) / 86400000)
    : 0;

  const failed: PanelFinding[] = health.failed.map((c) => ({
    id: c.id, severity: c.severity, title: c.title, detail: c.detail, threshold: c.threshold, count: c.count,
  }));
  const passed: PanelFinding[] = health.checks.filter((c) => c.passed).map((c) => ({
    id: c.id, severity: c.severity, title: c.title, detail: c.detail, threshold: c.threshold,
  }));

  /* The path itself, in order, with each task's duration — the answer to "what
     makes this project late", which is the only question a schedule exists to
     answer. */
  const path = dated.criticalPath.map((id) => ({
    id,
    task: tasks.find((t) => String(t.id) === id),
    node: dated.byId[id],
  })).filter((p) => p.task && p.node);

  const nearCritical = dated.tasks
    .filter((t) => t.isNearCritical)
    .sort((a, b) => a.totalFloat - b.totalFloat)
    .slice(0, 8);

  const negative = dated.tasks.filter((t) => t.totalFloat < 0).sort((a, b) => a.totalFloat - b.totalFloat);

  const stat = (label: string, value: React.ReactNode, sub?: string, color?: string) => (
    <div style={{ flex: '1 1 130px', background: RAISED, border: '1px solid ' + BORDER, borderRadius: 10, padding: '10px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? TEXT, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {stat('Forecast finish', fmtDate(forecast.projectFinish.to),
          slipped > 0 ? `${slipped} days later than planned`
            : slipped < 0 ? `${Math.abs(slipped)} days ahead of plan`
              : `${dated.durationDays} working days`,
          slipped > 0 ? RED : slipped < 0 ? GREEN : undefined)}
        {stat('Critical path', totals.critical, totals.critical ? `${path.length} in sequence` : 'none found', totals.critical ? RED : DIM)}
        {stat('Near critical', totals.nearCritical, 'within 5 days of the path', totals.nearCritical ? AMBER : DIM)}
        {stat('Behind', negative.length, negative.length ? `worst ${Math.abs(negative[0].totalFloat)} days late` : 'nothing late', negative.length ? RED : GREEN)}
        {stat('With logic', `${totals.withLogic}/${totals.tasks}`, totals.openEnds ? `${totals.openEnds} dangling` : 'all linked', totals.openEnds ? AMBER : GREEN)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 400px)', gap: 16, alignItems: 'start' }}>

        {/* The critical path in sequence */}
        <div style={{ background: RAISED, border: '1px solid ' + BORDER, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', gap: 9 }}>
            <Path size={17} weight="duotone" color={RED} />
            <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>Critical Path</div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>
              {path.length ? 'what makes the project late' : 'no continuous chain'}
            </div>
          </div>

          {path.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
              No critical path. Without a continuous chain of zero-float work there is no answer to
              &ldquo;what makes this project late&rdquo; — which is the only question a schedule exists to
              answer. On a schedule with no relationships, every date is a guess that nothing will
              ever correct.
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {path.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ width: 20, fontSize: 10.5, color: 'rgba(255,255,255,.3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: (p.node!.totalFloat < 0) ? RED : GOLD, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: TEXT, fontWeight: 600 }}>{String(p.task!.name ?? p.id)}</div>
                    <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>
                      {fmtDate(p.node!.esDate)} → {fmtDate(p.node!.efDate)} · {p.node!.duration}d
                    </div>
                  </div>
                  {p.node!.totalFloat < 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: RED, whiteSpace: 'nowrap' }}>
                      {Math.abs(p.node!.totalFloat)}d late
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Near-critical is where the next problem comes from. The path is
              already being watched; these are not. */}
          {nearCritical.length > 0 && (
            <>
              <div style={{ padding: '8px 16px', borderTop: '1px solid ' + BORDER, background: 'rgba(255,255,255,0.02)', fontSize: 10.5, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: .5 }}>
                One bad week from the path
              </div>
              {nearCritical.map((t) => {
                const task = tasks.find((x) => String(x.id) === t.id);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    <Clock size={12} weight="duotone" color={AMBER} style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: DIM, minWidth: 0, flex: 1 }}>{String(task?.name ?? t.id)}</div>
                    <span style={{ fontSize: 11, color: AMBER, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {t.totalFloat}d float
                      {t.freeFloat < t.totalFloat && (
                        <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 500 }}> · {t.freeFloat} free</span>
                      )}
                    </span>
                  </div>
                );
              })}
              <div style={{ padding: '7px 16px 11px', fontSize: 10.5, color: 'rgba(255,255,255,.35)', lineHeight: 1.5 }}>
                Free float is what this task can slip before the NEXT one moves. Total float is shared
                along the chain — spend it and somebody downstream who thought they had it too is the
                one who gets hurt.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HealthPanel
            title="Schedule Quality"
            score={health.score}
            findings={failed}
            passed={passed}
            blockers={health.blockers}
            warnings={health.warnings}
            summary={
              health.blockers > 0
                ? <><strong style={{ color: RED }}>{health.blockers} blocker{health.blockers === 1 ? '' : 's'}</strong> — the schedule cannot answer what it is for.</>
                : health.warnings > 0
                  ? <><strong style={{ color: AMBER }}>{health.warnings} thing{health.warnings === 1 ? '' : 's'} to fix</strong> before this is worth reporting against.</>
                  : totals.tasks === 0 ? 'No tasks yet.'
                    : <><strong style={{ color: GREEN }}>Passes the assessment.</strong> {totals.tasks} tasks, {totals.critical} on the path.</>
            }
            footnote="Measured against the DCMA 14-point assessment — the standard an owner's scheduler will use on you."
          />

          {negative.length > 0 && (
            <div style={{ background: RAISED, border: `1px solid ${RED}44`, borderRadius: 12, padding: '13px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <WarningCircle size={16} weight="duotone" color={RED} />
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>Already Late</div>
              </div>
              <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5, marginBottom: 9 }}>
                Negative float is not a warning about the future. It is a statement that the plan cannot
                meet a date it has already committed to.
              </div>
              {negative.slice(0, 6).map((t) => {
                const task = tasks.find((x) => String(x.id) === t.id);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 }}>
                    <Flag size={11} weight="fill" color={RED} style={{ flexShrink: 0 }} />
                    <span style={{ color: TEXT, minWidth: 0, flex: 1 }}>{String(task?.name ?? t.id)}</span>
                    <span style={{ color: RED, fontWeight: 800, whiteSpace: 'nowrap' }}>{Math.abs(t.totalFloat)}d</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
