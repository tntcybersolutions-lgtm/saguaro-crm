'use client';
/**
 * Daily Log Detail — Pass 4, on the RFIs reference layout (record + rail).
 *
 * Renders a single field daily log (date, weather, temps, crew, work performed,
 * delays, safety notes, materials, visitors, notes, photos) and edits it in
 * place: every section carries a uniform ghost edit affordance that flips the
 * Card into an inline editor (Save = optimistic write + rollback toast), empty
 * sections get an add-composer, and the report info (superintendent, phase,
 * crew) edits through the rail. Weather stays auto-stamped.
 *
 * API surface (unchanged):
 *   GET /api/daily-logs/[id] -> { log }
 *   PUT /api/daily-logs/[id] -> { success } (allowlist includes the text
 *     columns edited here AND the structured jsonb columns — manpower_by_trade,
 *     equipment_on_site, etc. — so partial PUTs never drop mobile data.)
 *   GET /api/projects?limit=200 -> project name for the crumb / subtitle
 *
 * Note: the daily_logs table stores temperatures as high_temp / low_temp; this
 * page reads those columns (the GET route returns raw rows). Photos are rendered
 * defensively only when the row carries a photos/photo_urls array.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Warning, ClipboardText, UsersThree,
  HourglassMedium, ShieldCheck, Package, UserCircle, NotePencil, ImageSquare,
  HardHat, Wrench, Info, PencilSimple, Plus, Check, CalendarBlank, ArrowClockwise,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, EmptyState, Field, Input, Textarea, FormGrid, DetailList, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { ModuleSkeleton } from '@/components/ui/PageSkeleton';
import RelatedItems from '@/components/related/RelatedItems';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { layout } from '@/lib/design-tokens';

interface DailyLog {
  id: string;
  project_id: string | null;
  log_date: string | null;
  weather: string | null;
  high_temp: number | null;
  low_temp: number | null;
  crew_count: number | null;
  work_performed: string | null;
  delays: string | null;
  safety_notes: string | null;
  materials_delivered: string | null;
  visitors: string | null;
  notes: string | null;
  // Mobile-app text columns (app/daily.tsx) — surfaced here so a log created on
  // the native app renders fully on web instead of showing partial data.
  superintendent: string | null;
  precipitation: string | null;
  wind_conditions: string | null;
  phase_of_work: string | null;
  equipment: string | null;
  status?: string | null;
  manpower_by_trade?: { trade: string; count: number }[] | null;
  subcontractors_on_site?: string[] | null;
  equipment_on_site?: string[] | null;
  photos?: string[] | null;
  photo_urls?: string[] | null;
  created_at: string | null;
}

interface Project { id: string; name: string; }

/** Section editor keys — one per editable surface on the page. */
type EditKey =
  | 'work' | 'equipment' | 'delays' | 'safety' | 'materials' | 'notes'
  | 'meta' | 'header';

