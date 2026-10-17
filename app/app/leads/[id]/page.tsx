'use client';
/*
 * app/app/leads/[id] — the deal page (MUST-PASS Path 12, SALES-PLAN Phase 1).
 *
 * Until now every lead was a modal on the board: there was no URL you could
 * send someone, and no place to actually WORK a deal — move it through the
 * stages, log a call, see its history. This is that page. Its spine is the
 * stage button bar: one tap advances (or rewinds) the deal, writes through the
 * one PATCH /api/leads/[id] that normalises stage casing (Path 10), and stamps
 * won_at / lost_at so the board, the sales overview and the journey signal — all
 * reading one aggregation now (Path 14) — agree the instant the stage changes.
 * When a deal reaches Won it offers the handoff that opens the job (Path 13).
 *
 * Built on components/ui/kit (design system Phase 2).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, EnvelopeSimple, UploadSimple, DownloadSimple, CheckCircle, WarningCircle, Trash, PencilSimple, User, Phone, Megaphone, MapPin, CalendarBlank, CurrencyDollar, Gauge, CalendarCheck, Funnel, Note, Users, Paperclip, Buildings, Flag, FileText, SealCheck } from '@phosphor-icons/react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/errors';
import { fmtDate as fmtDateSafe } from '@/lib/format-date';
import { LEAD_STAGES, LEAD_SOURCES, normaliseStage } from '@/lib/lead-stages';
import { localDay } from '@/lib/calendar-day';
import { BUILDING_TYPES } from '@/lib/contractor-trades';
import { FileTypeBadge } from '@/components/FileTypeBadge';
import ProposalSignPanel from '@/components/proposals/ProposalSignPanel';
import ProposalEditor, { type EditableProposal } from '@/components/proposals/ProposalEditor';
import { FlatStyles, SectionLabel, FlatList, Row, Brief } from '@/components/ui/flat';
import { money, SIGN_STATUS_LABEL, type ProposalLineItem, type SignStatus } from '@/lib/proposal-esign-core';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState,
  FormModal, Field, Input, Textarea, Select, FormGrid, DateInput,
  ItemList, ItemRow, MetaItem, Callout, StagePicker, Timeline, Menu,
  type Column, type BadgeTone, type Tone,
} from '@/components/ui/kit';

/* Stages read as the six fixed status colors (lib/status-colors) so the deal
   page, the board and the ticker agree. */
const STAGE_TONE: Record<string, BadgeTone> = {
  New: 'lead', Contacted: 'lead', Qualified: 'lead', Proposal: 'lead',
  Negotiation: 'lead', Won: 'ongoing', Lost: 'closed',
};
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const;
const ACTIVITY_LABELS: Record<string, string> = { call: 'Phone Call', email: 'Email', meeting: 'Meeting', note: 'Note' };
const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  call: <Phone size={15} weight="bold" />, email: <EnvelopeSimple size={15} weight="bold" />,
  meeting: <Users size={15} weight="bold" />, note: <Note size={15} weight="bold" />,
};
const ACTIVITY_TONE: Record<string, Tone> = { call: 'info', email: 'info', meeting: 'success', note: 'neutral' };
/* The open pipeline in order; Lost sits apart as its own action. */
const OPEN_STAGES = LEAD_STAGES.filter((s) => s !== 'Lost');

type Lead = {
  id: string; company_name: string | null; contact_name: string | null;
  email: string | null; phone: string | null; source: string | null;
  stage: string | null; estimated_value: number | string | null;
  probability: number | string | null; project_type: string | null;
  location: string | null; notes: string | null; next_action: string | null;
  next_action_date: string | null; assigned_to: string | null;
  won_at: string | null; lost_at: string | null;
  project_id: string | null; customer_id: string | null;
  created_at: string | null; updated_at: string | null;
};
type Activity = {
  id: string; lead_id: string; activity_type: string; description: string;
  scheduled_at: string | null; created_at: string;
};
type DealProposal = EditableProposal & {
  id: string; proposal_number: string | null; total: number; status: string | null; locked_at: string | null;
  signed_at: string | null; signed_by: string | null; created_at: string; line_items: ProposalLineItem[];
  latest_request: { status: SignStatus; signed_at: string | null; signed_name: string | null; on_sign: 'flag' | 'win' } | null;
};
type MediaItem = {
  id: string; name: string; content_type: string | null; size_bytes: number | null;
  created_at: string; url: string;
};

