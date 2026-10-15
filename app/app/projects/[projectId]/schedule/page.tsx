'use client';
/**
 * Project Schedule — tasks on a Gantt timeline, or as a sortable list.
 *
 * Anatomy: title + one primary action (Add Task) → StatRow (Tasks Complete and
 * Delayed filter the views; Critical Tasks turns on the critical-path view) →
 * Tabs (Gantt / List / 3-Week Lookahead) + Toolbar → the timeline, the
 * DataTable or the lookahead, with a task detail card beside it (stacked on phones).
 *
 * Critical path: lib/schedule-cpm.ts runs CPM (forward/backward pass, total
 * float) over every task's dates and finish-to-start predecessor links. The
 * Gantt draws each link as an arrow, critical bars and arrows in --danger.
 *
 * Every write goes through a route this screen already used:
 *   list     GET    /api/schedule/list?projectId=
 *   create   POST   /api/schedule/create
 *   update   PUT    /api/schedule/[id]          (edit, quick % / status)
 *   delete   DELETE /api/schedule/[id]
 *   baseline POST   /api/projects/[id]/schedule/baseline
 */
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { jobBarStyle } from '@/lib/project-colors';
import { useProjectColor } from '@/lib/hooks/useProjectColor';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { SkeletonRow } from '@/components/ui/Skeleton';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, Toolbar, DataTable, EmptyState, Select,
  FormModal, Field, Input, Textarea, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  WarningCircle, CalendarBlank, X, Plus, TrendUp, CheckCircle, Clock, Flag,
  PencilSimple, Trash, ArrowClockwise, Eye, ChartLineDown, Lightning,
} from '@phosphor-icons/react';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { localDay } from '@/lib/calendar-day';
import { baselineSummary, finishVariance, varianceLabel } from '@/lib/schedule-baseline';
import { computeCpm, lookahead, type CpmOutput } from '@/lib/schedule-cpm';

const STATUSES = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold'];
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started', in_progress: 'In Progress',
  completed: 'Completed', delayed: 'Delayed', on_hold: 'On Hold',
};
/** Progress-fill colour per status — status tokens only, never the brand yellow. */
const STATUS_FILL: Record<string, string> = {
  not_started: 'var(--text-tertiary)', in_progress: 'var(--status-ongoing)',
  completed: 'var(--status-completed)', delayed: 'var(--status-overdue)', on_hold: 'var(--status-lead)',
};
const STATUS_TONE: Record<string, BadgeTone> = {
  not_started: 'neutral', in_progress: 'ongoing', completed: 'completed', delayed: 'overdue', on_hold: 'lead',
};
const PHASES = ['Pre-Construction', 'Foundation', 'Framing', 'MEP Rough', 'Insulation',
  'Drywall', 'Finishes', 'MEP Trim', 'Punch List', 'Closeout', 'Other'];

const EMPTY: Record<string, any> = {
  name: '', phase: '', trade: '', start_date: '', end_date: '',
  pct_complete: 0, status: 'not_started', predecessor: '', predecessor_id: '', assigned_to: '', notes: '',
};
// Canonical trade taxonomy — CSI division groups plus the specialty markets outside them.
const DIVISION_TRADE_SET = new Set(SUB_TRADES_BY_DIVISION.flatMap(d => d.trades));
const EXTRA_TRADES = SUB_TRADES.filter(t => !DIVISION_TRADE_SET.has(t));

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 16,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

