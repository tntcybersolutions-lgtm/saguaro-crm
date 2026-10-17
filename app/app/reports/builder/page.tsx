'use client';
/**
 * Custom Report Builder — the ONE canonical builder (/app/reports-builder
 * permanently redirects here). Runs real tenant data through /api/reports/run,
 * exports tenant-branded PDF / Excel / CSV through /api/reports/export, and
 * persists configurations in saved_reports via /api/reports/saved.
 * Also the home of Scheduled Deliveries (#schedules): the email schedules that
 * live on report_templates.template_data.schedule and fire via
 * /api/cron/report-schedules — ported from the retired /app/reports-builder,
 * managed through /api/reports/[id]/schedule.
 * Command-center anatomy: ModuleHero, live StatStrip, SectionCards, machined
 * selects, skeleton loading, honest empty states.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiErrorFrom } from '@/lib/api-refusal';
import { humanError } from '@/lib/errors';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, IconChip, Pill,
  goldButtonStyle, ghostButtonStyle, secondaryButtonStyle
} from '@/components/ui/premium';
import { PdfIcon, XlsIcon, CsvIcon, DocIcon, FileButton } from '@/components/ui/FileTypeIcon';
import {
  ChartBar, Funnel, Columns, FloppyDisk, Play, Printer, Trash, Plus, Table, Clock,
} from '@phosphor-icons/react';
import {
  REPORT_ENTITIES,
  ENTITY_MAP,
  FILTER_OPS,
  PROJECT_COLUMN,
  PROJECT_FILTER_OPS,
  type ColType,
} from '@/lib/report-entities';
import { humanValue } from '@/lib/list-view';

// ── Surface tokens (white-label safe — gold rides the brand CSS vars) ──
const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const WHITE = 'var(--text-primary)';
const MUTED = 'rgba(255,255,255,0.62)';
const FAINT = 'rgba(255,255,255,0.42)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = 'var(--danger)';

// ── Local types ────────────────────────────────────────────────
interface FilterRow {
  field: string;
  op: string;
  value: string;
}
interface RunColumn {
  key: string;
  label: string;
  type: ColType;
}
interface SavedReport {
  id: string;
  name: string;
  entity: string;
  config: ReportConfig;
  updated_at?: string;
}
interface ReportConfig {
  columns: string[];
  filters: FilterRow[];
  groupBy: string | null;
  sort: { field: string; dir: 'asc' | 'desc' };
  limit: number;
}
interface RunResult {
  columns: RunColumn[];
  rows: Record<string, unknown>[];
  groupBy: string | null;
  rowCount: number;
}

// ── Scheduled deliveries (report_templates email schedules) ─────
// A different model from saved_reports: these live on
// report_templates.template_data.schedule, are delivered by
// /api/cron/report-schedules, and are edited through
// /api/reports/[id]/schedule. The page that created them retired, so this
// builder is now the one place to manage them.
type ScheduleFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
interface TemplateSchedule {
  enabled: boolean;
  frequency: ScheduleFrequency;
  recipients: string[];
  nextRun?: string;
  lastRunAt?: string;
  lastStatus?: string;
}
interface ScheduledTemplate {
  id: string;
  name: string;
  schedule: TemplateSchedule;
}

const FREQUENCIES: { value: ScheduleFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 Weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/** Pull the templates with an active email schedule out of raw /api/reports rows. */
function parseScheduledTemplates(raw: unknown): ScheduledTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduledTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { id?: unknown; name?: unknown; template_data?: unknown };
    const td = (row.template_data && typeof row.template_data === 'object') ? row.template_data as Record<string, unknown> : {};
    const s = (td.schedule && typeof td.schedule === 'object') ? td.schedule as Record<string, unknown> : null;
    if (!s || s.enabled !== true || typeof row.id !== 'string') continue;
    out.push({
      id: row.id,
      name: typeof row.name === 'string' && row.name ? row.name : 'Untitled Report',
      schedule: {
        enabled: true,
        frequency: FREQUENCIES.some((f) => f.value === s.frequency) ? s.frequency as ScheduleFrequency : 'weekly',
        recipients: Array.isArray(s.recipients) ? s.recipients.filter((r): r is string => typeof r === 'string') : [],
        nextRun: typeof s.nextRun === 'string' ? s.nextRun : undefined,
        lastRunAt: typeof s.lastRunAt === 'string' ? s.lastRunAt : undefined,
        lastStatus: typeof s.lastStatus === 'string' ? s.lastStatus : undefined,
      },
    });
  }
  return out;
}

