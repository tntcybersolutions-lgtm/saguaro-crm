'use client';
/**
 * Saguaro Field — Schedule View
 * View today/this week schedule. Tap a task to update % complete from the field.
 * Includes Gantt chart view toggle.
 * Enhanced with CPM dependencies, critical path, baseline comparison, milestones.
 */
import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { enqueue } from '@/lib/field-db';

const GOLD   = '#D4A017';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

/* ---- Dependency Types ---- */
type DepType = 'FS' | 'SS' | 'FF' | 'SF';

interface Dependency {
  from: string;   // predecessor task id
  to: string;     // successor task id
  type: DepType;  // FS, SS, FF, SF
  lag?: number;    // lag in days (default 0)
}

interface BaselineData {
  start_date: string;
  end_date: string;
}

interface Task {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  pct_complete?: number;
  percent_complete?: number;
  status: string;
  trade?: string;
  is_milestone?: boolean;
  // CPM/dependency fields
  predecessors?: string[];       // legacy simple predecessor ids
  successors?: string[];         // legacy simple successor ids
  dependencies?: Dependency[];   // full dependency objects
  // Baseline fields
  baseline_start?: string;
  baseline_end?: string;
  baseline?: BaselineData;
  // CPM calculated fields (set at runtime)
  _es?: number;  // early start
  _ef?: number;  // early finish
  _ls?: number;  // late start
  _lf?: number;  // late finish
  _totalFloat?: number;
  _isCritical?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'In Progress': GOLD,
  'Not Started': DIM,
  'Complete': GREEN,
  'Delayed': RED,
  'in_progress': GOLD,
  'not_started': DIM,
  'complete': GREEN,
  'delayed': RED,
};

