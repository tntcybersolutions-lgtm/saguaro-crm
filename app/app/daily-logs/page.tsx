'use client';
/**
 * Daily Logs Page — Fully wired to /api/daily-logs/list and /api/daily-logs/create.
 * Uses DataTable with sorting, filtering, pagination.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { humanError } from '@/lib/errors';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Sun, CloudRain, Thermometer, UsersThree, Warning, ClipboardText } from '@phosphor-icons/react';
import DataTable from '../../../components/DataTable';
import { colors, font, radius } from '../../../lib/design-tokens';
import { PremiumFX, ModuleHero, StatStrip, InsightRow, AutoChip, IconChip, goldButtonStyle } from '@/components/ui/premium';
import { getLastUsed, setLastUsed, postLearningEvent } from '@/lib/last-used';
import { moduleAccent } from '@/lib/module-identity';
import { ListToolbar } from '@/components/ui/ListToolbar';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_DAILY_LOG_GAP } from '@/lib/suggestions';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';

interface DailyLog {
  id: string;
  project_id: string;
  log_date: string;
  weather: string | null;
  temperature_high: number | null;
  temperature_low: number | null;
  crew_count: number;
  work_performed: string;
  delays: string;
  safety_notes: string;
  materials_delivered: string;
  visitors: string;
  notes: string;
  superintendent?: string | null;
  /* draft | submitted — the column existed in the database and nowhere on
     screen, so a log somebody started and abandoned looked filed. */
  status?: string | null;
  created_at: string;
}

interface Project { id: string; name: string; }

const columnHelper = createColumnHelper<DailyLog>();

