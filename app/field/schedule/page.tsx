'use client';
/**
 * Saguaro Field — Schedule View
 * View today/this week schedule. Tap a task to update % complete from the field.
 * Includes Gantt chart view toggle.
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

/* ---- Gantt Chart Component ---- */
function GanttChart({ tasks, onSelectTask }: { tasks: Task[]; onSelectTask: (t: Task) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const TASK_NAME_WIDTH = 120;
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
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onSelectTask(task)}
            style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 8px', borderBottom: `1px solid ${BORDER}`, overflow: 'hidden', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 11, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }} title={task.name}>
              {task.is_milestone ? '\u25C6 ' : ''}{task.name}
            </span>
          </div>
        ))}
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
            const barColor = getGanttBarColor(task);
            const top = idx * ROW_HEIGHT;

            if (task.is_milestone) {
              const milestoneLeft = startOffset + (barWidth / 2) - 8;
              return (
                <div key={task.id} style={{ position: 'absolute', top: top + HEADER_HEIGHT, left: 0, width: timelineWidth, height: ROW_HEIGHT, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ position: 'absolute', left: milestoneLeft, top: (ROW_HEIGHT - 16) / 2, width: 16, height: 16, background: GOLD, transform: 'rotate(45deg)', borderRadius: 2 }} />
                </div>
              );
            }

            return (
              <div key={task.id} style={{ position: 'absolute', top: top + HEADER_HEIGHT, left: 0, width: timelineWidth, height: ROW_HEIGHT, borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ position: 'absolute', left: startOffset, top: (ROW_HEIGHT - 18) / 2, width: barWidth, height: 18, background: `rgba(${hexRgb(barColor)},.2)`, borderRadius: 4, border: `1px solid rgba(${hexRgb(barColor)},.35)`, overflow: 'hidden', cursor: 'pointer' }} onClick={() => onSelectTask(task)}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width .3s' }} />
                </div>
                {barWidth > 30 && (
                  <div style={{ position: 'absolute', left: startOffset + 4, top: (ROW_HEIGHT - 18) / 2, height: 18, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>{pct}%</span>
                  </div>
                )}
              </div>
            );
          })}

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

  const activeToday  = tasks.filter((t) => isActive(t));
  const thisWeek     = tasks.filter((t) => isThisWeek(t.start_date) || isThisWeek(t.end_date) || isActive(t));
  const lateTasks    = tasks.filter(isLate);
  const milestones   = tasks.filter((t) => t.is_milestone);

  const displayTasks = tab === 'today' ? activeToday : tab === 'week' ? thisWeek : tab === 'late' ? lateTasks : tasks;

  const tabs = [
    { id: 'today', label: 'Today', count: activeToday.length },
    { id: 'week',  label: 'This Week', count: thisWeek.length },
    { id: 'late',  label: 'Late', count: lateTasks.length },
    { id: 'all',   label: 'All', count: tasks.length },
  ] as const;

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setEditPct(task.pct_complete ?? task.percent_complete ?? 0);
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

  // ---- TASK DETAIL VIEW ----
  if (selectedTask) {
    const pct = editPct;
    const late = isLate(selectedTask);
    const daysLeft = daysDiff(selectedTask.end_date);
    const newStatus = statusFromPct(pct);

    return (
      <div style={{ padding: '18px 16px' }}>
        <button onClick={() => setSelectedTask(null)} style={backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
            <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: TEXT }}>{selectedTask.name}</h1>
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
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Task Info</p>
          <InfoRow label="Start Date" value={formatDate(selectedTask.start_date)} />
          <InfoRow label="End Date" value={formatDate(selectedTask.end_date)} />
          {selectedTask.trade && <InfoRow label="Trade" value={selectedTask.trade} />}
          {selectedTask.is_milestone && <InfoRow label="Type" value="Milestone" />}
          <InfoRow label="Days Remaining" value={daysLeft < 0 ? `${Math.abs(daysLeft)} overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} days`} valueColor={daysLeft < 0 ? RED : daysLeft === 0 ? AMBER : GREEN} />
        </div>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {lateTasks.length > 0 && <StatBadge label="Late" value={lateTasks.length} color={RED} />}
        <StatBadge label="Active" value={activeToday.length} color={GOLD} />
        {milestones.length > 0 && <StatBadge label="Milestones" value={milestones.length} color={BLUE} />}
        <StatBadge label="Total" value={tasks.length} color={DIM} />
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
                return (
                  <button
                    key={task.id}
                    onClick={() => openTaskDetail(task)}
                    style={{ background: RAISED, border: `1px solid ${late ? 'rgba(239,68,68,.35)' : active ? 'rgba(212,160,23,.25)' : BORDER}`, borderRadius: 14, padding: '14px', textAlign: 'left', width: '100%', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {task.is_milestone && <span title="Milestone" style={{ fontSize: 12 }}>&#127937;</span>}
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{task.name}</p>
                        </div>
                        {task.trade && <p style={{ margin: '0 0 6px', fontSize: 12, color: DIM }}>{task.trade}</p>}
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: DIM }}>
                          {formatDate(task.start_date)} – {formatDate(task.end_date)}
                          {late ? <span style={{ color: RED, fontWeight: 700 }}> · {Math.abs(daysLeft)}d overdue</span> :
                           daysLeft === 0 ? <span style={{ color: AMBER, fontWeight: 700 }}> · Due today</span> :
                           daysLeft > 0 && daysLeft <= 3 ? <span style={{ color: AMBER }}> · {daysLeft}d left</span> : null}
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
          <GanttChart tasks={tasks} onSelectTask={openTaskDetail} />
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