const DEP_TYPE_LABELS: Record<DepType, string> = {
  FS: 'Finish-to-Start',
  SS: 'Start-to-Start',
  FF: 'Finish-to-Finish',
  SF: 'Start-to-Finish',
};

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  return d >= weekStart && d <= weekEnd;
}
function isActive(task: Task) {
  const now = new Date();
  const start = new Date(task.start_date);
  const end = new Date(task.end_date);
  return start <= now && end >= now;
}
function isLate(task: Task) {
  const pct = task.pct_complete ?? task.percent_complete ?? 0;
  return new Date(task.end_date) < new Date() && pct < 100 && task.status !== 'complete' && task.status !== 'Complete';
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysDiff(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
function statusFromPct(pct: number): string {
  if (pct === 0) return 'not_started';
  if (pct >= 100) return 'complete';
  return 'in_progress';
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getGanttBarColor(task: Task): string {
  const s = task.status?.toLowerCase().replace(/\s+/g, '_') || '';
  if (s === 'in_progress' || s === 'in progress') return GOLD;
  if (s === 'complete' || s === 'completed') return GREEN;
  if (s === 'delayed') return RED;
  return DIM;
}

/* ---- CPM / Critical Path Calculation ---- */
function buildDependencies(tasks: Task[]): Dependency[] {
  const deps: Dependency[] = [];
  const seenKeys = new Set<string>();

  for (const task of tasks) {
    // Collect from explicit dependency objects
    if (task.dependencies && Array.isArray(task.dependencies)) {
      for (const dep of task.dependencies) {
        const key = `${dep.from}->${dep.to}:${dep.type}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          deps.push(dep);
        }
      }
    }
    // Collect from simple predecessors array (default FS)
    if (task.predecessors && Array.isArray(task.predecessors)) {
      for (const predId of task.predecessors) {
        const key = `${predId}->${task.id}:FS`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          deps.push({ from: predId, to: task.id, type: 'FS', lag: 0 });
        }
      }
    }
    // Collect from simple successors array (default FS)
    if (task.successors && Array.isArray(task.successors)) {
      for (const succId of task.successors) {
        const key = `${task.id}->${succId}:FS`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          deps.push({ from: task.id, to: succId, type: 'FS', lag: 0 });
        }
      }
    }
  }

  return deps;
}

function calculateCPM(tasks: Task[], deps: Dependency[]): Task[] {
  if (tasks.length === 0) return tasks;

  const taskMap = new Map<string, Task>();
  const projectStart = new Date(Math.min(...tasks.map(t => new Date(t.start_date).getTime())));

  // Clone tasks and calculate durations in day offsets from project start
  const cloned = tasks.map(t => {
    const c = { ...t };
    const startDay = daysBetween(projectStart, new Date(t.start_date));
    const endDay = daysBetween(projectStart, new Date(t.end_date));
    const duration = Math.max(endDay - startDay, t.is_milestone ? 0 : 1);
    c._es = startDay;
    c._ef = startDay + duration;
    c._ls = 0;
    c._lf = 0;
    c._totalFloat = 0;
    c._isCritical = false;
    taskMap.set(c.id, c);
    return c;
  });

  // Build adjacency
  const predecessorsOf = new Map<string, { taskId: string; type: DepType; lag: number }[]>();
  const successorsOf = new Map<string, { taskId: string; type: DepType; lag: number }[]>();

  for (const dep of deps) {
    if (!taskMap.has(dep.from) || !taskMap.has(dep.to)) continue;
    if (!predecessorsOf.has(dep.to)) predecessorsOf.set(dep.to, []);
    predecessorsOf.get(dep.to)!.push({ taskId: dep.from, type: dep.type, lag: dep.lag || 0 });
    if (!successorsOf.has(dep.from)) successorsOf.set(dep.from, []);
    successorsOf.get(dep.from)!.push({ taskId: dep.to, type: dep.type, lag: dep.lag || 0 });
  }

  // Topological sort
  const inDegree = new Map<string, number>();
  for (const t of cloned) inDegree.set(t.id, 0);
  for (const dep of deps) {
    if (taskMap.has(dep.from) && taskMap.has(dep.to)) {
      inDegree.set(dep.to, (inDegree.get(dep.to) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    const succs = successorsOf.get(id) || [];
    for (const s of succs) {
      inDegree.set(s.taskId, (inDegree.get(s.taskId) || 0) - 1);
      if (inDegree.get(s.taskId) === 0) queue.push(s.taskId);
    }
  }

  // Add any tasks not in topo order (cycles or isolated)
  for (const t of cloned) {
    if (!topoOrder.includes(t.id)) topoOrder.push(t.id);
  }

  // Forward pass — calculate ES and EF
  for (const id of topoOrder) {
    const task = taskMap.get(id)!;
    const preds = predecessorsOf.get(id) || [];
    let maxES = task._es!;

    for (const pred of preds) {
      const predTask = taskMap.get(pred.taskId)!;
      let constraintDate = 0;
      switch (pred.type) {
        case 'FS': constraintDate = predTask._ef! + pred.lag; break;
        case 'SS': constraintDate = predTask._es! + pred.lag; break;
        case 'FF': constraintDate = predTask._ef! + pred.lag - (task._ef! - task._es!); break;
        case 'SF': constraintDate = predTask._es! + pred.lag - (task._ef! - task._es!); break;
      }
      if (constraintDate > maxES) maxES = constraintDate;
    }

    const duration = task._ef! - task._es!;
    task._es = maxES;
    task._ef = maxES + duration;
  }

  // Find project end
  const projectEnd = Math.max(...cloned.map(t => t._ef!));

  // Backward pass — calculate LS and LF
  for (const t of cloned) {
    t._lf = projectEnd;
    t._ls = projectEnd - (t._ef! - t._es!);
  }

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const task = taskMap.get(id)!;
    const succs = successorsOf.get(id) || [];

    for (const succ of succs) {
      const succTask = taskMap.get(succ.taskId)!;
      let constraintDate = task._lf!;
      switch (succ.type) {
        case 'FS': constraintDate = succTask._ls! - succ.lag; break;
        case 'SS': {
          const val = succTask._ls! - succ.lag;
          constraintDate = val + (task._ef! - task._es!);
          break;
        }
        case 'FF': constraintDate = succTask._lf! - succ.lag; break;
        case 'SF': {
          const val = succTask._lf! - succ.lag;
          constraintDate = val - (task._ef! - task._es!) + (task._ef! - task._es!);
          constraintDate = succTask._lf! - succ.lag;
          break;
        }
      }
      if (constraintDate < task._lf!) {
        const duration = task._ef! - task._es!;
        task._lf = constraintDate;
        task._ls = constraintDate - duration;
      }
    }
  }

  // Calculate float and critical path
  for (const t of cloned) {
    t._totalFloat = (t._ls! - t._es!);
    t._isCritical = Math.abs(t._totalFloat) < 1; // float < 1 day = critical
  }

  return cloned;
}

/* ---- Baseline helpers ---- */
function getBaselineStart(task: Task): string | null {
  return task.baseline_start || task.baseline?.start_date || null;
}

function getBaselineEnd(task: Task): string | null {
  return task.baseline_end || task.baseline?.end_date || null;
}

function getBaselineVariance(task: Task): number | null {
  const bEnd = getBaselineEnd(task);
  if (!bEnd) return null;
  const actual = new Date(task.end_date).getTime();
  const baseline = new Date(bEnd).getTime();
  return Math.round((actual - baseline) / 86400000);
}

/* ---- Dependency Arrow Drawing ---- */
function DependencyArrows({
  tasks,
  deps,
  timelineStart,
  DAY_WIDTH,
  ROW_HEIGHT,
  HEADER_HEIGHT,
}: {
  tasks: Task[];
  deps: Dependency[];
  timelineStart: Date;
  DAY_WIDTH: number;
  ROW_HEIGHT: number;
  HEADER_HEIGHT: number;
}) {
  const taskIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    tasks.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [tasks]);

  const getTaskX = (task: Task, point: 'start' | 'end') => {
    const d = point === 'start' ? new Date(task.start_date) : new Date(task.end_date);
    return daysBetween(timelineStart, d) * DAY_WIDTH;
  };

  const getTaskY = (idx: number) => {
    return HEADER_HEIGHT + idx * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const arrows = useMemo(() => {
    const result: Array<{ path: string; isCritical: boolean; key: string }> = [];

    for (const dep of deps) {
      const fromIdx = taskIndexMap.get(dep.from);
      const toIdx = taskIndexMap.get(dep.to);
      if (fromIdx === undefined || toIdx === undefined) continue;

      const fromTask = tasks[fromIdx];
      const toTask = tasks[toIdx];
      const fromIsCritical = fromTask._isCritical || false;
      const toIsCritical = toTask._isCritical || false;
      const isCritical = fromIsCritical && toIsCritical;

      let x1: number, y1: number, x2: number, y2: number;

      switch (dep.type) {
        case 'FS':
          x1 = getTaskX(fromTask, 'end');
          y1 = getTaskY(fromIdx);
          x2 = getTaskX(toTask, 'start');
          y2 = getTaskY(toIdx);
          break;
        case 'SS':
          x1 = getTaskX(fromTask, 'start');
          y1 = getTaskY(fromIdx);
          x2 = getTaskX(toTask, 'start');
          y2 = getTaskY(toIdx);
          break;
        case 'FF':
          x1 = getTaskX(fromTask, 'end');
          y1 = getTaskY(fromIdx);
          x2 = getTaskX(toTask, 'end');
          y2 = getTaskY(toIdx);
          break;
        case 'SF':
          x1 = getTaskX(fromTask, 'start');
          y1 = getTaskY(fromIdx);
          x2 = getTaskX(toTask, 'end');
          y2 = getTaskY(toIdx);
          break;
        default:
          x1 = getTaskX(fromTask, 'end');
          y1 = getTaskY(fromIdx);
          x2 = getTaskX(toTask, 'start');
          y2 = getTaskY(toIdx);
      }

      // Build a path with right-angle routing
      const midX = x1 + (x2 - x1) / 2;
      const cornerRadius = 4;

      let path: string;
      if (Math.abs(y1 - y2) < 2) {
        // Same row — straight horizontal line
        path = `M ${x1} ${y1} L ${x2} ${y2}`;
      } else if (x2 > x1 + 10) {
        // Normal routing: right then down/up then right
        path = `M ${x1} ${y1} L ${midX - cornerRadius} ${y1} Q ${midX} ${y1} ${midX} ${y1 + (y2 > y1 ? cornerRadius : -cornerRadius)} L ${midX} ${y2 - (y2 > y1 ? cornerRadius : -cornerRadius)} Q ${midX} ${y2} ${midX + cornerRadius} ${y2} L ${x2} ${y2}`;
      } else {
        // Backward routing: go right a bit, drop down, go left, drop to target
        const offsetX = 12;
        path = `M ${x1} ${y1} L ${x1 + offsetX} ${y1} L ${x1 + offsetX} ${(y1 + y2) / 2} L ${x2 - offsetX} ${(y1 + y2) / 2} L ${x2 - offsetX} ${y2} L ${x2} ${y2}`;
      }

      result.push({ path, isCritical, key: `${dep.from}-${dep.to}-${dep.type}` });
    }

    return result;
  }, [tasks, deps, taskIndexMap, timelineStart, DAY_WIDTH, ROW_HEIGHT, HEADER_HEIGHT]);

  if (arrows.length === 0) return null;

  const totalHeight = HEADER_HEIGHT + tasks.length * ROW_HEIGHT;

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: totalHeight, pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}
    >
      <defs>
        <marker id="arrowHead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 Z" fill={DIM} />
        </marker>
        <marker id="arrowHeadCritical" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 Z" fill={RED} />
        </marker>
      </defs>
      {arrows.map((a) => (
        <path
          key={a.key}
          d={a.path}
          fill="none"
          stroke={a.isCritical ? RED : DIM}
          strokeWidth={a.isCritical ? 2 : 1.5}
          strokeOpacity={a.isCritical ? 0.85 : 0.5}
          markerEnd={a.isCritical ? 'url(#arrowHeadCritical)' : 'url(#arrowHead)'}
        />
      ))}
    </svg>
  );
}

/* ---- Gantt Chart Component ---- */
function GanttChart({
  tasks,
  deps,
  onSelectTask,
  showBaseline,
}: {
  tasks: Task[];
  deps: Dependency[];
  onSelectTask: (t: Task) => void;
  showBaseline: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const TASK_NAME_WIDTH = 160;
  const ROW_HEIGHT = 36;
  const DAY_WIDTH = 28;
  const HEADER_HEIGHT = 44;

  const { timelineStart, totalDays } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return { timelineStart: now, timelineEnd: addDays(now, 30), totalDays: 30 };
    }
    let minDate = new Date(tasks[0].start_date);
    let maxDate = new Date(tasks[0].end_date);
    for (const t of tasks) {
      const s = new Date(t.start_date);
      const e = new Date(t.end_date);
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
      // Also consider baseline dates
      const bs = getBaselineStart(t);
      const be = getBaselineEnd(t);
      if (bs) { const bsd = new Date(bs); if (bsd < minDate) minDate = bsd; }
      if (be) { const bed = new Date(be); if (bed > maxDate) maxDate = bed; }
    }
    minDate = addDays(minDate, -2);
    maxDate = addDays(maxDate, 2);
    const total = daysBetween(minDate, maxDate);
    return { timelineStart: minDate, timelineEnd: maxDate, totalDays: Math.max(total, 7) };
  }, [tasks]);

  const dateHeaders = useMemo(() => {
    const headers: Array<{ label: string; offset: number }> = [];
    for (let i = 0; i <= totalDays; i++) {
      const d = addDays(timelineStart, i);
      const isWeekStart = d.getDay() === 1;
      if (isWeekStart || i === 0) {
        headers.push({ label: formatShortDate(d), offset: i * DAY_WIDTH });
      }
    }
    return headers;
  }, [timelineStart, totalDays]);

  const todayOffset = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = daysBetween(timelineStart, now);
    if (diff < 0 || diff > totalDays) return null;
    return diff * DAY_WIDTH;
  }, [timelineStart, totalDays]);

  useEffect(() => {
    if (todayOffset !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 100);
    }
  }, [todayOffset]);

  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
        <p style={{ margin: 0, fontSize: 14 }}>No tasks to display in Gantt chart.</p>
      </div>
    );
  }

  const timelineWidth = totalDays * DAY_WIDTH;
  const chartHeight = tasks.length * ROW_HEIGHT;

  return (
    <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: RAISED }}>
      {/* Task names column */}
      <div style={{ width: TASK_NAME_WIDTH, flexShrink: 0, borderRight: `1px solid ${BORDER}` }}>
        <div style={{ height: HEADER_HEIGHT, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: DIM }}>Task</span>
        </div>
        {tasks.map((task) => {
          const variance = getBaselineVariance(task);
          return (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              style={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                borderBottom: `1px solid ${BORDER}`,
                borderLeft: task._isCritical ? `3px solid ${RED}` : 'none',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }} title={task.name}>
                  {task.is_milestone ? '\u25C6 ' : ''}{task.name}
                </span>
                {task._isCritical && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: RED, background: 'rgba(239,68,68,.12)',
                    padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    Critical
                  </span>
                )}
                {!task._isCritical && task._totalFloat !== undefined && task._totalFloat > 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 600, color: DIM, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {task._totalFloat}d
                  </span>
                )}
                {showBaseline && variance !== null && variance !== 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
                    color: variance > 0 ? RED : GREEN,
                    background: variance > 0 ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                    padding: '1px 4px', borderRadius: 4,
                  }}>
                    {variance > 0 ? `+${variance}d` : `${variance}d`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline scrollable section */}
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ width: timelineWidth, position: 'relative' }}>
          {/* Date headers */}
          <div style={{ height: HEADER_HEIGHT, borderBottom: `1px solid ${BORDER}`, position: 'relative' }}>
            {dateHeaders.map((h, i) => (
              <div key={i} style={{ position: 'absolute', left: h.offset, top: 0, height: '100%', display: 'flex', alignItems: 'center', borderLeft: `1px solid ${BORDER}`, paddingLeft: 6 }}>
                <span style={{ fontSize: 10, color: DIM, whiteSpace: 'nowrap', fontWeight: 600 }}>{h.label}</span>
              </div>
            ))}
          </div>

          {/* Task bars */}
          {tasks.map((task, idx) => {
            const pct = task.pct_complete ?? task.percent_complete ?? 0;
            const taskStart = new Date(task.start_date);
            const taskEnd = new Date(task.end_date);
            const startOffset = daysBetween(timelineStart, taskStart) * DAY_WIDTH;
            const duration = Math.max(daysBetween(taskStart, taskEnd), 1);
            const barWidth = duration * DAY_WIDTH;
            const barColor = task._isCritical ? RED : getGanttBarColor(task);
            const top = idx * ROW_HEIGHT;

            // Baseline bar calculations
            const bStart = getBaselineStart(task);
            const bEnd = getBaselineEnd(task);
            let baselineBar: { left: number; width: number } | null = null;
            if (showBaseline && bStart && bEnd) {
              const bStartDate = new Date(bStart);
              const bEndDate = new Date(bEnd);
              const bStartOffset = daysBetween(timelineStart, bStartDate) * DAY_WIDTH;
              const bDuration = Math.max(daysBetween(bStartDate, bEndDate), 1);
              baselineBar = { left: bStartOffset, width: bDuration * DAY_WIDTH };
            }

            if (task.is_milestone) {
              const milestoneLeft = startOffset - 7;
              return (
                <div key={task.id} style={{ position: 'absolute', top: top + HEADER_HEIGHT, left: 0, width: timelineWidth, height: ROW_HEIGHT, borderBottom: `1px solid ${BORDER}` }}>
                  {/* Baseline milestone (lighter diamond) */}
                  {baselineBar && (
                    <div
                      style={{
                        position: 'absolute',
                        left: baselineBar.left - 6,
                        top: (ROW_HEIGHT - 12) / 2,
                        width: 12,
                        height: 12,
                        background: 'rgba(212,160,23,.2)',
                        border: `1px dashed rgba(212,160,23,.4)`,
                        transform: 'rotate(45deg)',
                        borderRadius: 1,
                      }}
                    />
                  )}
                  {/* Actual milestone diamond */}
                  <div
                    onClick={() => onSelectTask(task)}
                    style={{
                      position: 'absolute',
                      left: milestoneLeft,
                      top: (ROW_HEIGHT - 14) / 2,
                      width: 14,
                      height: 14,
                      background: task._isCritical ? RED : GOLD,
                      transform: 'rotate(45deg)',
                      borderRadius: 2,
                      cursor: 'pointer',
                      boxShadow: task._isCritical ? `0 0 6px rgba(239,68,68,.5)` : `0 0 4px rgba(212,160,23,.4)`,
                    }}
                  />
                </div>
              );
            }

            return (
              <div key={task.id} style={{ position: 'absolute', top: top + HEADER_HEIGHT, left: 0, width: timelineWidth, height: ROW_HEIGHT, borderBottom: `1px solid ${BORDER}` }}>
                {/* Baseline bar (behind actual) */}
                {baselineBar && (
                  <div style={{
                    position: 'absolute',
                    left: baselineBar.left,
                    top: (ROW_HEIGHT - 22) / 2 - 1,
                    width: baselineBar.width,
                    height: 22,
                    background: 'rgba(139,170,200,.08)',
                    border: `1px dashed rgba(139,170,200,.25)`,
                    borderRadius: 4,
                    zIndex: 0,
                  }} />
                )}
                {/* Actual bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: startOffset,
                    top: (ROW_HEIGHT - 18) / 2,
                    width: barWidth,
                    height: 18,
                    background: `rgba(${hexRgb(barColor)},.2)`,
                    borderRadius: 4,
                    border: `1px solid rgba(${hexRgb(barColor)},.35)`,
                    borderLeft: task._isCritical ? `3px solid ${RED}` : `1px solid rgba(${hexRgb(barColor)},.35)`,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    zIndex: 1,
                  }}
                  onClick={() => onSelectTask(task)}
                >
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width .3s' }} />
                </div>
                {barWidth > 30 && (
                  <div style={{ position: 'absolute', left: startOffset + 4, top: (ROW_HEIGHT - 18) / 2, height: 18, display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>{pct}%</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Dependency arrows SVG overlay */}
          <DependencyArrows
            tasks={tasks}
            deps={deps}
            timelineStart={timelineStart}
            DAY_WIDTH={DAY_WIDTH}
            ROW_HEIGHT={ROW_HEIGHT}
            HEADER_HEIGHT={HEADER_HEIGHT}
          />

          {/* Today marker */}
          {todayOffset !== null && (
            <div style={{ position: 'absolute', left: todayOffset, top: 0, width: 0, height: chartHeight + HEADER_HEIGHT, borderLeft: `2px dashed ${GOLD}`, zIndex: 10, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 2, left: -16, fontSize: 9, color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>Today</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SchedulePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'today' | 'week' | 'all' | 'late'>('today');
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
  const [projectName, setProjectName] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editPct, setEditPct]   = useState(0);
  const [saving, setSaving]     = useState(false);
  const [online, setOnline]     = useState(true);
  const [savedMsg, setSavedMsg] = useState('');
  const [showBaseline, setShowBaseline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    fetch('/api/projects/list')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { const p = d?.projects?.find((x: { id: string; name: string }) => x.id === projectId); if (p) setProjectName(p.name); })
      .catch(() => {});

    fetch(`/api/projects/${projectId}/schedule`)
      .then((r) => r.ok ? r.json() : { tasks: [] })
      .then((d) => setTasks(d.tasks || d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // Build dependencies and run CPM
  const allDeps = useMemo(() => buildDependencies(tasks), [tasks]);
  const cpmTasks = useMemo(() => calculateCPM(tasks, allDeps), [tasks, allDeps]);

  const activeToday  = cpmTasks.filter((t) => isActive(t));
  const thisWeek     = cpmTasks.filter((t) => isThisWeek(t.start_date) || isThisWeek(t.end_date) || isActive(t));
  const lateTasks    = cpmTasks.filter(isLate);
  const milestones   = cpmTasks.filter((t) => t.is_milestone);
  const criticalTasks = cpmTasks.filter((t) => t._isCritical);

  const displayTasks = tab === 'today' ? activeToday : tab === 'week' ? thisWeek : tab === 'late' ? lateTasks : cpmTasks;

  const tabs = [
    { id: 'today', label: 'Today', count: activeToday.length },
    { id: 'week',  label: 'This Week', count: thisWeek.length },
    { id: 'late',  label: 'Late', count: lateTasks.length },
    { id: 'all',   label: 'All', count: cpmTasks.length },
  ] as const;

  // Check if any baseline data exists
  const hasBaseline = cpmTasks.some(t => getBaselineStart(t) || getBaselineEnd(t));

  const openTaskDetail = (task: Task) => {
    // Find the CPM-enriched version
    const enriched = cpmTasks.find(t => t.id === task.id) || task;
    setSelectedTask(enriched);
    setEditPct(enriched.pct_complete ?? enriched.percent_complete ?? 0);
    setSavedMsg('');
  };

  const handleSavePct = async () => {
    if (!selectedTask) return;
    setSaving(true);

    const newStatus = statusFromPct(editPct);

    // Optimistic update
    setTasks((prev) => prev.map((t) =>
      t.id === selectedTask.id
        ? { ...t, pct_complete: editPct, percent_complete: editPct, status: newStatus }
        : t
    ));
    setSelectedTask((prev) => prev ? { ...prev, pct_complete: editPct, percent_complete: editPct, status: newStatus } : prev);

    const payload = { percent_complete: editPct };

    try {
      if (!online) throw new Error('offline');
      const res = await fetch(`/api/projects/${projectId}/schedule/${selectedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setSavedMsg('Progress updated');
    } catch {
      await enqueue({
        url: `/api/projects/${projectId}/schedule/${selectedTask.id}`,
        method: 'PATCH',
        body: JSON.stringify(payload),
        contentType: 'application/json',
        isFormData: false,
      });
      setSavedMsg('Queued — will sync when online');
    }

    setSaving(false);
    setTimeout(() => setSavedMsg(''), 3500);
  };

  // Helper: get predecessors for a task
  const getPredecessors = (task: Task): Array<{ task: Task; type: DepType }> => {
    const result: Array<{ task: Task; type: DepType }> = [];
    for (const dep of allDeps) {
      if (dep.to === task.id) {
        const predTask = cpmTasks.find(t => t.id === dep.from);
        if (predTask) result.push({ task: predTask, type: dep.type });
      }
    }
    return result;
  };

  // Helper: get successors for a task
  const getSuccessors = (task: Task): Array<{ task: Task; type: DepType }> => {
    const result: Array<{ task: Task; type: DepType }> = [];
    for (const dep of allDeps) {
      if (dep.from === task.id) {
        const succTask = cpmTasks.find(t => t.id === dep.to);
        if (succTask) result.push({ task: succTask, type: dep.type });
      }
    }
    return result;
  };

  // ---- TASK DETAIL VIEW ----
  if (selectedTask) {
    const pct = editPct;
    const late = isLate(selectedTask);
    const daysLeft = daysDiff(selectedTask.end_date);
    const newStatus = statusFromPct(pct);
    const predecessors = getPredecessors(selectedTask);
    const successors = getSuccessors(selectedTask);
    const variance = getBaselineVariance(selectedTask);
    const bStart = getBaselineStart(selectedTask);
    const bEnd = getBaselineEnd(selectedTask);

    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => setSelectedTask(null)} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>{selectedTask.name}</h1>
          {selectedTask._isCritical && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: RED,
              background: 'rgba(239,68,68,.12)', border: `1px solid rgba(239,68,68,.25)`,
              padding: '2px 8px', borderRadius: 6,
            }}>
              Critical Path
            </span>
          )}
        </div>
        {selectedTask.trade && <p style={{ margin: '0 0 4px', fontSize: 13, color: DIM }}>{selectedTask.trade}</p>}
        <p style={{ margin: '0 0 16px', fontSize: 12, color: DIM }}>
          {formatDate(selectedTask.start_date)} – {formatDate(selectedTask.end_date)}
          {late ? <span style={{ color: RED, fontWeight: 700 }}> · {Math.abs(daysLeft)}d overdue</span> :
           daysLeft === 0 ? <span style={{ color: AMBER, fontWeight: 700 }}> · Due today</span> :
           daysLeft > 0 && daysLeft <= 3 ? <span style={{ color: AMBER }}> · {daysLeft}d left</span> : null}
        </p>

        {savedMsg && (
          <div style={{
            background: savedMsg.includes('Queued') ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)',
            border: `1px solid ${savedMsg.includes('Queued') ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.3)'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            color: savedMsg.includes('Queued') ? AMBER : GREEN, fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>
            {savedMsg}
          </div>
        )}

        {/* Progress Card */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 18, padding: '24px 20px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 56, fontWeight: 900, color: pct === 100 ? GREEN : pct > 0 ? GOLD : DIM, letterSpacing: -2, marginBottom: 4 }}>
            {pct}%
          </div>
          <div style={{
            fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20, display: 'inline-block',
            background: `rgba(${hexRgb(STATUS_COLORS[newStatus] || DIM)},.12)`,
            color: STATUS_COLORS[newStatus] || DIM,
            marginBottom: 20,
          }}>
            {newStatus.replace('_', ' ')}
          </div>

          {/* Progress bar */}
          <div style={{ height: 8, background: '#1E3A5F', borderRadius: 4, marginBottom: 16 }}>
            <div style={{ height: '100%', background: pct === 100 ? GREEN : pct > 0 ? GOLD : 'transparent', borderRadius: 4, width: `${pct}%`, transition: 'width .3s' }} />
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => setEditPct(parseInt(e.target.value))}
              style={{
                width: '100%', height: 6, appearance: 'none', WebkitAppearance: 'none',
                background: `linear-gradient(to right, ${GOLD} 0%, ${GOLD} ${pct}%, #1E3A5F ${pct}%, #1E3A5F 100%)`,
                borderRadius: 3, outline: 'none', cursor: 'pointer',
              }}
            />
          </div>

          {/* Quick buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {[25, 50, 75, 100].map((v) => (
              <button
                key={v}
                onClick={() => setEditPct(v)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  background: pct === v ? (v === 100 ? GREEN : GOLD) : 'rgba(30,58,95,.5)',
                  border: `1px solid ${pct === v ? (v === 100 ? GREEN : GOLD) : BORDER}`,
                  color: pct === v ? (v === 100 ? '#000' : '#000') : DIM,
                  transition: 'all .2s',
                }}
              >
                {v}%
              </button>
            ))}
          </div>

          {/* Save button */}
          <button
            onClick={handleSavePct}
            disabled={saving}
            style={{
              width: '100%', background: saving ? '#1E3A5F' : GOLD, border: 'none', borderRadius: 14,
              padding: '18px', color: saving ? DIM : '#000', fontSize: 17, fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer', letterSpacing: 0.5,
            }}
          >
            {saving ? 'Saving...' : online ? 'Save Progress' : 'Save (Offline — will sync)'}
          </button>
        </div>

        {/* Task Info */}
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Task Info</p>
          <InfoRow label="Start Date" value={formatDate(selectedTask.start_date)} />
          <InfoRow label="End Date" value={formatDate(selectedTask.end_date)} />
          {selectedTask.trade && <InfoRow label="Trade" value={selectedTask.trade} />}
          {selectedTask.is_milestone && <InfoRow label="Type" value="Milestone" />}
          <InfoRow label="Days Remaining" value={daysLeft < 0 ? `${Math.abs(daysLeft)} overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} days`} valueColor={daysLeft < 0 ? RED : daysLeft === 0 ? AMBER : GREEN} />
        </div>

        {/* CPM / Float Info */}
        {(selectedTask._totalFloat !== undefined || selectedTask._isCritical) && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Schedule Analysis</p>
            {selectedTask._isCritical && (
              <InfoRow label="Critical Path" value="Yes" valueColor={RED} />
            )}
            <InfoRow
              label="Total Float"
              value={`${selectedTask._totalFloat ?? 0} days`}
              valueColor={selectedTask._isCritical ? RED : selectedTask._totalFloat! <= 3 ? AMBER : GREEN}
            />
          </div>
        )}

        {/* Baseline Comparison */}
        {(bStart || bEnd) && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Baseline vs Actual</p>
            {bStart && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: DIM }}>Start</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: DIM, textDecoration: 'line-through', marginRight: 8 }}>{formatDate(bStart)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{formatDate(selectedTask.start_date)}</span>
                </div>
              </div>
            )}
            {bEnd && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, color: DIM }}>Finish</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: DIM, textDecoration: 'line-through', marginRight: 8 }}>{formatDate(bEnd)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{formatDate(selectedTask.end_date)}</span>
                </div>
              </div>
            )}
            {variance !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ fontSize: 13, color: DIM }}>Variance</span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: variance === 0 ? GREEN : variance > 0 ? RED : GREEN,
                  background: variance === 0 ? 'rgba(34,197,94,.12)' : variance > 0 ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                  padding: '2px 10px', borderRadius: 8,
                }}>
                  {variance === 0 ? 'On Schedule' : variance > 0 ? `${variance}d behind` : `${Math.abs(variance)}d ahead`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Predecessors */}
        {predecessors.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Predecessors ({predecessors.length})
            </p>
            {predecessors.map((p, i) => (
              <div
                key={i}
                onClick={() => openTaskDetail(p.task)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: i < predecessors.length - 1 ? `1px solid ${BORDER}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{p.task.name}</span>
                  {p.task._isCritical && (
                    <span style={{ fontSize: 8, fontWeight: 800, color: RED, marginLeft: 6, background: 'rgba(239,68,68,.12)', padding: '1px 4px', borderRadius: 4 }}>Critical</span>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: BLUE,
                  background: 'rgba(59,130,246,.12)',
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginLeft: 8,
                }}>
                  {p.type}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Successors */}
        {successors.length > 0 && (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Successors ({successors.length})
            </p>
            {successors.map((s, i) => (
              <div
                key={i}
                onClick={() => openTaskDetail(s.task)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: i < successors.length - 1 ? `1px solid ${BORDER}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{s.task.name}</span>
                  {s.task._isCritical && (
                    <span style={{ fontSize: 8, fontWeight: 800, color: RED, marginLeft: 6, background: 'rgba(239,68,68,.12)', padding: '1px 4px', borderRadius: 4 }}>Critical</span>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: BLUE,
                  background: 'rgba(59,130,246,.12)',
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginLeft: 8,
                }}>
                  {s.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- MAIN VIEW (LIST + GANTT) ----
  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Schedule</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>{projectName}</p>

      {!online && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: RED, fontWeight: 600 }}>Offline — updates will sync when reconnected</div>}

      {savedMsg && (
        <div style={{
          background: savedMsg.includes('Queued') ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)',
          border: `1px solid ${savedMsg.includes('Queued') ? 'rgba(245,158,11,.3)' : 'rgba(34,197,94,.3)'}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 14,
          color: savedMsg.includes('Queued') ? AMBER : GREEN, fontSize: 14, fontWeight: 600,
        }}>
          {savedMsg}
        </div>
      )}

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {lateTasks.length > 0 && <StatBadge label="Late" value={lateTasks.length} color={RED} />}
        <StatBadge label="Active" value={activeToday.length} color={GOLD} />
        {criticalTasks.length > 0 && <StatBadge label="Critical" value={criticalTasks.length} color={RED} />}
        {milestones.length > 0 && <StatBadge label="Milestones" value={milestones.length} color={BLUE} />}
        <StatBadge label="Total" value={cpmTasks.length} color={DIM} />
      </div>

      {/* View mode toggle: List / Gantt */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: '#060C15', borderRadius: 10, padding: 4 }}>
        <button
          onClick={() => setViewMode('list')}
          style={{ flex: 1, background: viewMode === 'list' ? RAISED : 'transparent', border: `1px solid ${viewMode === 'list' ? BORDER : 'transparent'}`, borderRadius: 8, padding: '8px 4px', color: viewMode === 'list' ? TEXT : DIM, fontSize: 13, fontWeight: viewMode === 'list' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><line x1={8} y1={6} x2={21} y2={6}/><line x1={8} y1={12} x2={21} y2={12}/><line x1={8} y1={18} x2={21} y2={18}/><line x1={3} y1={6} x2={3.01} y2={6}/><line x1={3} y1={12} x2={3.01} y2={12}/><line x1={3} y1={18} x2={3.01} y2={18}/></svg>
          List
        </button>
        <button
          onClick={() => setViewMode('gantt')}
          style={{ flex: 1, background: viewMode === 'gantt' ? RAISED : 'transparent', border: `1px solid ${viewMode === 'gantt' ? BORDER : 'transparent'}`, borderRadius: 8, padding: '8px 4px', color: viewMode === 'gantt' ? TEXT : DIM, fontSize: 13, fontWeight: viewMode === 'gantt' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><rect x={3} y={3} width={7} height={4} rx={1}/><rect x={6} y={9} width={12} height={4} rx={1}/><rect x={4} y={15} width={9} height={4} rx={1}/></svg>
          Gantt
        </button>
      </div>

      {viewMode === 'list' && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: '#060C15', borderRadius: 10, padding: 4 }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: 1, background: tab === t.id ? RAISED : 'transparent', border: `1px solid ${tab === t.id ? BORDER : 'transparent'}`, borderRadius: 8, padding: '8px 4px', color: tab === t.id ? TEXT : DIM, fontSize: 11, fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
              >
                <span>{t.label}</span>
                {t.count > 0 && <span style={{ fontSize: 10, color: tab === t.id ? GOLD : DIM }}>{t.count}</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading schedule...</div>
          ) : displayTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: DIM }}>
              <div style={{ marginBottom: 8, color: tab === 'late' ? GREEN : GOLD, display: 'flex', justifyContent: 'center' }}>{tab === 'late' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><polyline points="20 6 9 17 4 12"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={40} height={40}><rect x={3} y={4} width={18} height={18} rx={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg>}</div>
              <p style={{ margin: 0, fontSize: 14 }}>
                {tab === 'today' ? 'No active tasks today. Check "This Week" or "All".' :
                 tab === 'late' ? 'No late tasks — you\'re on schedule!' :
                 'No schedule data. Add tasks in the desktop dashboard.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {displayTasks.map((task) => {
                const pct = task.pct_complete ?? task.percent_complete ?? 0;
                const late = isLate(task);
                const active = isActive(task);
                const daysLeft = daysDiff(task.end_date);
                const variance = getBaselineVariance(task);
                return (
                  <button
                    key={task.id}
                    onClick={() => openTaskDetail(task)}
                    style={{
                      background: RAISED,
                      border: `1px solid ${late ? 'rgba(239,68,68,.35)' : active ? 'rgba(212,160,23,.25)' : BORDER}`,
                      borderLeft: task._isCritical ? `3px solid ${RED}` : `1px solid ${late ? 'rgba(239,68,68,.35)' : active ? 'rgba(212,160,23,.25)' : BORDER}`,
                      borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                          {task.is_milestone && <span title="Milestone" style={{ fontSize: 12 }}>&#127937;</span>}
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{task.name}</p>
                          {task._isCritical && (
                            <span style={{
                              fontSize: 9, fontWeight: 800, color: RED,
                              background: 'rgba(239,68,68,.12)',
                              padding: '1px 6px', borderRadius: 4,
                            }}>
                              Critical
                            </span>
                          )}
                          {!task._isCritical && task._totalFloat !== undefined && task._totalFloat > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: DIM }}>
                              Float: {task._totalFloat}d
                            </span>
                          )}
                        </div>
                        {task.trade && <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>{task.trade}</p>}
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM }}>
                          {formatDate(task.start_date)} – {formatDate(task.end_date)}
                          {late ? <span style={{ color: RED, fontWeight: 700 }}> · {Math.abs(daysLeft)}d overdue</span> :
                           daysLeft === 0 ? <span style={{ color: AMBER, fontWeight: 700 }}> · Due today</span> :
                           daysLeft > 0 && daysLeft <= 3 ? <span style={{ color: AMBER }}> · {daysLeft}d left</span> : null}
                          {variance !== null && variance !== 0 && (
                            <span style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 700,
                              color: variance > 0 ? RED : GREEN,
                              background: variance > 0 ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                              padding: '1px 5px', borderRadius: 4,
                            }}>
                              {variance > 0 ? `+${variance}d behind` : `${Math.abs(variance)}d ahead`}
                            </span>
                          )}
                        </p>
                        {/* Progress bar */}
                        <div style={{ height: 5, background: '#1E3A5F', borderRadius: 3 }}>
                          <div style={{ height: '100%', background: pct === 100 ? GREEN : late ? RED : active ? GOLD : BLUE, borderRadius: 3, width: `${pct}%`, transition: 'width .3s' }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: pct === 100 ? GREEN : late ? RED : GOLD }}>{pct}%</div>
                        <div style={{ fontSize: 10, color: STATUS_COLORS[task.status] || DIM, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {task.status?.replace('_', ' ')}
                        </div>
                        <div style={{ fontSize: 9, color: DIM, marginTop: 4 }}>tap to edit</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {viewMode === 'gantt' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: DIM }}>Loading schedule...</div>
        ) : (
          <>
            {/* Gantt toolbar */}
            {hasBaseline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <button
                  onClick={() => setShowBaseline(!showBaseline)}
                  style={{
                    background: showBaseline ? 'rgba(59,130,246,.12)' : 'transparent',
                    border: `1px solid ${showBaseline ? BLUE : BORDER}`,
                    borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                    color: showBaseline ? BLUE : DIM, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: `2px solid ${showBaseline ? BLUE : DIM}`,
                    background: showBaseline ? BLUE : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {showBaseline && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} width={10} height={10}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  Show Baseline
                </button>
                {/* Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 16, height: 4, background: DIM, borderRadius: 2, border: `1px dashed rgba(139,170,200,.4)` }} />
                    <span style={{ fontSize: 9, color: DIM }}>Baseline</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 16, height: 4, background: RED, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: DIM }}>Critical</span>
                  </div>
                </div>
              </div>
            )}
            {!hasBaseline && allDeps.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 16, height: 4, background: RED, borderRadius: 2 }} />
                  <span style={{ fontSize: 9, color: DIM }}>Critical Path</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width={16} height={10}><line x1={0} y1={5} x2={16} y2={5} stroke={DIM} strokeWidth={1.5} /></svg>
                  <span style={{ fontSize: 9, color: DIM }}>Dependencies</span>
                </div>
              </div>
            )}
            <GanttChart tasks={cpmTasks} deps={allDeps} onSelectTask={openTaskDetail} showBaseline={showBaseline} />
          </>
        )
      )}
    </div>
  );
}

export default function FieldSchedulePage() {
  return <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}><SchedulePage /></Suspense>;
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return <div style={{ background: `rgba(${hexRgb(color)},.1)`, border: `1px solid rgba(${hexRgb(color)},.25)`, borderRadius: 20, padding: '4px 12px', fontSize: 12, color, fontWeight: 700 }}>{value} {label}</div>;
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 13, color: DIM }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor || TEXT }}>{value}</span>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