const fmtBytes = (n: number | null) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${Math.round((b / (1024 * 1024)) * 10) / 10} MB`;
};
const fmt = (n: unknown) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d: string | null) => (d ? fmtDateSafe(d) : '—');

/* The deal's editable fields, as form strings. Stage is not here — the stage
   bar moves it (and stamps won_at / lost_at). */
type DealForm = {
  company_name: string; contact_name: string; email: string; phone: string;
  source: string; project_type: string; estimated_value: string; probability: string;
  location: string; next_action: string; next_action_date: string; notes: string;
};
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
function formFromLead(l: Lead): DealForm {
  return {
    company_name: str(l.company_name), contact_name: str(l.contact_name), email: str(l.email), phone: str(l.phone),
    source: str(l.source), project_type: str(l.project_type),
    estimated_value: l.estimated_value != null && l.estimated_value !== '' ? str(Number(l.estimated_value)) : '',
    probability: l.probability != null && l.probability !== '' ? str(Number(l.probability)) : '',
    location: str(l.location), next_action: str(l.next_action),
    next_action_date: l.next_action_date ? l.next_action_date.slice(0, 10) : '', notes: str(l.notes),
  };
}
/** A select's options, keeping a saved value that is not in the list selectable. */
const withCurrent = (list: readonly string[], cur: string) => (cur && !list.includes(cur) ? [...list, cur] : [...list]);

const CRUMBS = [{ label: 'Sales', href: '/app/sales' }, { label: 'Pipeline', href: '/app/leads' }];

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const [actType, setActType] = useState<string>('call');
  const [actDesc, setActDesc] = useState('');
  const [actSaving, setActSaving] = useState(false);

  // Send-to-GC composer (P5). Emails the deal's contact via the existing,
  // honesty-contracted /api/leads/[id]/email and logs it on the activity trail.
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Deal media hub: files/photos/docs/videos attached to this deal.
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaError, setMediaError] = useState('');
  const [uploading, setUploading] = useState(false);

  // Edit / delete the deal itself. The deal page could move a stage and log a
  // call, but not fix a misspelled company or a wrong number, and not remove a
  // dead deal — those lived only on the board's modal.
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<DealForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The proposal on this deal, and its e-signature (components/proposals).
  const [proposals, setProposals] = useState<DealProposal[]>([]);
  const [proposalError, setProposalError] = useState('');
  const [editor, setEditor] = useState<null | { proposal: DealProposal | null }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lr, ar] = await Promise.all([
        fetch(`/api/leads/${id}`),
        fetch(`/api/leads/${id}/activities`),
      ]);
      if (lr.status === 404) { setError('This deal could not be found.'); setLead(null); return; }
      if (!lr.ok) throw new Error((await lr.json().catch(() => ({}))).error || 'Could not load the deal');
      const lj = await lr.json();
      setLead(lj.lead as Lead);
      // Activities are secondary — a failed log must not blank the deal.
      if (ar.ok) { const aj = await ar.json(); setActivities((aj.activities || []) as Activity[]); }
      else setActivities([]);
    } catch (e) {
      setError(humanError(e, 'Could not load the deal.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const loadMedia = useCallback(async () => {
    /* Non-fatal — the deal still renders — but a failed read is said, not
       shown as "0 files on this deal". */
    try {
      const r = await fetch(`/api/leads/${id}/media`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't load this deal's files.");
      const j = await r.json();
      setMedia((j.media || []) as MediaItem[]);
      setMediaError('');
    } catch (e) {
      setMediaError(humanError(e, "Couldn't load this deal's files."));
    }
  }, [id]);
  useEffect(() => { void loadMedia(); }, [loadMedia]);

  const loadProposals = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${id}/proposals`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't load this deal's proposal.");
      setProposals((j.proposals || []) as DealProposal[]);
      setProposalError('');
    } catch (e) {
      setProposalError(humanError(e, "Couldn't load this deal's proposal."));
    }
  }, [id]);
  useEffect(() => { void loadProposals(); }, [loadProposals]);

  const onUpload = useCallback(async (files: FileList | null) => {
    if (!files || !files.length || uploading) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        const r = await fetch(`/api/leads/${id}/media`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Could not upload ${f.name}`);
      }
      showToast(files.length === 1 ? 'File uploaded.' : `${files.length} files uploaded.`, 'success');
      void loadMedia();
    } catch (e) {
      showToast(humanError(e, 'Upload failed.'), 'error');
    } finally {
      setUploading(false);
    }
  }, [id, uploading, showToast, loadMedia]);

  // Remove one file: bucket object + index row (DELETE /api/leads/[id]/media/[mediaId]).
  const removeMedia = useCallback(async (m: MediaItem) => {
    if (!(await confirmDialog({ title: 'Please confirm', message: `Remove "${m.name}" from this deal? This cannot be undone.`, danger: true }))) return;
    try {
      const r = await fetch(`/api/leads/${id}/media/${m.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not remove the file');
      showToast('File removed.', 'success');
      void loadMedia();
    } catch (e) {
      showToast(humanError(e, 'Could not remove the file.'), 'error');
    }
  }, [id, showToast, loadMedia]);

  /* Send a message to the GC (the deal's contact). Reuses the email route,
     which is honest: it returns 503 and logs NOTHING when email isn't
     configured, so we never show a "sent" that didn't leave. On success the
     route logs an 'email' activity — reload to pull it into the timeline. */
  const sendToGc = useCallback(async () => {
    if (!lead || sending) return;
    if (!sendSubject.trim() || !sendMessage.trim()) { showToast('Add a subject and a message.', 'error'); return; }
    setSending(true);
    try {
      const r = await fetch(`/api/leads/${id}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: sendSubject.trim(), message: sendMessage.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send to the GC');
      showToast('Sent to the GC.', 'success');
      setSendOpen(false); setSendSubject(''); setSendMessage('');
      void load();
    } catch (e) {
      showToast(humanError(e, 'Could not send to the GC.'), 'error');
    } finally {
      setSending(false);
    }
  }, [lead, id, sending, sendSubject, sendMessage, showToast, load]);

  /* The spine: move the deal to a stage. One PATCH, which normalises casing;
     won_at / lost_at are stamped here so every pipeline reader agrees at once. */
  const moveStage = useCallback(async (stage: string) => {
    if (!lead || stage === normaliseStage(lead.stage) || savingStage) return;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      stage,
      won_at: stage === 'Won' ? now : null,
      lost_at: stage === 'Lost' ? now : null,
    };
    const prev = lead;
    setSavingStage(stage);
    setLead({ ...lead, stage, won_at: patch.won_at as string | null, lost_at: patch.lost_at as string | null });
    try {
      const r = await fetch(`/api/leads/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not move the deal');
      const j = await r.json();
      setLead(j.lead as Lead);
      showToast(`Moved to ${stage}.`, 'success');
    } catch (e) {
      setLead(prev); // roll the optimistic move back
      showToast(humanError(e, 'Could not move the deal.'), 'error');
    } finally {
      setSavingStage(null);
    }
  }, [lead, id, savingStage, showToast]);

  const addActivity = useCallback(async () => {
    if (!actDesc.trim() || actSaving) return;
    setActSaving(true);
    try {
      const r = await fetch(`/api/leads/${id}/activities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: actType, description: actDesc.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not add the activity');
      const j = await r.json();
      setActivities((a) => [j.activity as Activity, ...a]);
      setActDesc('');
      showToast('Activity logged.', 'success');
    } catch (e) {
      showToast(humanError(e, 'Could not add the activity.'), 'error');
    } finally {
      setActSaving(false);
    }
  }, [actDesc, actType, actSaving, id, showToast]);

  /* Won → open the job (Path 13). Idempotent server-side; we follow nextUrl. */
  const convert = useCallback(async () => {
    if (!lead || converting) return;
    setConverting(true);
    try {
      const r = await fetch(`/api/leads/${id}/convert`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not open the job');
      const failedFiles: string[] = j.files?.failed ?? [];
      showToast(
        j.alreadyConverted ? 'Opening the existing job…'
          : failedFiles.length ? `Job created — ${failedFiles.length} file${failedFiles.length === 1 ? '' : 's'} could not be copied (${failedFiles.join(', ')}). Opening it…`
          : 'Job created — opening it…',
        failedFiles.length ? 'error' : 'success',
      );
      if (j.nextUrl) router.push(j.nextUrl as string);
    } catch (e) {
      showToast(humanError(e, 'Could not open the job.'), 'error');
    } finally {
      setConverting(false);
    }
  }, [lead, id, converting, router, showToast]);

  /* A signed proposal's one tap: Won, then the job (Path 13's handoff, which
     also carries the signed proposal across as the contract). A deal already
     linked to a job only needs the stage. */
  const markWonAndOpen = useCallback(async () => {
    if (!lead) return;
    if (lead.project_id) { await moveStage('Won'); return; }
    await convert();
  }, [lead, moveStage, convert]);

  const openEdit = useCallback(() => {
    if (!lead) return;
    setForm(formFromLead(lead));
    setEditError(null);
    setEditOpen(true);
  }, [lead]);

  /* Save through the same PATCH /api/leads/[id] the board's editor uses, with
     the real lead_pipeline column names. */
  const saveEdit = useCallback(async () => {
    if (!form || savingEdit) return;
    if (!form.company_name.trim()) { setEditError('Company name is required.'); return; }
    const num = (v: string) => { const t = v.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
    const txt = (v: string) => v.trim() || null;
    setSavingEdit(true); setEditError(null);
    try {
      const r = await fetch(`/api/leads/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          contact_name: txt(form.contact_name), email: txt(form.email), phone: txt(form.phone),
          source: txt(form.source), project_type: txt(form.project_type),
          estimated_value: num(form.estimated_value), probability: num(form.probability),
          location: txt(form.location), next_action: txt(form.next_action),
          next_action_date: form.next_action_date || null, notes: txt(form.notes),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save the deal');
      setLead(j.lead as Lead);
      setEditOpen(false);
      showToast('Deal updated.', 'success');
    } catch (e) {
      setEditError(humanError(e, 'Could not save the deal.'));
    } finally {
      setSavingEdit(false);
    }
  }, [form, savingEdit, id, showToast]);

  const deleteDeal = useCallback(async () => {
    if (!lead || deleting) return;
    const ok = await confirmDialog({
      title: 'Delete this deal?',
      message: `${lead.company_name || 'This deal'}, its activity history and its files will be permanently removed. This can’t be undone.`,
      confirmLabel: 'Delete Deal',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not delete the deal');
      showToast('Deal deleted.', 'success');
      router.push('/app/leads');
    } catch (e) {
      showToast(humanError(e, 'Could not delete the deal.'), 'error');
      setDeleting(false);
    }
  }, [lead, deleting, id, router, showToast]);

  if (loading || error || !lead) {
    return (
      <PageShell crumbs={CRUMBS} title={loading ? 'Loading deal…' : 'Deal Unavailable'}>
        <Card>
          {loading ? (
            <div className="k-hint">Loading deal…</div>
          ) : (
            <EmptyState
              icon={<WarningCircle size={22} />}
              title="Deal Unavailable"
              text={error || 'This deal could not be found.'}
              action={<Button href="/app/leads">Back to Pipeline</Button>}
            />
          )}
        </Card>
      </PageShell>
    );
  }

  /* Read the stage through the one vocabulary (lib/lead-stages), so the bar,
     the badge and the Won handoff agree with the board on any casing. */
  const stage = normaliseStage(lead.stage);
  const isWon = stage === 'Won';

  const mediaColumns: Column<MediaItem>[] = [
    {
      key: 'name', header: 'File', primary: true,
      render: (m) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <FileTypeBadge name={m.name} mime={m.content_type} />{m.name}
        </span>
      ),
    },
    { key: 'size_bytes', header: 'Size', align: 'right', render: (m) => fmtBytes(m.size_bytes) },
    { key: 'created_at', header: 'Added', render: (m) => fmtDate(m.created_at) },
  ];

  const isLost = stage === 'Lost';
  const currentProposal = proposals[0] ?? null;
  const olderProposals = proposals.slice(1);
  const proposalSigned = currentProposal?.latest_request?.status === 'signed';
  const prob = lead.probability != null && lead.probability !== '' ? Math.max(0, Math.min(100, Number(lead.probability))) : null;
  /* Calendar days as 'YYYY-MM-DD' strings: new Date('2026-10-16') is UTC
     midnight, which made a follow-up due today read "Overdue" all day long
     anywhere west of Greenwich. */
  const overdue = !!lead.next_action_date && !isWon && !isLost && lead.next_action_date.slice(0, 10) < localDay();
  const firstName = String(lead.contact_name || '').trim().split(/\s+/)[0] || '';
  const valueNum = Number(lead.estimated_value) || 0;

  return (
    <PageShell
      crumbs={[...CRUMBS, { label: lead.company_name || 'Deal' }]}
      title={lead.company_name || 'Untitled Deal'}
      badge={<Badge tone={STAGE_TONE[stage] ?? 'neutral'} dot>{lead.stage ? stage : 'Unstaged'}</Badge>}
      meta={
        <>
          {lead.contact_name && <MetaItem icon={<User size={14} />}>{lead.contact_name}</MetaItem>}
          {lead.project_type && <MetaItem icon={<Buildings size={14} />}>{lead.project_type}</MetaItem>}
          {lead.location && <MetaItem icon={<MapPin size={14} />}>{lead.location}</MetaItem>}
          {lead.created_at && <MetaItem icon={<CalendarBlank size={14} />}>Created {fmtDate(lead.created_at)}</MetaItem>}
        </>
      }
      actions={
        <>
          <Button icon={<PencilSimple size={15} />} onClick={openEdit}>Edit</Button>
          {lead.email && (
            <Button
              icon={<EnvelopeSimple size={15} />}
              onClick={() => setSendOpen(true)}
              title={`Email ${lead.contact_name || 'the contact'} at ${lead.email}`}
            >
              Email {firstName || 'contact'}
            </Button>
          )}
          {/* A deal already linked to a job links to it at any stage; the
              handoff that opens one is offered once the deal is Won. */}
          {lead.project_id ? (
            <Button variant="primary" href={`/app/projects/${lead.project_id}/overview`} icon={<ArrowRight size={15} />}>View the Job</Button>
          ) : isWon && (
            <Button variant="primary" onClick={convert} disabled={converting} icon={<ArrowRight size={15} />}>{converting ? 'Opening…' : 'Open the Job'}</Button>
          )}
          <Menu label="More deal actions" actions={[
            { label: deleting ? 'Deleting…' : 'Delete deal', icon: <Trash size={14} />, tone: 'danger', disabled: deleting, onClick: () => { void deleteDeal(); } },
          ]} />
        </>
      }
    >
      <StatRow items={[
        { label: 'Estimated value', value: fmt(lead.estimated_value), icon: <CurrencyDollar size={15} weight="bold" />,
          sub: prob != null && valueNum > 0 ? `${fmt(Math.round(valueNum * prob / 100))} weighted` : undefined },
        ...(prob != null ? [{ label: 'Probability', value: `${prob}%`, icon: <Gauge size={15} weight="bold" />,
          sub: <span className="k-prog" aria-hidden><span style={{ width: `${prob}%` }} /></span> }] : []),
        ...(lead.next_action_date ? [{ label: 'Next action', value: fmtDate(lead.next_action_date), icon: <CalendarCheck size={15} weight="bold" />,
          tone: (overdue ? 'bad' : 'default') as 'bad' | 'default', sub: overdue ? 'Overdue' : 'Scheduled' }] : []),
      ]} />

      {/* The one next step, as the concept's alert card. */}
      {isWon ? (
        <Callout
          tone="success"
          icon={<CheckCircle size={20} weight="fill" />}
          title={lead.project_id ? 'Won — this deal is open as a job' : 'Won — ready to become a job'}
        />
      ) : !isLost && (
        <Callout
          tone={overdue ? 'danger' : lead.next_action ? 'info' : 'warning'}
          icon={overdue ? <WarningCircle size={20} weight="fill" /> : <Flag size={20} weight="fill" />}
          title={lead.next_action || 'No next step yet'}
          text={lead.next_action
            ? (lead.next_action_date ? `${overdue ? 'Was due' : 'Due'} ${fmtDate(lead.next_action_date)}.` : 'No date set.')
            : undefined}
          actions={<Button icon={<PencilSimple size={15} />} onClick={openEdit}>{lead.next_action ? 'Change' : 'Add Next Step'}</Button>}
        />
      )}

      {/* Pipeline — the Path 12 spine */}
      <Card
        icon={<Funnel size={17} weight="bold" />}
        title="Pipeline"
        actions={!isLost ? (
          <Button variant="ghost" onClick={() => void moveStage('Lost')} disabled={!!savingStage}>{savingStage === 'Lost' ? 'Saving…' : 'Mark as Lost'}</Button>
        ) : (
          <Badge tone="closed">Lost</Badge>
        )}
      >
        <StagePicker stages={OPEN_STAGES} value={isLost ? null : stage} onSelect={(st) => void moveStage(st)} busy={savingStage} label="Deal stage" />
      </Card>

      {/* Proposal + e-signature — the customer signs in the app, not out of band. */}
      <section aria-labelledby="deal-proposal">
        <FlatStyles />
        <SectionLabel id="deal-proposal" action={proposals.length && !proposalError ? { label: 'New Version', onClick: () => setEditor({ proposal: null }) } : undefined}>Proposal</SectionLabel>
        {proposalError ? (
          <EmptyState icon={<WarningCircle size={22} />} title="Proposal didn't load" text={proposalError} action={<Button onClick={() => void loadProposals()}>Retry</Button>} />
        ) : !currentProposal ? (
          <EmptyState title="No proposal yet" action={<Button icon={<FileText size={15} />} onClick={() => setEditor({ proposal: null })}>Create Proposal</Button>} />
        ) : (
          <>
            {proposalSigned && !isWon && (
              <Brief tone="success" icon={<SealCheck size={18} weight="fill" />} action={{ label: converting || savingStage === 'Won' ? 'Opening…' : lead.project_id ? 'Mark Won' : 'Mark Won & Open the Job', onClick: () => void markWonAndOpen() }}>
                <b>{currentProposal.latest_request?.signed_name || 'Your customer'}</b> signed {currentProposal.title} for <b>{money(currentProposal.total)}</b>{currentProposal.latest_request?.signed_at ? ` on ${fmtDate(currentProposal.latest_request.signed_at)}` : ''}.
              </Brief>
            )}
            <FlatList label="Proposal">
              <li>
                <Row
                  icon={<FileText size={18} weight="bold" />}
                  tone={proposalSigned ? 'success' : 'neutral'}
                  title={`${currentProposal.title}${currentProposal.proposal_number ? ` · ${currentProposal.proposal_number}` : ''}`}
                  meta={`${currentProposal.line_items.length} line item${currentProposal.line_items.length === 1 ? '' : 's'}${currentProposal.valid_until ? ` · valid until ${fmtDate(currentProposal.valid_until)}` : ''}${currentProposal.locked_at ? ' · signed, terms locked' : ''}`}
                  right={money(currentProposal.total)}
                  action={!currentProposal.locked_at ? <Button size="sm" icon={<PencilSimple size={14} />} onClick={() => setEditor({ proposal: currentProposal })}>Edit</Button> : undefined}
                />
              </li>
            </FlatList>
            <div style={{ paddingTop: 12 }}>
              <ProposalSignPanel
                key={currentProposal.id}
                proposalId={currentProposal.id}
                defaultSigner={{ name: lead.contact_name || '', email: lead.email || '' }}
                winLabel="move this deal to Won"
                canSend={currentProposal.total > 0}
                onChanged={() => { void loadProposals(); void load(); }}
              />
            </div>
            {olderProposals.length > 0 && (
              <>
                <SectionLabel>Earlier Versions</SectionLabel>
                <FlatList label="Earlier versions">
                  {olderProposals.map((p) => (
                    <li key={p.id}>
                      <Row
                        icon={<FileText size={18} weight="bold" />}
                        title={`${p.title}${p.proposal_number ? ` · ${p.proposal_number}` : ''}`}
                        meta={p.latest_request ? SIGN_STATUS_LABEL[p.latest_request.status] : 'Not sent'}
                        right={money(p.total)}
                      />
                    </li>
                  ))}
                </FlatList>
              </>
            )}
          </>
        )}
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <Card icon={<User size={17} weight="bold" />} title="Contact & Details">
          <ItemList>
            {lead.contact_name && <ItemRow icon={<User size={16} />} title="Contact" value={lead.contact_name} />}
            {lead.email && <ItemRow icon={<EnvelopeSimple size={16} />} tone="info" title="Email" value={<a href={`mailto:${lead.email}`}>{lead.email}</a>} />}
            {lead.phone && <ItemRow icon={<Phone size={16} />} tone="info" title="Phone" value={<a href={`tel:${lead.phone}`}>{lead.phone}</a>} />}
            {lead.source && <ItemRow icon={<Megaphone size={16} />} title="Source" value={lead.source} />}
            {lead.location && <ItemRow icon={<MapPin size={16} />} title="Location" value={lead.location} />}
          </ItemList>
          {lead.notes && (
            <div style={{ marginTop: 12 }}>
              <div className="k-label" style={{ marginBottom: 6 }}>Notes</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{lead.notes}</div>
            </div>
          )}
        </Card>

        <Card icon={<Note size={17} weight="bold" />} title="Activity">
          <form method="post"
            className="k-toolbar"
            style={{ marginBottom: 14 }}
            onSubmit={(e) => { e.preventDefault(); void addActivity(); }}
          >
            <Select
              options={ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_LABELS[t] }))}
              value={actType}
              onChange={(e) => setActType(e.target.value)}
              aria-label="Activity type"
              style={{ width: 140 }}
            />
            <Input
              value={actDesc}
              onChange={(e) => setActDesc(e.target.value)}
              placeholder="Log a call, email, or note…"
              aria-label="Activity description"
              style={{ flex: '1 1 200px', width: 'auto' }}
            />
            <Button type="submit" disabled={actSaving || !actDesc.trim()}>{actSaving ? 'Adding…' : 'Add'}</Button>
          </form>
          {activities.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <Timeline items={activities.map((a) => ({
              key: a.id,
              icon: ACTIVITY_ICON[a.activity_type] || <Note size={15} weight="bold" />,
              tone: ACTIVITY_TONE[a.activity_type] || 'neutral',
              title: ACTIVITY_LABELS[a.activity_type] || a.activity_type,
              meta: fmtDate(a.created_at),
              body: a.description,
            }))} />
          )}
        </Card>
      </div>

      {/* Files & media — upload photos/files/docs/videos; download in place */}
      <Card
        flush
        icon={<Paperclip size={17} weight="bold" />}
        title="Files & Media"
        subtitle={mediaError ? 'Files could not be loaded' : `${media.length} file${media.length === 1 ? '' : 's'} on this deal`}
        actions={
          <>
            <input ref={fileRef} type="file" multiple hidden disabled={uploading} onChange={(e) => { void onUpload(e.target.files); e.currentTarget.value = ''; }} />
            <Button size="sm" icon={<UploadSimple size={14} />} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload Files'}
            </Button>
          </>
        }
      >
        <DataTable
          columns={mediaColumns}
          rows={media}
          rowKey={(m) => m.id}
          onRowClick={(m) => window.open(m.url, '_blank', 'noopener,noreferrer')}
          rowActions={(m) => [{ label: 'Download', icon: <DownloadSimple size={14} />, inline: true, href: m.url }, { label: 'Remove', icon: <Trash size={14} />, tone: 'danger', onClick: () => void removeMedia(m) }]}
          empty={mediaError
            ? <EmptyState icon={<WarningCircle size={22} />} title="Files didn't load" text={mediaError} action={<Button onClick={() => void loadMedia()}>Retry</Button>} />
            : <EmptyState title="No files yet" primary={uploading ? undefined : { label: 'Upload Files', icon: <UploadSimple size={15} />, onClick: () => fileRef.current?.click() }} perm={['Sales', 'Edit']} />}
        />
      </Card>

      <ProposalEditor
        open={!!editor}
        onClose={() => setEditor(null)}
        leadId={id}
        initial={editor?.proposal ?? null}
        defaultTitle={`Proposal for ${lead.company_name || lead.contact_name || 'your project'}`}
        onSaved={() => { showToast('Proposal saved.', 'success'); void loadProposals(); }}
      />

      {/* Send to the GC — message the deal's contact (P5) */}
      <FormModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title={`Email ${lead.contact_name || 'contact'}`}
        subtitle={lead.email ? `${lead.contact_name || 'Contact'} · ${lead.email}` : undefined}
        busy={sending}
        onSubmit={sendToGc}
        submitLabel={sending ? 'Sending…' : 'Send Email'}
      >
        <FormGrid cols={1}>
          <Field label="Subject" required>
            <Input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} placeholder="e.g. Updated proposal for Back Nine" autoFocus />
          </Field>
          <Field label="Message" required hint="Logged on this deal's activity.">
            <Textarea value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} placeholder="Write your message to the GC…" rows={8} />
          </Field>
        </FormGrid>
      </FormModal>

      {/* Edit the deal — every saved field comes back pre-filled */}
      <FormModal
        open={editOpen && !!form}
        onClose={() => { if (!savingEdit) setEditOpen(false); }}
        title="Edit Deal"
        busy={savingEdit}
        error={editError}
        onSubmit={saveEdit}
        submitLabel="Save Changes"
      >
        {form && (
          <FormGrid cols={2}>
            <Field label="Company Name" required>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} autoFocus />
            </Field>
            <Field label="Contact Name">
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </Field>
            <Field label="Contact Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Contact Phone">
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Estimated Value ($)">
              <Input type="number" inputMode="decimal" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
            </Field>
            <Field label="Probability (%)">
              <Input type="number" inputMode="numeric" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
            </Field>
            <Field label="Source">
              <Select options={withCurrent(LEAD_SOURCES, form.source)} placeholder="Select source…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
            <Field label="Project Type">
              <Select options={withCurrent(BUILDING_TYPES, form.project_type)} placeholder="Select building type…" value={form.project_type} onChange={(e) => setForm({ ...form, project_type: e.target.value })} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Follow-Up Date">
              <DateInput value={form.next_action_date} onChange={(e) => setForm({ ...form, next_action_date: e.target.value })} />
            </Field>
            <Field label="Next Action" span>
              <Input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} placeholder="e.g. Send revised proposal" />
            </Field>
            <Field label="Notes" span>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
            </Field>
          </FormGrid>
        )}
      </FormModal>
    </PageShell>
  );
}