function fmtWhen(iso?: string): string {
  if (!iso) return 'next cron pass';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Value-less operators (no value input) ──────────────────────
const NO_VALUE_OPS = new Set(['is_null', 'not_null']);

// ── Formatting helpers ──────────────────────────────────────────
function fmtCell(value: unknown, type: ColType): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': {
      const n = Number(value);
      return Number.isNaN(n) ? String(value) : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    }
    case 'percent': {
      const n = Number(value);
      return Number.isNaN(n) ? String(value) : `${n}%`;
    }
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? String(value) : n.toLocaleString('en-US');
    }
    case 'date': {
      const s = String(value);
      // date-only strings: show as-is (avoid TZ shifting); timestamps → local date
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US');
    }
    case 'bool':
      return value === true || value === 'true' ? 'Yes' : 'No';
    default:
      // Stored codes read as words: owner_request → Owner request, approved → Approved.
      return humanValue(String(value));
  }
}

// Trigger a browser download for a served export blob.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const badgeToneFor = (v: string): 'gold' | 'green' | 'red' | 'amber' | 'neutral' => {
  const s = v.toLowerCase();
  if (/(approved|complete|closed|answered|resolved|done|paid|certified)/.test(s)) return 'green';
  if (/(open|pending|draft|new|submitted|in.?progress|review)/.test(s)) return 'gold';
  if (/(overdue|rejected|void|failed|expired|disputed)/.test(s)) return 'red';
  if (/(urgent|high|hold|revise)/.test(s)) return 'amber';
  return 'neutral';
};

// ── Machined form parts (glass ground, brand focus ring by default) ────
const inputStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
  color: WHITE,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,

  color: MUTED,
  marginBottom: 6,
  display: 'block',
};

/** Machined select — same milled-glass part as the inputs, pointer cursor. */
function Sel({ value, onChange, children, style }: { value: string; onChange: (v: string) => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', ...style }}>
      {children}
    </select>
  );
}

/** Pulsing skeleton bar (pmSkeleton keyframes come with PremiumSurface). */
function SkeletonBar({ w = '100%', h = 36 }: { w?: number | string; h?: number }) {
  return <div className="pmSkeleton" style={{ width: w, height: h, borderRadius: 10, background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))' }} />;
}

