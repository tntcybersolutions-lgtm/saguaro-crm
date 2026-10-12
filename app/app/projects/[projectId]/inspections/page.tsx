'use client';
/**
 * Inspections — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Anatomy: title + one primary action (Schedule Inspection) → StatRow (pass
 * rate / re-inspections due / scheduled / deficiencies / next up — each tile
 * filters the log) → Toolbar → workspace split: the inspection log on the
 * left and, when a row is selected, the record beside a 320–384px details
 * rail. Phone: stacked. The scheduling composer opens in a FormModal.
 *
 * Results are the data model's: scheduled / passed / failed / conditional
 * pass / pending. Nothing here auto-marks a pass — a failed type stays flagged
 * until a later inspection of that type passes.
 *
 * Every read / write is the one this screen already used:
 *   list    GET  /api/projects/[id]/inspections
 *   create  POST /api/inspections/create   (409 requiresQcOverride → confirm → override)
 *   result  PATCH /api/inspections/[id]    (Record Result: result, status, held date,
 *                                           deficiencies, re-inspection date, notes)
 *
 * Deep link: ?inspection=<id> opens that record; &record=1 also opens its
 * Record Result form (the Home queue's "Record Result" lands here).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { ClipboardText, Plus, Warning, ArrowsClockwise, X, CheckCircle } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState,
  FormModal, Field, Input, Select, Textarea, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, InsightRow, AutoChip } from '@/components/ui/premium';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { layout } from '@/lib/design-tokens';
import { canonInspectionResult, isUnheldDefault } from '@/lib/inspection-result';

interface Inspection {
  id: string;
  type: string;
  date: string;
  inspector: string;
  agency: string;
  result: string;
  notes: string;
  status: string;
  re_inspection_date: string | null;
  project_id: string;
  deficiency_count: number;
  checklist_total: number;
  checklist_passed: number;
}

const INSPECTION_TYPES = ['Foundation','Framing','Rough Electrical','Rough Plumbing','Rough HVAC','Insulation','Drywall','Final Electrical','Final Plumbing','Final Building'];
const EMPTY_FORM = { type: 'Framing', date: '', inspector: '', agency: '', notes: '' };
const RESULT_OPTIONS = ['Passed', 'Failed', 'Conditional Pass'] as const;
type ResultChoice = typeof RESULT_OPTIONS[number];
const EMPTY_RESULT = { result: 'Passed' as ResultChoice, heldOn: '', deficiencies: '0', reinspect: '', notes: '' };

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
// Results arrive in two dialects: the web form writes 'Passed'/'Failed'/'Pending'
// while the wizard/mobile route writes 'passed'/'conditional_pass'. Canonicalize
// before comparing so stats and re-inspection tracking see both.
const canonResult = (r: string) => { const c = canonInspectionResult(r); return c === 'conditional' ? 'conditional pass' : c; };

// The API returns raw `inspections` rows whose columns don't match this page's
// display fields (scheduled_date/inspection_type/inspector_name). Normalize so
// the user's saved date + inspector actually render on reload.
function normalizeInspection(r: Record<string, unknown>): Inspection {
  return {
    id: String(r.id ?? ''),
    type: String(r.type ?? r.inspection_type ?? ''),
    date: String(r.date ?? r.scheduled_date ?? ''),
    inspector: String(r.inspector ?? r.inspector_name ?? ''),
    agency: String(r.agency ?? r.inspector_agency ?? ''),
    // A booked row can carry the column's old 'pass' default — that is no result yet.
    result: isUnheldDefault(r.result, r.status) ? 'pending' : String(r.result ?? ''),
    notes: String(r.notes ?? ''),
    status: String(r.status ?? ''),
    re_inspection_date: (r.re_inspection_date as string | null) ?? null,
    project_id: String(r.project_id ?? ''),
    deficiency_count: Number(r.deficiency_count) || 0,
    checklist_total: Number(r.checklist_total) || 0,
    checklist_passed: Number(r.checklist_passed) || 0,
  };
}

/** One result → one badge. Passed green, Failed red, Conditional Pass amber,
 *  Pending neutral — from lib/status-colors. */
