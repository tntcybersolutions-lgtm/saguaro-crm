'use client';
/**
 * Submittal approval chain — Submitter → GC review → A/E review → Back to sub.
 *
 * One node per step: face (initials or role mark), role, who, state (done ✓ /
 * current with a pulsing ring / waiting), sent and returned dates, days held
 * and days past the required-by date in red. The logic is lib/submittal-
 * workflow (pure, tested); this file only draws it. Handoff moments come from
 * the item's change history (/api/audit-trail) when it has any.
 *
 * Wide: a horizontal chain. Narrow (under 600px of its own width): the same
 * chain stacked top to bottom, so a phone reads it without sideways scroll.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { Avatar } from '@/components/ui/kit';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { localDay } from '@/lib/calendar-day';
import { buildChain, eventsFromHistory, type SubmittalLike, type WfEvent, type WfStep } from '@/lib/submittal-workflow';

const fmt = (v: string | null) => {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export default function WorkflowChain({ submittal, entityId, gcName, architectName, refreshKey }: {
  submittal: SubmittalLike;
  /** The submittal id — when given, its change history supplies exact handoff dates. */
  entityId?: string | null;
  gcName?: string | null;
  architectName?: string | null;
  refreshKey?: unknown;
}) {
  const [events, setEvents] = useState<WfEvent[]>([]);
  const statusKey = `${submittal.status || ''}|${submittal.ball_in_court || ''}`;

  useEffect(() => {
    if (!entityId || String(entityId).startsWith('temp-')) { setEvents([]); return; }
    let alive = true;
    (async () => {
      try {
        const h = await getAuthHeaders();
        const r = await fetch(`/api/audit-trail?entity_type=submittals&entity_id=${encodeURIComponent(entityId)}&limit=200`, { headers: h, credentials: 'include', cache: 'no-store' });
        if (!r.ok) { if (alive) setEvents([]); return; }
        const j = await r.json().catch(() => ({}));
        if (alive) setEvents(eventsFromHistory(Array.isArray(j.entries) ? j.entries : []));
      } catch (e) {
        // History only sharpens the dates; the chain still draws from the record.
        console.error('[WorkflowChain] history read failed', e);
        if (alive) setEvents([]);
      }
    })();
    return () => { alive = false; };
  }, [entityId, statusKey, refreshKey]);

  const today = localDay();
  const chain = useMemo(() => buildChain(submittal, events, today, { gcName, architectName }), [submittal, events, today, gcName, architectName]);

  return (
    <div className="wfc-cq">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <ol className="wfc" aria-label="Approval workflow">
        {chain.steps.map((s, i) => <Node key={s.key} step={s} last={i === chain.steps.length - 1} nextDone={chain.steps[i + 1]?.state !== 'waiting'} />)}
      </ol>
    </div>
  );
}

function Node({ step: s, last, nextDone }: { step: WfStep; last: boolean; nextDone: boolean }) {
  const late = s.overdue;
  const tone = s.state === 'done' ? 'var(--success)' : s.state === 'current' ? (late ? 'var(--danger)' : 'var(--warning)') : 'var(--text-tertiary)';
  const sent = fmt(s.sentAt); const back = fmt(s.returnedAt);
  const stateText = s.state === 'done' ? (s.verdict || 'Done') : s.state === 'current' ? (s.verdict || 'Has it now') : 'Waiting';
  return (
    <li className="wfc-step" data-state={s.state} data-late={late ? 'true' : undefined} style={{ ['--wf' as string]: tone } as React.CSSProperties}>
      <div className="wfc-rail" aria-hidden>
        <span className="wfc-ring">
          <Avatar name={s.who || s.role} mark={s.who ? undefined : s.initials} size={44} tone={s.state === 'waiting' ? 'var(--text-tertiary)' : tone} title={s.who || s.role} />
          {s.state === 'done' && <span className="wfc-tick"><Check size={11} weight="bold" /></span>}
        </span>
        {!last && <span className="wfc-line" data-done={s.state === 'done' && nextDone ? 'true' : undefined} />}
      </div>
      <div className="wfc-body">
        <span className="wfc-role">{s.role}</span>
        {s.who && <span className="wfc-who" title={s.who}>{s.who}</span>}
        <span className="wfc-state">{stateText}{s.daysHeld != null && s.state !== 'waiting' ? <> · <b>{days(s.daysHeld)}</b>{s.state === 'current' ? ' held' : ''}</> : null}</span>
        {(sent || back) && (
          <span className="wfc-dates">
            {sent && <span>In {sent}</span>}
            {back && <span>Out {back}</span>}
          </span>
        )}
        {late && <span className="wfc-late">{s.state === 'current' ? `${days(s.daysLate)} past required` : `Returned ${days(s.daysLate)} late`}</span>}
      </div>
    </li>
  );
}

const CSS = `
.wfc-cq { container: wfc / inline-size; min-width: 0; }
.wfc { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
.wfc-step { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.wfc-rail { display: flex; align-items: center; min-width: 0; }
.wfc-ring { position: relative; flex-shrink: 0; border-radius: 50%; padding: 3px; box-shadow: 0 0 0 2px var(--wf); }
.wfc-step[data-state="waiting"] .wfc-ring { box-shadow: 0 0 0 2px var(--border-default); opacity: .75; }
.wfc-step[data-state="current"] .wfc-ring { animation: wfcPulse 1.8s ease-out infinite; }
@keyframes wfcPulse {
  0% { box-shadow: 0 0 0 2px var(--wf), 0 0 0 2px color-mix(in srgb, var(--wf) 55%, transparent); }
  100% { box-shadow: 0 0 0 2px var(--wf), 0 0 0 12px color-mix(in srgb, var(--wf) 0%, transparent); }
}
@media (prefers-reduced-motion: reduce) { .wfc-step[data-state="current"] .wfc-ring { animation: none; box-shadow: 0 0 0 3px var(--wf); } }
.wfc-tick { position: absolute; right: -4px; bottom: -4px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--success); color: var(--bg-base); box-shadow: 0 0 0 2px var(--bg-surface); }
.wfc-line { flex: 1 1 auto; height: 2px; margin: 0 10px; min-width: 16px; background: var(--border-default); border-radius: 2px; }
.wfc-line[data-done="true"] { background: var(--success); }
.wfc-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-right: 12px; }
.wfc-role { font-size: var(--fs-xs); font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--text-tertiary); }
.wfc-who { font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wfc-state { font-size: var(--fs-sm); color: var(--text-secondary); }
.wfc-state b { color: var(--text-primary); font-weight: 800; }
.wfc-step[data-state="current"] .wfc-state { color: var(--text-primary); font-weight: 700; }
.wfc-dates { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.wfc-late { font-size: var(--fs-xs); font-weight: 800; color: var(--danger); }
.wfc-step[data-late="true"][data-state="done"] .wfc-dates { color: var(--danger); }
@container wfc (max-width: 599px) {
  .wfc { grid-template-columns: minmax(0, 1fr); }
  .wfc-step { flex-direction: row; gap: 14px; }
  .wfc-rail { flex-direction: column; align-self: stretch; }
  .wfc-line { width: 2px; height: auto; min-height: 18px; margin: 8px 0; }
  .wfc-body { padding: 4px 0 16px; }
}
`;