function addDaysISO(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtShort(d?: string | null) {
  return d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}
function fmtDate(d?: string | null) {
  return d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

const CSS = `
.schCq { container: schws / inline-size; min-width: 0; }
.schSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.schSplit > * { min-width: 0; }
@container schws (min-width: 1020px) {
  .schSplit[data-open="true"] { grid-template-columns: minmax(0, 1fr) clamp(320px, 30%, 400px); }
  .schSplit[data-open="true"] .schDetail { position: sticky; top: 16px; }
}
.schGantt { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.schGrid { min-width: 700px; position: relative; }
.schRow[data-dim="true"] .schTrack, .schRow[data-dim="true"] .schLabel { opacity: .3; }
.schBar[data-crit="true"] { box-shadow: 0 0 0 1px color-mix(in srgb, var(--danger) 45%, transparent); }
.schLinks { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; z-index: 2; }
.schLinks path { fill: none; stroke: var(--text-secondary); stroke-width: 1.25; opacity: .75; }
.schLinks path[data-crit="true"] { stroke: var(--danger); stroke-width: 2; opacity: 1; }
.schLinks path[data-dim="true"] { opacity: .15; }
.schGBar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
.schGBar .schSp { flex: 1; }
.schZoom { display: inline-flex; gap: 6px; }
.schWarn { font-size: 12px; font-weight: 700; color: var(--warning); }
.schFloat[data-crit="true"] { color: var(--danger); font-weight: 800; }
.schLaWeek + .schLaWeek { border-top: 1px solid var(--border-default); }
.schLaHead { display: flex; align-items: baseline; gap: 10px; padding: 12px 12px 8px; }
.schLaTitle { font-size: 14px; font-weight: 800; color: var(--text-primary); }
.schLaRow { display: grid; grid-template-columns: minmax(0, 1fr) 150px 120px 90px; gap: 12px; align-items: center; min-height: 44px; padding: 6px 12px; border-top: 1px solid var(--border-subtle); cursor: pointer; }
.schLaRow:hover { background: var(--bg-row-hover); }
.schLaRow:focus-visible { outline: 2px solid var(--border-interactive); outline-offset: -2px; }
.schLaRow[data-sel="true"] { background: var(--brand-primary-08); box-shadow: inset 3px 0 0 var(--brand-primary); }
.schLaName { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.schLaName b { font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.schLaName span { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.schLaName b[data-crit="true"]::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--danger); margin-right: 6px; vertical-align: 1px; }
.schLaDates { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.schLaEmpty { padding: 4px 12px 14px; font-size: 13px; color: var(--text-tertiary); }
.schRow { display: grid; grid-template-columns: 200px minmax(0, 1fr); align-items: center; min-height: 38px; border-bottom: 1px solid var(--border-subtle); }
.schRow[role="button"] { cursor: pointer; }
.schRow[role="button"]:hover { background: var(--bg-row-hover); }
.schRow[role="button"]:focus-visible { outline: 2px solid var(--border-interactive); outline-offset: -2px; }
.schRow[data-sel="true"] { background: var(--brand-primary-08); box-shadow: inset 3px 0 0 var(--brand-primary); }
.schHead { min-height: 30px; border-bottom: 1px solid var(--border-default); }
.schLabel { padding: 0 12px; font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.schLabel[data-done="true"] { color: var(--text-secondary); text-decoration: line-through; }
.schTrack { position: relative; height: 26px; margin-right: 12px; }
.schTrack[data-base="true"] { height: 32px; }
.schHead .schTrack { height: 30px; }
.schWeek { position: absolute; top: 8px; font-size: 12px; color: var(--text-tertiary); white-space: nowrap; transform: translateX(-50%); }
.schToday { position: absolute; top: 0; bottom: 0; width: 2px; background: color-mix(in srgb, var(--text-primary) 55%, transparent); z-index: 1; pointer-events: none; }
.schTodayTag { position: absolute; top: 6px; transform: translateX(-50%); font-size: 12px; font-weight: 700; color: var(--text-primary); background: var(--bg-surface-2); border: 1px solid var(--border-default); border-radius: var(--radius-pill); padding: 0 6px; white-space: nowrap; z-index: 2; }
.schBar { position: absolute; top: 5px; height: 16px; border-radius: 3px; box-sizing: border-box; overflow: hidden; }
.schFill { height: 100%; opacity: .85; transition: width .3s; }
.schPct { position: absolute; inset: 0 4px; font-size: 12px; font-weight: 700; color: var(--text-primary); line-height: 16px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.schBase { position: absolute; top: 24px; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--text-primary) 45%, transparent); }
.schVar { position: absolute; top: 5px; font-size: 12px; font-weight: 800; line-height: 16px; white-space: nowrap; }
.schMeter { display: flex; align-items: center; gap: 8px; }
.schMeterTrack { width: 60px; height: 6px; background: var(--bg-surface-2); border-radius: 3px; overflow: hidden; flex-shrink: 0; }
.schMeterTrack[data-big="true"] { width: 100%; height: 10px; border-radius: 5px; }
.schMeterFill { height: 100%; border-radius: inherit; transition: width .3s; }
.schMuted { color: var(--text-tertiary); }
.schSection { display: flex; flex-direction: column; gap: 10px; }
.schSection + .schSection { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border-subtle); }
.schSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.schQuick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.schQuick .k-btn { justify-content: center; }
.schProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.schSeeds { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.schForm { display: flex; flex-direction: column; gap: 16px; }
@media (max-width: 640px) {
  .schRow { grid-template-columns: 140px minmax(0, 1fr); }
  .schWs .k-btn, .schWs .k-stat, .schWs select.k-select, .schWs .k-input, .schWs .k-chip { min-height: 44px; }
  .schLaRow { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; }
  .schLaRow .schLaDates { grid-column: 1; grid-row: 2; }
  .schLaRow .schMeter { display: none; }
}
`;

/* ── Gantt timeline ─────────────────────────────────────────────── */
type GanttZoom = 'fit' | 'week' | 'day';
const ZOOM_PX: Record<GanttZoom, number> = { fit: 0, week: 16, day: 40 };

function GanttChart({ tasks, jobHex, selectedId, onSelect, cpm, critOnly, zoom }: {
  tasks: any[]; jobHex: string; selectedId?: string | null; onSelect: (t: any) => void;
  cpm: CpmOutput; critOnly: boolean; zoom: GanttZoom;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef(new Map<string, HTMLDivElement>());
  const [arrows, setArrows] = useState<{ key: string; d: string; critical: boolean; dim: boolean }[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  const withDates = tasks.filter(t =>
    t.start_date && t.end_date
    && !Number.isNaN(Date.parse(t.start_date))
    && !Number.isNaN(Date.parse(t.end_date))
  );
  const shownKey = withDates.map(t => `${t.id}:${t.start_date}:${t.end_date}`).join('|');

  /* Arrows are measured from the bars themselves, so they stay on them
     through window resize, browser zoom, the zoom chips and filters. A link
     to a task that is filtered out (or has no dates) has no bar: no arrow. */
  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const out: { key: string; d: string; critical: boolean; dim: boolean }[] = [];
    for (const l of cpm.links) {
      const a = barRefs.current.get(l.from), b = barRefs.current.get(l.to);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.right - g.left, y1 = ra.top + ra.height / 2 - g.top;
      const x2 = rb.left - g.left, y2 = rb.top + rb.height / 2 - g.top;
      const gap = 8;
      let d: string;
      if (x2 - x1 >= gap * 2) {
        d = `M${x1},${y1} H${x1 + gap} V${y2} H${x2}`;
      } else {
        // Successor starts at/before the predecessor's end: route around the bar.
        const ym = y2 >= y1 ? rb.top - g.top - 4 : rb.bottom - g.top + 4;
        d = `M${x1},${y1} H${x1 + gap} V${ym} H${x2 - gap} V${y2} H${x2}`;
      }
      out.push({ key: `${l.from}>${l.to}`, d, critical: l.critical, dim: critOnly && !l.critical });
    }
    setArrows(out);
    setBox({ w: grid.offsetWidth, h: grid.offsetHeight });
  }, [cpm, critOnly]);

  useLayoutEffect(() => { measure(); }, [measure, shownKey, zoom]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(grid);
    return () => ro.disconnect();
  }, [measure, withDates.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!withDates.length) return (
    <EmptyState icon={<CalendarBlank size={22} />} title="No dated tasks" text="Give a task a start and end date and it draws here." />
  );

  const allDates = withDates.flatMap(t => [t.start_date, t.end_date, t.baseline_start, t.baseline_end].filter((d: any) => typeof d === 'string' && !Number.isNaN(Date.parse(d))));
  /* Calendar days, counted as days: new Date('YYYY-MM-DD') is UTC midnight,
     so the padding and week steps move in UTC days and labels read in UTC —
     mixing in local setDate/toLocaleDateString labelled every week one day
     early in the US. Only "today" is local: this device's day. */
  const minDate = new Date(allDates.reduce((m, d) => d < m ? d : m));
  const maxDate = new Date(allDates.reduce((m, d) => d > m ? d : m));
  minDate.setUTCDate(minDate.getUTCDate() - 2);
  maxDate.setUTCDate(maxDate.getUTCDate() + 5);
  const ymd = (d: Date) => d.toISOString().split('T')[0]; // a UTC-midnight calendar day
  const totalDays = daysBetween(ymd(minDate), ymd(maxDate));
  const pct = (date: string) => Math.max(0, Math.min(100, daysBetween(ymd(minDate), date) / totalDays * 100));
  const gridMin = zoom === 'fit' ? undefined : Math.max(700, 212 + totalDays * ZOOM_PX[zoom]);

  const markers: Date[] = [];
  const cur = new Date(minDate);
  while (cur <= maxDate) {
    markers.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }

  const today = localDay();
  const todayInRange = today >= ymd(minDate) && today <= ymd(maxDate);
  const todayPct = pct(today);

  return (
    <div className="schGantt">
      <div className="schGrid" ref={gridRef} style={gridMin ? { minWidth: gridMin } : undefined}>
        <div className="schRow schHead" aria-hidden>
          <div className="schLabel schMuted" style={{ fontSize: 12, fontWeight: 700 }}>Task</div>
          <div className="schTrack">
            {markers.map(m => (
              <div key={m.toISOString()} className="schWeek" style={{ left: `${pct(ymd(m))}%` }}>
                {m.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </div>
            ))}
            {todayInRange && <div className="schTodayTag" style={{ left: `${todayPct}%` }}>Today</div>}
          </div>
        </div>

        {withDates.map(task => {
          const left = pct(task.start_date);
          const width = Math.max(.5, pct(task.end_date) - left);
          const fill = STATUS_FILL[task.status] || 'var(--text-tertiary)';
          const isDone = task.status === 'completed' || task.status === 'complete';
          const hasBase = !!(task.baseline_start && task.baseline_end);
          const v = finishVariance(task);
          const c = cpm.byId[String(task.id)];
          const crit = !!c?.critical;
          const edge = crit ? 'var(--danger)' : jobHex;
          return (
            <div
              key={task.id}
              className="schRow"
              role="button"
              tabIndex={0}
              data-sel={task.id === selectedId ? 'true' : undefined}
              data-dim={critOnly && !crit ? 'true' : undefined}
              aria-label={`${task.name}, ${fmtShort(task.start_date)} to ${fmtShort(task.end_date)}, ${task.pct_complete ?? 0}% complete${crit ? ', critical path' : c ? `, ${c.float} days float` : ''}`}
              onClick={() => onSelect(task)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(task); } }}
            >
              <div className="schLabel" data-done={isDone ? 'true' : undefined} title={task.name}>{task.name}</div>
              <div className="schTrack" data-base={hasBase ? 'true' : undefined}>
                {/* Baseline: where this task was planned, under the bar. */}
                {hasBase && (
                  <div className="schBase" title={`Baseline ${fmtShort(task.baseline_start)} – ${fmtShort(task.baseline_end)}`}
                    style={{ left: `${pct(task.baseline_start)}%`, width: `${Math.max(.5, pct(task.baseline_end) - pct(task.baseline_start))}%` }} />
                )}
                {v !== null && v !== 0 && (
                  <div className="schVar" style={{ left: `calc(${Math.min(96, pct(task.end_date))}% + 4px)`, color: v > 0 ? 'var(--danger)' : 'var(--success)' }}>{varianceLabel(v)}</div>
                )}
                {todayInRange && <div className="schToday" style={{ left: `${todayPct}%` }} />}
                <div
                  className="schBar"
                  data-crit={crit ? 'true' : undefined}
                  ref={el => { const id = String(task.id); if (el) barRefs.current.set(id, el); else barRefs.current.delete(id); }}
                  style={{
                    left: `${left}%`, width: `${width}%`,
                    ...jobBarStyle(jobHex), border: `1px solid color-mix(in srgb, ${edge} ${crit ? 85 : 40}%, transparent)`, borderLeft: `3px solid ${edge}`,
                  }}>
                  <div className="schFill" style={{ background: fill, width: `${task.pct_complete ?? 0}%` }} />
                  {width > 8 && <div className="schPct">{task.pct_complete ?? 0}%</div>}
                </div>
              </div>
            </div>
          );
        })}

        {/* Finish-to-start links, predecessor end → successor start. */}
        <svg className="schLinks" width={box.w} height={box.h} viewBox={`0 0 ${box.w || 1} ${box.h || 1}`} aria-hidden>
          <defs>
            <marker id={`${uid}a`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--text-secondary)' }} />
            </marker>
            <marker id={`${uid}c`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--danger)' }} />
            </marker>
          </defs>
          {arrows.filter(a => !a.critical).concat(arrows.filter(a => a.critical)).map(a => (
            <path key={a.key} d={a.d} data-crit={a.critical ? 'true' : undefined} data-dim={a.dim ? 'true' : undefined}
              markerEnd={`url(#${uid}${a.critical ? 'c' : 'a'})`} />
          ))}
        </svg>
      </div>
    </div>
  );
}

function Meter({ pct, status, big }: { pct: number; status: string; big?: boolean }) {
  const fill = STATUS_FILL[status] || 'var(--text-tertiary)';
  return (
    <div className="schMeterTrack" data-big={big ? 'true' : undefined}>
      <div className="schMeterFill" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

export default function SchedulePage() {
  const { projectId } = useParams() as { projectId: string };
  const jobHex = useProjectColor(projectId);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'create' | null>(null);
  const [form, setForm] = useState<Record<string, any>>({ ...EMPTY });
  const detailRef = useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(mode === 'create' || mode === 'edit', form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `schedule:${projectId}`,
    draftData: mode === 'create' ? form : undefined,
    restoreDraft: (d) => { setForm(d as Record<string, any>); setMode('create'); setSelected(null); },
    onSave: () => save(),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast, show } = useToast(4000);
  const [viewMode, setViewMode] = useState<'gantt' | 'list' | 'lookahead'>('gantt');
  const [critOnly, setCritOnly] = useState(false);
  const [zoom, setZoom] = useState<GanttZoom>('fit');
  const [baselining, setBaselining] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPhase, setFilterPhase] = useState('all');
  // SmartCreate: the add flow walks in knowing the project — /api/project-context snapshot.
  const { ctx } = useProjectContext(projectId);
  const [duration, setDuration] = useState('');
  const [auto, setAuto] = useState<{ start?: boolean; end?: boolean }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => show(msg, type === 'error' ? 'bad' : 'good');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError('');
      const h = await getAuthHeaders();
      const r = await fetch(`/api/schedule/list?projectId=${projectId}`, { headers: h });
      if (!r.ok) throw new Error('Failed to load data');
      const d = await r.json();
      setTasks(d.tasks || []);
    } catch (e) {
      console.error(e);
      setTasks([]);
      setLoadError('Failed to load. Please try again.');
    } finally { setLoading(false); }
  }, [projectId]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the schedule back into its loading state.
  const revalidate = useCallback(async () => {
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/schedule/list?projectId=${projectId}`, { headers: h });
      if (!r.ok) return;
      const d = await r.json();
      setTasks(d.tasks || []);
    } catch { /* background refresh — keep the optimistic rows */ }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Dead-space kill (spec 4.1): an empty schedule auto-opens the create form —
  // the composer is the zero state. One-shot per visit so Cancel sticks.
  // Not on a phone: there the form is a full-screen sheet, and opening it
  // unasked hid the whole page on arrival. The empty state's Add Task is one tap away.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && !loadError && tasks.length === 0 && mode === null && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
      if (!phone) openCreate();
    }
  }, [loading, loadError, tasks.length, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape closes the task detail card (the create/edit modal handles its own Escape).
  useEffect(() => {
    if (mode !== 'view') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { setSelected(null); setMode(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  function openCreate() { setForm({ ...EMPTY }); setDuration(''); setAuto({}); setMode('create'); setSelected(null); }
  function openEdit(task: any) {
    setForm({
      name: task.name || '', phase: task.phase || '', trade: task.trade || '',
      start_date: task.start_date || '', end_date: task.end_date || '',
      pct_complete: task.pct_complete ?? 0, status: task.status || 'not_started',
      predecessor: task.predecessor || '', predecessor_id: task.predecessor_id || '',
      assigned_to: task.assigned_to || '', notes: task.notes || '',
    });
    setDuration(task.start_date && task.end_date ? String(daysBetween(task.start_date, task.end_date)) : '');
    setAuto({});
    setSelected(task); setMode('edit');
  }
  function viewTask(task: any) {
    setSelected(task); setMode('view');
    // Stacked layouts: bring the detail into view instead of leaving it below the fold.
    requestAnimationFrame(() => {
      const el = detailRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function closePanel() { setSelected(null); setMode(null); }
  /** Every close path for the create/edit modal (X, Cancel, Esc, backdrop) runs through the guard. */
  function closeComposer() {
    const back = mode === 'edit' && selected ? selected : null;
    guard.requestClose(() => { if (back) { setMode('view'); } else closePanel(); });
  }

  // SmartCreate wiring: duration drives the end date; a predecessor drives the start.
  function setStartDate(v: string) {
    const d = Number(duration) || 0;
    const end = v && d > 0 ? addDaysISO(v, d) : form.end_date;
    setForm(f => ({ ...f, start_date: v, end_date: end }));
    setAuto(a => ({ ...a, start: false, end: !!(v && d > 0) }));
  }
  function setDurationDays(v: string) {
    setDuration(v);
    const d = Number(v) || 0;
    if (form.start_date && d > 0) {
      setForm(f => ({ ...f, end_date: addDaysISO(f.start_date, d) }));
      setAuto(a => ({ ...a, end: true }));
    }
  }
  function setEndDate(v: string) {
    if (form.start_date && v) setDuration(String(daysBetween(form.start_date, v)));
    setForm(f => ({ ...f, end_date: v }));
    setAuto(a => ({ ...a, end: false }));
  }
  function setPredecessorTask(id: string) {
    const pred = tasks.find((t: any) => t.id === id);
    const patch: Record<string, any> = { predecessor_id: id, predecessor: pred?.name || '' };
    if (pred?.end_date && !form.start_date) {
      // A task follows its predecessor — default to starting the day after it ends.
      patch.start_date = addDaysISO(pred.end_date, 1);
      const d = Number(duration) || 0;
      if (d > 0) patch.end_date = addDaysISO(patch.start_date, d);
      setAuto({ start: true, end: d > 0 });
    }
    setForm(f => ({ ...f, ...patch }));
  }

  async function save(): Promise<boolean> {
    if (!form.name.trim()) { showToast('Task name is required.', 'error'); return false; }
    // Optimistic save (house pattern: budget saveEdit) — tasks patch and the
    // modal closes instantly; the network settles in the background.
    const snapshot = { ...form, pct_complete: Number(form.pct_complete) || 0 };
    const prevMode = mode, prevSelected = selected;
    setSaving(true);
    try {
      const h = await getAuthHeaders();
      if (mode === 'create') {
        const tempId = `temp-${Date.now()}`;
        setTasks(prev => [...prev, { id: tempId, ...snapshot, project_id: projectId }]);
        closePanel();
        showToast('Task added.');
        const r = await fetch('/api/schedule/create', {
          method: 'POST',
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, projectId }),
        });
        if (!r.ok) { setTasks(prev => prev.filter((t: any) => t.id !== tempId)); throw new Error(await r.text()); }
        const d = await r.json();
        if (d.task) setTasks(prev => prev.map((t: any) => t.id === tempId ? d.task : t));
        revalidate();
      } else if (mode === 'edit' && selected) {
        const prevTask = selected;
        setTasks(prev => prev.map((t: any) => t.id === prevTask.id ? { ...t, ...snapshot } : t));
        closePanel();
        showToast('Task updated.');
        const r = await fetch(`/api/schedule/${prevTask.id}`, {
          method: 'PUT',
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, pct_complete: Number(form.pct_complete) || 0 }),
        });
        if (!r.ok) { setTasks(prev => prev.map((t: any) => t.id === prevTask.id ? prevTask : t)); throw new Error(await r.text()); }
        revalidate();
      }
      guard.clearDraft();
      return true;
    } catch (e: any) {
      console.error(e); showToast(humanError(e, 'Save failed. Please try again.'), 'error');
      // Rollback already applied — reopen the form with the input intact.
      setForm(snapshot); setMode(prevMode); setSelected(prevSelected);
    } finally { setSaving(false); }
    return false;
  }

  /* Set Baseline: today's dates become the plan the Gantt measures slip against. */
  async function setBaseline() {
    const again = tasks.some((t: any) => t.baseline_end);
    if (again && !(await confirmDialog({ title: 'Replace the baseline?', message: "Every task's current dates become the new baseline. The old baseline is not kept.", danger: true }))) return;
    setBaselining(true);
    try {
      const h = await getAuthHeaders();
      const r = await fetch(`/api/projects/${projectId}/schedule/baseline`, { method: 'POST', headers: h });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not set the baseline.');
      showToast(`Baseline set for ${j.baselined} task${j.baselined === 1 ? '' : 's'} — slips now show on the Gantt.`);
      await revalidate();
    } catch (e: any) { showToast(humanError(e, 'Could not set the baseline.'), 'error'); }
    finally { setBaselining(false); }
  }

  async function deleteTask(task: any) {
    if (!(await confirmDialog({ title: 'Please confirm', message: `Delete task "${task.name}"?`, danger: true }))) return;
    // Optimistic remove — the task leaves and the detail closes instantly;
    // rollback restores the exact list on failure.
    const prevTasks = tasks;
    setTasks(prev => prev.filter((t: any) => t.id !== task.id));
    showToast('Task deleted.'); closePanel();
    setDeleting(true);
    try {
      const h = await getAuthHeaders();
      const dr = await fetch(`/api/schedule/${task.id}`, { method: 'DELETE', headers: h });
      if (!dr.ok) throw new Error('Delete failed');
      revalidate();
    } catch (e) { console.error(e); setTasks(prevTasks); showToast('Delete failed.', 'error'); }
    finally { setDeleting(false); }
  }

  async function updatePct(task: any, pct: number) {
    const newStatus = pct === 100 ? 'completed' : pct > 0 ? 'in_progress' : 'not_started';
    const prevPct = task.pct_complete ?? 0, prevStatus = task.status;
    // Optimistic patch (house pattern: budget saveEdit) — the bar and the open
    // detail move instantly; rollback + toast if the server disagrees.
    setTasks(prev => prev.map((t: any) => t.id === task.id ? { ...t, pct_complete: pct, status: newStatus } : t));
    setSelected((s: any) => s?.id === task.id ? { ...s, pct_complete: pct, status: newStatus } : s);
    try {
      const h = await getAuthHeaders();
      const pr = await fetch(`/api/schedule/${task.id}`, {
        method: 'PUT',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct_complete: pct, status: newStatus }),
      });
      if (!pr.ok) throw new Error('Update failed');
      revalidate();
    } catch (e: any) {
      setTasks(prev => prev.map((t: any) => t.id === task.id ? { ...t, pct_complete: prevPct, status: prevStatus } : t));
      setSelected((s: any) => s?.id === task.id ? { ...s, pct_complete: prevPct, status: prevStatus } : s);
      console.error(e); showToast(humanError(e, 'Something went wrong. Please try again.'), 'error');
    }
  }

  const phases = Array.from(new Set(tasks.map((t: any) => t.phase).filter(Boolean))) as string[];
  const filtered = tasks.filter((t: any) => {
    const ms = !search || (t.name || '').toLowerCase().includes(search.toLowerCase())
      || (t.phase || '').toLowerCase().includes(search.toLowerCase());
    const mst = filterStatus === 'all' || t.status === filterStatus;
    const mp = filterPhase === 'all' || t.phase === filterPhase;
    return ms && mst && mp;
  });
  const filtersActive = !!search || filterStatus !== 'all' || filterPhase !== 'all';
  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setFilterPhase('all'); };
  const toggleStatus = (s: string) => setFilterStatus(prev => (prev === s ? 'all' : s));

  const today = localDay(); // this device's day, not the UTC day (tomorrow from 7 PM on in Iowa)
  // CPM runs over the whole job — filters only hide rows, they never change the path.
  const cpm = useMemo(() => computeCpm(tasks.map((t: any) => ({ ...t, id: String(t.id) }))), [tasks]);
  const critCount = cpm.criticalIds.length;
  const weeks = useMemo(() => lookahead(filtered, today), [filtered, today]);
  const lookaheadCount = weeks.reduce((n, w) => n + w.tasks.length, 0);
  const nameOf = (id: string) => tasks.find((t: any) => String(t.id) === id)?.name || 'a deleted task';
  const linkIssues = [
    ...cpm.cycles.map(c => `Circular link ignored: ${nameOf(c.from)} → ${nameOf(c.to)}`),
    ...cpm.missing.map(m => `${nameOf(m.task)} follows a task that no longer exists`),
  ];
  const allEnds = tasks.filter((t: any) => t.end_date).map((t: any) => t.end_date);
  const projectEnd = allEnds.length ? allEnds.reduce((m, d) => d > m ? d : m) : '';
  const daysLeft = projectEnd ? Math.max(0, daysBetween(today, projectEnd)) : 0;
  const avgPct = tasks.length ? Math.round(tasks.reduce((s: number, t: any) => s + (t.pct_complete ?? 0), 0) / tasks.length) : 0;
  const delayedCount = tasks.filter((t: any) => t.status === 'delayed').length;
  const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
  const base = baselineSummary(tasks);

  const busy = loading || !!loadError;
  const stats: StatItem[] = [
    { label: '% Complete', value: busy ? '—' : `${avgPct}%`, sub: busy ? undefined : 'Average across tasks', tone: !busy && avgPct === 100 ? 'good' : 'default', icon: <TrendUp size={15} /> },
    { label: 'Days Remaining', value: busy ? '—' : daysLeft ? String(daysLeft) : '—', sub: busy ? undefined : projectEnd ? `Ends ${fmtDate(projectEnd)}` : 'No end dates yet', icon: <Clock size={15} /> },
    { label: 'Tasks Complete', value: busy ? '—' : `${completedCount}/${tasks.length}`, sub: busy ? undefined : filterStatus === 'completed' ? 'Filtered — click to clear' : 'Tasks finished', icon: <CheckCircle size={15} />, onClick: () => toggleStatus('completed'), active: filterStatus === 'completed' },
    { label: 'Delayed', value: busy ? '—' : String(delayedCount), tone: !busy && delayedCount ? 'bad' : 'default', sub: busy ? undefined : filterStatus === 'delayed' ? 'Filtered — click to clear' : delayedCount ? 'Need attention' : 'On track', icon: <WarningCircle size={15} />, onClick: () => toggleStatus('delayed'), active: filterStatus === 'delayed' },
    {
      label: 'Critical Tasks',
      value: busy ? '—' : String(critCount),
      tone: !busy && critCount ? 'bad' : 'default',
      sub: busy ? undefined : critOnly ? 'Showing critical path — click to clear' : cpm.projectFinish ? `Drive the ${fmtShort(cpm.projectFinish)} finish` : 'No dated tasks yet',
      icon: <Lightning size={15} />,
      onClick: () => { setCritOnly(v => !v); setViewMode('gantt'); },
      active: critOnly,
    },
    {
      label: 'Behind Baseline',
      value: busy ? '—' : base.baselined ? `${base.late}/${base.baselined}` : '—',
      tone: !busy && base.late > 0 ? 'bad' : !busy && base.baselined ? 'good' : 'default',
      sub: busy ? undefined : !base.baselined ? 'No baseline set' : base.finishVariance !== null ? `Finish ${varianceLabel(base.finishVariance)} vs baseline` : 'Tasks late vs plan',
      icon: <ChartLineDown size={15} />,
    },
  ];

  const taskActions = (t: any): Action[] => {
    const temp = String(t.id).startsWith('temp-');
    return [
      { label: 'Open details', icon: <Eye size={15} />, onClick: () => viewTask(t) },
      { label: 'Edit', icon: <PencilSimple size={15} />, onClick: () => openEdit(t), disabled: temp },
      { label: 'Delete', icon: <Trash size={15} />, onClick: () => { void deleteTask(t); }, tone: 'danger', disabled: temp || deleting },
    ];
  };

  const columns: Column<any>[] = [
    { key: 'name', header: 'Task', primary: true, phone: 'show', accessor: t => (t.name || '').toLowerCase(), render: t => t.name },
    { key: 'phase', header: 'Phase', render: t => t.phase || '—' },
    { key: 'start_date', header: 'Start', accessor: t => t.start_date || '', render: t => fmtDate(t.start_date) },
    { key: 'end_date', header: 'End', phone: 'show', accessor: t => t.end_date || '', render: t => fmtDate(t.end_date) },
    { key: 'duration', header: 'Duration', align: 'right', accessor: t => (t.start_date && t.end_date ? daysBetween(t.start_date, t.end_date) : null), render: t => (t.start_date && t.end_date ? `${daysBetween(t.start_date, t.end_date)}d` : '—'), groupable: false },
    { key: 'status', header: 'Status', phone: 'show', accessor: t => STATUS_LABELS[t.status] || t.status || '', render: t => <Badge tone={STATUS_TONE[t.status] || 'neutral'} dot>{STATUS_LABELS[t.status] || t.status}</Badge> },
    {
      key: 'pct_complete', header: '% Done', accessor: t => Number(t.pct_complete) || 0, groupable: false,
      render: t => (
        <div className="schMeter">
          <Meter pct={t.pct_complete ?? 0} status={t.status} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t.pct_complete ?? 0}%</span>
        </div>
      ),
    },
    {
      key: 'float', header: 'Float (days)', align: 'right', groupable: false,
      accessor: t => cpm.byId[String(t.id)]?.float ?? null,
      render: t => {
        const c = cpm.byId[String(t.id)];
        return c ? <span className="schFloat" data-crit={c.critical ? 'true' : undefined} title={c.critical ? 'On the critical path' : undefined}>{c.float}</span> : '—';
      },
    },
    { key: 'assigned_to', header: 'Assigned', render: t => t.assigned_to || '—' },
    { key: 'trade', header: 'Trade', hidden: true, render: t => t.trade || '—' },
  ];

  const base_ = `/app/projects/${projectId}`;
  const seeds = ((ctx?.bidPackages || []) as any[]).filter((b: any) => b.trade).slice(0, 5);
  const otherTasks = tasks.filter((t: any) => t.id !== selected?.id);
  const pred = form.predecessor_id ? tasks.find((t: any) => t.id === form.predecessor_id) : null;
  const next = ctx?.schedule?.nextTasks?.[0];
  const critical = cpm.criticalIds.filter(id => { const s = tasks.find((t: any) => String(t.id) === id)?.status; return s !== 'completed' && s !== 'complete'; }).length;
  const composerOpen = mode === 'create' || mode === 'edit';
  const viewing = mode === 'view' && selected ? selected : null;

  /* ── Main body: loading / error / empty / timeline or list ── */
  let body: React.ReactNode;
  if (loading) {
    body = viewMode === 'list'
      ? <Card flush><DataTable columns={columns} rows={[]} rowKey={t => t.id} loading tableId="project-schedule" /></Card>
      : <Card flush>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</Card>;
  } else if (loadError) {
    body = (
      <Card>
        <EmptyState
          icon={<WarningCircle size={22} />}
          title="Couldn't load the schedule"
          text="Check your connection and try again."
          action={<Button icon={<ArrowClockwise size={15} />} onClick={load}>Try again</Button>}
        />
      </Card>
    );
  } else if (tasks.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon={<CalendarBlank size={22} />}
          title="No tasks yet"
          text="Add the first task to start the timeline."
          action={
            <div className="schSeeds">
              <Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add Task</Button>
              {seeds.map((b: any) => (
                <Button key={b.id} size="sm" variant="ghost" title={`Start a task from the ${b.trade} bid package`}
                  onClick={() => { openCreate(); setForm(f => ({ ...f, name: b.name || b.trade, trade: b.trade })); }}>
                  {b.trade}
                </Button>
              ))}
            </div>
          }
        />
      </Card>
    );
  } else if (viewMode === 'gantt') {
    body = (
      <Card flush>
        <div className="schGBar">
          <button type="button" className="k-chip" aria-pressed={critOnly} onClick={() => setCritOnly(v => !v)} title="Dim every task that is not on the critical path">
            <Lightning size={14} weight="fill" style={{ color: critOnly ? undefined : 'var(--danger)' }} />
            Critical path{critCount ? ` · ${critCount}` : ''}
          </button>
          {linkIssues.length > 0 && <span className="schWarn" title={linkIssues.join('\n')}>{linkIssues.length} link{linkIssues.length === 1 ? '' : 's'} ignored</span>}
          <span className="schSp" />
          <div className="schZoom" role="group" aria-label="Zoom">
            {([['fit', 'Fit'], ['week', 'Weeks'], ['day', 'Days']] as [GanttZoom, string][]).map(([k, l]) => (
              <button key={k} type="button" className="k-chip" aria-pressed={zoom === k} onClick={() => setZoom(k)}>{l}</button>
            ))}
          </div>
        </div>
        {filtered.length
          ? <GanttChart tasks={filtered} jobHex={jobHex} selectedId={viewing?.id} onSelect={viewTask} cpm={cpm} critOnly={critOnly} zoom={zoom} />
          : <EmptyState title="Nothing matches" text="Change the search or the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />}
      </Card>
    );
  } else if (viewMode === 'lookahead') {
    body = (
      <Card flush>
        {weeks.map(w => (
          <div key={w.index} className="schLaWeek">
            <div className="schLaHead">
              <span className="schLaTitle">Week {w.index + 1} · {fmtShort(w.start)} – {fmtShort(w.end)}</span>
              <span className="schMuted" style={{ fontSize: 12 }}>{w.tasks.length} task{w.tasks.length === 1 ? '' : 's'}</span>
            </div>
            {w.tasks.length === 0 && <div className="schLaEmpty">Nothing active or starting.</div>}
            {w.tasks.map((t: any) => {
              const c = cpm.byId[String(t.id)];
              const underway = t.start_date < today;
              return (
                <div key={t.id} className="schLaRow" role="button" tabIndex={0}
                  data-sel={t.id === viewing?.id ? 'true' : undefined}
                  onClick={() => viewTask(t)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); viewTask(t); } }}>
                  <div className="schLaName">
                    <b data-crit={c?.critical ? 'true' : undefined} title={t.name}>{t.name}</b>
                    <span>{[t.trade || t.phase, t.assigned_to, c ? (c.critical ? 'Critical' : `${c.float}d float`) : null].filter(Boolean).join(' · ') || '—'}</span>
                  </div>
                  <div className="schLaDates">{underway ? `Underway · ends ${fmtShort(t.end_date)}` : `${fmtShort(t.start_date)} – ${fmtShort(t.end_date)}`}</div>
                  <div><Badge tone={STATUS_TONE[t.status] || 'neutral'} dot>{STATUS_LABELS[t.status] || t.status}</Badge></div>
                  <div className="schMeter">
                    <Meter pct={t.pct_complete ?? 0} status={t.status} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t.pct_complete ?? 0}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </Card>
    );
  } else {
    body = (
      <Card flush>
        <DataTable<any>
          tableId="project-schedule"
          exportName="schedule"
          columns={columns}
          rows={filtered}
          rowKey={t => t.id}
          defaultSort={{ key: 'start_date', dir: 'asc' }}
          onRowClick={viewTask}
          isSelected={t => t.id === viewing?.id}
          rowActions={taskActions}
          empty={<EmptyState title="Nothing matches" text="Change the search or the filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />}
        />
      </Card>
    );
  }

  const vCpm = viewing ? cpm.byId[String(viewing.id)] : undefined;
  const detail = viewing && (
    <div ref={detailRef} className="schDetail">
      <Card
        title={viewing.name}
        subtitle={viewing.phase || undefined}
        actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close details" title="Close details" onClick={closePanel} />}
      >
        <div className="schSection">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Badge tone={STATUS_TONE[viewing.status] || 'neutral'} dot>{STATUS_LABELS[viewing.status] || viewing.status}</Badge>
            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{viewing.pct_complete ?? 0}%</span>
          </div>
          <Meter pct={viewing.pct_complete ?? 0} status={viewing.status} big />
          <div className="schQuick" role="group" aria-label="Set progress">
            {[25, 50, 75, 100].map(p => (
              <Button key={p} size="sm" aria-pressed={(viewing.pct_complete ?? 0) === p} onClick={() => updatePct(viewing, p)} disabled={String(viewing.id).startsWith('temp-')}>{p}%</Button>
            ))}
          </div>
        </div>
        <div className="schSection">
          <DetailList items={([
            ['Start Date', viewing.start_date ? fmtDate(viewing.start_date) : null],
            ['End Date', viewing.end_date ? fmtDate(viewing.end_date) : null],
            ['Baseline', viewing.baseline_start && viewing.baseline_end ? `${fmtShort(viewing.baseline_start)} – ${fmtShort(viewing.baseline_end)}${finishVariance(viewing) ? ` (${varianceLabel(finishVariance(viewing))})` : ' (on plan)'}` : null],
            ['Duration', viewing.start_date && viewing.end_date ? `${daysBetween(viewing.start_date, viewing.end_date)} days` : null],
            ['Total Float', vCpm ? <span className="schFloat" data-crit={vCpm.critical ? 'true' : undefined}>{vCpm.critical ? `${vCpm.float} days · critical path` : `${vCpm.float} day${vCpm.float === 1 ? '' : 's'}`}</span> : null],
            ['Late Finish', vCpm && !vCpm.critical ? fmtDate(vCpm.lf) : null],
            ['Trade', viewing.trade],
            ['Assigned To', viewing.assigned_to],
            ['Predecessor', tasks.find((t: any) => t.id === viewing.predecessor_id)?.name || viewing.predecessor],
          ] as [string, React.ReactNode][]).filter(([, v]) => !!v)} />
        </div>
        {viewing.notes && (
          <div className="schSection">
            <div className="schSectionTitle">Notes</div>
            <div className="schProse">{viewing.notes}</div>
          </div>
        )}
        <div className="schSection">
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<PencilSimple size={15} />} onClick={() => openEdit(viewing)} disabled={String(viewing.id).startsWith('temp-')} style={{ flex: 1 }}>Edit</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={() => deleteTask(viewing)} disabled={deleting || String(viewing.id).startsWith('temp-')}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="schWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base_}/overview` },
          { label: 'Schedule' },
        ]}
        title="Schedule"
        subtitle="Tasks, dates and progress on one timeline."
        actions={
          <>
            {tasks.length > 0 && (
              <Button icon={<Flag size={15} weight="bold" />} onClick={setBaseline} disabled={baselining}>
                {baselining ? 'Setting…' : tasks.some((t: any) => t.baseline_end) ? 'Reset Baseline' : 'Set Baseline'}
              </Button>
            )}
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Add Task</Button>
          </>
        }
      >
        <StatRow items={stats} />

        {!loading && !loadError && tasks.length > 0 && (
          <>
            <Tabs
              tabs={[{ key: 'gantt', label: 'Gantt' }, { key: 'list', label: 'List', count: filtered.length }, { key: 'lookahead', label: '3-Week Lookahead', count: lookaheadCount }]}
              value={viewMode}
              onChange={k => setViewMode(k as 'gantt' | 'list' | 'lookahead')}
            />
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search tasks or phases…"
              filters={
                <>
                  <Select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: 160 }}
                    options={[{ value: 'all', label: 'All Statuses' }, ...STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))]} />
                  {phases.length > 0 && (
                    <Select aria-label="Phase" value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={{ width: 'auto', minWidth: 160 }}
                      options={[{ value: 'all', label: 'All Phases' }, ...phases]} />
                  )}
                  {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
                </>
              }
              actions={<span className="schMuted" style={{ fontSize: 'var(--fs-sm)' }}>{filtered.length} of {tasks.length}</span>}
            />
          </>
        )}

        <div className="schCq">
          <div className="schSplit" data-open={viewing ? 'true' : 'false'}>
            <div>{body}</div>
            {detail}
          </div>
        </div>
      </PageShell>

      <FormModal
        open={composerOpen}
        onClose={closeComposer}
        title={mode === 'create' ? 'New Task' : 'Edit Task'}
        subtitle={mode === 'create' && ctx
          ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${completedCount} complete · ${delayedCount} delayed · ${critical} on the critical path${next ? ` · next: ${next.name} starts ${fmtShort(next.startDate)}` : ''}`
          : mode === 'edit' && selected ? selected.name : undefined}
        onSubmit={async () => { await save(); }}
        submitLabel={mode === 'create' ? 'Add Task' : 'Save Changes'}
        busy={saving}
      >
        <div className="schForm">
          <FormGrid cols={2}>
            <Field label="Task Name" required span>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Foundation excavation…" required autoFocus />
            </Field>
            <Field label="Phase">
              <Select value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value }))} placeholder="— Select Phase —" options={PHASES} />
            </Field>
            <Field label="Trade">
              <select className="k-select" value={form.trade} onChange={e => setForm(f => ({ ...f, trade: e.target.value }))}>
                <option value="">— Select Trade —</option>
                {SUB_TRADES_BY_DIVISION.map(d => (
                  <optgroup key={d.division} label={`Div ${d.division} — ${d.name}`}>
                    {d.trades.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
                <optgroup label="Specialty & Site Markets">
                  {EXTRA_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              </select>
            </Field>
          </FormGrid>

          <FormGrid cols={3}>
            <Field label="Start" hint={auto.start ? 'Day after the predecessor ends.' : undefined}>
              <div><SaguaroDatePicker value={form.start_date} onChange={v => setStartDate(v)} style={DATE_INPUT_STYLE} /></div>
            </Field>
            <Field label="Duration (days)">
              <Input type="number" min={1} value={duration} placeholder="10" onChange={e => setDurationDays(e.target.value)} />
            </Field>
            <Field label="End" hint={auto.end && form.start_date ? `Start + ${Number(duration) || 0}d — editing either re-syncs.` : undefined}>
              <div><SaguaroDatePicker value={form.end_date} onChange={v => setEndDate(v)} style={DATE_INPUT_STYLE} /></div>
            </Field>
          </FormGrid>

          <FormGrid cols={2}>
            <Field label="Status">
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))} />
            </Field>
            <Field label="% Complete">
              <Input type="number" min={0} max={100} value={form.pct_complete} onChange={e => setForm(f => ({ ...f, pct_complete: Number(e.target.value) }))} />
            </Field>
            <Field label="Assigned To" hint={(ctx?.subs || []).length > 0 ? `${ctx!.subs.length} sub${ctx!.subs.length === 1 ? '' : 's'} on the project roster — start typing to pick one.` : undefined}>
              <Suggest className="k-input" value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Subcontractor or person" options={((ctx?.subs || []) as { companyName?: string | null }[]).map((s) => s.companyName || '').filter(Boolean)} />
            </Field>
            <Field label="Predecessor" hint={pred ? (pred.end_date ? `Follows ${pred.name} — ends ${fmtShort(pred.end_date)}; this task starts the day after.` : `Follows ${pred.name} — it has no end date yet.`) : undefined}>
              <Select value={form.predecessor_id} onChange={e => setPredecessorTask(e.target.value)} disabled={otherTasks.length === 0}
                options={[{ value: '', label: 'None — starts independently' }, ...otherTasks.map((t: any) => ({ value: String(t.id), label: `${t.name}${t.end_date ? ` (ends ${fmtShort(t.end_date)})` : ''}` }))]} />
            </Field>
            <Field label="Notes" span>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any additional notes…" />
            </Field>
          </FormGrid>
        </div>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