// ─────────────────────────────────────────────────────────────────
export default function ReportBuilderPage() {
  const [entityKey, setEntityKey] = useState<string>(REPORT_ENTITIES[0].key);
  const entity = ENTITY_MAP[entityKey];

  const [selectedCols, setSelectedCols] = useState<string[]>(() => REPORT_ENTITIES[0].columns.slice(0, 6).map((c) => c.key));
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [groupBy, setGroupBy] = useState<string>('');
  const [sortField, setSortField] = useState<string>(REPORT_ENTITIES[0].defaultSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState<number>(100);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);

  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [reportName, setReportName] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Jobs for the Project filter (it picks a job; it never asks anyone to type an id).
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/projects/list')
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => setJobs(((d.projects || []) as { id: string; name?: string | null }[])
        .map((p) => ({ id: String(p.id), name: p.name || 'Untitled job' }))
        .sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => console.error('[reports/builder] jobs', e));
  }, []);

  // Reset column/sort selection whenever the entity changes.
  const applyEntityDefaults = useCallback((key: string) => {
    const e = ENTITY_MAP[key];
    setSelectedCols(e.columns.slice(0, 6).map((c) => c.key));
    setFilters([]);
    setGroupBy('');
    setSortField(e.defaultSort);
    setSortDir('desc');
    setResult(null);
    setError('');
  }, []);

  const onEntityChange = (key: string) => {
    setEntityKey(key);
    setLoadedId(null);
    setReportName('');
    applyEntityDefaults(key);
  };

  // ── Scheduled deliveries state ──
  const [schedules, setSchedules] = useState<ScheduledTemplate[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedSavingId, setSchedSavingId] = useState<string | null>(null);
  const [schedError, setSchedError] = useState('');
  const [recipientDrafts, setRecipientDrafts] = useState<Record<string, string>>({});

  const loadSchedules = useCallback(async () => {
    try {
      const r = await fetch('/api/reports');
      const j = await r.json();
      setSchedules(parseScheduledTemplates(j.reports));
    } catch {
      /* section shows its honest empty state */
    } finally {
      setSchedulesLoading(false);
    }
  }, []);
  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // Every mutation (cadence, recipients, cancel, re-enable) goes through the
  // existing PUT /api/reports/[id]/schedule and only lands in local state when
  // the server confirms it.
  const saveSchedule = useCallback(async (id: string, next: TemplateSchedule) => {
    setSchedSavingId(id);
    setSchedError('');
    try {
      const r = await fetch(`/api/reports/${id}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: next.enabled,
          frequency: next.frequency,
          recipients: next.recipients,
          ...(next.nextRun ? { nextRun: next.nextRun } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Schedule update failed');
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, schedule: next } : s)));
    } catch (e: unknown) {
      console.error(e);
      setSchedError(humanError(e, 'Schedule update failed. Please try again.'));
    } finally {
      setSchedSavingId(null);
    }
  }, []);

  const addRecipient = (tpl: ScheduledTemplate) => {
    const email = (recipientDrafts[tpl.id] || '').trim();
    if (!email) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setSchedError(`"${email}" doesn't look like an email address.`);
      return;
    }
    setRecipientDrafts((d) => ({ ...d, [tpl.id]: '' }));
    if (tpl.schedule.recipients.some((r) => r.toLowerCase() === email.toLowerCase())) return;
    saveSchedule(tpl.id, { ...tpl.schedule, recipients: [...tpl.schedule.recipients, email] });
  };

  // ── Load saved reports ──
  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch('/api/reports/saved');
      const j = await r.json();
      setSaved(Array.isArray(j.reports) ? j.reports : []);
    } catch {
      /* ignore */
    } finally {
      setSavedLoading(false);
    }
  }, []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  // ── Column toggling ──
  const toggleCol = (key: string) => {
    setSelectedCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  // ── Filters ──
  const addFilter = () => setFilters((f) => [...f, { field: entity.columns[0].key, op: 'eq', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterRow>) =>
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));

  // ── Run ──
  const currentConfig = useCallback((): ReportConfig => ({
    columns: selectedCols,
    filters,
    groupBy: groupBy || null,
    sort: { field: sortField, dir: sortDir },
    limit,
  }), [selectedCols, filters, groupBy, sortField, sortDir, limit]);

  const run = useCallback(async (saved?: { entity: string; config: ReportConfig }) => {
    const cfg = saved?.config ?? currentConfig();
    if (cfg.columns.length === 0) { setError('Pick at least one column.'); return; }
    setRunning(true);
    setError('');
    try {
      const r = await fetch('/api/reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: saved?.entity ?? entityKey,
          columns: cfg.columns,
          filters: (cfg.filters || []).filter((f) => f.field && f.op),
          groupBy: cfg.groupBy || null,
          sort: cfg.sort,
          limit: cfg.limit,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Report failed');
      setResult({ columns: j.columns, rows: j.rows, groupBy: j.groupBy, rowCount: j.rowCount });
    } catch (e: unknown) {
      console.error(e); setError(humanError(e, 'Report failed. Please try again.'));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [entityKey, currentConfig]);

  // ── Grouped rows for display ──
  const grouped = useMemo(() => {
    if (!result) return null;
    if (!result.groupBy) return [{ key: '', rows: result.rows }];
    const gb = result.groupBy;
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of result.rows) {
      const k = row[gb] === null || row[gb] === undefined || row[gb] === '' ? '(none)' : String(row[gb]);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, rows }));
  }, [result]);

  const currencyCols = useMemo(() => (result ? result.columns.filter((c) => c.type === 'currency') : []), [result]);

  // ── Downloads: server-built, tenant-branded PDF / Excel / CSV ──
  // All three formats run through /api/reports/export so every file carries the
  // tenant's letterhead (PDF), typed money columns, and a real totals row.
  const [exporting, setExporting] = useState<'' | 'csv' | 'xlsx' | 'pdf' | 'docx'>('');
  const exportAs = useCallback(async (format: 'csv' | 'xlsx' | 'pdf' | 'docx') => {
    if (!result || exporting) return;
    setExporting(format);
    setError('');
    try {
      const title = reportName || `${entity.label} Report`;
      const r = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          title,
          // 'bool' has no export peer — ship it as text.
          columns: result.columns.map((c) => ({ key: c.key, label: c.label, type: c.type === 'bool' ? 'text' : c.type })),
          // The file reads like the table: stored codes as words (owner_request → Owner request).
          rows: result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => {
            const t = result.columns.find((c) => c.key === k)?.type;
            return [k, typeof v === 'string' && (t === 'text' || t === 'badge') ? humanValue(v) : v];
          }))),
        }),
      });
      if (!r.ok) throw await apiErrorFrom(r, 'Export failed');
      const blob = await r.blob();
      const base = `${title.replace(/[^\w.-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
      downloadBlob(blob, `${base}.${format === 'xlsx' ? 'xlsx' : format}`);
    } catch (e: unknown) {
      console.error(e); setError(humanError(e, 'Export failed. Please try again.'));
    } finally {
      setExporting('');
    }
  }, [result, exporting, reportName, entity.label]);

  // ── Save / Load / Delete ──
  const saveReport = async () => {
    const name = reportName.trim();
    if (!name) { setError('Enter a report name to save.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { name, entity: entityKey, config: currentConfig() };
      const url = loadedId ? `/api/reports/saved/${loadedId}` : '/api/reports/saved';
      const method = loadedId ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      if (j.report?.id) setLoadedId(j.report.id);
      await loadSaved();
    } catch (e: unknown) {
      console.error(e); setError(humanError(e, 'Save failed. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const loadReport = (rep: SavedReport) => {
    if (!ENTITY_MAP[rep.entity]) return;
    const cfg = rep.config || ({} as ReportConfig);
    setEntityKey(rep.entity);
    const e = ENTITY_MAP[rep.entity];
    const validCols = (cfg.columns || []).filter((k) => e.columns.some((c) => c.key === k));
    setSelectedCols(validCols.length ? validCols : e.columns.slice(0, 6).map((c) => c.key));
    setFilters(Array.isArray(cfg.filters) ? cfg.filters : []);
    setGroupBy(cfg.groupBy || '');
    setSortField(cfg.sort?.field && e.columns.some((c) => c.key === cfg.sort.field) ? cfg.sort.field : e.defaultSort);
    setSortDir(cfg.sort?.dir === 'asc' ? 'asc' : 'desc');
    setLimit(typeof cfg.limit === 'number' ? cfg.limit : 100);
    setReportName(rep.name);
    setLoadedId(rep.id);
    setError('');
    // Opening a saved report shows its results — no second click on Run.
    void run({
      entity: rep.entity,
      config: {
        columns: validCols.length ? validCols : e.columns.slice(0, 6).map((c) => c.key),
        filters: Array.isArray(cfg.filters) ? cfg.filters : [],
        groupBy: cfg.groupBy || null,
        sort: { field: cfg.sort?.field && e.columns.some((c) => c.key === cfg.sort.field) ? cfg.sort.field : e.defaultSort, dir: cfg.sort?.dir === 'asc' ? 'asc' : 'desc' },
        limit: typeof cfg.limit === 'number' ? cfg.limit : 100,
      },
    });
  };

  const deleteReport = async (id: string) => {
    try {
      const r = await fetch(`/api/reports/saved/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Delete failed');
      if (loadedId === id) { setLoadedId(null); setReportName(''); }
      await loadSaved();
    } catch (e: unknown) {
      setError(humanError(e, "Couldn't delete that report. Please try again."));
    }
  };

  return (
    <PremiumSurface>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .rb-noprint { display: none !important; }
          .rb-print-area, .rb-print-area * { color: #000 !important; }
          .rb-print-area { box-shadow: none !important; background: #fff !important; }
          .rb-print-area table { border-collapse: collapse; width: 100%; }
          .rb-print-area th, .rb-print-area td { border: 1px solid #999 !important; padding: 6px 8px !important; font-size: 12px; }
        }
      `}</style>

      <div className="rb-noprint">
        <ModuleHero
          eyebrow="Analytics"
          eyebrowIcon={<ChartBar size={13} weight="fill" color="var(--text-secondary)" />}
          title="Custom Report"
          accent="Builder"
          subtitle="Build a report over live project data, then run or export."
          actions={
            <a href="/app/reports" style={ghostButtonStyle} className="pmBtn">
              <ChartBar size={15} weight="bold" /> Report Library
            </a>
          }
        />

        {/* Live figures — every number on this strip is real page state. */}
        <StatStrip items={[
          {href: '/app/reports/builder', label: 'Data Sources', value: String(REPORT_ENTITIES.length), sub: 'Live entities to report over' },
          {href: '/app/reports/builder', label: 'Columns', value: `${selectedCols.length}/${entity.columns.length}`, sub: `Selected on ${entity.label}` },
          {href: '/app/reports/builder', label: 'Filters', value: String(filters.length), sub: filters.length ? 'Narrowing this run' : 'All rows for your tenant' },
          {href: '/app/reports/builder', label: 'Saved Reports', value: savedLoading ? '…' : String(saved.length), sub: savedLoading ? 'Loading' : saved.length ? 'Reusable configurations' : 'Nothing saved yet' },
          {href: '/app/reports/builder', label: 'Last Run', value: result ? String(result.rowCount) : '—', accent: result ? GOLD_HI : undefined, sub: result ? `Row${result.rowCount === 1 ? '' : 's'} returned` : 'Not run yet' },
          {href: '/app/reports/builder', label: 'Email Schedules', value: schedulesLoading ? '…' : String(schedules.filter((s) => s.schedule.enabled).length), sub: schedulesLoading ? 'Loading' : 'Recurring deliveries' },
        ]} />
      </div>

      {error && (
        <div className="rb-noprint" style={{ padding: '12px 16px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Left: builder controls ── */}
        <div className="rb-noprint" style={{ flex: '1 1 380px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Source + options */}
          <SectionCard
            title="1 · Source"
            subtitle="Which records, in what order"
            icon={<Table size={16} weight="duotone" color="var(--text-secondary)" />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Entity</label>
                <Sel value={entityKey} onChange={onEntityChange} style={{ width: '100%' }}>
                  {REPORT_ENTITIES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                </Sel>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={labelStyle}>Sort By</label>
                  <Sel value={sortField} onChange={setSortField} style={{ width: '100%' }}>
                    {entity.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Sel>
                </div>
                <div style={{ width: 110 }}>
                  <label style={labelStyle}>Direction</label>
                  <Sel value={sortDir} onChange={(v) => setSortDir(v as 'asc' | 'desc')} style={{ width: '100%' }}>
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </Sel>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={labelStyle}>Group By</label>
                  <Sel value={groupBy} onChange={setGroupBy} style={{ width: '100%' }}>
                    <option value="">(None)</option>
                    {entity.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Sel>
                </div>
                <div style={{ width: 110 }}>
                  <label style={labelStyle}>Row Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Columns */}
          <SectionCard
            title="2 · Columns"
            subtitle={`${selectedCols.length} of ${entity.columns.length} selected`}
            icon={<Columns size={16} weight="duotone" color="var(--text-secondary)" />}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {entity.columns.map((c) => {
                const on = selectedCols.includes(c.key);
                return (
                  <label
                    key={c.key}
                    className="pmTile"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: '7px 10px', borderRadius: 8,
                      border: `1px solid ${on ? 'var(--brand-primary-35)' : BORDER}`,
                      background: on ? 'var(--brand-primary-12)' : 'transparent',
                      fontSize: 13, color: WHITE,
                    }}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleCol(c.key)} style={{ accentColor: GOLD as string }} />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </SectionCard>

          {/* Filters */}
          <SectionCard
            title="3 · Filters"
            subtitle={filters.length ? `${filters.length} active` : 'optional'}
            icon={<Funnel size={16} weight="duotone" color="var(--text-secondary)" />}
            action={
              <button onClick={addFilter} style={{ ...ghostButtonStyle, padding: '7px 12px', fontSize: 12 }} className="pmBtn">
                <Plus size={13} weight="bold" /> Add filter
              </button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filters.length === 0 && <div style={{ fontSize: 13, color: FAINT }}>No filters — all rows for your tenant.</div>}
              {filters.map((f, i) => {
                const noVal = NO_VALUE_OPS.has(f.op);
                return (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Sel value={f.field} onChange={(v) => updateFilter(i, v === PROJECT_COLUMN ? { field: v, op: 'eq', value: '' } : { field: v })} style={{ flex: '1 1 120px', minWidth: 110 }}>
                      {entity.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </Sel>
                    <Sel value={f.op} onChange={(v) => updateFilter(i, { op: v })} style={{ flex: '0 1 140px' }}>
                      {FILTER_OPS.filter((o) => f.field !== PROJECT_COLUMN || PROJECT_FILTER_OPS.has(o.op)).map((o) => <option key={o.op} value={o.op}>{f.field === PROJECT_COLUMN && o.op === 'eq' ? '= is' : f.field === PROJECT_COLUMN && o.op === 'neq' ? '≠ is not' : o.label}</option>)}
                    </Sel>
                    {!noVal && f.field === PROJECT_COLUMN && (
                      <Sel value={f.value} onChange={(v) => updateFilter(i, { value: v })} style={{ flex: '1 1 160px', minWidth: 140 }}>
                        <option value="">Pick a job</option>
                        {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                      </Sel>
                    )}
                    {!noVal && f.field !== PROJECT_COLUMN && (
                      <input
                        value={f.value}
                        onChange={(e) => updateFilter(i, { value: e.target.value })}
                        placeholder="value"
                        style={{ ...inputStyle, flex: '1 1 100px', minWidth: 80 }}
                      />
                    )}
                    <button
                      onClick={() => removeFilter(i)}
                      title="Remove"
                      className="pmBtn"
                      style={{ background: 'rgba(248,113,113,0.12)', color: RED, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, width: 30, height: 32, cursor: 'pointer', fontSize: 15, flexShrink: 0 }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Run */}
          <button onClick={() => void run()} disabled={running} className="pmBtn" style={{ ...goldButtonStyle, width: '100%', cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1 }}>
            <Play size={15} weight="fill" /> {running ? 'Running…' : 'Run Report'}
          </button>

          {/* Save / Load */}
          <SectionCard
            title="Saved Reports"
            subtitle="Reusable configurations, shared with your team"
            icon={<FloppyDisk size={16} weight="duotone" color="var(--text-secondary)" />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="Report name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={saveReport} disabled={saving} className="pmBtn" style={{ ...secondaryButtonStyle, padding: '9px 14px', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : loadedId ? 'Update' : 'Save'}
                </button>
              </div>
              {loadedId && <div style={{ fontSize: 12, color: FAINT }}>Editing a saved report — Update overwrites it.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedLoading && (
                  <>
                    <SkeletonBar h={46} />
                    <SkeletonBar h={46} />
                  </>
                )}
                {!savedLoading && saved.length === 0 && (
                  <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.5 }}>
                    Nothing saved yet. Configure a report above, name it, and Save — it lands here for one-click reruns.
                  </div>
                )}
                {saved.map((rep) => (
                  <div
                    key={rep.id}
                    className="pmTile"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
                      border: `1px solid ${loadedId === rep.id ? 'var(--brand-primary-35)' : BORDER}`,
                      background: loadedId === rep.id ? 'var(--brand-primary-12)' : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rep.name}</div>
                      <div style={{ fontSize: 12, color: FAINT }}>{ENTITY_MAP[rep.entity]?.label || rep.entity}</div>
                    </div>
                    <button onClick={() => loadReport(rep)} className="pmBtn" style={{ ...ghostButtonStyle, padding: '6px 12px', fontSize: 12 }}>Load</button>
                    <button
                      onClick={() => deleteReport(rep.id)}
                      title="Delete"
                      className="pmBtn"
                      style={{ background: 'transparent', color: FAINT, border: `1px solid ${BORDER}`, borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    ><Trash size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right: results ── */}
        <div style={{ flex: '2 1 560px', minWidth: 340 }}>
          <SectionCard
            flush
            title={reportName || `${entity.label} Report`}
            subtitle={result ? `${result.rowCount} row${result.rowCount === 1 ? '' : 's'} · live tenant data` : 'Results land here'}
            icon={<ChartBar size={16} weight="duotone" color="var(--text-secondary)" />}
            action={
              <div className="rb-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <FileButton icon={<PdfIcon size={16} />} label={exporting === 'pdf' ? 'Building…' : 'PDF'} onClick={() => exportAs('pdf')} disabled={!result || result.rowCount === 0 || !!exporting} title="Branded corporate PDF — letterhead, KPI band, totals" />
                <FileButton icon={<XlsIcon size={16} />} label={exporting === 'xlsx' ? 'Building…' : 'Excel'} onClick={() => exportAs('xlsx')} disabled={!result || result.rowCount === 0 || !!exporting} title="Excel workbook (.xlsx) with typed money columns and totals" />
                <FileButton icon={<DocIcon size={16} />} label={exporting === 'docx' ? 'Building…' : 'Word'} onClick={() => exportAs('docx')} disabled={!result || result.rowCount === 0 || !!exporting} title="Word document (.docx) with a real table you can restyle" />
                <FileButton icon={<CsvIcon size={16} />} label={exporting === 'csv' ? 'Building…' : 'CSV'} onClick={() => exportAs('csv')} disabled={!result || result.rowCount === 0 || !!exporting} title="Plain CSV (.csv) for any spreadsheet tool" />
                <button onClick={() => window.print()} disabled={!result} className="pmBtn" style={{ ...ghostButtonStyle, padding: '7px 12px', fontSize: 12, opacity: result ? 1 : 0.5, cursor: result ? 'pointer' : 'not-allowed' }}>
                  <Printer size={14} /> Print
                </button>
              </div>
            }
          >
            <div className="rb-print-area" style={{ overflowX: 'auto', maxHeight: 640, overflowY: 'auto' }}>
              {running && (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SkeletonBar h={30} />
                  <SkeletonBar h={22} />
                  <SkeletonBar h={22} />
                  <SkeletonBar h={22} />
                  <SkeletonBar h={22} />
                  <SkeletonBar h={22} />
                </div>
              )}
              {!running && !result && (
                <div style={{ padding: '52px 24px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', marginBottom: 16 }}>
                    <IconChip size={56}><ChartBar size={26} weight="duotone" color="var(--text-secondary)" /></IconChip>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: WHITE, marginBottom: 6 }}>No report run yet</div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, maxWidth: 380, margin: '0 auto' }}>
                    Configure your report on the left, then press <strong style={{ color: WHITE }}>Run Report</strong>. Results come straight from your live project data.
                  </div>
                </div>
              )}
              {!running && result && (
                <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c.key} style={{
                          padding: '10px 14px', textAlign: c.type === 'currency' || c.type === 'number' || c.type === 'percent' ? 'right' : 'left',
                          color: MUTED, fontWeight: 700, fontSize: 12,
                          borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
                          background: 'var(--bg-surface-2)',
                        }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(grouped || []).map((g) => (
                      <React.Fragment key={g.key || '_all'}>
                        {result.groupBy && (
                          <tr>
                            <td colSpan={result.columns.length} style={{ padding: '8px 14px', background: 'var(--bg-surface-2)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', borderBottom: `1px solid ${BORDER}` }}>
                              {ENTITY_MAP[entityKey]?.columns.find((c) => c.key === result.groupBy)?.label || result.groupBy}: {g.key} · {g.rows.length}
                            </td>
                          </tr>
                        )}
                        {g.rows.map((row, ri) => (
                          <tr key={(row.id as string) || ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {result.columns.map((c) => (
                              <td key={c.key} style={{
                                padding: '9px 14px', color: WHITE, verticalAlign: 'middle',
                                // Words wrap (titles, job names) so the money columns stay on screen.
                                ...(c.type === 'text' ? { whiteSpace: 'normal', minWidth: 120, height: 'auto', lineHeight: 1.35 } : {}),
                                textAlign: c.type === 'currency' || c.type === 'number' || c.type === 'percent' ? 'right' : 'left',
                                fontVariantNumeric: c.type === 'currency' || c.type === 'number' ? 'tabular-nums' : undefined,
                              }}>
                                {c.type === 'badge' && row[c.key]
                                  ? <Pill tone={badgeToneFor(String(row[c.key]))}>{humanValue(String(row[c.key]))}</Pill>
                                  : fmtCell(row[c.key], c.type)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {result.groupBy && currencyCols.length > 0 && (
                          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                            {result.columns.map((c, ci) => {
                              if (ci === 0) return <td key={c.key} style={{ padding: '8px 14px', color: FAINT, fontSize: 12, fontWeight: 700 }}>Subtotal</td>;
                              if (c.type === 'currency') {
                                const sum = g.rows.reduce((acc, r) => acc + (Number(r[c.key]) || 0), 0);
                                return <td key={c.key} style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCell(sum, 'currency')}</td>;
                              }
                              return <td key={c.key} />;
                            })}
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {result.rowCount === 0 && (
                      <tr><td colSpan={result.columns.length} style={{ padding: '40px 14px', textAlign: 'center', color: FAINT }}>No rows match this configuration. Loosen a filter and run again.</td></tr>
                    )}
                  </tbody>
                  {currencyCols.length > 0 && result.rowCount > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${BORDER}` }}>
                        {result.columns.map((c, ci) => {
                          if (ci === 0) return <td key={c.key} style={{ padding: '10px 14px', color: WHITE, fontWeight: 700 }}>Total</td>;
                          if (c.type === 'currency') {
                            const sum = result.rows.reduce((acc, r) => acc + (Number(r[c.key]) || 0), 0);
                            return <td key={c.key} style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtCell(sum, 'currency')}</td>;
                          }
                          return <td key={c.key} />;
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Scheduled deliveries — email schedules living on report templates.
             Old scheduled-report emails deep-link here via #schedules. ── */}
      <div className="rb-noprint" id="schedules" style={{ marginTop: 20 }}>
        <SectionCard
          title="Scheduled Deliveries"
          subtitle="Scheduled reports, emailed with the full CSV attached."
          icon={<Clock size={16} weight="duotone" color="var(--text-secondary)" />}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {schedError && (
              <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 10, color: RED, fontSize: 13 }}>
                {schedError}
              </div>
            )}

            {schedulesLoading && (
              <>
                <SkeletonBar h={72} />
                <SkeletonBar h={72} />
              </>
            )}

            {!schedulesLoading && schedules.length === 0 && (
              <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.55 }}>
                No recurring email deliveries are set up for your team. Active schedules appear here so you can adjust their cadence and recipients, or cancel them.
              </div>
            )}

            {schedules.map((tpl) => {
              const s = tpl.schedule;
              const savingThis = schedSavingId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className="pmTile"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 12,
                    border: `1px solid ${s.enabled ? 'var(--brand-primary-35)' : BORDER}`,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160, fontSize: 14, fontWeight: 700, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name}</div>
                    {savingThis && <span style={{ fontSize: 12, color: FAINT }}>Saving…</span>}
                    <Pill tone={s.enabled ? 'green' : 'neutral'}>{s.enabled ? 'Active' : 'Canceled'}</Pill>
                  </div>

                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: FAINT }}>
                    {s.enabled && <span>Next run: <span style={{ color: MUTED }}>{fmtWhen(s.nextRun)}</span></span>}
                    {s.lastRunAt && <span>Last ran {fmtWhen(s.lastRunAt)}{s.lastStatus ? ` · ${s.lastStatus}` : ''}</span>}
                  </div>

                  {s.enabled ? (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label style={labelStyle}>Cadence</label>
                        <Sel value={s.frequency} onChange={(v) => saveSchedule(tpl.id, { ...s, frequency: v as ScheduleFrequency })} style={{ width: 150 }}>
                          {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </Sel>
                      </div>
                      <div style={{ flex: '1 1 280px', minWidth: 240 }}>
                        <label style={labelStyle}>Recipients</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          {s.recipients.map((r) => (
                            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, color: WHITE, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.05)' }}>
                              {r}
                              <button
                                onClick={() => saveSchedule(tpl.id, { ...s, recipients: s.recipients.filter((x) => x !== r) })}
                                disabled={savingThis}
                                title={`Remove ${r}`}
                                style={{ background: 'transparent', border: 'none', color: FAINT, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
                              >×</button>
                            </span>
                          ))}
                          {s.recipients.length === 0 && (
                            <span style={{ fontSize: 12, color: FAINT }}>No recipients — runs are skipped until you add one.</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={recipientDrafts[tpl.id] || ''}
                            onChange={(e) => setRecipientDrafts((d) => ({ ...d, [tpl.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') addRecipient(tpl); }}
                            placeholder="name@company.com"
                            type="email"
                            style={{ ...inputStyle, flex: 1, minWidth: 170 }}
                          />
                          <button onClick={() => addRecipient(tpl)} disabled={savingThis} className="pmBtn" style={{ ...ghostButtonStyle, padding: '8px 13px', fontSize: 12 }}>
                            <Plus size={13} weight="bold" /> Add
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => saveSchedule(tpl.id, { ...s, enabled: false })}
                        disabled={savingThis}
                        className="pmBtn"
                        style={{ background: 'rgba(248,113,113,0.12)', color: RED, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: savingThis ? 'not-allowed' : 'pointer' }}
                      >
                        Cancel schedule
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: MUTED }}>Canceled — no more emails will be sent. Re-enable to resume with the same cadence and recipients.</span>
                      <button onClick={() => saveSchedule(tpl.id, { ...s, enabled: true })} disabled={savingThis} className="pmBtn" style={{ ...secondaryButtonStyle, padding: '8px 14px', fontSize: 12 }}>
                        Re-enable
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </PremiumSurface>
  );
}
