'use client';
/**
 * Schedule Task Detail — task overview reached from the schedule list row click
 * (app/app/schedule/page.tsx -> router.push('/app/schedule/<id>')).
 *
 * Data source: GET /api/schedule/list returns { tasks: [...] } with full rows
 * (the [id] route only exposes PUT/DELETE, not GET), so the task is resolved by
 * id from that list. Machined to the premium kit standard (components/ui/premium):
 * PremiumSurface wrapper, hero-lite ModuleHero (module accent 'schedule' on the
 * eyebrow/chips only), StatStrip timeline band, and SectionCards per section.
 * Uses @phosphor-icons/react (no emoji), consistent with the rest of the app.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Warning, CalendarBlank, GitBranch, ClipboardText, ChartBar,
} from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, ghostButtonStyle } from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';

const ACCENT = moduleAccent('schedule'); // sage — chips, eyebrow, section markers only
const GOLD = 'var(--brand-primary)';
const TEXT = '#FFFFFF';
const DIM = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.45)';
const RED = '#FF3B30';
const GREEN = '#2CFF7A';
const ORANGE = '#FF8A00';
const BLUE = '#FF8A00';

interface ScheduleTask {
  id: string;
  project_id: string | null;
  name: string | null;
  phase: string | null;
  trade: string | null;
  start_date: string | null;
  end_date: string | null;
  pct_complete: number | null;
  status: string | null;
  predecessor_id: string | null;
  duration: number | null;
  created_at: string | null;
}

interface Project { id: string; name: string; }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: '#A3ACBB' }, // hex — composed into hex-alpha chip fills
  in_progress: { label: 'In Progress', color: BLUE },
  complete: { label: 'Complete', color: GREEN },
  blocked: { label: 'Blocked', color: RED },
  delayed: { label: 'Delayed', color: ORANGE },
  on_hold: { label: 'On Hold', color: ORANGE },
};

function statusCfg(status?: string | null): { label: string; color: string } {
  const key = (status ?? 'not_started').toLowerCase();
  return STATUS_MAP[key] ?? STATUS_MAP.not_started;
}

function dateStr(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function ScheduleTaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params['id'] as string;

  const [task, setTask] = useState<ScheduleTask | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [predecessorName, setPredecessorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const loadTask = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await fetch('/api/schedule/list');
      if (!res.ok) throw new Error('Failed to load schedule');
      const data = await res.json();
      const list: ScheduleTask[] = Array.isArray(data)
        ? data
        : data.tasks ?? data.schedule_tasks ?? [];
      const match = list.find(t => t.id === id);
      if (!match) { setNotFound(true); return; }
      setTask(match);
      if (match.predecessor_id) {
        const pred = list.find(t => t.id === match.predecessor_id);
        setPredecessorName(pred?.name ?? 'Linked task');
      } else {
        setPredecessorName(null);
      }
      if (match.project_id) {
        fetch('/api/projects?limit=200&fields=id,name')
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d) return;
            const projects: Project[] = Array.isArray(d) ? d : d.projects ?? [];
            const p = projects.find(x => x.id === match.project_id);
            if (p) setProjectName(p.name);
          })
          .catch(() => {});
      }
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Failed to load the task. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadTask(); }, [loadTask]);

  // ── Shared bits ──────────────────────────────────────────────────────────
  const backBtn = (
    <button onClick={() => router.push('/app/schedule')} style={{ ...ghostButtonStyle, padding: '8px 14px', fontSize: 12.5 }}>
      <ArrowLeft size={14} /> Back to Schedule
    </button>
  );
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 800,
    color: FAINT, marginBottom: 5,
  };
  const fieldValueStyle: React.CSSProperties = {
    fontSize: 13.5, color: TEXT, wordBreak: 'break-word',
  };

  // ── Loading / Not found / Error ──────────────────────────────────────────
  if (loading) {
    return (
      <PremiumSurface maxWidth={2200}>
        <ModuleSkeleton kpis={0} rows={6} />
      </PremiumSurface>
    );
  }

  if (notFound) {
    return (
      <PremiumSurface maxWidth={2200}>
        <SectionCard flat flush>
          <PremiumEmpty
            icon={<CalendarBlank size={30} weight="duotone" color={ACCENT.hex} />}
            title="Task not found"
            description="This schedule task may have been deleted, or the link is stale."
            action={backBtn}
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  if (error && !task) {
    return (
      <PremiumSurface maxWidth={2200}>
        <SectionCard flat flush>
          <PremiumEmpty
            tone="error"
            icon={<Warning size={30} weight="duotone" color={RED} />}
            title="Failed to load the task"
            description={error}
            action={backBtn}
          />
        </SectionCard>
      </PremiumSurface>
    );
  }

  const t = task as ScheduleTask;
  const cfg = statusCfg(t.status);
  const pct = t.pct_complete ?? 0;
  const overdue = !!t.end_date && new Date(t.end_date) < new Date() && (t.status ?? '') !== 'complete';

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Back link */}
      <button
        onClick={() => router.push('/app/schedule')}
        style={{ background: 'none', border: 'none', color: DIM, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} /> Schedule
      </button>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,59,48,.1)', border: `1px solid rgba(255,59,48,.3)`, borderRadius: 12, color: RED, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      {/* Hero-lite */}
      <ModuleHero
        eyebrow="Schedule Task"
        eyebrowIcon={<CalendarBlank size={13} weight="fill" color={ACCENT.hex} />}
        aux={
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 800,
            background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${cfg.color} 35%, transparent)`, color: cfg.color,
          }}>
            {cfg.label}
          </span>
        }
        title={t.name || 'Schedule Task'}
        subtitle={
          <>
            {t.phase || 'No phase'}
            {(projectName || t.project_id) && <span> · {projectName || 'Project'}</span>}
          </>
        }
        style={{ marginBottom: 22 }}
      />

      {/* Timeline band */}
      <StatStrip items={[
        {href: '/app/schedule',  label: 'Start Date', value: dateStr(t.start_date), icon: <CalendarBlank size={12} weight="fill" color={ACCENT.hex} /> },
        {href: '/app/schedule', label: 'End Date', value: dateStr(t.end_date), accent: overdue ? RED : undefined, sub: overdue ? 'Overdue' : undefined, icon: <CalendarBlank size={12} weight="fill" color={ACCENT.hex} /> },
        {href: '/app/schedule',  label: 'Duration', value: t.duration != null ? `${Number(t.duration) || 0}d` : '—', icon: <ChartBar size={12} weight="fill" color={ACCENT.hex} /> },
        {href: '/app/schedule',  label: '% Complete', value: `${pct}%`, accent: GOLD, icon: <ChartBar size={12} weight="fill" color={ACCENT.hex} /> },
        {href: '/app/schedule',  label: 'Status', value: cfg.label, accent: cfg.color, icon: <ClipboardText size={12} weight="fill" color={ACCENT.hex} /> },
      ]} />

      {/* Progress */}
      <SectionCard flat
        title="Progress"
        icon={<ChartBar size={16} weight="duotone" color={ACCENT.hex} />}
        accent={ACCENT.hex}
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(Math.max(pct, 0), 100)}%`, background: pct >= 100 ? GREEN : pct > 50 ? BLUE : GOLD, borderRadius: 999, transition: 'width .3s ease', boxShadow: '0 0 12px -2px currentColor' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT, minWidth: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
      </SectionCard>

      {/* Task details */}
      <SectionCard flat
        title="Task Details"
        icon={<ClipboardText size={16} weight="duotone" color={ACCENT.hex} />}
        accent={ACCENT.hex}
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          {[
            { l: 'Task', v: t.name || '—' },
            { l: 'Phase', v: t.phase || '—' },
            { l: 'Project', v: projectName || t.project_id || '—' },
            { l: 'Trade', v: t.trade || '—' },
            { l: 'Start Date', v: dateStr(t.start_date) },
            { l: 'End Date', v: dateStr(t.end_date) },
            { l: 'Created', v: dateStr(t.created_at) },
          ].map(f => (
            <div key={f.l}>
              <div style={fieldLabelStyle}>{f.l}</div>
              <div style={fieldValueStyle}>{f.v}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Dependencies */}
      <SectionCard
        title="Dependencies"
        icon={<GitBranch size={16} weight="duotone" color={ACCENT.hex} />}
        accent={ACCENT.hex}
      >
        <div style={fieldLabelStyle}>Predecessor</div>
        {t.predecessor_id ? (
          <div
            style={{ ...fieldValueStyle, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: BLUE, fontWeight: 700 }}
            onClick={() => router.push(`/app/schedule/${t.predecessor_id}`)}
          >
            <GitBranch size={14} color={BLUE} /> {predecessorName || 'Linked task'}
          </div>
        ) : (
          <div style={{ ...fieldValueStyle, color: DIM }}>No predecessor — this task can start independently.</div>
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