function resultBadge(result: string): { label: string; tone: BadgeTone } {
  const k = canonResult(result);
  if (k === 'passed') return { label: 'Passed', tone: 'ongoing' };
  if (k === 'failed') return { label: 'Failed', tone: 'overdue' };
  if (k === 'conditional pass') return { label: 'Conditional Pass', tone: 'under_contract' };
  if (k === 'pending' || !k) return { label: 'Pending', tone: 'neutral' };
  return { label: result, tone: 'neutral' };
}
const RESULT_RANK: Record<string, number> = { failed: 0, pending: 1, 'conditional pass': 2, passed: 3 };
/** Status is booked (Scheduled) or resulted — blue while it is on the calendar. */
function statusBadge(status: string): { label: string; tone: BadgeTone } {
  const k = String(status || '').toLowerCase();
  if (/sched/.test(k)) return { label: 'Scheduled', tone: 'lead' };
  if (/pass/.test(k)) return { label: 'Passed', tone: 'ongoing' };
  if (/fail/.test(k)) return { label: 'Failed', tone: 'overdue' };
  if (/complete/.test(k)) return { label: 'Completed', tone: 'completed' };
  return { label: k ? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—', tone: 'neutral' };
}
type ResultFilter = 'all' | 'passed' | 'failed' | 'pending' | 'conditional pass' | 'scheduled' | 'reinspect';

const CSS = `
.inWs > .k-page { max-width: none; }
.inCq { container: inws / inline-size; min-width: 0; }
.inSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.inSplit > * { min-width: 0; }
@container inws (min-width: 1080px) {
  .inSplit[data-open="true"] { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
}
.inList .k-table th:first-child, .inList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.inList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.inList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.inList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.inList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.inType { color: var(--text-primary); font-weight: 700; white-space: nowrap; }
.inMuted { color: var(--text-tertiary); }
.inClamp { display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.inBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.inSection { display: flex; flex-direction: column; gap: 8px; }
.inSection + .inSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.inSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.inProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.inNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.inActions { display: flex; flex-direction: column; gap: 8px; }
.inActions .k-btn { width: 100%; justify-content: flex-start; }
.inRail { position: sticky; top: 16px; }
.inLadder { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); margin-bottom: 16px; }
.inWarn { display: flex; gap: 10px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-primary); line-height: 1.55; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(255,77,94,.35); background: rgba(255,77,94,.08); margin-bottom: 16px; }
.inWarn > svg { color: var(--status-overdue); flex-shrink: 0; margin-top: 2px; }
.inWarn button { background: none; border: 0; padding: 0; color: var(--link); font-weight: 700; cursor: pointer; font: inherit; margin-right: 10px; }
.inSeq { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.inSeqItem { display: flex; align-items: center; gap: 9px; font-size: var(--fs-sm); color: var(--text-tertiary); }
.inSeqItem[data-next="true"] { color: var(--text-primary); font-weight: 700; }
.inSeqNum { width: 18px; height: 18px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; border: 1px solid var(--border-default); color: var(--text-tertiary); }
.inSeqItem[data-next="true"] .inSeqNum { border-color: var(--link); color: var(--link); }
.inEmptyGrid { display: grid; grid-template-columns: minmax(0, 1fr); }
.inEmptyRail { padding: 14px 20px 18px; border-top: 1px solid var(--border-subtle); }
.inDateInput { width: 100%; }
@media (max-width: 640px) {
  .inWs .k-btn, .inWs .k-stat, .inWs select.k-select, .inWs .k-input { min-height: 44px; }
  .inWs .k-table td { height: 48px; }
  .inClamp { max-width: 180px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function InspectionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `inspections:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast(4000);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filterResult, setFilterResult] = useState<ResultFilter>('all');
  const [filterType, setFilterType] = useState('all');
  // Record Result — the PATCH this screen never had a form for.
  const [recordId, setRecordId] = useState<string | null>(null);
  const [resultForm, setResultForm] = useState(EMPTY_RESULT);
  const [resultSaving, setResultSaving] = useState(false);
  const [resultError, setResultError] = useState('');

  const fetchInspections = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/inspections`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setInspections((json.inspections ?? []).map(normalizeInspection));
    } catch {
      setInspections([]);
      setLoadError('Failed to load inspections.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchInspections(); }, [fetchInspections]);

  // Project intelligence — one snapshot; the schedule flow walks in knowing the job.
  const { ctx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ date?: boolean; type?: boolean; insp?: boolean; agency?: boolean }>({});

  const passed = inspections.filter(i => canonResult(i.result) === 'passed').length;
  const failed = inspections.filter(i => canonResult(i.result) === 'failed').length;
  const conditional = inspections.filter(i => canonResult(i.result) === 'conditional pass').length;
  const resulted = passed + failed + conditional;
  const passRate = resulted > 0 ? Math.round(((passed + conditional) / resulted) * 100) : 0;
  const scheduled = inspections.filter(i => /sched/i.test(i.status)).length;
  const deficiencies = inspections.reduce((s, i) => s + (Number(i.deficiency_count) || 0), 0);

  // Re-inspection tracking: a failed inspection stays open until a later
  // inspection of the same type passes (or conditionally passes).
  const awaitingReinspection = inspections.filter(f =>
    canonResult(f.result) === 'failed' &&
    !inspections.some(p =>
      p.type === f.type && p.id !== f.id &&
      (canonResult(p.result) === 'passed' || canonResult(p.result) === 'conditional pass') &&
      (p.date || '') >= (f.date || '')
    )
  );
  const needsReinspect = (i: Inspection) => awaitingReinspection.some(f => f.id === i.id);

  const todayIso = localIso(new Date());
  const upcoming = inspections
    .filter(i => /sched/i.test(i.status) && (i.date || '') >= todayIso)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const nextUp = upcoming[0] || null;
  const byDateDesc = [...inspections].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const lastRecord = byDateDesc[0] || null;
  const passedTypes = new Set(inspections.filter(i => canonResult(i.result) === 'passed').map(i => i.type));
  const suggestedType = INSPECTION_TYPES.find(t => !passedTypes.has(t)) || 'Final Building';
  const openPunch = Number(ctx?.counts?.openPunch) || 0;
  const pctComplete = Number(ctx?.project?.percentComplete) || 0;

  // Toolbar filtering — client-side over the loaded records.
  const filteredInspections = inspections.filter(i => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (i.type || '').toLowerCase().includes(q)
        || (i.inspector || '').toLowerCase().includes(q)
        || (i.agency || '').toLowerCase().includes(q)
        || (i.notes || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterResult === 'scheduled') { if (!/sched/i.test(i.status)) return false; }
    else if (filterResult === 'reinspect') { if (!needsReinspect(i)) return false; }
    else if (filterResult !== 'all' && canonResult(i.result) !== filterResult) return false;
    if (filterType !== 'all' && i.type !== filterType) return false;
    return true;
  });
  const filtersActive = !!search || filterResult !== 'all' || filterType !== 'all';
  const clearFilters = () => { setSearch(''); setFilterResult('all'); setFilterType('all'); };
  const toggleResult = (r: ResultFilter) => setFilterResult(prev => (prev === r ? 'all' : r));

  // Prefilled schedule flow: date today, the last inspector/agency of record,
  // and the next milestone type (or the failed type for a re-inspection).
  function openCreate(prefType?: string) {
    const lastWithInspector = byDateDesc.find(i => i.inspector);
    const lastWithAgency = byDateDesc.find(i => i.agency);
    setForm({
      type: prefType || suggestedType,
      date: localIso(new Date()),
      inspector: lastWithInspector?.inspector || '',
      agency: lastWithAgency?.agency || '',
      notes: prefType ? `Re-inspection — prior ${prefType} inspection failed.` : '',
    });
    setAuto({ date: true, type: true, insp: !!lastWithInspector?.inspector, agency: !!lastWithAgency?.agency });
    setShowForm(true);
    setErrorMsg('');
  }
  function closeComposer() { guard.requestClose(() => { setShowForm(false); setErrorMsg(''); }); }

  // Record Result — prefilled from the record: its result if one is on file
  // (Passed otherwise), the day it was held (today if it was booked ahead),
  // the deficiency count and the notes already there.
  function openRecord(i: Inspection) {
    const k = canonResult(i.result);
    const current: ResultChoice = k === 'failed' ? 'Failed' : k === 'conditional pass' ? 'Conditional Pass' : 'Passed';
    const booked = (i.date || '').slice(0, 10);
    setResultForm({
      result: current,
      heldOn: booked && booked <= todayIso ? booked : todayIso,
      deficiencies: String(Number(i.deficiency_count) || 0),
      reinspect: i.re_inspection_date ? String(i.re_inspection_date).slice(0, 10) : '',
      notes: i.notes || '',
    });
    setResultError('');
    setRecordId(i.id);
  }
  function closeRecord() { if (!resultSaving) { setRecordId(null); setResultError(''); } }

  async function saveResult() {
    const target = recordId ? inspections.find(i => i.id === recordId) : null;
    if (!target) return;
    if (!resultForm.heldOn) { setResultError('Pick the date the inspection was held.'); return; }
    const defCount = Number(resultForm.deficiencies);
    if (!Number.isInteger(defCount) || defCount < 0) { setResultError('Deficiencies must be a whole number, 0 or more.'); return; }
    setResultSaving(true);
    setResultError('');
    const failedResult = resultForm.result === 'Failed';
    const body: Record<string, unknown> = {
      result: resultForm.result,
      // Home and this log read status: a fail stays open, anything else is done.
      status: failedResult ? 'Failed' : 'Completed',
      inspected_at: `${resultForm.heldOn}T12:00:00`,
      deficiency_count: defCount,
      notes: resultForm.notes.trim() || null,
    };
    if (failedResult) body.re_inspection_date = resultForm.reinspect || null;
    try {
      const res = await fetch(`/api/inspections/${target.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.inspection) throw new Error(json.error || `Could not save the result (${res.status}).`);
      const saved = normalizeInspection(json.inspection);
      setInspections(prev => prev.map(i => (i.id === saved.id ? saved : i)));
      setSelectedId(saved.id);
      setRecordId(null);
      show(failedResult ? 'Result recorded — flagged for re-inspection.' : 'Result recorded.');
    } catch (e) {
      setResultError(e instanceof Error ? e.message : 'Could not save the result. Please try again.');
    } finally {
      setResultSaving(false);
    }
  }

  // Deep link from Home: open the record (and its result form) once the log is in.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (loading || deepLinkDone.current || typeof window === 'undefined') return;
    deepLinkDone.current = true;
    const q = new URLSearchParams(window.location.search);
    const target = q.get('inspection') ? inspections.find(i => i.id === q.get('inspection')) : null;
    if (!target) return;
    setSelectedId(target.id);
    if (q.get('record') === '1') openRecord(target);
    // openRecord reads only its argument and stable values; run once per load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, inspections]);

  async function handleSave(): Promise<boolean> {
    if (!form.type || !form.date || !form.inspector) { setErrorMsg('Type, date, and inspector are required.'); return false; }
    setSaving(true);
    setErrorMsg('');
    const payload = { projectId, result: 'Pending', status: 'Scheduled', ...form };
    try {
      let res = await fetch('/api/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      // QC-before-inspections gate (franchise sites): allow an explicit override.
      if (res.status === 409) {
        const g = await res.json().catch(() => ({}));
        if (g?.requiresQcOverride && typeof window !== 'undefined' &&
            (await confirmDialog({ title: 'Schedule anyway?', message: g.error || 'QC is not complete for this site.', confirmLabel: 'Schedule anyway' }))) {
          res = await fetch('/api/inspections/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, override: true }) });
        } else if (g?.requiresQcOverride) {
          setErrorMsg(g.error || 'QC not complete for this site.'); setSaving(false); return false;
        }
      }
      const json = await res.json();
      if (!res.ok || !json.inspection) throw new Error(json.error || 'Create failed');
      setInspections(prev => [...prev, normalizeInspection(json.inspection)]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      show('Inspection scheduled.');
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not schedule the inspection. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const selected = selectedId ? inspections.find(i => i.id === selectedId) || null : null;
  const detailOpen = !!selected;
  useEffect(() => {
    if (!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [detailOpen, selectedId]);

  // ── Stat tiles — each filters the log ──
  const stats: StatItem[] = loading
    ? [
        { label: 'Pass Rate', value: '—', sub: 'Loading…' },
        { label: 'Re-Inspections Due', value: '—', sub: 'Loading…' },
        { label: 'Scheduled', value: '—', sub: 'Loading…' },
        { label: 'Deficiencies', value: '—', sub: 'Loading…' },
        { label: 'Next Scheduled', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Pass Rate', value: resulted > 0 ? `${passRate}%` : '—', tone: resulted > 0 ? (passRate >= 80 ? 'good' : passRate >= 60 ? 'warn' : 'bad') : 'default', sub: filterResult === 'passed' ? 'Filtered — click to clear' : resulted > 0 ? `${passed} passed of ${resulted} resulted` : 'No results recorded yet', onClick: () => toggleResult('passed') },
        { label: 'Re-Inspections Due', value: awaitingReinspection.length, tone: awaitingReinspection.length > 0 ? 'bad' : 'default', sub: filterResult === 'reinspect' ? 'Filtered — click to clear' : awaitingReinspection.length > 0 ? awaitingReinspection.slice(0, 2).map(f => f.type).join(', ') : failed > 0 ? 'Every failure re-passed' : 'No failures on record', onClick: () => toggleResult('reinspect') },
        { label: 'Scheduled', value: scheduled, tone: scheduled > 0 ? 'warn' : 'default', sub: filterResult === 'scheduled' ? 'Filtered — click to clear' : nextUp ? `Next ${fmtDate(nextUp.date)}` : 'Nothing on the calendar', onClick: () => toggleResult('scheduled') },
        { label: 'Deficiencies', value: deficiencies, tone: deficiencies > 0 ? 'warn' : 'default', sub: deficiencies > 0 ? 'Flagged on inspection checklists' : 'None flagged' },
        { label: 'Next Milestone', value: suggestedType, sub: openPunch > 0 ? `${openPunch} open punch item${openPunch === 1 ? '' : 's'} before finals` : `${passedTypes.size} of ${INSPECTION_TYPES.length} milestone types passed` },
      ];

  // ── Log columns ──
  const isSel = (i: Inspection) => i.id === selectedId;
  const typeCol: Column<Inspection> = { key: 'type', header: 'Type', accessor: i => i.type || '', render: i => <span className="inType" data-sel={isSel(i) ? 'true' : undefined}>{i.type || '—'}</span> };
  const dateCol: Column<Inspection> = { key: 'date', header: 'Date', accessor: i => i.date || '', render: i => <span className="inMuted">{fmtDate(i.date)}</span> };
  const inspectorCol: Column<Inspection> = { key: 'inspector', phone: 'hide', header: 'Inspector', accessor: i => (i.inspector || '').toLowerCase(), render: i => i.inspector || <span className="inMuted">—</span> };
  const agencyCol: Column<Inspection> = { key: 'agency', phone: 'hide', header: 'Agency', accessor: i => (i.agency || '').toLowerCase(), render: i => i.agency || <span className="inMuted">—</span> };
  const resultCol: Column<Inspection> = { key: 'result', phone: 'show', header: 'Result', accessor: i => RESULT_RANK[canonResult(i.result)] ?? 9, render: i => { const b = resultBadge(i.result); return <span className="inBadges"><Badge tone={b.tone}>{b.label}</Badge>{needsReinspect(i) && <Badge tone="overdue"><ArrowsClockwise size={11} /> Re-Inspect</Badge>}</span>; } };
  const defCol: Column<Inspection> = { key: 'deficiency_count', phone: 'hide', header: 'Deficiencies', accessor: i => Number(i.deficiency_count) || 0, align: 'right', render: i => (Number(i.deficiency_count) || 0) > 0 ? <span style={{ color: 'var(--status-under-contract)', fontWeight: 700 }}>{i.deficiency_count}</span> : <span className="inMuted">—</span> };
  const notesCol: Column<Inspection> = { key: 'notes', phone: 'hide', header: 'Notes', accessor: i => (i.notes || '').toLowerCase(), render: i => i.notes ? <span className="inClamp" title={i.notes}>{i.notes}</span> : <span className="inMuted">—</span> };
  const statusCol: Column<Inspection> = { key: 'status', phone: 'show', header: 'Status', accessor: i => (i.status || '').toLowerCase(), render: i => { const b = statusBadge(i.status); return <Badge tone={b.tone}>{b.label}</Badge>; } };
  const columns: Column<Inspection>[] = detailOpen ? [typeCol, dateCol, resultCol, statusCol] : [typeCol, dateCol, inspectorCol, agencyCol, resultCol, defCol, notesCol, statusCol];
  const isResulted = (i: Inspection) => ['passed', 'failed', 'conditional pass'].includes(canonResult(i.result));
  const rowActions = (i: Inspection): Action[] => [
    { label: 'Open Record', icon: <ClipboardText size={15} />, onClick: () => setSelectedId(i.id) },
    { label: isResulted(i) ? 'Change Result' : 'Record Result', icon: <CheckCircle size={15} />, onClick: () => openRecord(i) },
    { label: 'Schedule Re-Inspection', icon: <ArrowsClockwise size={15} />, onClick: () => openCreate(i.type), hidden: !needsReinspect(i) },
  ];

  // ── Detail workspace ──
  const detailWorkspace = selected && (() => {
    const rb = resultBadge(selected.result); const sb = statusBadge(selected.status);
    return (
      <aside ref={detailRef} className="inRail" aria-label="Inspection details">
        <Card
          title={selected.type || 'Inspection'}
          subtitle={`${fmtDate(selected.date)}${selected.agency ? ` · ${selected.agency}` : ''}`}
          actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close record" title="Close record" onClick={() => setSelectedId(null)} />}
        >
          <div className="inSection">
            <div className="inBadges">
              <Badge tone={rb.tone} dot>{rb.label}</Badge>
              <Badge tone={sb.tone}>{sb.label}</Badge>
              {needsReinspect(selected) && <Badge tone="overdue">Re-Inspect</Badge>}
            </div>
            <div className="inNext">
              {needsReinspect(selected) ? `Failed — stays flagged until a later ${selected.type} inspection passes.` : canonResult(selected.result) === 'passed' ? 'Passed — part of the permanent project record.' : /sched/i.test(selected.status) ? 'Booked — waiting on the inspector. Record the result once it is held.' : 'Result recorded on the inspection checklist.'}
            </div>
          </div>
          <div className="inSection">
            <DetailList items={[
              ['Inspector', selected.inspector || ''],
              ['Agency', selected.agency || ''],
              ['Date', fmtDate(selected.date)],
              ['Re-Inspection', fmtDate(selected.re_inspection_date)],
              ['Deficiencies', String(Number(selected.deficiency_count) || 0)],
              ['Checklist', selected.checklist_total > 0 ? `${selected.checklist_passed} of ${selected.checklist_total} passed` : '—'],
            ]} />
          </div>
          {selected.notes && (
            <div className="inSection">
              <div className="inSectionTitle">Notes</div>
              <div className="inProse">{selected.notes}</div>
            </div>
          )}
          <div className="inSection">
            <div className="inActions">
              <Button variant={isResulted(selected) ? 'secondary' : 'primary'} icon={<CheckCircle size={16} />} onClick={() => openRecord(selected)}>
                {isResulted(selected) ? 'Change Result' : 'Record Result'}
              </Button>
              {needsReinspect(selected) && (
                <Button icon={<ArrowsClockwise size={16} />} onClick={() => openCreate(selected.type)}>Schedule Re-Inspection</Button>
              )}
            </div>
          </div>
        </Card>
      </aside>
    );
  })();

  // ── Log body ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = <EmptyState icon={<Warning size={22} />} title="Couldn't load inspections" text={`${loadError} Nothing has been lost — try again.`} action={<Button onClick={fetchInspections}>Retry</Button>} />;
  } else if (!loading && inspections.length === 0) {
    listBody = (
      <div className="inEmptyGrid" data-ctx={ctx ? 'true' : 'false'}>
        <EmptyState
          icon={<ClipboardText size={22} />}
          title="No inspections on record"
          text={pctComplete > 0
            ? `${ctx?.project?.name || 'This project'} is ${pctComplete}% complete — inspection records are how the work gets signed off. ${suggestedType} is the next milestone in a typical sequence.`
            : 'Every passed inspection becomes part of the permanent project record — and failed ones are tracked until they re-pass. Schedule the first one to start the log.'}
          action={<Button icon={<Plus size={15} weight="bold" />} onClick={() => openCreate()}>Schedule {suggestedType}</Button>}
        />
        {ctx && (
          <div className="inEmptyRail">
            <div className="inSectionTitle" style={{ marginBottom: 10 }}>The Typical Sequence</div>
            <div className="inSeq">
              {INSPECTION_TYPES.map((t, idx) => (
                <div key={t} className="inSeqItem" data-next={t === suggestedType ? 'true' : undefined}><span className="inSeqNum">{idx + 1}</span>{t}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filteredInspections}
        rowKey={i => i.id}
        loading={loading}
        defaultSort={{ key: 'date', dir: 'desc' }}
        onRowClick={i => setSelectedId(i.id)}
        rowActions={rowActions}
        empty={<EmptyState icon={<ClipboardText size={22} />} title="No inspections match these filters" text="Clear the search, result, or type filter to see more." action={<Button onClick={clearFilters}>Clear Filters</Button>} />}
      />
    );
  }

  return (
    <div className="inWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` },
          { label: 'Inspections' },
        ]}
        title="Inspections"
        subtitle="Building inspections and approval records — failures stay flagged until they re-pass."
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => openCreate()}>Schedule Inspection</Button>}
      >
        {!loadError && <StatRow items={stats} />}

        {!loading && !loadError && inspections.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by type, inspector, agency, or notes…"
            filters={
              <>
                <Select aria-label="Result" value={filterResult} onChange={e => setFilterResult(e.target.value as ResultFilter)} style={{ width: 'auto', minWidth: 160 }} options={[
                  { value: 'all', label: 'All Results' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Pending' }, { value: 'conditional pass', label: 'Conditional Pass' }, { value: 'reinspect', label: 'Re-Inspection Due' },
                ]} />
                <Select aria-label="Type" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 'auto', minWidth: 150 }} options={[{ value: 'all', label: 'All Types' }, ...INSPECTION_TYPES]} />
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span className="inMuted" style={{ fontSize: 'var(--fs-sm)' }}>{filteredInspections.length} of {inspections.length}</span>}
          />
        )}

        <div className="inCq">
          <div className="inSplit" data-open={detailOpen ? 'true' : 'false'}>
            <div className="inList"><Card flush>{listBody}</Card></div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer ── */}
      <FormModal
        open={showForm}
        onClose={closeComposer}
        title="Schedule Inspection"
        subtitle={ctx?.project?.name ? `${ctx.project.name} · saved as Scheduled with the inspector and agency of record.` : 'Saved as Scheduled with the inspector and agency of record.'}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Schedule Inspection"
        busy={saving}
        error={errorMsg || null}
      >
        {awaitingReinspection.length > 0 && (
          <div className="inWarn" role="status">
            <ArrowsClockwise size={16} weight="bold" />
            <div>
              {awaitingReinspection.length} failed inspection{awaitingReinspection.length === 1 ? '' : 's'} awaiting re-inspection:{' '}
              {awaitingReinspection.slice(0, 3).map(f => (
                <button key={f.id} type="button" onClick={() => openCreate(f.type)}>{f.type} (failed {fmtDate(f.date)})</button>
              ))}
            </div>
          </div>
        )}
        {ctx && (
          <div className="inLadder">
            <InsightRow label="Project" value={`${pctComplete}% complete`} />
            <InsightRow label="Inspections Held" value={String(inspections.length)} />
            <InsightRow label="Pass Rate" value={resulted > 0 ? `${passRate}%` : '—'} />
            <InsightRow label="Open Punch Items" value={String(openPunch)} />
            {lastRecord && <InsightRow label="Last Inspection" value={`${lastRecord.type} · ${fmtDate(lastRecord.date)} · ${resultBadge(lastRecord.result).label}`} />}
          </div>
        )}
        <FormGrid cols={2}>
          <Field label="Inspection Type" required hint={<>{auto.type && <AutoChip />} {passedTypes.size > 0 ? `${passedTypes.size} of ${INSPECTION_TYPES.length} milestone types passed — ${suggestedType} is next.` : 'Typical sequence runs Foundation through Final Building.'}</>}>
            <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} options={INSPECTION_TYPES} />
          </Field>
          <Field label="Date" required hint={<>{auto.date && <AutoChip />} Defaulted to today — most agencies need 24–48h notice.</>}>
            <div className="inDateInput"><SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Inspector" required hint={<>{auto.insp && <AutoChip />} {auto.insp ? `Carried from the last inspection (${fmtDate(lastRecord?.date)}).` : 'Who performs the inspection.'}</>}>
            <Suggest className="k-input" type="text" value={form.inspector} onChange={e => { setForm(p => ({ ...p, inspector: e.target.value })); if (errorMsg) setErrorMsg(''); }} options={inspections.map((i) => i.inspector || '').filter(Boolean)} placeholder="Inspector name" />
          </Field>
          <Field label="Agency" hint={<>{auto.agency && <AutoChip />} {auto.agency ? 'Same authority as the last inspection.' : 'The authority having jurisdiction.'}</>}>
            <Suggest className="k-input" type="text" value={form.agency} onChange={e => setForm(p => ({ ...p, agency: e.target.value }))} placeholder="e.g. City of Phoenix" options={inspections.map((i) => i.agency || '').filter(Boolean)} />
          </Field>
          <Field label="Notes" span hint="Anything the inspector needs on arrival.">
            <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Gate code, area under inspection, permit reference…" />
          </Field>
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <FlowSteps title="After You Schedule" steps={[
            { title: 'Inspection Is on the Calendar', desc: 'Saved as Scheduled with the inspector and agency of record.' },
            { title: 'Record the Result', desc: 'Pass, fail, or conditional — checklist deficiencies are counted per inspection.' },
            { title: 'Failures Queue a Re-Inspection', desc: 'A failed type stays flagged here until a later inspection of that type passes.' },
            { title: 'Records Feed Closeout', desc: 'Passed finals roll into the project closeout package.' },
          ]} />
        </div>
      </FormModal>

      {/* ── Record Result ── */}
      {(() => {
        const target = recordId ? inspections.find(i => i.id === recordId) : null;
        return (
          <FormModal
            open={!!target}
            onClose={closeRecord}
            title="Record Result"
            subtitle={target ? `${target.type || 'Inspection'} · booked ${fmtDate(target.date)}${target.inspector ? ` · ${target.inspector}` : ''}` : undefined}
            onSubmit={saveResult}
            submitLabel="Save Result"
            busy={resultSaving}
            error={resultError || null}
          >
            <FormGrid cols={2}>
              <Field label="Result" required hint="A fail stays flagged here until a later inspection of this type passes.">
                <Select value={resultForm.result} onChange={e => setResultForm(p => ({ ...p, result: e.target.value as ResultChoice }))} options={[...RESULT_OPTIONS]} />
              </Field>
              <Field label="Held On" required hint="The day the inspector came out.">
                <div className="inDateInput"><SaguaroDatePicker value={resultForm.heldOn} onChange={v => setResultForm(p => ({ ...p, heldOn: v }))} style={DATE_INPUT_STYLE} /></div>
              </Field>
              <Field label="Deficiencies" hint="Items the inspector wrote up. 0 if none.">
                <Input type="number" inputMode="numeric" min={0} step={1} value={resultForm.deficiencies} onChange={e => setResultForm(p => ({ ...p, deficiencies: e.target.value }))} />
              </Field>
              {resultForm.result === 'Failed' && (
                <Field label="Re-Inspection Date" hint="When the inspector is coming back, if booked.">
                  <div className="inDateInput"><SaguaroDatePicker value={resultForm.reinspect} onChange={v => setResultForm(p => ({ ...p, reinspect: v }))} style={DATE_INPUT_STYLE} /></div>
                </Field>
              )}
              <Field label="Notes" span hint="What was written up, conditions of approval, the card number.">
                <Textarea rows={3} value={resultForm.notes} onChange={e => setResultForm(p => ({ ...p, notes: e.target.value }))} placeholder="Corrections required, conditions, sign-off reference…" />
              </Field>
            </FormGrid>
          </FormModal>
        );
      })()}

      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
