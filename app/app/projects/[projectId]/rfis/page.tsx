'use client';
/**
 * Project RFIs — Pass 3 #2 reference screen (dense table + detail).
 *
 * Anatomy: title + one primary action (New RFI) → StatRow (each tile filters
 * the log) → Toolbar → workspace split: DataTable log on the left, and when a
 * row is selected, a detail workspace (question / answer / radio evidence)
 * beside a 320–384px metadata + action rail. Phone: list, then detail, stacked.
 *
 * Every write goes through a route this screen already used:
 *   create   POST   /api/rfis/create
 *   answer   POST   /api/rfis/[id]/answer
 *   reassign PATCH  /api/rfis/[id]        (ball_in_court / assigned_to_name / due_date)
 *   close    PATCH  /api/rfis/[id]        (status 'closed' + closed_at)
 *   delete   DELETE /api/rfis/[id]
 *   detail   GET    /api/rfis/[id]        (impacts, radio provenance)
 *   bulk     PATCH  /api/items/rfis/[id]  (status / ball in court / due, one per row — lib/items/bulk)
 */
import { useEditRights } from '@/lib/hooks/usePermissions';
import { itemBulkEdit } from '@/lib/items/bulk';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, RowActions,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  Question, WarningCircle, Plus, Lightning, X, ChatText, UserSwitch, CheckCircle,
  Trash, FilePdf, Waveform, ArrowClockwise, ArrowSquareOut,
} from '@phosphor-icons/react';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import RadioEvidence, {
  hasRadioEvidence,
  radioProvenanceFromText,
  radioEvidenceFromRecord,
  stripRadioProvenance,
} from '@/components/RadioEvidence';
import { MODULES } from '@/lib/status-system';
import { layout } from '@/lib/design-tokens';
import { useOpenOnNew, useOpenRecord } from '@/lib/ui/open-on-new';

interface RFI {
  id: string;
  rfi_number: number;
  subject: string;
  question: string;
  spec_section: string;
  status: string;
  submitted_by: string;
  due_date: string | null;
  answer: string | null;
  answered_by: string | null;
  ball_in_court: string | null;
  assigned_to_name: string | null;
  priority: string | null;
  is_urgent: boolean | null;
  is_overdue: boolean;
  created_at: string;
  answered_at?: string | null;
  closed_at?: string | null;
}

/** Fields only the single-record read carries (the list route is narrow). */
interface RFIDetail {
  cost_impact?: number | string | null;
  cost_impact_direction?: string | null;
  schedule_impact_days?: number | null;
  impact_description?: string | null;
  drawing_reference?: string | null;
  pdf_url?: string | null;
  answered_at?: string | null;
  closed_at?: string | null;
  [k: string]: unknown;
}

type StatusFilter = 'all' | 'open' | 'in_review' | 'answered' | 'closed' | 'overdue';

// Smart date default — +N days out, local ISO, always user-editable.
const isoPlusDays = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const IN_REVIEW = new Set(['submitted', 'pending', 'under_review']);
const ANSWERABLE = (s: string) => s !== 'answered' && s !== 'closed';

/** One status → one badge. Overdue wins. Open/draft stay neutral so the log is
 *  not a rainbow: only In Review (amber), Overdue (red), Answered (green) and
 *  Closed (grey) carry a hue, all from lib/status-colors. */
function rfiStatus(r: RFI): { label: string; tone: BadgeTone } {
  if (r.is_overdue) return { label: 'Overdue', tone: 'overdue' };
  const s = r.status || 'open';
  if (s === 'answered') return { label: 'Answered', tone: 'ongoing' };
  if (s === 'closed') return { label: 'Closed', tone: 'closed' };
  if (s === 'under_review') return { label: 'In Review', tone: 'under_contract' };
  if (s === 'submitted') return { label: 'Submitted', tone: 'under_contract' };
  if (s === 'pending') return { label: 'Pending', tone: 'under_contract' };
  if (s === 'draft') return { label: 'Draft', tone: 'neutral' };
  return { label: 'Open', tone: 'neutral' };
}

const isUrgent = (r: RFI) => !!(r.is_urgent || r.priority === 'high' || r.priority === 'critical');

/** Days the RFI was (or still is) open: a closed or answered RFI stops its
 *  clock on the day it was answered / closed, so the column stays true. */
function daysOpen(rfi: RFI): number {
  const created = new Date(rfi.created_at || Date.now());
  const done = rfi.status === 'closed' || rfi.status === 'answered';
  const endIso = done ? (rfi.answered_at || rfi.closed_at) : null;
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, Math.floor((end - created.getTime()) / 86400000));
}

/** Who owes the next move. A closed RFI is in nobody's court — and an old
 *  import that stored a status word there ("closed") is not a person. */
function ballInCourt(rfi: RFI): string {
  if (rfi.status === 'closed') return '';
  const v = (rfi.ball_in_court || rfi.assigned_to_name || '').trim();
  return /^(open|closed|answered|draft|submitted|pending|under_review|n\/a|none)$/i.test(v) ? '' : v;
}

/** "RFI-004" stays as stored; a bare number reads "#4". */
const rfiNo = (n: unknown) => (/^\d+$/.test(String(n ?? '')) ? `#${n}` : String(n ?? ''));
const rfiRef = (n: unknown) => (/^\d+$/.test(String(n ?? '')) ? `RFI #${n}` : String(n ?? 'RFI'));

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

