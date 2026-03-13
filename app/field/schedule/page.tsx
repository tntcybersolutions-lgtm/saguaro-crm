'use client';
/**
 * Saguaro Field — Schedule View
 * Read-only today/this week schedule. Shows what's happening and what's behind.
 */
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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

function SchedulePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'today' | 'week' | 'all' | 'late'>('today');
  const [projectName, setProjectName] = useState('');

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

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}><line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/></svg></button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Schedule</h1>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: DIM }}>{projectName}</p>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {lateTasks.length > 0 && <StatBadge label="Late" value={lateTasks.length} color={RED} />}
        <StatBadge label="Active" value={activeToday.length} color={GOLD} />
        {milestones.length > 0 && <StatBadge label="Milestones" value={milestones.length} color={BLUE} />}
        <StatBadge label="Total" value={tasks.length} color={DIM} />
      </div>

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
              <div
                key={task.id}
                style={{ background: RAISED, border: `1px solid ${late ? 'rgba(239,68,68,.35)' : active ? 'rgba(212,160,23,.25)' : BORDER}`, borderRadius: 14, padding: '14px' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {task.is_milestone && <span title="Milestone" style={{ fontSize: 12 }}>🏁</span>}
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
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

const backBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#8BAAC8', fontSize: 14, cursor: 'pointer', padding: '0 0 10px', display: 'block' };

function hexRgb(hex: string): string {
  const r = parseInt((hex || '#888').slice(1, 3), 16);
  const g = parseInt((hex || '#888').slice(3, 5), 16);
  const b = parseInt((hex || '#888').slice(5, 7), 16);
  return `${r},${g},${b}`;
}
