'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { Badge, Table, T } from '@/components/ui/shell';
import {
  PremiumSurface, ModuleHero, SectionCard, PremiumEmpty,
  StatStrip, FlowSteps, FlowStrip, AutoChip,
  goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle, secondaryButtonStyle, railStyle
} from '@/components/ui/premium';
import {
  ShieldCheck, ClipboardText, CheckCircle, Warning,
  FilePdf, Plus, X, ArrowRight, Wrench,
  ChalkboardTeacher, UsersThree,
} from '@phosphor-icons/react';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import Suggest from '@/components/ui/Suggest';
import { StatusPill } from '@/components/ui/Status';

// Semantic accents — tuned to match the dashboard's Sonoran palette.
const GREEN = 'var(--success)';
const RED = 'var(--danger)';
const AMBER = 'var(--warning)';

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

const SEVERITY_BADGE: Record<string, 'amber' | 'gold' | 'red' | 'muted'> = {
  'Near Miss': 'amber',
  'First Aid': 'gold',
  'Recordable': 'red',
  'Lost Time': 'red',
};

const STATUS_BADGE: Record<string, 'red' | 'green' | 'muted'> = {
  Open: 'red',
  Resolved: 'green',
};

const CA_STATUS_BADGE: Record<string, 'red' | 'amber' | 'gold' | 'green' | 'muted'> = {
  open: 'red',
  in_progress: 'amber',
  verified: 'gold',
  closed: 'green',
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
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  // Distinct from "no incidents": the read itself failed, so we know nothing
  // about this project's safety record and must not imply a clean one.
  const [loadError, setLoadError] = useState('');

  // Corrective Actions state
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
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
  // ListToolbar state — filters persist per module via sag_flt_safety.
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState('all');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('all');

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
  const daysSinceLast = lastIncident
    ? Math.floor((Date.now() - new Date(lastIncident.date).getTime()) / 86400000)
    : incidents.length > 0
      ? Math.floor((Date.now() - new Date(incidents[0].date).getTime()) / 86400000)
      : 0;

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
      setSuccessMsg('Toolbox talk logged.');
      setTimeout(() => setSuccessMsg(''), 4000);
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
      setSuccessMsg('Incident reported.');
      setTimeout(() => setSuccessMsg(''), 4000);
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
      setSuccessMsg('Corrective action created.');
      setTimeout(() => setSuccessMsg(''), 4000);
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
      if (!res.ok) throw new Error('update failed');
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, ...json.action, status: nextStatus } : a));
      setSuccessMsg(`Action updated to ${CA_STATUS_LABELS[nextStatus]}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setErrorMsg('Could not update the corrective action. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
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
      setErrorMsg('Could not generate the JHA. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  }

  function isOverdue(action: CorrectiveAction): boolean {
    if (action.status === 'closed' || action.status === 'verified') return false;
    if (!action.due_date) return false;
    return new Date(action.due_date) < new Date();
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 12, color: 'var(--c-text-2)', marginTop: 5, lineHeight: 1.45 };

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Health & Safety'}
        eyebrowIcon={<ShieldCheck size={13} weight="fill" color="var(--text-secondary)" />}
        title="Safety"
        subtitle="Safety incidents, inspections, and OSHA records"
        actions={
          <>
            <button onClick={handleGenerateJHA} style={ghostButtonStyle} className="pmBtn">
              <FilePdf size={15} weight="bold" /> Generate JHA
            </button>
            <button onClick={() => { if (showTalkForm) { setShowTalkForm(false); setErrorMsg(''); } else { openTalk(); } }} style={goldOutlineButtonStyle} className="pmBtn">
              {showTalkForm ? <><X size={15} weight="bold" /> Cancel Talk</> : <><ChalkboardTeacher size={15} weight="bold" /> Log Toolbox Talk</>}
            </button>
            <button onClick={() => { if (showForm) { setShowForm(false); setErrorMsg(''); } else { openIncident(); } }} style={goldButtonStyle} className="pmBtn">
              {showForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> Report Incident</>}
            </button>
          </>
        }
      />

      {/* One summary: the indicators a PM watches — recordables, near misses, open incidents and actions, days incident-free */}
      {!loading && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/safety`,  label: 'OSHA Recordables', value: String(recordables), accent: recordables > 0 ? RED : GREEN, sub: recordables > 0 ? 'On the 300 log' : 'Clean 300 log' },
          {href: `/app/projects/${projectId}/safety`,  label: 'Near Misses', value: String(nearMisses), accent: nearMisses > 0 ? AMBER : undefined, sub: 'Leading indicator — keep reporting' },
          {href: `/app/projects/${projectId}/safety`,  label: 'Open', value: String(openCount), accent: openCount > 0 ? RED : undefined },
          {href: `/app/projects/${projectId}/safety`,  label: 'Open Actions', value: String(openActionsCount), accent: openActionsCount > 0 ? AMBER : undefined },
          {href: `/app/projects/${projectId}/safety`,  label: 'Overdue Actions', value: String(overdueActionsCount), accent: overdueActionsCount > 0 ? RED : undefined, sub: overdueActionsCount > 0 ? 'Needs attention' : undefined },
          {href: `/app/projects/${projectId}/safety`,  label: 'Days Incident-Free', value: String(daysSinceLast), accent: daysSinceLast > 30 ? GREEN : undefined, sub: lastIncident ? `Since ${fmtDate(lastIncident.date)}` : 'No recordable incidents' },
        ]} />
      )}

      {successMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(74,222,128,0.4)`, borderRadius: 10, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {errorMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: T.redDim, border: `1px solid rgba(248,113,113,0.4)`, borderRadius: 10, color: T.red, fontSize: 13 }}>{errorMsg}</div>
      )}

      {/* Create Incident Form */}
      {showForm && (
        <div className={ctx ? 'pmSplit' : undefined} style={railStyle(320, { gap: 18, alignItems: 'start', marginBottom: 20 })}>
          <SectionCard title="Report Safety Incident" icon={<Warning size={17} weight="duotone" color={RED} />} accent={RED}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={lbl}>Date *{auto.incDate && <AutoChip />}</label>
                <SaguaroDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} style={inp} />
                <div style={hint}>Defaulted to today — report the day it happened.</div>
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inp}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <div style={hint}>Near Miss and First Aid stay off the OSHA 300 log.</div>
              </div>
              <div>
                <label style={lbl}>Severity</label>
                <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} style={inp}>
                  {TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
                <div style={hint}>Drives the OSHA-recordable flag below.</div>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <div style={{ padding: '9px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, background: formIsRecordable ? 'rgba(248,113,113,0.10)' : 'rgba(74,222,128,0.08)', border: `1px solid ${formIsRecordable ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.3)'}`, color: formIsRecordable ? '#F0A092' : GREEN }}>
                  {formIsRecordable
                    ? 'OSHA-recordable: this incident will be flagged for the 300 log. Recordables generally must be logged within 7 calendar days; fatalities reported within 8 hours, in-patient hospitalizations within 24.'
                    : 'Not OSHA-recordable as classified — it will be saved for internal tracking and trend analysis only.'}
                </div>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={lbl}>Description *</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="What happened, who was involved, where on site…" />
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={lbl}>Corrective Action</label>
                <textarea value={form.corrective_action} onChange={e => setForm(p => ({ ...p, corrective_action: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="What prevents a repeat…" />
                <div style={hint}>Anything entered here auto-creates a tracked corrective action linked to this incident.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleSave} disabled={saving} className="pmBtn" style={{ ...goldButtonStyle, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Report Incident'}</button>
              <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>
          {ctx && (
            <SectionCard flat title="After You Report" icon={<ShieldCheck size={17} weight="duotone" color="var(--text-secondary)" />}>
              <FlowSteps title="" steps={[
                { title: 'Incident Enters the Log', desc: formIsRecordable ? 'Flagged OSHA-recordable for the 300 log.' : 'Saved for internal tracking and trends.' },
                { title: 'Corrective Action Opens', desc: 'The corrective-action text becomes a tracked item with its own status flow.' },
                { title: 'Verify and Close', desc: 'Advance Open to In Progress to Verified to Closed as the fix lands.' },
                { title: 'Stats Update Everywhere', desc: 'Days-incident-free and recordable counts refresh across the project.' },
              ]} />
            </SectionCard>
          )}
        </div>
      )}

      {/* Incidents Table */}
      <ListToolbar
        module="safety"
        search={incidentSearch}
        onSearch={setIncidentSearch}
        searchPlaceholder="Search incidents…"
        filters={[
          { key: 'type', label: 'Type', value: incidentTypeFilter, onChange: setIncidentTypeFilter, allLabel: 'All Types', options: [...TYPES] },
          { key: 'status', label: 'Status', value: incidentStatusFilter, onChange: setIncidentStatusFilter, allLabel: 'All Statuses', options: ['Open', 'Resolved'] },
        ]}
        count={{ shown: filteredIncidents.length, total: incidents.length }}
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 28 }}>
        <SectionCard
          title="Incident Log"
          subtitle="Reported safety incidents for this project"
          icon={<ClipboardText size={17} weight="duotone" color="var(--text-secondary)" />}
          flush
        >
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading…</div>
          ) : loadError ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Warning size={30} weight="duotone" color={RED} />
              <div style={{ marginTop: 12, color: T.white, fontSize: 15, fontWeight: 700 }}>
                Could not load the incident log
              </div>
              <div style={{ marginTop: 6, color: T.muted, fontSize: 13, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
                This is <strong>not</strong> a clean safety record — the read failed, so this
                project&apos;s incidents are unknown. {loadError}
              </div>
              <button onClick={fetchData} style={{ ...ghostButtonStyle, marginTop: 16 }} className="pmBtn">
                Retry
              </button>
            </div>
          ) : incidents.length === 0 ? (
            <PremiumEmpty
              icon={<CheckCircle size={30} weight="duotone" color={GREEN} />}
              title="No incidents recorded"
              description={`A clean log${subCount > 0 ? ` with ${subCount} sub crew${subCount === 1 ? '' : 's'} on site` : ''} — keep it that way by reporting near misses too: they are the leading indicator that prevents the recordable. Anything logged here flags OSHA-recordable automatically by type.`}
              action={<button onClick={openIncident} style={ghostButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Report a Near Miss</button>}
            />
          ) : (
            <Table
              headers={['Date', 'Type', 'OSHA', 'Description', 'Severity', 'Status']}
              rows={filteredIncidents.map(i => [
                <span key="d" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{i.date}</span>,
                i.type,
                <span key="osha" style={{ fontSize: 12, fontWeight: 800, color: isOshaRecordable(i) ? RED : T.muted }}>{isOshaRecordable(i) ? 'Recordable' : '—'}</span>,
                <span key="desc" style={{ maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.description}
                </span>,
                <Badge key="sev" label={i.severity} color={SEVERITY_BADGE[i.severity] || 'muted'} />,
                <StatusPill key="st" module="safety_incidents" status={i.status} size="sm" />,
              ])}
            />
          )}
        </SectionCard>
      </div>

      {/* Toolbox Talk form */}
      {showTalkForm && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="Log Toolbox Talk" icon={<ChalkboardTeacher size={17} weight="duotone" color="var(--text-secondary)" />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div>
                <label style={lbl}>Topic *</label>
                <Suggest value={talkForm.topic} onChange={e => setTalkForm(p => ({ ...p, topic: e.target.value }))} style={inp} placeholder="e.g. Fall Protection" options={TALK_TOPICS} />
                <div style={hint}>OSHA focus-four topics suggested first.</div>
              </div>
              <div>
                <label style={lbl}>Date{auto.talkDate && <AutoChip />}</label>
                <SaguaroDatePicker value={talkForm.talk_date} onChange={v => setTalkForm(p => ({ ...p, talk_date: v }))} style={inp} />
                <div style={hint}>Defaulted to today.</div>
              </div>
              <div>
                <label style={lbl}>Presenter{auto.presenter && <AutoChip />}</label>
                <input value={talkForm.conducted_by} onChange={e => setTalkForm(p => ({ ...p, conducted_by: e.target.value }))} style={inp} placeholder="Who ran the talk" />
                <div style={hint}>{auto.presenter ? 'Carried from the last talk.' : 'Usually the super or foreman.'}</div>
              </div>
              <div>
                <label style={lbl}>Attendees{auto.attendees && <AutoChip />}</label>
                <input type="number" min="0" value={talkForm.attendee_count} onChange={e => setTalkForm(p => ({ ...p, attendee_count: e.target.value }))} style={inp} placeholder="0" />
                <div style={hint}>{subCount > 0 ? `${subCount} sub crew${subCount === 1 ? '' : 's'} on the roster.` : 'Headcount at the talk.'}</div>
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <label style={lbl}>Notes</label>
                <textarea value={talkForm.notes} onChange={e => setTalkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Key points covered, questions raised…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleLogTalk} disabled={talkSaving} className="pmBtn" style={{ ...goldButtonStyle, opacity: talkSaving ? 0.5 : 1, cursor: talkSaving ? 'not-allowed' : 'pointer' }}>{talkSaving ? 'Logging…' : 'Log Talk'}</button>
              <button onClick={() => { setShowTalkForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Toolbox Talks log */}
      <div style={{ marginBottom: 28 }}>
        <SectionCard
          title="Toolbox Talks"
          subtitle={lastTalk ? `${talks.length} logged · last ${fmtDate(lastTalk.talk_date)}` : 'Weekly safety briefings for the crew'}
          icon={<ChalkboardTeacher size={17} weight="duotone" color="var(--text-secondary)" />}
          flush
        >
          {talks.length === 0 ? (
            <PremiumEmpty
              compact
              icon={<ChalkboardTeacher size={26} weight="duotone" color="var(--text-secondary)" />}
              title="No toolbox talks logged"
              description={`A five-minute weekly talk is the cheapest safety program there is${subCount > 0 ? ` — you have ${subCount} sub crew${subCount === 1 ? '' : 's'} on this project to cover` : ''}. Log the first one to start the cadence.`}
              action={<button onClick={openTalk} style={secondaryButtonStyle} className="pmBtn"><ChalkboardTeacher size={15} weight="bold" /> Log Toolbox Talk</button>}
            />
          ) : (
            <Table
              headers={['Date', 'Topic', 'Presenter', 'Attendees', 'Notes']}
              rows={talks.map(t => [
                <span key="d" style={{ color: T.muted, whiteSpace: 'nowrap' }}>{fmtDate(t.talk_date)}</span>,
                <span key="t" style={{ fontWeight: 600 }}>{t.topic}</span>,
                <span key="p" style={{ color: t.conducted_by ? T.white : T.muted }}>{t.conducted_by || '—'}</span>,
                <span key="a" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.muted }}><UsersThree size={13} color={T.muted} />{t.attendee_count}</span>,
                <span key="n" style={{ maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.muted }}>{t.notes || '—'}</span>,
              ])}
            />
          )}
        </SectionCard>
      </div>

      {/* Corrective Actions Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>Corrective Actions</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--c-text-2)' }}>Track and verify corrective actions from incidents</p>
        </div>
        <button onClick={() => { if (showCAForm) { setShowCAForm(false); setErrorMsg(''); } else { openCA(); } }} style={showCAForm ? ghostButtonStyle : secondaryButtonStyle} className="pmBtn">
          {showCAForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> New Action</>}
        </button>
      </div>

      {/* Create Corrective Action Form */}
      {showCAForm && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="New Corrective Action" icon={<Wrench size={17} weight="duotone" color="var(--text-secondary)" />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Description *</label>
                <textarea value={caForm.description} onChange={e => setCaForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div>
                <label style={lbl}>Assigned To</label>
                <Suggest value={caForm.assigned_to} onChange={e => setCaForm(p => ({ ...p, assigned_to: e.target.value }))} style={inp} placeholder="Name or email" options={((ctx?.subs || []) as { companyName?: string | null }[]).map((s) => s.companyName || '').filter(Boolean)} />
                <div style={hint}>{subCount > 0 ? `${subCount} sub${subCount === 1 ? '' : 's'} on the roster to pick from.` : 'Who owns the fix.'}</div>
              </div>
              <div>
                <label style={lbl}>Due Date{auto.caDue && <AutoChip />}</label>
                <SaguaroDatePicker value={caForm.due_date} onChange={v => setCaForm(p => ({ ...p, due_date: v }))} style={inp} />
                <div style={hint}>One week out by default — overdue flags itself.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={handleCreateCA} disabled={caSaving} className="pmBtn" style={{ ...goldButtonStyle, opacity: caSaving ? 0.5 : 1, cursor: caSaving ? 'not-allowed' : 'pointer' }}>{caSaving ? 'Creating…' : 'Create Action'}</button>
              <button onClick={() => { setShowCAForm(false); setErrorMsg(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Corrective Actions Table */}
      <div>
        <SectionCard flush>
          {actionsLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>Loading corrective actions…</div>
          ) : actions.length === 0 ? (
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                  <Wrench size={16} weight="duotone" color="var(--text-secondary)" style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                  No corrective actions
                  <span style={{ fontWeight: 400, color: 'var(--c-text-2)' }}>{showCAForm ? ' — describe the first one in the form above; the due date is already a week out.' : ' — incidents auto-create them, or add one directly.'}</span>
                </div>
                {!showCAForm && (
                  <button onClick={openCA} style={secondaryButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Corrective Action</button>
                )}
              </div>
              <FlowStrip steps={[
                { title: 'Open the Action', desc: 'From an incident or directly' },
                { title: 'Assign an Owner', desc: 'Sub roster type-ahead' },
                { title: 'Fix Lands', desc: 'Advance Open to In Progress' },
                { title: 'Verify and Close', desc: 'Overdue flags itself' },
              ]} />
            </div>
          ) : (
            <Table
              headers={['Description', 'Assigned To', 'Due Date', 'Status', 'Actions']}
              rows={actions.map(a => {
                const overdue = isOverdue(a);
                const nextStatus = CA_STATUS_FLOW[a.status];
                const nextLabel = nextStatus ? CA_STATUS_LABELS[nextStatus] : null;
                return [
                  <span key="desc" style={{ maxWidth: 280, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.description}
                  </span>,
                  <span key="assign" style={{ color: a.assigned_to ? T.white : T.muted }}>{a.assigned_to || 'Unassigned'}</span>,
                  <span key="due" style={{ color: overdue ? T.red : T.muted, fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {a.due_date || 'No date'}
                    {overdue && <StatusPill module="generic" status="overdue" size="sm" />}
                  </span>,
                  <Badge key="st" label={CA_STATUS_LABELS[a.status] || a.status} color={CA_STATUS_BADGE[a.status] || 'muted'} />,
                  <span key="action">
                    {nextLabel ? (
                      <button
                        onClick={() => handleAdvanceCAStatus(a)}
                        className="pmBtn"
                        style={{ ...ghostButtonStyle, padding: '5px 12px', fontSize: 12, borderRadius: 9, gap: 6 }}
                      >
                        <ArrowRight size={12} weight="bold" /> {nextLabel}
                      </button>
                    ) : (
                      <StatusPill module="generic" status="complete" size="sm" />
                    )}
                  </span>,
                ];
              })}
            />
          )}
        </SectionCard>
      </div>
      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