const fmtDay = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
/** Workdays (Mon-Fri) strictly between two ISO dates — 0 across a plain weekend. */
function missedWorkdays(fromIso: string, toIso: string) {
  let n = 0;
  for (let d = new Date(fromIso + 'T12:00:00').getTime() + 86400000; d < new Date(toIso + 'T12:00:00').getTime(); d += 86400000) {
    const wd = new Date(d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export default function DailyLogsPage() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autoCrew, setAutoCrew] = useState(false);
  // "Same as yesterday" — true once the prior log's structure was carried in.
  const [carryUsed, setCarryUsed] = useState(false);
  const [carrying, setCarrying] = useState(false);
  // Last-used memory: what this open prefilled, so AUTO chips track edits.
  const [lastApplied, setLastApplied] = useState<{ projectId?: string; superintendent?: string }>({});
  // ListToolbar state — filters + sort persist per module via sag_flt_daily-logs.
  const [logSearch, setLogSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [delayFilter, setDelayFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const prevLogFor = (pid: string) => logs.filter(l => l.project_id === pid).sort((a, b) => (b.log_date || '').localeCompare(a.log_date || ''))[0];

  const [form, setForm] = useState({
    projectId: '',
    logDate: new Date().toISOString().slice(0, 10),
    weather: '',
    temperatureHigh: '',
    temperatureLow: '',
    crewCount: '',
    workPerformed: '',
    delays: '',
    safetyNotes: '',
    materialsDelivered: '',
    visitors: '',
    notes: '',
    // Mobile-app fields (app/daily.tsx) — kept in sync so a web-created log
    // carries the same union of columns the native app reads/writes.
    superintendent: '',
    precipitation: '',
    windConditions: '',
    phaseOfWork: '',
    equipment: '',
  });

  // Snapshot of the selected project — served from the shared useProjectContext
  // cache the moment one is chosen in the modal; last log + open items, so the
  // form walks in knowing the job.
  const { ctx } = useProjectContext(form.projectId || null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/daily-logs/list');
      if (!res.ok) throw new Error('Failed to load daily logs');
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : data.logs ?? data.daily_logs ?? []);
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetch('/api/projects?limit=100&fields=id,name')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProjects(Array.isArray(d) ? d : d.projects ?? []); })
      .catch(() => {});
    // Deep link from the command palette: /app/daily-logs?new=1 opens the composer.
    try {
      if (new URLSearchParams(window.location.search).get('new') === '1') openCreate();
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLogs]);

  /** Open the composer with last-used memory applied: the project and
   *  superintendent this user logged last time prefill with AUTO chips. */
  function openCreate() {
    const last = getLastUsed<{ projectId?: string; superintendent?: string }>('daily-log') || {};
    const applied: { projectId?: string; superintendent?: string } = {};
    const next = { ...form };
    if (!next.projectId && last.projectId && projects.some(p => p.id === last.projectId)) {
      next.projectId = last.projectId;
      applied.projectId = last.projectId;
      const prev = prevLogFor(last.projectId);
      if (prev?.crew_count) { next.crewCount = String(prev.crew_count); setAutoCrew(true); }
    }
    if (!next.superintendent && last.superintendent) {
      next.superintendent = last.superintendent;
      applied.superintendent = last.superintendent;
    }
    setForm(next);
    setLastApplied(applied);
    setCarryUsed(false);
    setShowCreate(true);
  }

  /** "Same as yesterday" — carries the prior log's structure (crew, super,
   *  phase, equipment) via the server /prefill carry-forward, falling back to
   *  the last log already loaded client-side. Today's narrative stays blank. */
  async function sameAsYesterday() {
    const pid = form.projectId;
    if (!pid || carrying) return;
    setCarrying(true);
    try {
      let carry: Record<string, any> | null = null;
      let clockCrew = 0;
      try {
        const r = await fetch(`/api/projects/${pid}/daily-logs/prefill?date=${form.logDate}`);
        if (r.ok) {
          const d = await r.json();
          carry = d.carryForward || null;
          clockCrew = Number(d.crewCount) || 0;
        }
      } catch { /* prefill unavailable — fall back to the loaded log list */ }
      const prev = prevLogFor(pid);
      setForm(f => ({
        ...f,
        crewCount: clockCrew > 0 ? String(clockCrew) : (prev?.crew_count ? String(prev.crew_count) : f.crewCount),
        superintendent: f.superintendent || (carry?.superintendent as string) || prev?.superintendent || '',
        phaseOfWork: f.phaseOfWork || (carry?.phase_of_work as string) || '',
        equipment: f.equipment || (carry?.equipment as string) || '',
      }));
      setAutoCrew(true);
      setCarryUsed(true);
    } finally {
      setCarrying(false);
    }
  }

  /* ── Unsaved-work protection (R14): dirty once anything beyond the default
   *    date is filled in; draft autosaves to this device and restores on
   *    return. Losing a day's field notes is exactly the failure mode the
   *    guard exists for. ── */
  const logFormDirty = showCreate && (
    !!form.projectId || !!form.weather || !!form.temperatureHigh || !!form.temperatureLow ||
    !!form.crewCount || !!form.workPerformed || !!form.delays || !!form.safetyNotes ||
    !!form.materialsDelivered || !!form.visitors || !!form.notes || !!form.superintendent ||
    !!form.precipitation || !!form.windConditions || !!form.phaseOfWork || !!form.equipment
  );
  const guard = useUnsavedGuard({
    dirty: logFormDirty,
    draftKey: 'daily-log-create',
    draftData: form,
    restoreDraft: (d) => {
      setForm(f => ({ ...f, ...(d as Partial<typeof form>) }));
      setShowCreate(true);
    },
    onSave: () => submitCreate(),
  });

  /** Close paths (backdrop / × / Cancel) run through the guard. */
  function closeCreate() {
    guard.requestClose(() => setShowCreate(false));
  }

  /** POST the form — shared by the form submit and the guard's "Save & leave". */
  async function submitCreate(): Promise<boolean> {
    if (!form.projectId) {
      setError('Pick a project before the log can be saved.');
      return false;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/daily-logs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: form.projectId,
          logDate: form.logDate,
          weather: form.weather || null,
          temperatureHigh: form.temperatureHigh ? parseFloat(form.temperatureHigh) : null,
          temperatureLow: form.temperatureLow ? parseFloat(form.temperatureLow) : null,
          crewCount: form.crewCount ? parseInt(form.crewCount) : 0,
          workPerformed: form.workPerformed,
          delays: form.delays,
          safetyNotes: form.safetyNotes,
          materialsDelivered: form.materialsDelivered,
          visitors: form.visitors,
          notes: form.notes,
          superintendent: form.superintendent || null,
          precipitation: form.precipitation || null,
          windConditions: form.windConditions || null,
          phaseOfWork: form.phaseOfWork || null,
          equipment: form.equipment || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create daily log');
      // Remember what was saved for next time, and receipt what was accepted.
      setLastUsed('daily-log', { projectId: form.projectId, superintendent: form.superintendent });
      const acceptedLast = [
        lastApplied.projectId && form.projectId === lastApplied.projectId && 'projectId',
        lastApplied.superintendent && form.superintendent === lastApplied.superintendent && 'superintendent',
      ].filter(Boolean) as string[];
      if (acceptedLast.length > 0) {
        postLearningEvent('last_used_prefill', { projectId: form.projectId, meta: { scope: 'daily-log', fields: acceptedLast } });
      }
      if (carryUsed) {
        postLearningEvent('daily_log_carry_forward', { projectId: form.projectId, meta: { logDate: form.logDate } });
      }
      setLastApplied({});
      setCarryUsed(false);
      setShowCreate(false);
      setForm({ projectId: '', logDate: new Date().toISOString().slice(0, 10), weather: '', temperatureHigh: '', temperatureLow: '', crewCount: '', workPerformed: '', delays: '', safetyNotes: '', materialsDelivered: '', visitors: '', notes: '', superintendent: '', precipitation: '', windConditions: '', phaseOfWork: '', equipment: '' });
      setAutoCrew(false);
      await fetchLogs();
      return true;
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Something went wrong. Please try again.'));
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (await submitCreate()) guard.clearDraft();
  }

  const columns = useMemo(() => [
    columnHelper.accessor('log_date', {
      header: 'Date',
      cell: (info) => {
        const v = info.getValue();
        return v ? <span style={{ fontWeight: font.weight.semibold }}>{new Date(v).toLocaleDateString()}</span> : '—';
      },
    }),
    /* Draft or submitted. The column did not exist, so a log somebody started
       and never finished looked exactly like one that was filed — and an
       unsubmitted daily log is a hole in the record that only shows up when
       somebody goes looking for it two years later. */
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusPill module="daily_logs" status={info.getValue() as string} size="sm" />,
    }),
    columnHelper.accessor('weather', {
      header: 'Weather',
      cell: (info) => info.getValue() || '—',
    }),
    columnHelper.accessor((row) => `${row.temperature_high ?? '—'}° / ${row.temperature_low ?? '—'}°`, {
      id: 'temp',
      header: 'Temp',
      // The cell renders "72° / 55°" — sort on the numeric high, not the string.
      sortingFn: (a, b) => (Number(a.original.temperature_high) || 0) - (Number(b.original.temperature_high) || 0),
      cell: (info) => <span style={{ color: colors.textMuted }}>{info.getValue()}</span>,
    }),
    columnHelper.accessor('crew_count', {
      header: 'Crew',
      // crew_count can round-trip as TEXT — numeric sort, not lexicographic.
      sortingFn: (a, b) => (Number(a.original.crew_count) || 0) - (Number(b.original.crew_count) || 0),
      cell: (info) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <UsersThree size={14} style={{ color: colors.textDim }} />
          {info.getValue() || 0}
        </span>
      ),
    }),
    columnHelper.accessor('work_performed', {
      header: 'Work Performed',
      cell: (info) => {
        const v = info.getValue();
        return <span style={{ color: colors.textMuted, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>{v || '—'}</span>;
      },
    }),
    columnHelper.accessor('delays', {
      header: 'Delays',
      cell: (info) => {
        const v = info.getValue();
        return v ? <span style={{ color: colors.orange }}>{v}</span> : <span style={{ color: colors.textDim }}>None</span>;
      },
    }),
    columnHelper.accessor('safety_notes', {
      header: 'Safety',
      cell: (info) => {
        const v = info.getValue();
        return v ? <span style={{ color: colors.red }}>{v.slice(0, 40)}{v.length > 40 ? '...' : ''}</span> : <span style={{ color: colors.green }}>OK</span>;
      },
    }),
  ], []);

  const visibleLogs = useMemo(() => {
    let list = logs;
    if (projectFilter !== 'all') list = list.filter(l => l.project_id === projectFilter);
    if (delayFilter === 'delays') list = list.filter(l => (l.delays || '').trim());
    if (delayFilter === 'clear') list = list.filter(l => !(l.delays || '').trim());
    const q = logSearch.trim().toLowerCase();
    if (q) list = list.filter(l => [l.work_performed, l.weather, l.delays, l.superintendent, l.notes, l.visitors, l.materials_delivered].some(v => String(v || '').toLowerCase().includes(q)));
    return [...list].sort((a, b) => sortBy === 'oldest'
      ? (a.log_date || '').localeCompare(b.log_date || '')
      : (b.log_date || '').localeCompare(a.log_date || ''));
  }, [logs, logSearch, projectFilter, delayFilter, sortBy]);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: colors.raised, border: `1px solid ${colors.border}`, borderRadius: radius.md, color: colors.text, fontSize: font.size.md, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textMuted, marginBottom: 4, display: 'block' };

  return (
    <div className="pmRoot" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header — standard module hero anatomy, accented by the daily module color */}
      <PremiumFX />
      <ModuleHero
        eyebrow="Field Record"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('daily').vivid ?? moduleAccent('daily').hex}><ClipboardText size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('daily').hex}
        title="Daily"
        accent="Logs"
        subtitle="Track daily field activity, weather, crew, and work progress."
        note="wins the argument in 2 years"
        actions={
          <button data-tour="new-daily-log" onClick={openCreate} className="pmBtn" style={goldButtonStyle}>
            <Plus size={16} weight="bold" /> New Log
          </button>
        }
      />

      {/* Cross-project field intelligence — no dead space above the table */}
      {!loading && logs.length > 0 && (() => {
        const monthIso = new Date().toISOString().slice(0, 7);
        const thisMonth = logs.filter(l => (l.log_date || '').startsWith(monthIso)).length;
        const avgCrew = logs.length ? Math.round(logs.reduce((s, l) => s + (Number(l.crew_count) || 0), 0) / logs.length) : 0;
        const delayDays = logs.filter(l => (l.delays || '').trim()).length;
        const projectsCovered = new Set(logs.map(l => l.project_id)).size;
        const latest = logs.reduce((m, l) => (l.log_date || '') > m ? (l.log_date || '') : m, '');
        return (
          <StatStrip items={[
            { label: 'Latest Log', value: latest ? fmtDay(latest) : '—', sub: 'across all projects' },
            { label: 'Total Logs', value: String(logs.length), sub: 'all field reports' },
            { label: 'This Month', value: String(thisMonth), sub: monthIso },
            { label: 'Avg Crew / Day', value: String(avgCrew), sub: 'workers on site' },
            { label: 'Days w/ Delays', value: String(delayDays), accent: delayDays > 0 ? colors.red : undefined, sub: delayDays > 0 ? 'flagged delays' : 'none flagged' },
            { label: 'Projects', value: String(projectsCovered), sub: 'with field reports' },
          ]} />
        );
      })()}

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: radius.md, color: colors.red, fontSize: font.size.md, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Warning size={16} /> {error}
        </div>
      )}

      {/* List toolbar — search, project + delay filters, and sort (spec 1.1 anatomy) */}
      <ListToolbar
        module="daily-logs"
        search={logSearch}
        onSearch={setLogSearch}
        searchPlaceholder="Search daily logs..."
        filters={[
          { key: 'project', label: 'Project', value: projectFilter, onChange: setProjectFilter, allLabel: 'All Projects', options: projects.map(p => ({ value: p.id, label: p.name })) },
          { key: 'delays', label: 'Delays', value: delayFilter, onChange: setDelayFilter, allLabel: 'All Days', options: [
            { value: 'delays', label: 'Days with Delays' },
            { value: 'clear', label: 'No Delays' },
          ] },
        ]}
        sort={sortBy}
        onSort={setSortBy}
        sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]}
        count={{ shown: visibleLogs.length, total: logs.length }}
        style={{ marginBottom: 16 }}
      />

      {/* NudgeRing pulses the log table when the suggestion engine flags an
          active project that has gone 3+ workdays without a daily log. */}
      <NudgeRing anchorId={ANCHOR_DAILY_LOG_GAP}>
        <DataTable
          data={visibleLogs}
          columns={columns}
          loading={loading}
          tableId="daily-logs"
          searchPlaceholder="Refine within results..."
          emptyMessage="No daily logs yet. Create your first log to start tracking."
          onRowClick={(row) => guard.requestLeave(`/app/daily-logs/${row.id}`)}
        />
      </NudgeRing>

      {/* ── Create Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) closeCreate(); }}>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: colors.surface, zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.black, color: colors.text }}>New Daily Log</h2>
              <button onClick={closeCreate} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {form.projectId && ctx ? (() => {
                const lastLog = ctx.recent?.lastDailyLogDate as string | null;
                const gap = lastLog ? missedWorkdays(lastLog, new Date().toISOString().slice(0, 10)) : 0;
                const prev = prevLogFor(form.projectId);
                return (
                  <div style={{ background: gap > 0 ? 'rgba(239,68,68,.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${gap > 0 ? 'rgba(239,68,68,.3)' : colors.border}`, borderRadius: radius.md, padding: '12px 14px' }}>
                    <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: gap > 0 ? colors.red : colors.text }}>
                      {lastLog
                        ? gap > 0
                          ? `Gap in the record — last log ${fmtDay(lastLog)}, ${gap} workday${gap === 1 ? '' : 's'} unlogged.`
                          : `Last log: ${fmtDay(lastLog)} — record is current.`
                        : 'First daily log on this project — it starts the field record.'}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <InsightRow label="Project" value={`${Number(ctx.project?.percentComplete) || 0}% complete`} />
                      <InsightRow label="Open items" value={`${ctx.counts?.openRfis ?? 0} RFIs · ${ctx.counts?.openSubmittals ?? 0} submittals · ${ctx.counts?.openPunch ?? 0} punch`} />
                      {prev ? <InsightRow label="Prev log" value={`${prev.crew_count || 0} crew${prev.weather ? ` · ${prev.weather}` : ''}${prev.superintendent ? ` · ${prev.superintendent}` : ''}`} /> : null}
                    </div>
                    {(prev || lastLog) && !carryUsed ? (
                      <button
                        type="button"
                        onClick={sameAsYesterday}
                        disabled={carrying}
                        title="Carry the last log's crew count, superintendent, phase, and equipment into today — work performed stays blank"
                        style={{ marginTop: 10, padding: '7px 14px', background: 'var(--brand-primary-18, rgba(255,255,255,0.06))', border: '1px solid var(--brand-primary-35, rgba(255,255,255,0.2))', borderRadius: radius.md, color: 'var(--brand-primary)', fontSize: font.size.sm, fontWeight: font.weight.bold, cursor: carrying ? 'wait' : 'pointer', opacity: carrying ? 0.6 : 1 }}
                      >
                        {carrying ? 'Carrying forward…' : 'Same as yesterday — carry crew, super, phase & equipment'}
                      </button>
                    ) : carryUsed ? (
                      <div style={{ marginTop: 8, fontSize: font.size.sm, color: colors.textDim }}>
                        Carried from the last log — crew, superintendent, phase, and equipment are prefilled. Today&apos;s work still needs your words.
                      </div>
                    ) : null}
                  </div>
                );
              })() : null}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Project *{lastApplied.projectId && form.projectId === lastApplied.projectId ? <AutoChip /> : null}</label>
                  <select value={form.projectId} onChange={(e) => {
                    const pid = e.target.value;
                    // The moment a project is chosen the form walks in knowing it:
                    // snapshot fetch + crew carried from that job's latest log.
                    const prev = prevLogFor(pid);
                    setForm(f => ({ ...f, projectId: pid, crewCount: prev?.crew_count ? String(prev.crew_count) : f.crewCount }));
                    setAutoCrew(!!(prev?.crew_count));
                  }} required style={inputStyle}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date<AutoChip /></label>
                  <SaguaroDatePicker value={form.logDate} onChange={(v) => setForm({ ...form, logDate: v })} style={inputStyle} />
                  <div style={{ fontSize: font.size.sm, color: colors.textDim, marginTop: 4 }}>Defaulted to today — backfill any missed day.</div>
                </div>
                <div>
                  <label style={labelStyle}>Superintendent{form.superintendent && ((lastApplied.superintendent && form.superintendent === lastApplied.superintendent) || carryUsed) ? <AutoChip /> : null}</label>
                  <input value={form.superintendent} onChange={(e) => setForm({ ...form, superintendent: e.target.value })} style={inputStyle} placeholder="Who ran the site" />
                  {(() => { const prev = prevLogFor(form.projectId); return prev?.superintendent ? <div style={{ fontSize: font.size.sm, color: colors.textDim, marginTop: 4 }}>Last log: {prev.superintendent}.</div> : null; })()}
                </div>
                <div>
                  <label style={labelStyle}>Phase of Work{carryUsed && form.phaseOfWork ? <AutoChip /> : null}</label>
                  <input value={form.phaseOfWork} onChange={(e) => setForm({ ...form, phaseOfWork: e.target.value })} style={inputStyle} placeholder="e.g. Rough-in, Framing" />
                </div>
                <div>
                  <label style={labelStyle}>Weather</label>
                  <Suggest value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} style={inputStyle} placeholder="Clear, 10 mph W, dusty..." options={['w']} />
                  </div>
                <div>
                  <label style={labelStyle}>Crew Count{autoCrew && form.crewCount ? <AutoChip /> : null}</label>
                  <input type="number" value={form.crewCount} onChange={(e) => setForm({ ...form, crewCount: e.target.value })} style={inputStyle} placeholder="0" />
                  {autoCrew && form.crewCount ? <div style={{ fontSize: font.size.sm, color: colors.textDim, marginTop: 4 }}>Carried from the last log on this project — adjust for today.</div> : null}
                </div>
                <div>
                  <label style={labelStyle}>Temp High (°F)</label>
                  <input type="number" value={form.temperatureHigh} onChange={(e) => setForm({ ...form, temperatureHigh: e.target.value })} style={inputStyle} placeholder="95" />
                </div>
                <div>
                  <label style={labelStyle}>Temp Low (°F)</label>
                  <input type="number" value={form.temperatureLow} onChange={(e) => setForm({ ...form, temperatureLow: e.target.value })} style={inputStyle} placeholder="72" />
                </div>
                <div>
                  <label style={labelStyle}>Precipitation</label>
                  <input value={form.precipitation} onChange={(e) => setForm({ ...form, precipitation: e.target.value })} style={inputStyle} placeholder="e.g. 0.2 in" />
                </div>
                <div>
                  <label style={labelStyle}>Wind</label>
                  <input value={form.windConditions} onChange={(e) => setForm({ ...form, windConditions: e.target.value })} style={inputStyle} placeholder="e.g. 8 mph SW" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Equipment On Site{carryUsed && form.equipment ? <AutoChip /> : null}</label>
                <textarea value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Equipment on site..." />
              </div>
              <div>
                <label style={labelStyle}>Work Performed *</label>
                <textarea value={form.workPerformed} onChange={(e) => setForm({ ...form, workPerformed: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe work completed today..." />
              </div>
              <div>
                <label style={labelStyle}>Delays</label>
                <textarea value={form.delays} onChange={(e) => setForm({ ...form, delays: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any delays or issues..." />
              </div>
              <div>
                <label style={labelStyle}>Safety Notes</label>
                <textarea value={form.safetyNotes} onChange={(e) => setForm({ ...form, safetyNotes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Safety observations, incidents, near misses..." />
              </div>
              <div>
                <label style={labelStyle}>Materials Delivered</label>
                <input value={form.materialsDelivered} onChange={(e) => setForm({ ...form, materialsDelivered: e.target.value })} style={inputStyle} placeholder="Concrete, rebar, lumber..." />
              </div>
              <div>
                <label style={labelStyle}>Visitors</label>
                <input value={form.visitors} onChange={(e) => setForm({ ...form, visitors: e.target.value })} style={inputStyle} placeholder="Inspector, owner, architect..." />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeCreate} style={{ padding: '10px 20px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.lg, color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creating} style={{ padding: '10px 24px', background: colors.gold, border: 'none', borderRadius: radius.lg, color: colors.dark, fontSize: font.size.md, fontWeight: font.weight.black, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : 'Create Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <UnsavedGuardModal guard={guard} />
    </div>
  );
}
