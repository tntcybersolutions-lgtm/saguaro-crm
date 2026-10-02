'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { T, Badge, Btn, Table } from '@/components/ui/shell';
import {
  PremiumSurface,
  ModuleHero,
  SectionCard,
  StatCard,
  PremiumEmpty,
  goldButtonStyle,
  ghostButtonStyle,
  goldOutlineButtonStyle,
  StatStrip,
  FlowSteps,
  InsightRow,
  AutoChip,
  IconChip,
} from '@/components/ui/premium';
import { SkeletonKPI, SkeletonRow } from '@/components/ui/Skeleton';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { Question, WarningCircle, Clipboard, FolderOpen, CheckCircle, Clock, Trash, Plus, Lightning, Buildings } from '@phosphor-icons/react';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { moduleAccent } from '@/lib/module-identity';
import RadioEvidence, {
  RadioEvidenceChip,
  hasRadioEvidence,
  radioProvenanceFromText,
  radioEvidenceFromRecord,
  stripRadioProvenance,
  type RadioEvidenceSource,
} from '@/components/RadioEvidence';
import { StatusPill } from '@/components/ui/Status';

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
}

// Smart date default — +N days out, local ISO, always user-editable.
const isoPlusDays = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const STATUS_BADGE: Record<string, 'blue' | 'green' | 'muted' | 'red'> = {
  open: 'blue',
  answered: 'green',
  closed: 'muted',
  overdue: 'red',
};