/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
function dateStr(v: string | null | undefined): string {
  if (!v) return '—';
  const d = v.length <= 10 ? new Date(v + 'T12:00:00') : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function shortDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = v.length <= 10 ? new Date(v + 'T12:00:00') : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function tempStr(high: number | null | undefined, low: number | null | undefined): string {
  if (high == null && low == null) return '—';
  return `${high ?? '—'}° / ${low ?? '—'}°`;
}

/** One status → one badge. Draft stays neutral; Submitted / Approved carry the
 *  Ongoing hue from lib/status-colors. */
function logStatus(l: DailyLog): { label: string; tone: BadgeTone } {
  const s = String(l.status || 'draft').toLowerCase();
  if (s === 'submitted') return { label: 'Submitted', tone: 'ongoing' };
  if (s === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (s === 'draft') return { label: 'Draft', tone: 'neutral' };
  return { label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), tone: 'neutral' };
}

const CSS = `
.dldWs > .k-page { max-width: none; }
.dldCq { container: dlddetail / inline-size; min-width: 0; }
.dldDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.dldDetail > * { min-width: 0; }
.dldMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.dldRail { order: -1; }
.dldRelated { padding: 16px 4px 0; }
@container dlddetail (min-width: 860px) {
  .dldDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 30%, ${layout.detailRailMax}px); }
  .dldRail { order: 0; position: sticky; top: 16px; }
}
.dldSection { display: flex; flex-direction: column; gap: 8px; }
.dldSection + .dldSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.dldProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; margin: 0; }
.dldProse[data-tone="warn"] { color: var(--text-primary); }
.dldMuted { color: var(--text-tertiary); font-size: var(--fs-sm); }
.dldMuted[data-tone="good"] { color: var(--status-ongoing); }
.dldEmptyRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dldFoot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dldFoot .dldFootRight { margin-left: auto; }
.dldPair { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.dldLabel { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin-bottom: 5px; }
.dldValue { font-size: var(--fs-md); color: var(--text-primary); overflow-wrap: anywhere; line-height: 1.55; white-space: pre-wrap; }
.dldChips { display: flex; flex-wrap: wrap; gap: 6px; }
.dldChip { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border-radius: 999px; font-size: var(--fs-sm); font-weight: 600; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-default); }
.dldChip b { color: var(--text-primary); font-weight: 800; }
.dldPhotos { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.dldPhotos img { width: 100%; aspect-ratio: 4 / 3; height: auto; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: block; background: var(--bg-solid); }
.dldActions { display: flex; flex-direction: column; gap: 8px; }
.dldActions .k-btn { width: 100%; justify-content: flex-start; }
.dldBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dldNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.dldInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); padding: 10px 14px; border: 1px solid rgba(248,113,113,.35); border-radius: var(--radius-sm); background: rgba(248,113,113,.08); }
.dldComposer { display: flex; gap: 8px; flex-wrap: wrap; }
.dldDateInput { max-width: 340px; }
@media (max-width: 640px) {
  .dldWs .k-btn, .dldWs .k-stat, .dldWs .k-input { min-height: 44px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function DailyLogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params['id'] as string;

  const [log, setLog] = useState<DailyLog | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // ── Inline editing state ─────────────────────────────────────────────────
  const [editKey, setEditKey] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast, show: showToast } = useToast(4000);

  const openEditor = (key: EditKey, seed: Record<string, string>) => {
    setEditKey(key);
    setDraft(seed);
  };
  const closeEditor = () => { setEditKey(null); setDraft({}); };

  /**
   * Optimistic PUT: apply `fields` to local state immediately, persist, and on
   * failure roll back to the exact prior row + surface an error toast. On
   * success a silent background GET reconciles server truth (kept best-effort —
   * the optimistic row stands if it fails).
   */
  const saveFields = useCallback(async (fields: Partial<DailyLog>, doneMsg = 'Log updated'): Promise<boolean> => {
    if (!log) return false;
    const prev = log;
    setSaving(true);
    setLog({ ...log, ...fields });
    try {
      const res = await fetch(`/api/daily-logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast(doneMsg);
      fetch(`/api/daily-logs/${id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d?.log) setLog(d.log); })
        .catch(() => {});
      return true;
    } catch (e: any) {
      console.error(e);
      setLog(prev); // rollback — the page shows exactly what the server holds
      showToast(humanError(e, 'Save failed — your change was rolled back.'), 'bad');
      return false;
    } finally {
      setSaving(false);
    }
  }, [log, id, showToast]);

  const loadLog = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await fetch(`/api/daily-logs/${id}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error('Failed to load daily log');
      const data = await res.json();
      const row: DailyLog = data.log ?? data;
      setLog(row);
      if (row?.project_id) {
        fetch(`/api/projects?limit=200`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d) return;
            const list: Project[] = Array.isArray(d) ? d : d.projects ?? [];
            const match = list.find(p => p.id === row.project_id);
            if (match) setProjectName(match.name);
          })
          .catch(() => {});
      }
    } catch (e: any) {
      console.error(e); setError(humanError(e, 'Failed to load the daily log. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadLog(); }, [loadLog]);

  // ── Shared bits ──────────────────────────────────────────────────────────
  const backBtn = (
    <Button icon={<ArrowLeft size={14} />} onClick={() => router.push('/app/daily-logs')}>Daily Logs</Button>
  );
  const crumbs = [
    { label: 'Daily Logs', href: '/app/daily-logs' },
    ...(log?.project_id ? [{ label: projectName || 'Project', href: `/app/projects/${log.project_id}/daily-logs` }] : []),
    { label: log?.log_date ? shortDate(log.log_date) : 'Daily Log' },
  ];

  // ── Loading / Not found / Error ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="dldWs">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <PageShell crumbs={[{ label: 'Daily Logs', href: '/app/daily-logs' }, { label: 'Loading…' }]} title="Daily Log" subtitle="Loading the field record…">
          <Card flush><div style={{ padding: 16 }}><ModuleSkeleton hero={false} kpis={4} rows={6} /></div></Card>
        </PageShell>
      </div>
    );
  }

  if (notFound || (!log && !error)) {
    return (
      <div className="dldWs">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <PageShell crumbs={[{ label: 'Daily Logs', href: '/app/daily-logs' }, { label: 'Not Found' }]} title="Daily Log">
          <Card flush>
            <EmptyState
              icon={<ClipboardText size={22} />}
              title="Daily log not found"
              text="This log may have been deleted, or the link is stale."
              action={backBtn}
            />
          </Card>
        </PageShell>
      </div>
    );
  }

  if (error && !log) {
    return (
      <div className="dldWs">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <PageShell crumbs={[{ label: 'Daily Logs', href: '/app/daily-logs' }, { label: 'Error' }]} title="Daily Log">
          <Card flush>
            <EmptyState
              icon={<Warning size={22} />}
              title="Couldn't load the daily log"
              text={`${error} Nothing has been lost — try again.`}
              action={<div className="dldComposer"><Button icon={<ArrowClockwise size={15} />} onClick={loadLog}>Retry</Button>{backBtn}</div>}
            />
          </Card>
        </PageShell>
      </div>
    );
  }

  const l = log as DailyLog;
  const photos = (l.photos ?? l.photo_urls ?? []).filter(Boolean);
  const status = logStatus(l);

  const conditions: StatItem[] = [
    { label: 'Crew on Site', value: l.crew_count != null ? String(l.crew_count) : '0', sub: l.superintendent ? `Super: ${l.superintendent}` : 'No superintendent recorded' },
    { label: 'Weather', value: l.weather || '—', sub: l.precipitation ? `Precipitation ${l.precipitation}` : 'Auto-stamped from NWS' },
    { label: 'High / Low', value: tempStr(l.high_temp, l.low_temp), sub: l.wind_conditions ? `Wind ${l.wind_conditions}` : 'As recorded' },
    { label: 'Phase of Work', value: l.phase_of_work || '—', sub: l.equipment ? 'Equipment notes recorded' : 'Set in report info' },
  ];

  // ── Editor plumbing ──────────────────────────────────────────────────────
  const editBtn = (key: EditKey, seed: Record<string, string>, label: string) => (
    <Button
      variant="ghost"
      size="sm"
      icon={<PencilSimple size={14} />}
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
      onClick={() => openEditor(key, seed)}
    />
  );

  /** Save/Cancel (+ optional Clear-with-confirm) footer, one shape everywhere. */
  const editorFooter = (onSave: () => void, onClear?: () => void) => (
    <div className="dldFoot" style={{ marginTop: 12 }}>
      <Button variant="primary" icon={<Check size={14} weight="bold" />} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="ghost" onClick={closeEditor} disabled={saving}>Cancel</Button>
      {onClear && (
        <Button variant="danger" className="dldFootRight" onClick={onClear} disabled={saving}>Clear</Button>
      )}
    </div>
  );

  /** Single-textarea section: view / add-composer / inline editor. */
  const textSection = (opts: {
    k: EditKey; title: string; icon: React.ReactNode; field: keyof DailyLog & string;
    emptyText: string; emptyTone?: 'good'; addLabel: string; contentTone?: 'warn';
    placeholder: string;
  }) => {
    const value = (l[opts.field] as string | null) || '';
    const isEditing = editKey === opts.k;
    return (
      <Card
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{opts.icon}{opts.title}</span>}
        actions={!isEditing ? editBtn(opts.k, { v: value }, opts.title) : undefined}
      >
        {isEditing ? (
          <div>
            <Textarea
              autoFocus
              aria-label={opts.title}
              value={draft.v ?? ''}
              onChange={e => setDraft(d => ({ ...d, v: e.target.value }))}
              placeholder={opts.placeholder}
              rows={5}
            />
            {editorFooter(
              async () => {
                const ok = await saveFields({ [opts.field]: (draft.v ?? '').trim() || null } as Partial<DailyLog>);
                if (ok) closeEditor();
              },
              value
                ? async () => {
                    if (!(await confirmDialog({ title: 'Clear entry?', message: `This removes the recorded ${opts.title}.`, confirmLabel: 'Clear', danger: true }))) return;
                    const ok = await saveFields({ [opts.field]: null } as Partial<DailyLog>, `${opts.title} cleared`);
                    if (ok) closeEditor();
                  }
                : undefined,
            )}
          </div>
        ) : value ? (
          <p className="dldProse" data-tone={opts.contentTone}>{value}</p>
        ) : (
          <div className="dldEmptyRow">
            <p className="dldMuted" data-tone={opts.emptyTone} style={{ margin: 0 }}>{opts.emptyText}</p>
            <Button size="sm" icon={<Plus size={13} weight="bold" />} onClick={() => openEditor(opts.k, { v: '' })}>
              {opts.addLabel}
            </Button>
          </div>
        )}
      </Card>
    );
  };

  // Hidden-when-empty sections (equipment, notes) surface through a composer
  // strip instead of rendering empty cards.
  const composerTargets: { k: EditKey; label: string; icon: React.ReactNode }[] = [];
  if (!l.equipment && editKey !== 'equipment') composerTargets.push({ k: 'equipment', label: 'Add Equipment on Site', icon: <Wrench size={13} /> });
  if (!l.notes && editKey !== 'notes') composerTargets.push({ k: 'notes', label: 'Add General Notes', icon: <NotePencil size={13} /> });

  const manpower = Array.isArray(l.manpower_by_trade) ? l.manpower_by_trade : [];
  const subsOnSite = Array.isArray(l.subcontractors_on_site) ? l.subcontractors_on_site : [];
  const equipOnSite = Array.isArray(l.equipment_on_site) ? l.equipment_on_site : [];

  return (
    <div className="dldWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={crumbs}
        title={dateStr(l.log_date)}
        badge={<span className="dldBadges"><Badge tone={status.tone} dot>{status.label}</Badge>{!!(l.delays || '').trim() && <Badge tone="overdue">Delays</Badge>}{!!(l.safety_notes || '').trim() && <Badge tone="neutral">Safety Note</Badge>}</span>}
        subtitle={projectName ? `${projectName} — daily field report.` : 'Daily field report.'}
        actions={
          <Button
            variant="primary"
            icon={<PencilSimple size={15} />}
            onClick={() => openEditor('header', {
              superintendent: l.superintendent || '',
              phase: l.phase_of_work || '',
              crew: l.crew_count != null ? String(l.crew_count) : '',
            })}
            disabled={editKey === 'header'}
          >
            Edit Report Info
          </Button>
        }
      >
        {error && (
          <div className="dldInlineErr" role="alert">
            <Warning size={15} /> {error}
            <Button size="sm" variant="ghost" onClick={() => setError('')}>Dismiss</Button>
          </div>
        )}

        {/* Conditions band */}
        <StatRow items={conditions} />

        <div className="dldCq">
          <div className="dldDetail">
            <div className="dldMain">
              {/* Report info editor — superintendent / phase / crew. Weather is
                  auto-stamped at creation and intentionally not editable here. */}
              {editKey === 'header' && (
                <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><HardHat size={16} />Edit Report Info</span>} subtitle="Superintendent, phase of work and crew count">
                  <FormGrid cols={3}>
                    <Field label="Superintendent">
                      <Input autoFocus value={draft.superintendent ?? ''} onChange={e => setDraft(d => ({ ...d, superintendent: e.target.value }))} placeholder="Who ran the site" />
                    </Field>
                    <Field label="Phase of Work">
                      <Input value={draft.phase ?? ''} onChange={e => setDraft(d => ({ ...d, phase: e.target.value }))} placeholder="e.g. Rough-in, Trim" />
                    </Field>
                    <Field label="Crew on Site">
                      <Input inputMode="numeric" value={draft.crew ?? ''} onChange={e => setDraft(d => ({ ...d, crew: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="0" />
                    </Field>
                  </FormGrid>
                  <div className="dldMuted" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
                    <Info size={13} />
                    Weather, temps, precipitation and wind were auto-stamped when this log was created — they stay as recorded.
                  </div>
                  {editorFooter(async () => {
                    const ok = await saveFields({
                      superintendent: (draft.superintendent ?? '').trim() || null,
                      phase_of_work: (draft.phase ?? '').trim() || null,
                      crew_count: Number(draft.crew) || 0,
                    }, 'Report info updated');
                    if (ok) closeEditor();
                  })}
                </Card>
              )}

              {/* Structured sections from the field app — read-only here, edited on the project page composer. */}
              {(manpower.length > 0 || subsOnSite.length > 0 || equipOnSite.length > 0) && (
                <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><UsersThree size={16} />On Site</span>}>
                  {manpower.length > 0 && (
                    <div className="dldSection">
                      <div className="dldLabel">Manpower by Trade</div>
                      <div className="dldChips">{manpower.map((m, i) => <span key={i} className="dldChip">{m.trade}<b>{Number(m.count) || 0}</b></span>)}</div>
                    </div>
                  )}
                  {subsOnSite.length > 0 && (
                    <div className="dldSection">
                      <div className="dldLabel">Subcontractors On Site</div>
                      <div className="dldChips">{subsOnSite.map((s, i) => <span key={i} className="dldChip">{s}</span>)}</div>
                    </div>
                  )}
                  {equipOnSite.length > 0 && (
                    <div className="dldSection">
                      <div className="dldLabel">Equipment On Site</div>
                      <div className="dldChips">{equipOnSite.map((s, i) => <span key={i} className="dldChip">{s}</span>)}</div>
                    </div>
                  )}
                </Card>
              )}

              {/* Work Performed */}
              {textSection({
                k: 'work', title: 'Work Performed', field: 'work_performed',
                icon: <ClipboardText size={16} />,
                emptyText: 'No work recorded for this day.', addLabel: 'Add Work Note',
                placeholder: 'What did the crews get done today?',
              })}

              {/* Equipment On Site (mobile-app column) — card renders when recorded or
                  being composed; otherwise it lives in the composer strip below */}
              {(l.equipment || editKey === 'equipment') && textSection({
                k: 'equipment', title: 'Equipment Notes', field: 'equipment',
                icon: <Wrench size={16} />,
                emptyText: 'No equipment recorded.', addLabel: 'Add Equipment Note',
                placeholder: 'Excavator, lull, scissor lifts…',
              })}

              {/* Delays */}
              {textSection({
                k: 'delays', title: 'Delays', field: 'delays',
                icon: <HourglassMedium size={16} />,
                emptyText: 'No delays reported.', addLabel: 'Add Delays Note',
                contentTone: 'warn',
                placeholder: 'Weather hold, missed delivery, inspection slip…',
              })}

              {/* Safety Notes */}
              {textSection({
                k: 'safety', title: 'Safety Notes', field: 'safety_notes',
                icon: <ShieldCheck size={16} />,
                emptyText: 'No safety issues reported.', emptyTone: 'good', addLabel: 'Add Safety Note',
                placeholder: 'Incidents, near-misses, toolbox talks…',
              })}

              {/* Materials & Visitors */}
              <Card
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Package size={16} />Materials & Visitors</span>}
                actions={editKey !== 'materials' ? editBtn('materials', { materials: l.materials_delivered || '', visitors: l.visitors || '' }, 'Materials & Visitors') : undefined}
              >
                {editKey === 'materials' ? (
                  <div>
                    <FormGrid cols={2}>
                      <Field label="Materials Delivered">
                        <Textarea autoFocus value={draft.materials ?? ''} onChange={e => setDraft(d => ({ ...d, materials: e.target.value }))} placeholder="What hit the site today" rows={4} />
                      </Field>
                      <Field label="Visitors">
                        <Textarea value={draft.visitors ?? ''} onChange={e => setDraft(d => ({ ...d, visitors: e.target.value }))} placeholder="Inspectors, owner reps, vendors" rows={4} />
                      </Field>
                    </FormGrid>
                    {editorFooter(
                      async () => {
                        const ok = await saveFields({
                          materials_delivered: (draft.materials ?? '').trim() || null,
                          visitors: (draft.visitors ?? '').trim() || null,
                        });
                        if (ok) closeEditor();
                      },
                      (l.materials_delivered || l.visitors)
                        ? async () => {
                            if (!(await confirmDialog({ title: 'Clear materials & visitors?', message: 'This removes both recorded entries.', confirmLabel: 'Clear', danger: true }))) return;
                            const ok = await saveFields({ materials_delivered: null, visitors: null }, 'Materials & visitors cleared');
                            if (ok) closeEditor();
                          }
                        : undefined,
                    )}
                  </div>
                ) : (
                  <div className="dldPair">
                    {[
                      { l: 'Materials Delivered', v: l.materials_delivered || '—', icon: <Package size={12} /> },
                      { l: 'Visitors', v: l.visitors || '—', icon: <UserCircle size={12} /> },
                    ].map(f => (
                      <div key={f.l}>
                        <div className="dldLabel">{f.icon} {f.l}</div>
                        <div className="dldValue">{f.v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Notes — card renders when recorded or being composed */}
              {(l.notes || editKey === 'notes') && textSection({
                k: 'notes', title: 'Notes', field: 'notes',
                icon: <NotePencil size={16} />,
                emptyText: 'No notes recorded.', addLabel: 'Add Notes',
                placeholder: 'Anything else worth logging for the record',
              })}

              {/* Add-section composer — surfaces the hidden-when-empty sections */}
              {composerTargets.length > 0 && (
                <div className="dldComposer">
                  {composerTargets.map(t => (
                    <Button key={t.k} icon={<Plus size={13} weight="bold" />} onClick={() => openEditor(t.k, { v: '' })}>
                      {t.icon} {t.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Photos (rendered only when the row carries a photo array) */}
              {photos.length > 0 && (
                <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ImageSquare size={16} />Photos</span>} subtitle={`${photos.length} attached`}>
                  <div className="dldPhotos">
                    {photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                        <img src={src} alt={`Daily log photo ${i + 1}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            <aside className="dldRail" aria-label="Daily log details and actions">
              <Card title="Details" actions={editKey !== 'meta' ? editBtn('meta', { date: (l.log_date || '').slice(0, 10) }, 'log date') : undefined}>
                {status.label === 'Draft' && <div className="dldSection"><div className="dldNext">Finish the day&apos;s log — it is the record that settles a claim.</div></div>}
                {editKey === 'meta' ? (
                  <div className="dldSection">
                    <Field label="Log Date">
                      <div className="dldDateInput">
                        <SaguaroDatePicker
                          value={draft.date ?? ''}
                          onChange={(v: string) => setDraft(d => ({ ...d, date: v }))}
                          placeholder="Pick the report date"
                          style={DATE_INPUT_STYLE}
                        />
                      </div>
                    </Field>
                    {editorFooter(async () => {
                      const ok = await saveFields({ log_date: draft.date || null }, 'Log date updated');
                      if (ok) closeEditor();
                    })}
                  </div>
                ) : (
                  <div className="dldSection">
                    <DetailList items={[
                      ['Project', projectName || l.project_id || ''],
                      ['Log Date', shortDate(l.log_date)],
                      ['Superintendent', l.superintendent || ''],
                      ['Crew on Site', l.crew_count != null ? String(l.crew_count) : '0'],
                      ['Weather', l.weather || ''],
                      ['High / Low', tempStr(l.high_temp, l.low_temp)],
                      ['Precipitation', l.precipitation || ''],
                      ['Wind', l.wind_conditions || ''],
                      ['Created', shortDate(l.created_at)],
                    ]} />
                  </div>
                )}
                <div className="dldSection">
                  <div className="dldActions">
                    <Button icon={<CalendarBlank size={16} />} onClick={() => openEditor('meta', { date: (l.log_date || '').slice(0, 10) })} disabled={editKey === 'meta'}>
                      Change Log Date
                    </Button>
                    {l.project_id && (
                      <Button icon={<ClipboardText size={16} />} href={`/app/projects/${l.project_id}/daily-logs`}>
                        Project Daily Logs
                      </Button>
                    )}
                    <Button icon={<ArrowLeft size={16} />} onClick={() => router.push('/app/daily-logs')}>
                      All Daily Logs
                    </Button>
                  </div>
                </div>
              </Card>
              <div className="dldRelated">
                <RelatedItems type="daily_log" id={id} projectId={l.project_id} />
              </div>
            </aside>
          </div>
        </div>
      </PageShell>

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