/** Pull a readable message out of a failed response without echoing raw bodies. */
async function readError(r: Response, fallback: string): Promise<string> {
  try {
    const d = await r.json();
    return (d && typeof d.error === 'string' && d.error) || fallback;
  } catch {
    return fallback;
  }
}

const CSS = `
.rfiWs > .k-page { max-width: none; }
.rfiCq { container: rfiws / inline-size; min-width: 0; }
.rfiSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.rfiSplit > * { min-width: 0; }
@container rfiws (min-width: 1080px) {
  .rfiSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.rfiDetailCq { container: rfidetail / inline-size; min-width: 0; }
.rfiDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.rfiDetail > * { min-width: 0; }
.rfiRail { order: -1; }
@container rfidetail (min-width: 720px) {
  .rfiDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .rfiRail { order: 0; position: sticky; top: 16px; }
}
.rfiList .k-table th:first-child, .rfiList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.rfiList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.rfiList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.rfiList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.rfiList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.rfiNum { color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; }
.rfiSubj { display: flex; align-items: center; gap: 6px; max-width: 420px; min-width: 0; }
.rfiSubj > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--text-primary); font-weight: 600; }
.rfiBadges { display: inline-flex; align-items: center; gap: 6px; }
.rfiLate { color: var(--status-overdue); font-weight: 700; }
.rfiMuted { color: var(--text-tertiary); }
.rfiSection { display: flex; flex-direction: column; gap: 8px; }
.rfiSection + .rfiSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.rfiSectionTitle { font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.rfiProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.rfiActions { display: flex; flex-direction: column; gap: 8px; }
.rfiActions .k-btn { width: 100%; justify-content: flex-start; }
.rfiActionsRow { display: flex; gap: 8px; align-items: center; }
.rfiActionsRow > .k-btn { flex: 1 1 auto; }
.rfiNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.rfiInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); }
.rfiSeg[aria-pressed="true"] { border-color: var(--border-strong); background: rgba(255,255,255,0.12); color: var(--text-primary); }
.rfiSeg[data-urgent="true"][aria-pressed="true"] { border-color: var(--status-overdue); color: var(--status-overdue); }
.rfiFormBtns { display: flex; gap: 8px; flex-wrap: wrap; }
.rfiDateInput { width: 100%; }
@media (max-width: 640px) {
  .rfiWs .k-btn, .rfiWs .k-stat, .rfiWs select.k-select, .rfiWs .k-input { min-height: 44px; }
  .rfiWs .k-table td { height: 48px; }
  .rfiSubj { max-width: 220px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

export default function RFIsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answeredBy, setAnsweredBy] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const { toast, show } = useToast(4000);
  const rights = useEditRights('RFIs');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  // Selection + the full single-record read behind the detail workspace.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RFIDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRef = useRef<HTMLDivElement>(null);

  // Assign / ball-in-court
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignName, setAssignName] = useState('');
  const [assignDue, setAssignDue] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);

  // Create form
  const [fSubject, setFSubject] = useState('');
  const [fQuestion, setFQuestion] = useState('');
  const [fSpecSection, setFSpecSection] = useState('');
  const [fDueDate, setFDueDate] = useState('');
  const [fAssignedTo, setFAssignedTo] = useState('');
  const [fAssignedOther, setFAssignedOther] = useState('');
  const [fUrgent, setFUrgent] = useState(false);

  // Project intelligence — the create form walks in knowing the architect,
  // the sub roster, and the RFI cadence. One /api/project-context snapshot.
  const { ctx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ due?: boolean; assignee?: boolean }>({});

  // Assignee default: the architect from the (cached) snapshot — prev-guarded,
  // so it never stomps what the GC typed.
  useEffect(() => {
    const architect = ctx?.defaults?.architectName || ctx?.project?.architectName || '';
    if (architect) setFAssignedTo(prev => { if (!prev) { setAuto(a => ({ ...a, assignee: true })); return architect; } return prev; });
  }, [ctx]);
  useEffect(() => {
    // Response due: +7 days is the standard contract turnaround. Always editable.
    setFDueDate(prev => { if (!prev) { setAuto(a => ({ ...a, due: true })); return isoPlusDays(7); } return prev; });
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetch(`/api/rfis/list?projectId=${projectId}`);
      if (!r.ok) throw new Error(await readError(r, 'Could not load RFIs.'));
      const d = await r.json();
      setRfis(d.rfis ?? []);
    } catch (e: unknown) {
      setLoadError((e as Error).message || 'Could not load RFIs.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Background revalidate — reconciles server truth after an optimistic write
  // without flipping the log back into its skeleton state.
  const revalidate = useCallback(async () => {
    try {
      const r = await fetch(`/api/rfis/list?projectId=${projectId}`);
      if (!r.ok) return;
      const d = await r.json();
      setRfis(d.rfis ?? []);
    } catch { /* background refresh — keep the optimistic rows */ }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    setDetail(null);
    setDetailError('');
    if (id.startsWith('temp-')) return; // not on the server yet
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/rfis/${id}`);
      if (!r.ok) throw new Error(await readError(r, 'Could not load this RFI record.'));
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDetail((d.rfi ?? null) as RFIDetail | null);
    } catch (e: unknown) {
      setDetailError((e as Error).message || 'Could not load this RFI record.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else { setDetail(null); setDetailError(''); }
  }, [selectedId, loadDetail]);

  const selected = selectedId ? rfis.find(r => r.id === selectedId) ?? null : null;

  // Keep a selected optimistic row selected once the server swaps in its real id.
  useEffect(() => {
    if (selectedId && !selected && !loading) setSelectedId(null);
  }, [selectedId, selected, loading]);

  function selectRfi(rfi: RFI) {
    if (selectedId !== rfi.id) {
      setAnsweringId(null);
      setAssigningId(null);
    }
    setSelectedId(rfi.id);
    // Stacked layouts: bring the detail into view instead of leaving it below the fold.
    requestAnimationFrame(() => {
      const el = detailRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  const totalCount = rfis.length;
  const openCount = rfis.filter(r => (r.status || 'open') === 'open').length;
  const answeredCount = rfis.filter(r => r.status === 'answered').length;
  const inReviewCount = rfis.filter(r => IN_REVIEW.has(r.status)).length;
  const overdueCount = rfis.filter(r => r.is_overdue).length;
  const closedRfis = rfis.filter(r => r.status === 'closed');
  const timedClosed = closedRfis.filter(r => r.answered_at || r.closed_at);
  const avgTurnaround = timedClosed.length ? Math.round(timedClosed.reduce((s, r) => s + daysOpen(r), 0) / timedClosed.length) : 0;

  // SmartCreate intelligence — ctx snapshot + the live log
  const subs: any[] = ctx?.subs || [];
  const architectName = ctx?.defaults?.architectName || ctx?.project?.architectName || '';
  const nextRfiNumber = totalCount + 1;
  const oldestOpenDays = rfis.filter(r => r.status === 'open').reduce((m, r) => Math.max(m, daysOpen(r)), 0);
  const specDiv = (CSI_DIVISIONS as Record<string, { name: string }>)[fSpecSection.slice(0, 2)] ? fSpecSection.slice(0, 2) : '';

  // Distinct ball-in-court holders for the assignee filter.
  const assigneeOptions = Array.from(new Set(rfis.map(ballInCourt).filter(Boolean))).sort();

  const filteredRfis = rfis.filter(rfi => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (rfi.subject || '').toLowerCase().includes(q)
        || (rfi.question || '').toLowerCase().includes(q)
        || (rfi.spec_section || '').toLowerCase().includes(q)
        || String(rfi.rfi_number).includes(q.replace(/^#/, ''));
      if (!hit) return false;
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') { if (!rfi.is_overdue) return false; }
      else if (statusFilter === 'in_review') { if (!IN_REVIEW.has(rfi.status)) return false; }
      else if ((rfi.status || 'open') !== statusFilter) return false;
    }
    if (assigneeFilter !== 'all' && ballInCourt(rfi) !== assigneeFilter) return false;
    return true;
  });

  const filtersActive = !!search || statusFilter !== 'all' || assigneeFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setAssigneeFilter('all'); };
  const toggleStatus = (f: StatusFilter) => setStatusFilter(prev => (prev === f ? 'all' : f));

  /* ── Unsaved-work protection (R14): the create form arms the guard once any
   *    field differs from its seeded default (the architect assignee and the
   *    +7-day due date never count on their own). ── */
  const createDirty = showForm && (
    !!fSubject.trim() || !!fQuestion.trim() || !!fSpecSection.trim() ||
    !!fAssignedOther.trim() || fUrgent ||
    (!!fDueDate && fDueDate !== isoPlusDays(7)) ||
    (!!fAssignedTo && fAssignedTo !== architectName)
  );
  const guard = useUnsavedGuard({
    dirty: createDirty,
    draftKey: `rfi:${projectId}`,
    draftData: { fSubject, fQuestion, fSpecSection, fDueDate, fAssignedTo, fAssignedOther, fUrgent },
    restoreDraft: (d) => {
      const dr = d as { fSubject?: string; fQuestion?: string; fSpecSection?: string; fDueDate?: string; fAssignedTo?: string; fAssignedOther?: string; fUrgent?: boolean };
      if (dr.fSubject !== undefined) setFSubject(dr.fSubject);
      if (dr.fQuestion !== undefined) setFQuestion(dr.fQuestion);
      if (dr.fSpecSection !== undefined) setFSpecSection(dr.fSpecSection);
      if (dr.fDueDate) setFDueDate(dr.fDueDate);
      if (dr.fAssignedTo) setFAssignedTo(dr.fAssignedTo);
      if (dr.fAssignedOther !== undefined) setFAssignedOther(dr.fAssignedOther);
      if (dr.fUrgent !== undefined) setFUrgent(dr.fUrgent);
      setShowForm(true);
    },
    onSave: () => submitRFI(),
  });

  /** Every close path for the create modal (X, Cancel, Esc, backdrop) runs through the guard. */
  function closeCreate() {
    guard.requestClose(() => { setShowForm(false); setFormError(''); });
  }

  function openCreate() {
    setFormError('');
    setShowForm(true);
  }

  // Photo-sheet shortcut (?new=1) lands in the new-RFI form.
  useOpenOnNew(openCreate, !loading);
  // Search hit (?open=<id>) lands on that RFI's detail.
  useOpenRecord((id) => { const r = rfis.find(x => x.id === id); if (r) selectRfi(r); }, !loading);

  /** POST the RFI — shared by the modal submit and the guard's "Save & leave".
   *  Optimistic: the row lands and the modal closes instantly; returns true
   *  once the server confirms. */
  async function submitRFI(): Promise<boolean> {
    if (!fSubject.trim()) { setFormError('Subject is required.'); return false; }
    const assignedName = (fAssignedTo === '__other' ? fAssignedOther.trim() : fAssignedTo) || '';
    const tempId = `temp-${Date.now()}`;
    const optimistic: RFI = {
      id: tempId, rfi_number: nextRfiNumber, subject: fSubject, question: fQuestion,
      spec_section: fSpecSection, status: 'open', submitted_by: '',
      due_date: fDueDate || null, answer: null, answered_by: null,
      ball_in_court: assignedName || null, assigned_to_name: assignedName || null,
      /* Mirror what the POST below sends, so the optimistic row shows the
         urgent badge immediately instead of only after the refetch. */
      priority: fUrgent ? 'high' : 'medium', is_urgent: fUrgent,
      is_overdue: false, created_at: new Date().toISOString(),
    };
    setRfis(prev => [...prev, optimistic]);
    setFSubject(''); setFQuestion(''); setFSpecSection(''); setFAssignedOther(''); setFUrgent(false);
    setFDueDate(isoPlusDays(7));
    setFAssignedTo(ctx?.defaults?.architectName || ctx?.project?.architectName || '');
    setShowForm(false);
    setSaving(true);
    setFormError('');
    try {
      const r = await fetch('/api/rfis/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, subject: fSubject, question: fQuestion, specSection: fSpecSection, dueDate: fDueDate || undefined,
          assignedToName: assignedName || undefined,
          isUrgent: fUrgent,
          priority: fUrgent ? 'high' : 'medium',
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.rfi) {
        setRfis(prev => prev.map(x => (x.id === tempId ? d.rfi : x)));
        setSelectedId(prev => (prev === tempId ? d.rfi.id : prev));
      }
      guard.clearDraft();
      show(`${rfiRef(d.rfi?.rfi_number ?? nextRfiNumber)} created.`);
      revalidate();
      return true;
    } catch (e: unknown) {
      // Rollback + reopen with the typed values intact — input is never lost.
      setRfis(prev => prev.filter(x => x.id !== tempId));
      setFSubject(fSubject); setFQuestion(fQuestion); setFSpecSection(fSpecSection); setFAssignedOther(fAssignedOther); setFUrgent(fUrgent);
      setFDueDate(fDueDate);
      setFAssignedTo(fAssignedTo);
      setShowForm(true);
      setFormError((e as Error).message || 'Failed to create RFI.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswer(rfiId: string) {
    if (!answerText.trim()) return;
    // Optimistic patch — the RFI flips to answered instantly; rollback if the server disagrees.
    const prevRfi = rfis.find(x => x.id === rfiId);
    setRfis(prev => prev.map(x => (x.id === rfiId ? { ...x, status: 'answered', answer: answerText, answered_by: answeredBy || null, is_overdue: false } : x)));
    setAnsweringId(null);
    setAnswerText('');
    setAnsweredBy('');
    setSubmittingAnswer(true);
    try {
      const r = await fetch(`/api/rfis/${rfiId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText, answeredBy, projectId }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      show('Answer submitted.');
      revalidate();
    } catch (e: unknown) {
      // Rollback + reopen the answer form with the typed values intact.
      if (prevRfi) setRfis(prev => prev.map(x => (x.id === rfiId ? prevRfi : x)));
      setAnsweringId(rfiId);
      setAnswerText(answerText);
      setAnsweredBy(answeredBy);
      show((e as Error).message || 'Failed to submit answer.', 'bad');
    } finally {
      setSubmittingAnswer(false);
    }
  }

  async function submitAssign(rfiId: string) {
    if (!assignName.trim() && !assignDue) return;
    // Optimistic patch — ball-in-court and due date move instantly; rollback if the server disagrees.
    const prevRfi = rfis.find(x => x.id === rfiId);
    setRfis(prev => prev.map(x => (x.id === rfiId ? {
      ...x,
      ...(assignName.trim() ? { assigned_to_name: assignName.trim(), ball_in_court: assignName.trim() } : {}),
      ...(assignDue ? { due_date: assignDue } : {}),
    } : x)));
    setAssigningId(null);
    setAssignName('');
    setAssignDue('');
    setSavingAssign(true);
    try {
      const payload: Record<string, unknown> = {};
      if (assignName.trim()) {
        payload.assigned_to_name = assignName.trim();
        payload.ball_in_court = assignName.trim();
      }
      if (assignDue) payload.due_date = assignDue;
      const r = await fetch(`/api/rfis/${rfiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      show('RFI reassigned. The ball is in their court.');
      revalidate();
    } catch (e: unknown) {
      // Rollback + reopen the assign form with the typed values intact.
      if (prevRfi) setRfis(prev => prev.map(x => (x.id === rfiId ? prevRfi : x)));
      setAssigningId(rfiId);
      setAssignName(assignName);
      setAssignDue(assignDue);
      show((e as Error).message || 'Failed to reassign RFI.', 'bad');
    } finally {
      setSavingAssign(false);
    }
  }

  /** Close out an RFI through the same PATCH route reassign uses. */
  async function closeRfi(rfi: RFI) {
    const ok = await confirmDialog({
      title: `Close ${rfiRef(rfi.rfi_number)}?`,
      message: 'It moves to Closed and drops out of overdue tracking.',
      confirmLabel: 'Close RFI',
    });
    if (!ok) return;
    const prevRfi = rfi;
    setRfis(prev => prev.map(x => (x.id === rfi.id ? { ...x, status: 'closed', is_overdue: false } : x)));
    setAnsweringId(null);
    setAssigningId(null);
    try {
      const r = await fetch(`/api/rfis/${rfi.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed', closed_at: new Date().toISOString() }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not close the RFI.');
      show(`${rfiRef(rfi.rfi_number)} closed.`);
      revalidate();
    } catch (e: unknown) {
      setRfis(prev => prev.map(x => (x.id === rfi.id ? prevRfi : x)));
      show((e as Error).message || 'Could not close the RFI. Please try again.', 'bad');
    }
  }

  async function deleteRfi(rfi: RFI) {
    if (!(await confirmDialog({ title: 'Please confirm', message: `Delete ${rfiRef(rfi.rfi_number)}? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    setRfis(prev => prev.filter(r => r.id !== rfi.id));
    if (selectedId === rfi.id) setSelectedId(null);
    try {
      const res = await fetch(`/api/rfis/${rfi.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      show(`${rfiRef(rfi.rfi_number)} deleted.`);
    } catch {
      show('Could not delete the RFI. Please try again.', 'bad');
      load();
    }
  }

  function startAnswer(rfi: RFI) {
    selectRfi(rfi);
    setAnsweringId(rfi.id);
    setAnswerText('');
    setAnsweredBy('');
    setAssigningId(null);
  }

  function startAssign(rfi: RFI) {
    selectRfi(rfi);
    setAssigningId(rfi.id);
    setAssignName(ballInCourt(rfi));
    setAssignDue(rfi.due_date || '');
    setAnsweringId(null);
  }

  /** The record's verbs — shared by the row overflow and the rail. */
  function rfiActions(rfi: RFI): Action[] {
    const s = rfi.status || 'open';
    const temp = rfi.id.startsWith('temp-');
    return [
      { label: 'Open Details', icon: <Question size={15} />, onClick: () => selectRfi(rfi) },
      { label: 'Open full page', icon: <ArrowSquareOut size={15} />, href: `/app/projects/${projectId}/items/rfis/${rfi.id}`, hidden: temp },
      { label: 'Answer', icon: <ChatText size={15} />, onClick: () => startAnswer(rfi), hidden: !ANSWERABLE(s), disabled: temp },
      { label: 'Reassign', icon: <UserSwitch size={15} />, onClick: () => startAssign(rfi), disabled: temp },
      { label: 'Close RFI', icon: <CheckCircle size={15} />, onClick: () => closeRfi(rfi), hidden: s === 'closed', disabled: temp },
      { label: 'Delete', icon: <Trash size={15} />, onClick: () => deleteRfi(rfi), tone: 'danger', disabled: temp },
    ];
  }

  // ── Stat tiles: each opens the log filtered to that slice ──
  const stats: StatItem[] = loading
    ? [
        { label: 'Open', value: '—', sub: 'Loading…' },
        { label: 'Overdue', value: '—', sub: 'Loading…' },
        { label: 'Answered', value: '—', sub: 'Loading…' },
        { label: 'Closed', value: '—', sub: 'Loading…' },
      ]
    : [
        { label: 'Open', value: openCount, sub: statusFilter === 'open' ? 'Filtered — tap to clear' : oldestOpenDays > 0 ? `Oldest ${oldestOpenDays}d${inReviewCount > 0 ? ` · ${inReviewCount} in review` : ''}` : inReviewCount > 0 ? `${inReviewCount} in review` : 'None waiting', onClick: () => toggleStatus('open'), active: statusFilter === 'open' },
        { label: 'Overdue', value: overdueCount, tone: overdueCount > 0 ? 'bad' : 'default', sub: statusFilter === 'overdue' ? 'Filtered — tap to clear' : overdueCount > 0 ? 'Past the response date' : 'All on time', onClick: () => toggleStatus('overdue'), active: statusFilter === 'overdue' },
        { label: 'Answered', value: answeredCount, tone: answeredCount > 0 ? 'good' : 'default', sub: statusFilter === 'answered' ? 'Filtered — tap to clear' : answeredCount > 0 ? 'Ready to close' : 'None waiting to close', onClick: () => toggleStatus('answered'), active: statusFilter === 'answered' },
        { label: 'Closed', value: closedRfis.length, sub: statusFilter === 'closed' ? 'Filtered — tap to clear' : avgTurnaround > 0 ? `Avg ${avgTurnaround}d to answer` : `of ${totalCount} total`, onClick: () => toggleStatus('closed'), active: statusFilter === 'closed' },
      ];

  // ── List columns: full log, or a compact log beside the detail workspace ──
  const numberCol: Column<RFI> = {
    key: 'rfi_number', header: 'RFI #', accessor: r => r.rfi_number, width: 96,
    render: r => <span className="rfiNum" data-sel={r.id === selectedId ? 'true' : undefined}>{rfiNo(r.rfi_number)}</span>,
  };
  const subjectCol: Column<RFI> = {
    key: 'subject', header: 'Subject', accessor: r => (r.subject || '').toLowerCase(),
    render: r => (
      <div className="rfiSubj">
        <span title={r.subject}>{r.subject || 'Untitled RFI'}</span>
        {hasRadioEvidence({ question: r.question }) && (
          <Waveform size={14} weight="fill" aria-label="Filed from Saguaro Radio" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
        )}
      </div>
    ),
  };
  const bicCol: Column<RFI> = {
    key: 'bic', header: 'Ball in Court', accessor: r => ballInCourt(r).toLowerCase(),
    render: r => { const b = ballInCourt(r); return b ? <span style={{ color: 'var(--text-primary)' }}>{b}</span> : r.status === 'closed' ? null : <span className="rfiMuted">Unassigned</span>; },
  };
  const dueCol: Column<RFI> = {
    key: 'due_date', header: 'Due Date', accessor: r => r.due_date || '', width: 124,
    render: r => <span className={r.is_overdue ? 'rfiLate' : undefined} style={{ whiteSpace: 'nowrap' }}>{r.due_date ? fmtDate(r.due_date) : null}</span>,
  };
  const daysCol: Column<RFI> = {
    key: 'days', header: 'Days Open', accessor: r => daysOpen(r), align: 'right',
    render: r => <span className="rfiMuted">{daysOpen(r)}d</span>,
  };
  const statusCol: Column<RFI> = {
    key: 'status', header: 'Status', accessor: r => rfiStatus(r).label,
    render: r => {
      const st = rfiStatus(r);
      return (
        <span className="rfiBadges">
          <Badge tone={st.tone}>{st.label}</Badge>
          {/* Urgent only matters while the RFI is still waiting on an answer. */}
          {isUrgent(r) && ANSWERABLE(r.status || 'open') && <Badge tone="neutral"><Lightning size={11} weight="fill" /> Urgent</Badge>}
        </span>
      );
    },
  };
  const columns: Column<RFI>[] = selected
    ? [numberCol, subjectCol, dueCol, statusCol]
    : [numberCol, subjectCol, bicCol, dueCol, daysCol, statusCol];

  // ── Detail workspace pieces ──
  const selStatus = selected ? (selected.status || 'open') : 'open';
  const selDef = MODULES.rfis?.statuses?.[selStatus];
  const radioFromText = selected && hasRadioEvidence({ question: selected.question }) ? radioProvenanceFromText(selected.question) : null;
  const radioFromRecord = detail ? radioEvidenceFromRecord(detail) : null;
  const radioSource = radioFromRecord ?? radioFromText;

  const detailValue = (v: React.ReactNode): React.ReactNode =>
    detailLoading ? <span className="rfiMuted">Loading…</span>
      : detailError ? <span className="rfiMuted">Unavailable</span>
      : v;

  const costImpact = (() => {
    if (!detail || detail.cost_impact == null || detail.cost_impact === '') return null;
    const n = Number(detail.cost_impact);
    if (!Number.isFinite(n)) return null;
    const dir = detail.cost_impact_direction ? ` · ${String(detail.cost_impact_direction).replace(/_/g, ' ')}` : '';
    return `${money.format(n)}${dir}`;
  })();
  const scheduleImpact = detail && detail.schedule_impact_days != null
    ? `${detail.schedule_impact_days} ${Math.abs(Number(detail.schedule_impact_days)) === 1 ? 'day' : 'days'}`
    : null;

  const answerForm = selected && answeringId === selected.id && (
    <div className="rfiSection">
      <div className="rfiSectionTitle">Answer / Response</div>
      <Field label="Answer" required>
        <Textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={4} placeholder="Type the answer…" autoFocus />
      </Field>
      <Field label="Answered By">
        <Input value={answeredBy} onChange={e => setAnsweredBy(e.target.value)} placeholder="Your name" />
      </Field>
      <div className="rfiFormBtns">
        <Button variant="primary" onClick={() => submitAnswer(selected.id)} disabled={submittingAnswer || !answerText.trim()}>
          {submittingAnswer ? 'Saving…' : 'Submit Answer'}
        </Button>
        <Button variant="ghost" onClick={() => { setAnsweringId(null); setAnswerText(''); setAnsweredBy(''); }}>Cancel</Button>
      </div>
    </div>
  );

  const assignForm = selected && assigningId === selected.id && (
    <div className="rfiSection">
      <div className="rfiSectionTitle">Reassign</div>
      <FormGrid cols={2}>
        <Field label="Ball in Court (Assignee)">
          <Input value={assignName} onChange={e => setAssignName(e.target.value)} placeholder="e.g. Jane Architect / ACME Design" autoFocus />
        </Field>
        <Field label="Due Date">
          <div className="rfiDateInput"><SaguaroDatePicker value={assignDue} onChange={setAssignDue} style={DATE_INPUT_STYLE} /></div>
        </Field>
      </FormGrid>
      <div className="rfiFormBtns">
        <Button variant="primary" onClick={() => submitAssign(selected.id)} disabled={savingAssign || (!assignName.trim() && !assignDue)}>
          {savingAssign ? 'Saving…' : 'Save Assignment'}
        </Button>
        <Button variant="ghost" onClick={() => { setAssigningId(null); setAssignName(''); setAssignDue(''); }}>Cancel</Button>
      </div>
    </div>
  );

  const detailWorkspace = selected && (
    <div ref={detailRef} className="rfiDetailCq">
      <div className="rfiDetail">
        <Card
          title={<>{rfiRef(selected.rfi_number)} — {selected.subject || 'Untitled RFI'}</>}
          subtitle={selected.spec_section ? `Spec ${selected.spec_section}` : undefined}
          actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close details" title="Close details" onClick={() => setSelectedId(null)} />}
        >
          <div className="rfiSection">
            <div className="rfiSectionTitle">Question</div>
            {stripRadioProvenance(selected.question)
              ? <div className="rfiProse">{stripRadioProvenance(selected.question)}</div>
              : <div className="rfiMuted" style={{ fontSize: 'var(--fs-sm)' }}>No question text was entered.</div>}
          </div>

          {selected.answer && (
            <div className="rfiSection">
              <div className="rfiSectionTitle">Answer{selected.answered_by ? ` — ${selected.answered_by}` : ''}</div>
              <div className="rfiProse">{selected.answer}</div>
            </div>
          )}

          {answerForm}
          {assignForm}

          {detail?.impact_description && (
            <div className="rfiSection">
              <div className="rfiSectionTitle">Impact Notes</div>
              <div className="rfiProse">{String(detail.impact_description)}</div>
            </div>
          )}

          {/* The voice behind an RFI promoted from a radio transmission: paints from
              the headline the list row carries, upgrades to the structured
              provenance in the record's attachments once the detail read lands. */}
          {radioFromText && (
            <div className="rfiSection">
              {radioSource && <RadioEvidence source={radioSource} title="Voice on the Record" />}
              {detailLoading && <div className="rfiMuted" style={{ fontSize: 'var(--fs-sm)' }}>Loading the radio evidence…</div>}
              {!detailLoading && !detailError && detail && !radioFromRecord && (
                <div className="rfiMuted" style={{ fontSize: 'var(--fs-sm)' }}>This RFI no longer carries the radio provenance that was filed with it.</div>
              )}
            </div>
          )}
        </Card>

        <aside className="rfiRail" aria-label="RFI details and actions">
          <Card title="Details">
            <div className="rfiSection">
              <div className="rfiBadges">
                <Badge tone={rfiStatus(selected).tone} dot>{rfiStatus(selected).label}</Badge>
                {isUrgent(selected) && ANSWERABLE(selStatus) && <Badge tone="neutral"><Lightning size={11} weight="fill" /> Urgent</Badge>}
              </div>
              {selDef?.action && <div className="rfiNext">{selDef.action}.</div>}
            </div>
            <div className="rfiSection">
              <DetailList items={[
                ['Ball in Court', ballInCourt(selected) || (selStatus === 'closed' ? '' : 'Unassigned')],
                ['Due', <span key="due" className={selected.is_overdue ? 'rfiLate' : undefined}>{fmtDate(selected.due_date)}</span>],
                ['Days Open', `${daysOpen(selected)}d`],
                ['Cost Impact', detailValue(costImpact ?? '—')],
                ['Schedule Impact', detailValue(scheduleImpact ?? '—')],
                ['Spec Section', selected.spec_section || ''],
                ['Drawing', detailValue(detail?.drawing_reference ? String(detail.drawing_reference) : '—')],
                ['Submitted By', selected.submitted_by || ''],
                ['Created', fmtDate(selected.created_at)],
              ].filter(([, v]) => v != null && v !== '' && v !== '—') as [string, React.ReactNode][]} />
              {detailError && (
                <div className="rfiInlineErr" role="alert">
                  <WarningCircle size={15} /> {detailError}
                  <Button size="sm" variant="ghost" icon={<ArrowClockwise size={14} />} onClick={() => loadDetail(selected.id)}>Retry</Button>
                </div>
              )}
            </div>
            <div className="rfiSection">
              <div className="rfiActions">
                {ANSWERABLE(selStatus) && (
                  <Button icon={<ChatText size={16} />} onClick={() => startAnswer(selected)} disabled={selected.id.startsWith('temp-') || answeringId === selected.id}>
                    Answer / Respond
                  </Button>
                )}
                <div className="rfiActionsRow">
                  <Button icon={<UserSwitch size={16} />} onClick={() => startAssign(selected)} disabled={selected.id.startsWith('temp-') || assigningId === selected.id}>
                    Reassign
                  </Button>
                  <RowActions actions={[
                    { label: 'Open PDF', icon: <FilePdf size={15} />, href: detail?.pdf_url ? String(detail.pdf_url) : undefined, hidden: !detail?.pdf_url },
                    { label: 'Delete', icon: <Trash size={15} />, onClick: () => deleteRfi(selected), tone: 'danger', disabled: selected.id.startsWith('temp-') },
                  ]} />
                </div>
                {selStatus !== 'closed' && (
                  <Button icon={<CheckCircle size={16} />} onClick={() => closeRfi(selected)} disabled={selected.id.startsWith('temp-')}>
                    Close RFI
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );

  // ── List body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (loadError) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22} />}
        title="Couldn't load RFIs"
        text={`${loadError} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15} />} onClick={load}>Retry</Button>}
      />
    );
  } else if (!loading && rfis.length === 0) {
    listBody = (
      <EmptyState
        icon={<Question size={22} />}
        title="No RFIs yet"
        text="Create a Request for Information when you need clarification on plans, specs, or project details."
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={openCreate}>Create First RFI</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        columns={columns}
        rows={filteredRfis}
        rowKey={r => r.id}
        loading={loading}
        onRowClick={selectRfi}
        rowActions={rfiActions}
        tableId="project-rfis"
        exportName="rfis"
        bulkEdit={itemBulkEdit<RFI>('rfis', {
          allowed: rights.edit,
          canDelete: rights.full,
          deleteUrl: r => `/api/rfis/${r.id}`,
          people: rfis.map(ballInCourt),
          onDone: () => { void revalidate(); },
        })}
        empty={
          <EmptyState
            icon={<Question size={22} />}
            title="No RFIs match these filters"
            action={<Button onClick={clearFilters}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  return (
    <div className="rfiWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` },
          { label: 'RFIs' },
        ]}
        title="RFIs"
        subtitle={ctx?.project?.name || undefined}
        actions={
          <Button variant="primary" data-tour="create-rfi" icon={<Plus size={15} weight="bold" />} onClick={openCreate}>
            New RFI
          </Button>
        }
      >
        {!loadError && <StatRow items={stats} />}

        {!loading && !loadError && rfis.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by number, subject, or spec section…"
            filters={
              <>
                <Select
                  aria-label="Status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  style={{ width: 'auto', minWidth: 160 }}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'open', label: 'Open' },
                    { value: 'overdue', label: 'Overdue' },
                    { value: 'in_review', label: 'In Review' },
                    { value: 'answered', label: 'Answered' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                />
                {assigneeOptions.length > 0 && (
                  <Select
                    aria-label="Ball in Court"
                    value={assigneeFilter}
                    onChange={e => setAssigneeFilter(e.target.value)}
                    style={{ width: 'auto', minWidth: 160, maxWidth: 260 }}
                    options={[{ value: 'all', label: 'Anyone' }, ...assigneeOptions]}
                  />
                )}
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
          />
        )}

        <div className="rfiCq">
          <div className="rfiSplit" data-open={selected ? 'true' : 'false'}>
            <div className="rfiList">
              <Card flush>{listBody}</Card>
            </div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      <FormModal
        open={showForm}
        onClose={closeCreate}
        title="New RFI"
        subtitle={`#${nextRfiNumber} on this project · ${openCount} open${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}${subs.length > 0 ? ` · ${subs.length} subs on the roster` : ''}`}
        onSubmit={async () => { await submitRFI(); }}
        submitLabel="Submit RFI"
        busy={saving}
        error={formError}
      >
        <FormGrid cols={2}>
          <Field label="Subject" required span hint="Keep it one line — the subject is what the architect scans in their inbox.">
            <Input value={fSubject} onChange={e => { setFSubject(e.target.value); if (formError) setFormError(''); }} placeholder="e.g. Clarify footing depth at grid A-3" autoFocus aria-invalid={formError === 'Subject is required.' || undefined} />
          </Field>
          <Field label="RFI Number" hint="Next in the project sequence — confirmed at submit.">
            <Input value={`#${nextRfiNumber}`} readOnly />
          </Field>
          <Field label="Response Due" hint={auto.due && fDueDate === isoPlusDays(7) ? 'Defaulted to +7 days — overdue tracking runs against this date.' : 'Overdue tracking runs against this date.'}>
            <div className="rfiDateInput"><SaguaroDatePicker value={fDueDate} onChange={setFDueDate} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Spec Section" hint="Pick the division to stamp its MasterFormat prefix, then refine to the exact section.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Select
                aria-label="CSI division"
                value={specDiv}
                onChange={e => { const code = e.target.value; setFSpecSection(code ? `${code} 00 00` : ''); }}
                placeholder="CSI division…"
                options={Object.entries(CSI_DIVISIONS).map(([code, d]) => ({ value: code, label: `Div ${code} — ${(d as { name: string }).name}` }))}
              />
              <Input aria-label="Spec section" value={fSpecSection} onChange={e => setFSpecSection(e.target.value)} placeholder="e.g. 03 30 00" />
            </div>
          </Field>
          <Field
            label="Assign To — Ball in Court"
            hint={architectName
              ? (auto.assignee && fAssignedTo === architectName ? `Defaulted to ${architectName} — the architect of record answers most RFIs.` : `${architectName} is the architect of record.`)
              : 'Architect, owner rep, or any sub from the awarded roster.'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Select
                aria-label="Assign to"
                value={fAssignedTo}
                onChange={e => setFAssignedTo(e.target.value)}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...(architectName ? [{ value: architectName, label: `${architectName} — Architect` }] : []),
                  ...subs.map(s => ({ value: String(s.companyName ?? ''), label: `${s.companyName}${s.trade ? ` — ${s.trade}` : ''}` })),
                  { value: '__other', label: 'Other — type a name…' },
                ]}
              />
              {fAssignedTo === '__other' && (
                <Input aria-label="Assignee name" value={fAssignedOther} onChange={e => setFAssignedOther(e.target.value)} placeholder="Name or company" autoFocus />
              )}
            </div>
          </Field>
          <Field label="Urgency" span hint={fUrgent ? 'Flagged urgent — priority is raised and the responder sees it first.' : 'Urgent raises priority and flags the record for the responder.'}>
            <div className="rfiFormBtns" role="group" aria-label="Urgency">
              <Button className="rfiSeg" aria-pressed={!fUrgent} onClick={() => setFUrgent(false)}>Standard</Button>
              <Button className="rfiSeg" data-urgent="true" aria-pressed={fUrgent} icon={<Lightning size={13} weight="fill" />} onClick={() => setFUrgent(true)}>Urgent</Button>
            </div>
          </Field>
          <Field label="Question / Description" span hint="Reference sheets and grid lines — precise questions come back answered, not re-asked.">
            <Textarea value={fQuestion} onChange={e => setFQuestion(e.target.value)} rows={5} placeholder="Describe the question in detail…" />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay (z 10000) so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