export default function RFIsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answeredBy, setAnsweredBy] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  /* ── Radio evidence: an RFI promoted from a transmission carries the voice
   *    behind it. The list route returns a narrow column set (no attachments,
   *    no notes), so the row detects it from the headline the promote appends
   *    to `question`, and the full structured provenance is pulled from the
   *    RFI detail only when the user opens the card. ── */
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [evidenceSrc, setEvidenceSrc] = useState<RadioEvidenceSource | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');

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
    setError('');
    try {
      const r = await fetch(`/api/rfis/list?projectId=${projectId}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setRfis(d.rfis ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load RFIs');
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

  const totalCount = rfis?.length ?? 0;
  const openCount = rfis?.filter(r => r.status === 'open').length ?? 0;
  const answeredCount = rfis?.filter(r => r.status === 'answered').length ?? 0;
  const overdueCount = rfis?.filter(r => r.is_overdue).length ?? 0;

  // SmartCreate intelligence — ctx snapshot + the live log
  const subs: any[] = ctx?.subs || [];
  const architectName = ctx?.defaults?.architectName || ctx?.project?.architectName || '';
  const nextRfiNumber = totalCount + 1;
  const oldestOpenDays = rfis.filter(r => r.status === 'open').reduce((m, r) => Math.max(m, daysOpen(r)), 0);
  const specDiv = (CSI_DIVISIONS as Record<string, { name: string }>)[fSpecSection.slice(0, 2)] ? fSpecSection.slice(0, 2) : '';

  function daysOpen(rfi: RFI): number {
    const created = new Date(rfi.created_at || Date.now());
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  }

  function ballInCourt(rfi: RFI): string {
    return (rfi.ball_in_court || rfi.assigned_to_name || '').trim();
  }

  // Distinct ball-in-court holders for the assignee filter.
  const assigneeOptions = Array.from(
    new Set(rfis.map(ballInCourt).filter(Boolean))
  ).sort();

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
      else if ((rfi.status || 'open') !== statusFilter) return false;
    }
    if (assigneeFilter !== 'all' && ballInCourt(rfi) !== assigneeFilter) return false;
    return true;
  });

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

  /** Close paths for the create form (hero Cancel / footer Cancel) run through the guard. */
  function closeCreate() {
    guard.requestClose(() => { setShowForm(false); setError(''); });
  }

  /** POST the RFI — shared by the form button and the guard's "Save & leave".
   *  Optimistic: the row lands and the form closes instantly; returns true
   *  once the server confirms. */
  async function submitRFI(): Promise<boolean> {
    if (!fSubject.trim()) { setError('Subject is required'); return false; }
    // Optimistic create (house pattern: budget saveEdit) — the row lands in the
    // log and the form closes instantly; the network settles in the background.
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
    setError('');
    try {
      const r = await fetch('/api/rfis/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, subject: fSubject, question: fQuestion, specSection: fSpecSection, dueDate: fDueDate || undefined,
          assignedToName: (fAssignedTo === '__other' ? fAssignedOther.trim() : fAssignedTo) || undefined,
          isUrgent: fUrgent,
          priority: fUrgent ? 'high' : 'medium',
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.rfi) setRfis(prev => prev.map(x => (x.id === tempId ? d.rfi : x)));
      guard.clearDraft();
      revalidate();
      return true;
    } catch (e: unknown) {
      // Rollback + reopen with the typed values intact — input is never lost.
      setRfis(prev => prev.filter(x => x.id !== tempId));
      setFSubject(fSubject); setFQuestion(fQuestion); setFSpecSection(fSpecSection); setFAssignedOther(fAssignedOther); setFUrgent(fUrgent);
      setFDueDate(fDueDate);
      setFAssignedTo(fAssignedTo);
      setShowForm(true);
      setError((e as Error).message || 'Failed to create RFI');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswer(rfiId: string) {
    if (!answerText.trim()) return;
    // Optimistic patch (house pattern: budget saveEdit) — the RFI flips to
    // answered instantly; rollback + error banner if the server disagrees.
    const prevRfi = rfis.find(x => x.id === rfiId);
    setRfis(prev => prev.map(x => (x.id === rfiId ? { ...x, status: 'answered', answer: answerText, answered_by: answeredBy || null, is_overdue: false } : x)));
    setAnsweringId(null);
    setAnswerText('');
    setAnsweredBy('');
    setSuccessMsg('Answer submitted successfully.');
    setTimeout(() => setSuccessMsg(''), 4000);
    setSubmittingAnswer(true);
    try {
      const r = await fetch(`/api/rfis/${rfiId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText, answeredBy, projectId }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      revalidate();
    } catch (e: unknown) {
      // Rollback + reopen the answer form with the typed values intact.
      if (prevRfi) setRfis(prev => prev.map(x => (x.id === rfiId ? prevRfi : x)));
      setAnsweringId(rfiId);
      setAnswerText(answerText);
      setAnsweredBy(answeredBy);
      setSuccessMsg('');
      setError((e as Error).message || 'Failed to submit answer');
    } finally {
      setSubmittingAnswer(false);
    }
  }

  async function submitAssign(rfiId: string) {
    if (!assignName.trim() && !assignDue) return;
    // Optimistic patch (house pattern: budget saveEdit) — ball-in-court and due
    // date move instantly; rollback + error banner if the server disagrees.
    const prevRfi = rfis.find(x => x.id === rfiId);
    setRfis(prev => prev.map(x => (x.id === rfiId ? {
      ...x,
      ...(assignName.trim() ? { assigned_to_name: assignName.trim(), ball_in_court: assignName.trim() } : {}),
      ...(assignDue ? { due_date: assignDue } : {}),
    } : x)));
    setAssigningId(null);
    setAssignName('');
    setAssignDue('');
    setSuccessMsg('RFI assigned. Ball is now in their court.');
    setTimeout(() => setSuccessMsg(''), 4000);
    setSavingAssign(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      if (assignName.trim()) {
        payload.assigned_to_name = assignName.trim();
        payload.ball_in_court = assignName.trim();
        // Re-open if it had been answered/closed and the ball is being moved again.
      }
      if (assignDue) payload.due_date = assignDue;
      const r = await fetch(`/api/rfis/${rfiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      revalidate();
    } catch (e: unknown) {
      // Rollback + reopen the assign form with the typed values intact.
      if (prevRfi) setRfis(prev => prev.map(x => (x.id === rfiId ? prevRfi : x)));
      setAssigningId(rfiId);
      setAssignName(assignName);
      setAssignDue(assignDue);
      setSuccessMsg('');
      setError((e as Error).message || 'Failed to assign RFI');
    } finally {
      setSavingAssign(false);
    }
  }

  /** Open (or close) the radio-evidence card for one RFI. Read-only — nothing
   *  is written, and a failed detail read is reported, never faked. */
  async function openEvidence(rfi: RFI) {
    if (evidenceId === rfi.id) { setEvidenceId(null); return; }
    setAnsweringId(null);
    setAssigningId(null);
    setEvidenceId(rfi.id);
    // Paint instantly from the headline the list row already carries…
    setEvidenceSrc(radioProvenanceFromText(rfi.question));
    setEvidenceError('');
    setEvidenceLoading(true);
    try {
      // …then upgrade to the structured provenance stored in attachments jsonb,
      // which is the only place the radio message ID lives.
      const r = await fetch(`/api/rfis/${rfi.id}`);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not load this RFI record');
      const full = radioEvidenceFromRecord(d.rfi);
      if (full) setEvidenceSrc(full);
      else setEvidenceError('This RFI no longer carries the radio provenance that was filed with it.');
    } catch (e: unknown) {
      setEvidenceError((e as Error).message || 'Could not load the radio evidence for this RFI.');
    } finally {
      setEvidenceLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, outline: 'none',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };

  // Disabled-aware CTA helper — keeps goldButtonStyle looking correct while a
  // write is in flight or a required field is empty.
  const disabledGold = (isDisabled: boolean): React.CSSProperties => ({
    ...goldButtonStyle,
    opacity: isDisabled ? 0.5 : 1,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
  });

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow="Project RFIs"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('rfis').vivid ?? moduleAccent('rfis').hex}><Question size={13} weight="fill" color="#F8FAFC" /></IconChip>}
        accentColor={moduleAccent('rfis').hex}
        title="Requests for"
        accent="Information"
        subtitle="Questions, ball-in-court, and close-out."
        note="get it in writing"
        actions={
          showForm ? (
            <button onClick={closeCreate} style={ghostButtonStyle} className="pmBtn">Cancel</button>
          ) : (
            <button data-tour="create-rfi" onClick={() => setShowForm(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Create RFI</button>
          )
        }
      />

      {/* Stat Cards — skeletons while loading, greyed/suppressed on error, real values otherwise */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        {loading ? (
          <>
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
          </>
        ) : error ? (
          <div style={{ gridColumn: '1 / -1', opacity: 0.55 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <StatCard icon={<Clipboard size={19} weight="duotone" color={T.faint} />} label="Total RFIs" value="—"  href={`/app/projects/${projectId}/rfis`}/>
              <StatCard icon={<FolderOpen size={19} weight="duotone" color={T.faint} />} label="Open" value="—"  href={`/app/projects/${projectId}/rfis`}/>
              <StatCard icon={<CheckCircle size={19} weight="duotone" color={T.faint} />} label="Answered" value="—"  href={`/app/projects/${projectId}/rfis`}/>
              <StatCard icon={<Clock size={19} weight="duotone" color={T.faint} />} label="Overdue" value="—"  href={`/app/projects/${projectId}/rfis`}/>
            </div>
          </div>
        ) : (
          <>
            <StatCard icon={<Clipboard size={19} weight="duotone" color={moduleAccent('rfis').hex} />} label="Total RFIs" value={String(totalCount ?? 0)} delay={0.02}  href={`/app/projects/${projectId}/rfis`}/>
            <StatCard icon={<FolderOpen size={19} weight="duotone" color={moduleAccent('rfis').hex} />} label="Open" value={String(openCount ?? 0)} accent={T.gold} delay={0.06}  href={`/app/projects/${projectId}/rfis`}/>
            <StatCard icon={<CheckCircle size={19} weight="duotone" color={T.green} />} label="Answered" value={String(answeredCount ?? 0)} accent={T.green} delay={0.10}  href={`/app/projects/${projectId}/rfis`}/>
            <StatCard icon={<Clock size={19} weight="duotone" color={overdueCount > 0 ? T.red : T.faint} />} label="Overdue" value={String(overdueCount ?? 0)} accent={overdueCount > 0 ? T.red : undefined} sub={overdueCount > 0 ? 'Needs attention' : undefined} delay={0.14}  href={`/app/projects/${projectId}/rfis`}/>
          </>
        )}
      </div>

      {successMsg && (
        <div style={{ margin: '0 0 16px', padding: '10px 14px', background: T.greenDim, border: `1px solid rgba(34,197,94,0.4)`, borderRadius: 10, color: T.green, fontSize: 13 }}>{successMsg}</div>
      )}
      {/* Inline banner for action errors (form/answer) when data is already on screen;
          full-load errors are surfaced by the error block in the table below instead. */}
      {error && !loading && rfis.length > 0 && (
        <div style={{ margin: '0 0 16px', padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 10, color: T.red, fontSize: 13 }}>{error}</div>
      )}

      {/* Create Form — SmartCreate: walks in knowing the project */}
      {showForm && (
        <div style={{ marginBottom: 22 }}>
          {ctx && (
            <StatStrip items={[
              {href: `/app/projects/${projectId}/rfis`,  label: 'Next RFI', value: `#${nextRfiNumber}`, sub: totalCount > 0 ? `follows ${totalCount} on this project` : 'first on this project' },
              {href: `/app/projects/${projectId}/rfis`,  label: 'Ball in Court', value: architectName || 'Unassigned', sub: architectName ? 'architect of record' : 'pick a recipient below' },
              {href: `/app/projects/${projectId}/rfis`,  label: 'Open RFIs', value: String(openCount), accent: overdueCount > 0 ? T.red : undefined, sub: overdueCount > 0 ? `${overdueCount} overdue` : oldestOpenDays > 0 ? `oldest ${oldestOpenDays}d` : 'all current' },
              {href: `/app/projects/${projectId}/rfis`,  label: 'Response Due', value: '+7 days', sub: 'standard turnaround' },
              {href: `/app/projects/${projectId}/subs`,  label: 'Subs on Job', value: String(subs.length), sub: subs.length > 0 ? 'roster ready to assign' : 'none awarded yet' },
              {href: `/app/projects/${projectId}/submittals`,  label: 'Open Submittals', value: String(ctx?.counts?.openSubmittals ?? 0), sub: 'linkable from an answer' },
            ]} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 22, alignItems: 'start' }}>
            <SectionCard title="New Request for Information" icon={<Question size={17} weight="duotone" color={moduleAccent('rfis').hex} />}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Subject *</label>
                  <input value={fSubject} onChange={e => setFSubject(e.target.value)} placeholder="e.g. Clarify footing depth at grid A-3" style={inp} />
                  <div style={hint}>Keep it one line — the subject is what the architect scans in their inbox.</div>
                </div>
                <div>
                  <label style={lbl}>RFI Number<AutoChip /></label>
                  <input value={`#${nextRfiNumber}`} readOnly style={{ ...inp, color: T.gold, fontWeight: 700 }} />
                  <div style={hint}>Next in the project sequence — confirmed at submit.</div>
                </div>
                <div>
                  <label style={lbl}>Response Due{auto.due && <AutoChip />}</label>
                  <SaguaroDatePicker value={fDueDate} onChange={setFDueDate} style={inp} />
                  <div style={hint}>Defaulted to +7 days — overdue tracking runs against this date.</div>
                </div>
                <div>
                  <label style={lbl}>Spec Section</label>
                  <select value={specDiv} onChange={e => { const code = e.target.value; setFSpecSection(code ? `${code} 00 00` : ''); }} style={{ ...inp, cursor: 'pointer', marginBottom: 6 }}>
                    <option value="">CSI division…</option>
                    {Object.entries(CSI_DIVISIONS).map(([code, d]) => (
                      <option key={code} value={code}>Div {code} — {(d as { name: string }).name}</option>
                    ))}
                  </select>
                  <input value={fSpecSection} onChange={e => setFSpecSection(e.target.value)} placeholder="e.g. 03 30 00" style={inp} />
                  <div style={hint}>Pick the division to stamp its MasterFormat prefix, then refine to the exact section.</div>
                </div>
                <div>
                  <label style={lbl}>Assign To — Ball in Court{auto.assignee && architectName !== '' && fAssignedTo === architectName && <AutoChip />}</label>
                  <select value={fAssignedTo} onChange={e => setFAssignedTo(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Unassigned</option>
                    {architectName && <option value={architectName}>{architectName} — Architect</option>}
                    {subs.map(s => (
                      <option key={s.membershipId || s.id} value={s.companyName}>{s.companyName}{s.trade ? ` — ${s.trade}` : ''}</option>
                    ))}
                    <option value="__other">Other — type a name…</option>
                  </select>
                  {fAssignedTo === '__other' && (
                    <input value={fAssignedOther} onChange={e => setFAssignedOther(e.target.value)} placeholder="Name or company" style={{ ...inp, marginTop: 6 }} autoFocus />
                  )}
                  <div style={hint}>{architectName ? `Defaults to ${architectName} — the architect of record answers most RFIs.` : 'Architect, owner rep, or any sub from the awarded roster.'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Urgency</label>
                  <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
                    <button type="button" onClick={() => setFUrgent(false)} className="pmBtn"
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: !fUrgent ? 'rgba(245,158,11,0.14)' : 'transparent', border: `1px solid ${!fUrgent ? 'rgba(245,158,11,0.5)' : T.border}`, color: !fUrgent ? T.gold : T.muted }}>
                      Standard
                    </button>
                    <button type="button" onClick={() => setFUrgent(true)} className="pmBtn"
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: fUrgent ? 'rgba(239,68,68,0.14)' : 'transparent', border: `1px solid ${fUrgent ? 'rgba(239,68,68,0.5)' : T.border}`, color: fUrgent ? T.red : T.muted }}>
                      <Lightning size={13} weight="fill" /> Urgent
                    </button>
                  </div>
                  <div style={hint}>{fUrgent ? 'Flagged urgent — priority is raised and the responder sees it first.' : 'Urgent raises priority and flags the record for the responder.'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Question / Description</label>
                  <textarea value={fQuestion} onChange={e => setFQuestion(e.target.value)} rows={4} placeholder="Describe the question in detail..." style={{ ...inp, resize: 'vertical' }} />
                  <div style={hint}>Reference sheets and grid lines — precise questions come back answered, not re-asked.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={submitRFI} disabled={saving || !fSubject.trim()} className="pmBtn" style={disabledGold(saving || !fSubject.trim())}>{saving ? 'Submitting...' : 'Submit RFI'}</button>
                <button onClick={closeCreate} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              </div>
            </SectionCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionCard flat title="Project Routing" icon={<Buildings size={17} weight="duotone" color={T.gold} />}>
                <InsightRow label="Project" value={ctx?.project?.name || '—'} />
                <InsightRow label="Architect" value={architectName || 'Not on file'} />
                <InsightRow label="Owner" value={ctx?.defaults?.ownerName || ctx?.project?.ownerName || '—'} />
                <InsightRow label="Subs on roster" value={String(subs.length)} />
                <InsightRow label="Open / Overdue" value={`${openCount} / ${overdueCount}`} accent={overdueCount > 0 ? T.red : undefined} strong />
              </SectionCard>
              <SectionCard flat title="After You Submit" icon={<CheckCircle size={17} weight="duotone" color={T.gold} />}>
                <FlowSteps title="" steps={[
                  { title: 'RFI logs and routes', desc: `Numbered #${nextRfiNumber} automatically — the ball-in-court gets the email and in-app notification.` },
                  { title: 'The clock starts', desc: 'Days-open and overdue tracking run against the response-due date.' },
                  { title: 'Answer lands on the record', desc: 'One click captures the response and the RFI closes out.' },
                  { title: 'Impacts spawn follow-ups', desc: 'Cost or scope in the answer? Link a change order or submittal straight from this RFI.' },
                ]} />
              </SectionCard>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!loading && !error && rfis.length > 0 && (
        <ListToolbar
          module="rfis"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search RFIs by number, subject, or spec section..."
          filters={[
            {
              key: 'status', label: 'Status', value: statusFilter, onChange: setStatusFilter,
              allLabel: 'All statuses',
              options: [
                { value: 'open', label: 'Open' },
                { value: 'answered', label: 'Answered' },
                { value: 'closed', label: 'Closed' },
                { value: 'overdue', label: 'Overdue' },
              ],
            },
            {
              key: 'assignee', label: 'Ball in Court', value: assigneeFilter, onChange: setAssigneeFilter,
              allLabel: 'Anyone', options: assigneeOptions,
            },
          ]}
          count={{ shown: filteredRfis.length, total: rfis.length }}
          style={{ marginBottom: 14 }}
        />
      )}

      {/* Table */}
      <SectionCard title="RFI Log" icon={<Clipboard size={17} weight="duotone" color={moduleAccent('rfis').hex} />} flush>
        {loading ? (
          <div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={32} weight="duotone" color={T.red} />}
            title="Couldn't load RFIs"
            description={error || 'Something went wrong while loading Requests for Information. Please try again.'}
            action={<button onClick={load} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
          />
        ) : rfis.length === 0 ? (
          <PremiumEmpty
            icon={<Question size={32} weight="duotone" color={T.gold} />}
            title="No RFIs yet"
            description="Create your first Request for Information when you need clarification on plans, specs, or project details."
            action={<button onClick={() => setShowForm(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Create First RFI</button>}
          />
        ) : filteredRfis.length === 0 ? (
          <PremiumEmpty
            icon={<Question size={32} weight="duotone" color={T.gold} />}
            title="No RFIs match these filters"
            description="Try clearing the status or ball-in-court filters to see more."
            action={<button onClick={() => { setSearch(''); setStatusFilter('all'); setAssigneeFilter('all'); }} style={goldOutlineButtonStyle} className="pmBtn">Clear filters</button>}
          />
        ) : (
          <>
            <Table
              headers={['RFI #', 'Subject', 'Status', 'Ball in Court', 'Due Date', 'Days Open', 'Actions']}
              rows={filteredRfis.map(rfi => {
                const displayStatus = rfi.is_overdue ? 'overdue' : (rfi.status || 'open');
                const bic = ballInCourt(rfi);
                // Filed from a radio transmission? The promote appends its
                // headline to `question`, which is in the list payload.
                const radio = hasRadioEvidence({ question: rfi.question })
                  ? radioProvenanceFromText(rfi.question)
                  : null;
                const questionPreview = stripRadioProvenance(rfi.question);
                return [
                  <span key="n" style={{ color: T.gold, fontWeight: 700 }}>#{rfi.rfi_number}</span>,
                  <div key="sub">
                    <div style={{ fontWeight: 600 }}>{rfi.subject}</div>
                    {questionPreview && <div style={{ fontSize: 11, color: T.muted, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{questionPreview}</div>}
                    {radio && (
                      <div style={{ marginTop: 5 }}>
                        <RadioEvidenceChip
                          durationSecs={radio.audio_duration_secs}
                          active={evidenceId === rfi.id}
                          onClick={() => openEvidence(rfi)}
                        />
                      </div>
                    )}
                  </div>,
                  <div key="s" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <StatusPill module="rfis" status={displayStatus} size="sm" />
                    {/* The urgent toggle on the create form promises the responder
                        sees this first. Until now it wrote priority='high' and
                        nothing ever displayed it. An open RFI is the only place
                        it still matters — once answered, urgency is history. */}
                    {(rfi.is_urgent || rfi.priority === 'high' || rfi.priority === 'critical')
                      && rfi.status === 'open' && <Badge label="urgent" color="amber" />}
                    {rfi.is_overdue && rfi.status !== 'overdue' && <Badge label="overdue" color="red" />}
                  </div>,
                  <span key="bic" style={{ color: bic ? T.white : T.faint, fontWeight: bic ? 600 : 400 }}>{bic || 'Unassigned'}</span>,
                  <span key="dd" style={{ color: rfi.is_overdue ? T.red : T.muted, fontWeight: rfi.is_overdue ? 700 : 400 }}>
                    {rfi.due_date ? new Date(rfi.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>,
                  <span key="do" style={{ color: T.muted }}>{daysOpen(rfi)}d</span>,
                  <div key="act" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {(rfi.status === 'open' || rfi.status === 'pending' || rfi.status === 'draft') && (
                      <Btn size="sm" onClick={() => { setAnsweringId(answeringId === rfi.id ? null : rfi.id); setAnswerText(''); setAnsweredBy(''); setAssigningId(null); setEvidenceId(null); }}>
                        {answeringId === rfi.id ? 'Cancel' : 'Answer'}
                      </Btn>
                    )}
                    {rfi.status === 'answered' && <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>Answered</span>}
                    <Btn size="sm" variant="ghost" onClick={() => { setAssigningId(assigningId === rfi.id ? null : rfi.id); setAssignName(bic); setAssignDue(rfi.due_date || ''); setAnsweringId(null); setEvidenceId(null); }}>
                      {assigningId === rfi.id ? 'Cancel' : 'Assign'}
                    </Btn>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm('Delete this RFI?')) return;
                      setRfis(prev => prev.filter(r => r.id !== rfi.id));
                      try {
                        const res = await fetch(`/api/rfis/${rfi.id}`, { method: 'DELETE' });
                        if (!res.ok) throw new Error('delete failed');
                      } catch { setError('Could not delete the RFI. Please try again.'); load(); }
                    }} style={{background:'none',border:'none',color:'rgba(239,68,68,.5)',cursor:'pointer',fontSize:12,padding:'2px 6px',marginLeft:4}} title="Delete RFI"><Trash size={14} weight="regular" /></button>
                  </div>,
                ];
              })}
            />
            {/* Inline radio-evidence panel — the voice behind a promoted RFI */}
            {evidenceId && (
              <div style={{ padding: '16px 20px', background: T.surface2, borderTop: `1px solid ${T.border}` }}>
                {evidenceError && (
                  <div style={{ marginBottom: 10, padding: '10px 14px', background: T.redDim, border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 10, color: T.red, fontSize: 12.5 }}>
                    {evidenceError}
                  </div>
                )}
                {evidenceSrc ? (
                  <RadioEvidence source={evidenceSrc} title="Voice on the record" />
                ) : evidenceLoading ? (
                  <div style={{ fontSize: 12.5, color: T.faint }}>Loading the radio evidence…</div>
                ) : !evidenceError ? (
                  <div style={{ fontSize: 12.5, color: T.muted }}>No radio provenance is stored on this RFI.</div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setEvidenceId(null)} style={ghostButtonStyle} className="pmBtn">Close</button>
                </div>
              </div>
            )}
            {/* Inline assign / ball-in-court panel */}
            {assigningId && (
              <div style={{ padding: '16px 20px', background: T.surface2, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 10 }}>
                  <div>
                    <label style={lbl}>Ball in Court (assignee)</label>
                    <input value={assignName} onChange={e => setAssignName(e.target.value)} placeholder="e.g. Jane Architect / ACME Design" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Due Date</label>
                    <SaguaroDatePicker value={assignDue} onChange={setAssignDue} style={inp} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => submitAssign(assigningId)} disabled={savingAssign || (!assignName.trim() && !assignDue)} className="pmBtn" style={disabledGold(savingAssign || (!assignName.trim() && !assignDue))}>
                    {savingAssign ? 'Saving...' : 'Save Assignment'}
                  </button>
                  <button onClick={() => { setAssigningId(null); setAssignName(''); setAssignDue(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
                </div>
              </div>
            )}
            {/* Inline answer form */}
            {answeringId && (
              <div style={{ padding: '16px 20px', background: T.surface2, borderTop: `1px solid ${T.border}` }}>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Answer / Response</label>
                  <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={3} placeholder="Type your answer..." style={{ ...inp, resize: 'vertical' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Answered By</label>
                  <input value={answeredBy} onChange={e => setAnsweredBy(e.target.value)} placeholder="Your name" style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => submitAnswer(answeringId)} disabled={submittingAnswer || !answerText.trim()} className="pmBtn" style={disabledGold(submittingAnswer || !answerText.trim())}>
                    {submittingAnswer ? 'Saving...' : 'Submit Answer'}
                  </button>
                  <button onClick={() => { setAnsweringId(null); setAnswerText(''); setAnsweredBy(''); }} style={ghostButtonStyle} className="pmBtn">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
