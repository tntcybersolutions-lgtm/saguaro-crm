'use client';
/**
 * Project Safety — incidents, toolbox talks and corrective actions on the kit.
 *
 * Anatomy: title + one primary action (Report Incident) → StatRow (OSHA
 * recordables, near misses, open incidents, open actions, days incident-free;
 * tiles jump to the matching tab + filter) → Tabs (Incidents / Toolbox Talks /
 * Corrective Actions), each a DataTable. Every composer is a FormModal.
 *
 * Every read / write is the one this screen already used:
 *   incidents  GET  /api/projects/[id]/safety
 *   report     POST /api/safety/incidents/create  (+ best-effort corrective action)
 *   actions    GET/POST /api/projects/[id]/safety/corrective-actions
 *   advance    PATCH /api/projects/[id]/safety/corrective-actions/[actionId]
 *   talks      GET/POST /api/safety/talks
 *   JHA        POST /api/documents/jha  (opens the returned PDF)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiErrorFrom } from '@/lib/api-refusal';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, Tabs, DataTable, EmptyState, Callout,
  FormModal, Field, Input, Textarea, Select, FormGrid, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  ShieldCheck, CheckCircle, Warning, FilePdf, Plus, ArrowRight, Wrench,
  ChalkboardTeacher, UsersThree, FirstAid, Eye, Timer,
} from '@phosphor-icons/react';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import { usePeople } from '@/lib/hooks/usePeople';
import { personName } from '@/lib/person-names';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';

interface Incident {
  id: string;
  date: string;
  type: string;
  description: string;
  severity: string;
  corrective_action: string;
  status: string;
  project_id: string;
}

interface CorrectiveAction {
  id: string;
  description: string;
  assigned_to: string;
  due_date: string;
  status: string;
  verification_date?: string;
  verified_by?: string;
  incident_id?: string;
  created_at?: string;
  project_id?: string;
}

const TYPES = ['Near Miss', 'First Aid', 'Recordable', 'Lost Time'];

// OSHA 29 CFR 1904: recordable = beyond first aid. Of this incident taxonomy,
// Recordable and Lost Time land on the 300 log; Near Miss / First Aid do not.
const OSHA_RECORDABLE_TYPES = ['Recordable', 'Lost Time'];
const isOshaRecordable = (i: { type?: string; severity?: string }) =>
  OSHA_RECORDABLE_TYPES.includes(String(i.type)) || OSHA_RECORDABLE_TYPES.includes(String(i.severity));

// Toolbox talk topic suggestions — OSHA focus-four first.
const TALK_TOPICS = [
  'Fall Protection', 'Ladder Safety', 'Struck-By Hazards', 'Caught-In / Between',
  'Electrical Safety', 'Trenching & Excavation', 'Heat Illness Prevention', 'PPE',
  'Silica Dust', 'Scaffold Safety', 'Hand & Power Tools', 'Housekeeping & Fire Prevention',
];

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

interface ToolboxTalk {
  id: string;
  topic: string;
  conducted_by: string;
  attendee_count: number;
  talk_date: string;
  notes: string;
}

const SEVERITY_BADGE: Record<string, BadgeTone> = {
  'Near Miss': 'lead',
  'First Aid': 'lead',
  'Recordable': 'overdue',
  'Lost Time': 'overdue',
};

const STATUS_BADGE: Record<string, BadgeTone> = {
  Open: 'overdue',
  Resolved: 'completed',
};

const CA_STATUS_BADGE: Record<string, BadgeTone> = {
  open: 'neutral',
  in_progress: 'lead',
  verified: 'completed',
  closed: 'completed',
};

const CA_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  verified: 'Verified',
  closed: 'Closed',
};

const CA_STATUS_FLOW: Record<string, string> = {
  open: 'in_progress',
  in_progress: 'verified',
  verified: 'closed',
};

const EMPTY_FORM = { date: '', type: 'Near Miss', description: '', severity: 'Near Miss', corrective_action: '' };

// The API returns raw safety_incidents rows (incident_date / corrective_actions)
// that don't match this page's display fields (date / corrective_action).
// Normalize so a saved incident's date renders on reload instead of going blank.
function normalizeIncident(r: Record<string, unknown>): Incident {
  return {
    id: String(r.id ?? ''),
    date: String((r.date as string) ?? (r.incident_date as string) ?? ''),
    type: String(r.type ?? ''),
    description: String(r.description ?? ''),
    severity: String(r.severity ?? ''),
    corrective_action: String((r.corrective_action as string) ?? (r.corrective_actions as string) ?? ''),
    status: String(r.status ?? 'Open'),
    project_id: String(r.project_id ?? ''),
  };
}

const EMPTY_CA_FORM = { description: '', assigned_to: '', due_date: '' };

type TabKey = 'incidents' | 'talks' | 'actions';
type CaFilter = 'all' | 'open' | 'in_progress' | 'verified' | 'closed' | 'overdue';

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

const CSS = `
.sfWs > .k-page { max-width: none; }
.sfMuted { color: var(--text-tertiary); }
.sfClamp { display: inline-block; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.sfBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sfLate { color: var(--status-overdue); font-weight: 700; }
.sfGap { margin-bottom: 16px; }
@media (max-width: 640px) {
  .sfWs .k-btn, .sfWs .k-stat, .sfWs select.k-select, .sfWs .k-input { min-height: 44px; }
  .sfWs .k-table td { height: 48px; }
  .sfClamp { max-width: 200px; }
}
`;

export default function SafetyPage() {
  const { projectId } = useParams() as { projectId: string };
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `safety-incident:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleSave(),
  });
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast(4000);
  /** Shared composer error (shown in whichever FormModal is open). */
  const [errorMsg, setErrorMsg] = useState('');
  const [tab, setTab] = useState<TabKey>('incidents');
  // Distinct from "no incidents": the read itself failed, so we know nothing
  // about this project's safety record and must not imply a clean one.
  const [loadError, setLoadError] = useState('');

  // Corrective Actions state
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  // Assignees by name — the column can hold a user id (lib/person-names).
  const people = usePeople(actions.flatMap(a => [a.assigned_to, a.verified_by]));
  const [actionsLoading, setActionsLoading] = useState(true);
  const [showCAForm, setShowCAForm] = useState(false);
  const [caForm, setCaForm] = useState(EMPTY_CA_FORM);
  const [caSaving, setCaSaving] = useState(false);

  // Toolbox talks state
  const [talks, setTalks] = useState<ToolboxTalk[]>([]);
  const [showTalkForm, setShowTalkForm] = useState(false);
  const [talkForm, setTalkForm] = useState({ topic: '', conducted_by: '', attendee_count: '', talk_date: '', notes: '' });
  const [talkSaving, setTalkSaving] = useState(false);

  // Project intelligence — one snapshot; forms walk in knowing the roster.
  const { ctx } = useProjectContext(projectId);
  const [auto, setAuto] = useState<{ incDate?: boolean; talkDate?: boolean; presenter?: boolean; attendees?: boolean; caDue?: boolean }>({});
  // Incident log filters.
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState('all');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('all');
  const [oshaFilter, setOshaFilter] = useState<'all' | 'recordable'>('all');
  const [caFilter, setCaFilter] = useState<CaFilter>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/safety`);
      const json = await res.json().catch(() => ({}));
      // fetch() does not reject on 4xx/5xx — without this check a failed read
      // fell through to an empty array and rendered as a clean safety log.
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setIncidents((json.incidents || []).map(normalizeIncident));
    } catch (e) {
      setIncidents([]);
      setLoadError(e instanceof Error ? e.message : 'Could not load safety data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchActions = useCallback(async () => {
    setActionsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions`);
      const json = await res.json();
      setActions(json.actions || []);
    } catch {
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  }, [projectId]);

  const fetchTalks = useCallback(async () => {
    try {
      const res = await fetch(`/api/safety/talks?projectId=${projectId}`);
      const json = await res.json();
      setTalks(Array.isArray(json.talks) ? json.talks.map((t: Record<string, unknown>) => ({
        id: String(t.id ?? ''),
        topic: String(t.topic ?? ''),
        conducted_by: String(t.conducted_by ?? t.presenter ?? ''),
        attendee_count: Number(t.attendee_count) || 0,
        talk_date: String(t.talk_date ?? ''),
        notes: String(t.notes ?? t.content ?? ''),
      })) : []);
    } catch {
      setTalks([]);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); fetchActions(); fetchTalks(); }, [fetchData, fetchActions, fetchTalks]);

  const openCount = incidents.filter(i => i.status === 'Open').length;

  const openActionsCount = actions.filter(a => a.status === 'open' || a.status === 'in_progress').length;
  const overdueActionsCount = actions.filter(a => {
    if (a.status === 'closed' || a.status === 'verified') return false;
    if (!a.due_date) return false;
    return new Date(a.due_date) < new Date();
  }).length;

  const lastIncident = incidents
    .filter(i => i.severity !== 'Near Miss')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  /* With nothing recordable on file the clock runs from the job's start (to its
     closeout once the job is closed) — a clean job is not "0 days" incident-free. */
  const jobStart = (ctx?.project?.startDate as string | null) || null;
  const jobClosed = /closed|complete/i.test(String(ctx?.project?.status || ''));
  const jobEnd = jobClosed ? ((ctx?.project?.closeoutDate as string | null) || (ctx?.project?.endDate as string | null) || null) : null;
  const dayDiff = (from: string, to?: string | null) => Math.max(0, Math.floor(((to ? new Date(`${to.slice(0, 10)}T12:00:00`).getTime() : Date.now()) - new Date(`${from.slice(0, 10)}T12:00:00`).getTime()) / 86400000));
  const daysSinceLast: number | null = lastIncident
    ? dayDiff(lastIncident.date, jobEnd)
    : jobStart ? dayDiff(jobStart, jobEnd) : null;

  const recordables = incidents.filter(isOshaRecordable).length;
  const nearMisses = incidents.filter(i => i.type === 'Near Miss' || i.severity === 'Near Miss').length;
  const lastTalk = talks[0] || null;
  const subCount = (ctx?.subs || []).length;

  // The pending report is OSHA-recordable when its type or severity says so —
  // shown live in the form and stamped onto the row at save.
  const formIsRecordable = isOshaRecordable(form);

  // Toolbar-driven view of the incident log; stats still read the full list.
  const qS = incidentSearch.trim().toLowerCase();
  const filteredIncidents = incidents.filter(i => {
    if (incidentStatusFilter !== 'all' && i.status !== incidentStatusFilter) return false;
    if (incidentTypeFilter !== 'all' && i.type !== incidentTypeFilter) return false;
    if (oshaFilter === 'recordable' && !isOshaRecordable(i)) return false;
    if (!qS) return true;
    return [i.description, i.type, i.severity, i.corrective_action].some(v => String(v || '').toLowerCase().includes(qS));
  });

  // Prefilled report flow: incident date defaults to today.
  function openIncident() {
    setForm({ ...EMPTY_FORM, date: localIso(new Date()) });
    setAuto(a => ({ ...a, incDate: true }));
    setShowForm(true);
    setErrorMsg('');
  }

  // Prefilled toolbox talk: today's date, last presenter, last headcount.
  function openTalk() {
    setTalkForm({
      topic: '',
      conducted_by: lastTalk?.conducted_by || '',
      attendee_count: lastTalk?.attendee_count ? String(lastTalk.attendee_count) : '',
      talk_date: localIso(new Date()),
      notes: '',
    });
    setAuto(a => ({ ...a, talkDate: true, presenter: !!lastTalk?.conducted_by, attendees: !!lastTalk?.attendee_count }));
    setShowTalkForm(true);
    setErrorMsg('');
  }

  // Prefilled corrective action: due a week out.
  function openCA() {
    const due = new Date(Date.now() + 7 * 86400000);
    setCaForm({ ...EMPTY_CA_FORM, due_date: localIso(due) });
    setAuto(a => ({ ...a, caDue: true }));
    setShowCAForm(true);
    setErrorMsg('');
  }

  async function handleLogTalk() {
    if (!talkForm.topic) { setErrorMsg('Talk topic is required.'); return; }
    setTalkSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/safety/talks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          topic: talkForm.topic,
          conducted_by: talkForm.conducted_by,
          attendee_count: Number(talkForm.attendee_count) || 0,
          talk_date: talkForm.talk_date || localIso(new Date()),
          notes: talkForm.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.talk) throw new Error(json.error || 'Create failed');
      setTalks(prev => [{
        id: String(json.talk.id ?? ''),
        topic: String(json.talk.topic ?? talkForm.topic),
        conducted_by: String(json.talk.presenter ?? talkForm.conducted_by),
        attendee_count: Number(json.talk.attendee_count) || 0,
        talk_date: String(json.talk.talk_date ?? talkForm.talk_date),
        notes: String(json.talk.content ?? talkForm.notes),
      }, ...prev]);
      setShowTalkForm(false);
      show('Toolbox talk logged.');
      setTimeout(() => show(''), 4000);
    } catch {
      setErrorMsg('Could not log the toolbox talk. Please try again.');
    } finally {
      setTalkSaving(false);
    }
  }

  async function handleSave(): Promise<boolean> {
    if (!form.description || !form.date) { setErrorMsg('Date and description are required.'); return false; }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/safety/incidents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'Open', osha_recordable: formIsRecordable, near_miss: form.type === 'Near Miss', ...form }),
      });
      const json = await res.json();
      if (!res.ok || !json.incident) throw new Error(json.error || 'Create failed');
      const newIncident = normalizeIncident(json.incident);
      setIncidents(prev => [newIncident, ...prev]);

      // Auto-create corrective action if corrective_action text is provided.
      // Best-effort: the incident is already saved, so a CA failure doesn't fail the report.
      if (form.corrective_action && form.corrective_action.trim()) {
        try {
          const caRes = await fetch(`/api/projects/${projectId}/safety/corrective-actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: form.corrective_action,
              incident_id: newIncident.id,
              due_date: '',
              assigned_to: '',
            }),
          });
          const caJson = await caRes.json();
          if (caRes.ok && caJson.action) {
            setActions(prev => [caJson.action, ...prev]);
          }
        } catch { /* incident saved; corrective action is best-effort */ }
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      show('Incident reported.');
      setTimeout(() => show(''), 4000);
      guard.clearDraft();
      return true;
    } catch {
      setErrorMsg('Could not report the incident. Please try again.');
    } finally {
      setSaving(false);
    }
    return false;
  }

  async function handleCreateCA() {
    if (!caForm.description) { setErrorMsg('Corrective action description is required.'); return; }
    setCaSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caForm),
      });
      const json = await res.json();
      if (!res.ok || !json.action) throw new Error(json.error || 'Create failed');
      setActions(prev => [json.action as CorrectiveAction, ...prev]);
      setShowCAForm(false);
      setCaForm(EMPTY_CA_FORM);
      show('Corrective action created.');
      setTimeout(() => show(''), 4000);
    } catch {
      setErrorMsg('Could not create the corrective action. Please try again.');
    } finally {
      setCaSaving(false);
    }
  }

  async function handleAdvanceCAStatus(action: CorrectiveAction) {
    const nextStatus = CA_STATUS_FLOW[action.status];
    if (!nextStatus) return;
    setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: nextStatus } : a));
    try {
      const res = await fetch(`/api/projects/${projectId}/safety/corrective-actions/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw await apiErrorFrom(res, 'update failed');
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, ...json.action, status: nextStatus } : a));
      show(`Action updated to ${CA_STATUS_LABELS[nextStatus]}.`);
    } catch {
      show('Could not update the corrective action. Please try again.', 'bad');
      fetchActions();
    }
  }

  async function handleGenerateJHA() {
    try {
      const res = await fetch('/api/documents/jha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json().catch(() => ({}));
      const link = json.pdfUrl || json.url;
      if (!res.ok || !link) throw new Error(json.error || 'no document returned');
      window.open(link, '_blank');
    } catch {
      show('Could not generate the JHA. Please try again.', 'bad');
    }
  }

  function isOverdue(action: CorrectiveAction): boolean {
    if (action.status === 'closed' || action.status === 'verified') return false;
    if (!action.due_date) return false;
    return new Date(action.due_date) < new Date();
  }

  const base = `/app/projects/${projectId}`;
  const closeIncident = () => guard.requestClose(() => { setShowForm(false); setErrorMsg(''); });
  const closeTalk = () => { if (!talkSaving) { setShowTalkForm(false); setErrorMsg(''); } };
  const closeCA = () => { if (!caSaving) { setShowCAForm(false); setErrorMsg(''); } };
  const goIncidents = (patch: () => void) => { setTab('incidents'); patch(); };
  const goActions = (f: CaFilter) => { setTab('actions'); setCaFilter(prev => (prev === f ? 'all' : f)); };

  // ── Stat tiles — each opens the matching tab and filter ──
  const unknown = loading || !!loadError;
  const stats: StatItem[] = [
    {
      label: 'OSHA Recordables', value: unknown ? '—' : recordables, icon: <FirstAid size={15} />,
      tone: unknown ? 'default' : recordables > 0 ? 'bad' : 'good',
      sub: loading ? 'Loading…' : loadError ? 'Unknown' : recordables > 0 ? 'On the 300 log' : 'Clean 300 log',
      onClick: () => goIncidents(() => setOshaFilter(p => (p === 'recordable' ? 'all' : 'recordable'))),
      active: tab === 'incidents' && oshaFilter === 'recordable',
    },
    {
      label: 'Near Misses', value: unknown ? '—' : nearMisses, icon: <Eye size={15} />,
      tone: !unknown && nearMisses > 0 ? 'warn' : 'default',
      sub: loading ? 'Loading…' : 'Leading indicator',
      onClick: () => goIncidents(() => setIncidentTypeFilter(p => (p === 'Near Miss' ? 'all' : 'Near Miss'))),
      active: tab === 'incidents' && incidentTypeFilter === 'Near Miss',
    },
    {
      label: 'Open Incidents', value: unknown ? '—' : openCount, icon: <Warning size={15} />,
      tone: !unknown && openCount > 0 ? 'bad' : 'default',
      sub: loading ? 'Loading…' : `${incidents.length} reported`,
      onClick: () => goIncidents(() => setIncidentStatusFilter(p => (p === 'Open' ? 'all' : 'Open'))),
      active: tab === 'incidents' && incidentStatusFilter === 'Open',
    },
    {
      label: 'Open Actions', value: actionsLoading ? '—' : openActionsCount, icon: <Wrench size={15} />,
      tone: actionsLoading ? 'default' : overdueActionsCount > 0 ? 'bad' : openActionsCount > 0 ? 'warn' : 'default',
      sub: actionsLoading ? 'Loading…' : overdueActionsCount > 0 ? `${overdueActionsCount} overdue` : 'None overdue',
      onClick: () => goActions(overdueActionsCount > 0 ? 'overdue' : 'open'),
      active: tab === 'actions' && (caFilter === 'overdue' || caFilter === 'open'),
    },
    {
      label: 'Days Incident-Free', value: unknown || daysSinceLast === null ? '—' : daysSinceLast, icon: <Timer size={15} />,
      tone: !unknown && daysSinceLast !== null && daysSinceLast > 30 ? 'good' : 'default',
      sub: loading ? 'Loading…' : lastIncident ? `Since ${fmtDate(lastIncident.date)}` : jobStart ? (jobEnd ? 'Start to closeout' : 'Since the job started') : 'No start date on the job',
    },
  ];

  // ── Incident log ──
  const incidentColumns: Column<Incident>[] = [
    { key: 'description', header: 'Description', primary: true, phone: 'show', accessor: i => i.description || '', render: i => <span className="sfClamp" title={i.description}>{i.description || '—'}</span> },
    { key: 'date', header: 'Date', phone: 'show', accessor: i => i.date || '', render: i => <span className="sfMuted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.date)}</span> },
    { key: 'type', header: 'Type', phone: 'hide', render: i => i.type || null },
    { key: 'osha', header: 'OSHA', accessor: i => (isOshaRecordable(i) ? 'Recordable' : ''), render: i => isOshaRecordable(i) ? <Badge tone="overdue">Recordable</Badge> : null },
    { key: 'severity', header: 'Severity', phone: 'hide', render: i => <Badge tone={SEVERITY_BADGE[i.severity] || 'neutral'}>{i.severity || '—'}</Badge> },
    { key: 'status', header: 'Status', phone: 'show', render: i => <Badge tone={STATUS_BADGE[i.status] || 'neutral'} dot>{i.status || '—'}</Badge> },
  ];
  const incidentFiltersActive = !!incidentSearch || incidentTypeFilter !== 'all' || incidentStatusFilter !== 'all' || oshaFilter !== 'all';
  const clearIncidentFilters = () => { setIncidentSearch(''); setIncidentTypeFilter('all'); setIncidentStatusFilter('all'); setOshaFilter('all'); };

  let incidentBody: React.ReactNode;
  if (!loading && loadError) {
    incidentBody = (
      <EmptyState
        icon={<Warning size={22} />}
        title="Couldn't load the incident log"
        text={`This is not a clean safety record — the read failed, so this project's incidents are unknown. ${loadError}`}
        action={<Button onClick={fetchData}>Try again</Button>}
      />
    );
  } else if (!loading && incidents.length === 0) {
    incidentBody = (
      <EmptyState
        icon={<CheckCircle size={22} />}
        title="No incidents recorded"
        text={subCount > 0 ? `${subCount} sub crew${subCount === 1 ? '' : 's'} on site. Report near misses too.` : 'Report near misses too.'}
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={openIncident}>Report a Near Miss</Button>}
      />
    );
  } else {
    incidentBody = (
      <DataTable<Incident>
        tableId="project-safety-incidents"
        exportName="safety-incidents"
        columns={incidentColumns}
        rows={filteredIncidents}
        rowKey={i => i.id}
        loading={loading}
        defaultSort={{ key: 'date', dir: 'desc' }}
        empty={<EmptyState title="No incidents match these filters" action={<Button onClick={clearIncidentFilters}>Clear filters</Button>} />}
      />
    );
  }

  // ── Toolbox talks ──
  const talkColumns: Column<ToolboxTalk>[] = [
    { key: 'topic', header: 'Topic', primary: true, phone: 'show', render: t => t.topic || null },
    { key: 'talk_date', header: 'Date', phone: 'show', accessor: t => t.talk_date || '', render: t => <span className="sfMuted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.talk_date)}</span> },
    { key: 'conducted_by', header: 'Presenter', render: t => t.conducted_by || null },
    { key: 'attendee_count', header: 'Attendees', align: 'right', phone: 'show', total: 'sum', accessor: t => t.attendee_count, render: t => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UsersThree size={13} />{t.attendee_count}</span> },
    { key: 'notes', header: 'Notes', phone: 'hide', render: t => t.notes ? <span className="sfClamp sfMuted" title={t.notes}>{t.notes}</span> : null },
  ];

  // ── Corrective actions ──
  const filteredActions = actions.filter(a => {
    if (caFilter === 'all') return true;
    if (caFilter === 'overdue') return isOverdue(a);
    return a.status === caFilter;
  });
  const actionColumns: Column<CorrectiveAction>[] = [
    { key: 'description', header: 'Description', primary: true, phone: 'show', render: a => <span className="sfClamp" title={a.description}>{a.description || '—'}</span> },
    { key: 'assigned_to', header: 'Assigned To', render: a => personName(a.assigned_to, people) || <span className="sfMuted">Unassigned</span> },
    {
      key: 'due_date', header: 'Due Date', phone: 'show', accessor: a => a.due_date || '',
      render: a => isOverdue(a)
        ? <span className="sfBadges"><span className="sfLate">{fmtDate(a.due_date)}</span><Badge tone="overdue">Overdue</Badge></span>
        : <span className="sfMuted">{a.due_date ? fmtDate(a.due_date) : 'No date'}</span>,
    },
    { key: 'status', header: 'Status', phone: 'show', accessor: a => CA_STATUS_LABELS[a.status] || a.status, render: a => <Badge tone={CA_STATUS_BADGE[a.status] || 'neutral'} dot>{CA_STATUS_LABELS[a.status] || a.status}</Badge> },
  ];
  const actionVerbs = (a: CorrectiveAction): Action[] => {
    const nextStatus = CA_STATUS_FLOW[a.status];
    return [
      { label: nextStatus ? `Move to ${CA_STATUS_LABELS[nextStatus]}` : 'Complete', icon: nextStatus ? <ArrowRight size={14} weight="bold" /> : <CheckCircle size={14} />, onClick: () => handleAdvanceCAStatus(a), inline: true, hidden: !nextStatus },
    ];
  };

  return (
    <div className="sfWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Safety' },
        ]}
        title="Safety"
        subtitle={ctx?.project?.name || undefined}
        actions={
          <>
            <Button variant="ghost" icon={<FilePdf size={15} weight="bold" />} onClick={handleGenerateJHA}>Generate JHA</Button>
            <Button icon={<ChalkboardTeacher size={15} weight="bold" />} onClick={openTalk}>Log Toolbox Talk</Button>
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openIncident}>Report Incident</Button>
          </>
        }
      >
        <StatRow items={stats} />

        <Tabs
          value={tab}
          onChange={k => setTab(k as TabKey)}
          tabs={[
            { key: 'incidents', label: 'Incidents', count: loading || loadError ? undefined : incidents.length },
            { key: 'talks', label: 'Toolbox Talks', count: talks.length },
            { key: 'actions', label: 'Corrective Actions', count: actionsLoading ? undefined : actions.length },
          ]}
        />

        {tab === 'incidents' && (
          <>
            {!loading && !loadError && incidents.length > 0 && (
              <Toolbar
                search={incidentSearch}
                onSearch={setIncidentSearch}
                placeholder="Search incidents…"
                filters={
                  <>
                    <Select aria-label="Type" value={incidentTypeFilter} onChange={e => setIncidentTypeFilter(e.target.value)} style={{ width: 'auto', minWidth: 150 }} options={[{ value: 'all', label: 'All Types' }, ...TYPES]} />
                    <Select aria-label="Status" value={incidentStatusFilter} onChange={e => setIncidentStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 150 }} options={[{ value: 'all', label: 'All Statuses' }, 'Open', 'Resolved']} />
                    <Select aria-label="OSHA" value={oshaFilter} onChange={e => setOshaFilter(e.target.value as 'all' | 'recordable')} style={{ width: 'auto', minWidth: 150 }} options={[{ value: 'all', label: 'All OSHA' }, { value: 'recordable', label: 'Recordable only' }]} />
                    {incidentFiltersActive && <Button variant="ghost" size="sm" onClick={clearIncidentFilters}>Clear</Button>}
                  </>
                }
              />
            )}
            <Card flush>{incidentBody}</Card>
          </>
        )}

        {tab === 'talks' && (
          <Card
            flush
            title="Toolbox Talks"
            subtitle={lastTalk ? `${talks.length} logged · last ${fmtDate(lastTalk.talk_date)}` : undefined}
            icon={<ChalkboardTeacher size={17} />}
            actions={<Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={openTalk}>Log Talk</Button>}
          >
            <DataTable<ToolboxTalk>
              tableId="project-safety-talks"
              exportName="toolbox-talks"
              columns={talkColumns}
              rows={talks}
              rowKey={t => t.id}
              defaultSort={{ key: 'talk_date', dir: 'desc' }}
              empty={
                <EmptyState
                  icon={<ChalkboardTeacher size={22} />}
                  title="No toolbox talks logged"
                  text={subCount > 0 ? `${subCount} sub crew${subCount === 1 ? '' : 's'} on this project.` : undefined}
                  action={<Button icon={<ChalkboardTeacher size={15} weight="bold" />} onClick={openTalk}>Log Toolbox Talk</Button>}
                />
              }
            />
          </Card>
        )}

        {tab === 'actions' && (
          <>
            {!actionsLoading && actions.length > 0 && (
              <Toolbar
                filters={
                  <Select
                    aria-label="Action status"
                    value={caFilter}
                    onChange={e => setCaFilter(e.target.value as CaFilter)}
                    style={{ width: 'auto', minWidth: 160 }}
                    options={[
                      { value: 'all', label: 'All Statuses' },
                      { value: 'open', label: 'Open' },
                      { value: 'in_progress', label: 'In Progress' },
                      { value: 'verified', label: 'Verified' },
                      { value: 'closed', label: 'Closed' },
                      { value: 'overdue', label: 'Overdue' },
                    ]}
                  />
                }
              />
            )}
            <Card
              flush
              title="Corrective Actions"
              subtitle={overdueActionsCount > 0 ? `${overdueActionsCount} overdue` : undefined}
              icon={<Wrench size={17} />}
              actions={<Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={openCA}>New Action</Button>}
            >
              <DataTable<CorrectiveAction>
                tableId="project-safety-actions"
                exportName="corrective-actions"
                columns={actionColumns}
                rows={filteredActions}
                rowKey={a => a.id}
                loading={actionsLoading}
                defaultSort={{ key: 'due_date', dir: 'asc' }}
                rowActions={actionVerbs}
                empty={actions.length === 0 ? (
                  <EmptyState
                    icon={<Wrench size={22} />}
                    title="No corrective actions"
                    action={<Button icon={<Plus size={15} weight="bold" />} onClick={openCA}>Add Corrective Action</Button>}
                  />
                ) : (
                  <EmptyState title="No actions match this filter" action={<Button onClick={() => setCaFilter('all')}>Clear filter</Button>} />
                )}
              />
            </Card>
          </>
        )}
      </PageShell>

      {/* ── Report Incident ── */}
      <FormModal
        open={showForm}
        onClose={closeIncident}
        title="Report Safety Incident"
        subtitle={ctx?.project?.name || undefined}
        onSubmit={async () => { await handleSave(); }}
        submitLabel="Report Incident"
        busy={saving}
        error={errorMsg || null}
      >
        <div className="sfGap">
          {formIsRecordable ? (
            <Callout
              tone="danger"
              icon={<Warning size={16} weight="bold" />}
              title="OSHA-recordable — flagged for the 300 log"
              text="Log within 7 calendar days. Fatalities within 8 hours, in-patient hospitalizations within 24."
            />
          ) : (
            <Callout tone="success" icon={<ShieldCheck size={16} weight="bold" />} title="Not OSHA-recordable" text="Saved for internal tracking only." />
          )}
        </div>
        <FormGrid cols={3}>
          <Field label="Date" required hint={auto.incDate ? 'Defaulted to today.' : undefined}>
            <div style={{ width: '100%' }}><SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Type" hint="Near Miss and First Aid stay off the 300 log.">
            <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} options={TYPES} />
          </Field>
          <Field label="Severity">
            <Select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} options={TYPES} />
          </Field>
          <Field label="Description" required span>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="What happened, who was involved, where on site…" />
          </Field>
          <Field label="Corrective Action" span hint="Creates a tracked corrective action linked to this incident.">
            <Textarea value={form.corrective_action} onChange={e => setForm(p => ({ ...p, corrective_action: e.target.value }))} rows={2} placeholder="What prevents a repeat…" />
          </Field>
        </FormGrid>
      </FormModal>

      {/* ── Log Toolbox Talk ── */}
      <FormModal
        open={showTalkForm}
        onClose={closeTalk}
        title="Log Toolbox Talk"
        subtitle={lastTalk ? `${talks.length} logged · last ${fmtDate(lastTalk.talk_date)}` : ctx?.project?.name || undefined}
        onSubmit={handleLogTalk}
        submitLabel="Log Talk"
        busy={talkSaving}
        error={errorMsg || null}
      >
        <FormGrid cols={2}>
          <Field label="Topic" required hint="OSHA focus-four first.">
            <Suggest className="k-input" value={talkForm.topic} onChange={e => setTalkForm(p => ({ ...p, topic: e.target.value }))} placeholder="e.g. Fall Protection" options={TALK_TOPICS} />
          </Field>
          <Field label="Date" hint={auto.talkDate ? 'Defaulted to today.' : undefined}>
            <div style={{ width: '100%' }}><SaguaroDatePicker value={talkForm.talk_date} onChange={v => setTalkForm(p => ({ ...p, talk_date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Presenter" hint={auto.presenter ? 'From the last talk.' : undefined}>
            <Input value={talkForm.conducted_by} onChange={e => setTalkForm(p => ({ ...p, conducted_by: e.target.value }))} placeholder="Who ran the talk" />
          </Field>
          <Field label="Attendees" hint={auto.attendees ? 'From the last talk.' : subCount > 0 ? `${subCount} sub crew${subCount === 1 ? '' : 's'} on the roster.` : undefined}>
            <Input type="number" min="0" inputMode="numeric" value={talkForm.attendee_count} onChange={e => setTalkForm(p => ({ ...p, attendee_count: e.target.value }))} placeholder="0" />
          </Field>
          <Field label="Notes" span>
            <Textarea value={talkForm.notes} onChange={e => setTalkForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Key points covered, questions raised…" />
          </Field>
        </FormGrid>
      </FormModal>

      {/* ── New Corrective Action ── */}
      <FormModal
        open={showCAForm}
        onClose={closeCA}
        title="New Corrective Action"
        subtitle={openActionsCount > 0 ? `${openActionsCount} open${overdueActionsCount > 0 ? `, ${overdueActionsCount} overdue` : ''}` : ctx?.project?.name || undefined}
        onSubmit={handleCreateCA}
        submitLabel="Create Action"
        busy={caSaving}
        error={errorMsg || null}
      >
        <FormGrid cols={2}>
          <Field label="Description" required span>
            <Textarea value={caForm.description} onChange={e => setCaForm(p => ({ ...p, description: e.target.value }))} rows={3} />
          </Field>
          <Field label="Assigned To" hint={subCount > 0 ? `${subCount} sub${subCount === 1 ? '' : 's'} on the roster.` : undefined}>
            <Suggest className="k-input" value={caForm.assigned_to} onChange={e => setCaForm(p => ({ ...p, assigned_to: e.target.value }))} placeholder="Name or email" options={((ctx?.subs || []) as { companyName?: string | null }[]).map((s) => s.companyName || '').filter(Boolean)} />
          </Field>
          <Field label="Due Date" hint={auto.caDue ? 'Defaulted to one week out.' : undefined}>
            <div style={{ width: '100%' }}><SaguaroDatePicker value={caForm.due_date} onChange={v => setCaForm(p => ({ ...p, due_date: v }))} style={DATE_INPUT_STYLE} /></div>
          </Field>
        </FormGrid>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
