'use client';
/**
 * ProposalSignPanel — the GC's side of proposal e-signature, on the deal page
 * and the job's Proposals page (one component, one API: /api/proposals/[id]/esign).
 *
 * Shows the latest signing link's status as a chip with its timestamps
 * (Sent / Viewed / Signed / Declined / Voided / Expired), the audit trail, and
 * the one next action: Send for Signature, Resend / Void while it is out, or
 * Download Signed PDF once signed. Flat: no card of its own — it sits in the
 * section that hosts it. Colors are theme tokens only; targets are 44px.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  PaperPlaneTilt, ArrowClockwise, Prohibit, DownloadSimple, Eye, SealCheck, XCircle, Clock, Copy, ShieldCheck,
} from '@phosphor-icons/react';
import { Badge, Button, Field, FormGrid, FormModal, Input, Select, Textarea, Timeline, type BadgeTone, type Tone } from '@/components/ui/kit';
import { useToast } from '@/components/Toast';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';
import { SIGN_STATUS_LABEL, type SignStatus } from '@/lib/proposal-esign-core';

type SignRequest = {
  id: string; status: SignStatus; on_sign: 'flag' | 'win';
  signer_name: string; signer_email: string; signer_title: string | null;
  sent_at: string; expires_at: string; viewed_at: string | null; last_viewed_at: string | null; view_count: number;
  signed_at: string | null; signed_name: string | null; signature_method: string | null; signer_ip: string | null;
  declined_at: string | null; decline_reason: string | null; voided_at: string | null;
  content_hash: string; has_signed_pdf: boolean; signed_pdf_sha256: string | null;
};
type SignEvent = { id: string; signature_id: string; event: string; actor: string; ip: string | null; detail: Record<string, unknown> | null; created_at: string };

const TONE: Record<SignStatus, BadgeTone> = { sent: 'lead', viewed: 'lead', signed: 'ongoing', declined: 'overdue', voided: 'closed', expired: 'closed' };
const EVENT_TITLE: Record<string, string> = { sent: 'Sent for signature', viewed: 'Opened by the customer', signed: 'Signed', declined: 'Declined', voided: 'Link voided' };
const EVENT_TONE: Record<string, Tone> = { sent: 'info', viewed: 'info', signed: 'success', declined: 'danger', voided: 'neutral' };
const EVENT_ICON: Record<string, React.ReactNode> = {
  sent: <PaperPlaneTilt size={14} weight="bold" />, viewed: <Eye size={14} weight="bold" />, signed: <SealCheck size={14} weight="bold" />,
  declined: <XCircle size={14} weight="bold" />, voided: <Prohibit size={14} weight="bold" />,
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export interface ProposalSignPanelProps {
  proposalId: string;
  /** Prefill for the send form — the deal's contact or the job's owner. */
  defaultSigner: { name: string; email: string; title?: string };
  /** What "win on signature" means here, e.g. "move this deal to Won". */
  winLabel: string;
  /** False when the proposal has no amount yet — sending is pointless. */
  canSend: boolean;
  /** Called after any change (send, void, a status found signed) so the host refreshes. */
  onChanged?: (latest: SignRequest | null) => void;
}

export default function ProposalSignPanel({ proposalId, defaultSigner, winLabel, canSend, onChanged }: ProposalSignPanelProps) {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<SignRequest[]>([]);
  const [events, setEvents] = useState<SignEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<null | { mode: 'send' | 'resend'; name: string; email: string; title: string; message: string; days: string; win: boolean }>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/proposals/${proposalId}/esign`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load the signature status.');
      setRequests((j.requests || []) as SignRequest[]);
      setEvents((j.events || []) as SignEvent[]);
      setLoadError('');
      return ((j.requests || []) as SignRequest[])[0] ?? null;
    } catch (e) {
      setLoadError(humanError(e, 'Could not load the signature status.'));
      return null;
    } finally {
      setLoaded(true);
    }
  }, [proposalId]);
  useEffect(() => { void load(); }, [load]);

  const latest = requests[0] ?? null;
  const isOpen = latest && (latest.status === 'sent' || latest.status === 'viewed');

  const openForm = (mode: 'send' | 'resend') => {
    setFormError(null);
    setForm({
      mode,
      name: latest?.signer_name || defaultSigner.name || '',
      email: latest?.signer_email || defaultSigner.email || '',
      title: latest?.signer_title || defaultSigner.title || '',
      message: '',
      days: '30',
      win: latest?.on_sign === 'win',
    });
  };

  const submit = async () => {
    if (!form) return;
    setBusy('send');
    setFormError(null);
    try {
      const r = await fetch(`/api/proposals/${proposalId}/esign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: form.mode, signer_name: form.name, signer_email: form.email, signer_title: form.title || undefined,
          message: form.message || undefined, expires_days: Number(form.days), on_sign: form.win ? 'win' : 'flag',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send the proposal.');
      setForm(null);
      setManualLink(j.emailed ? null : (j.sign_url as string) || null);
      showToast(j.emailed ? `Sent to ${form.email}.` : (j.warning as string) || 'Link created.', j.emailed ? 'success' : 'warning');
      onChanged?.(await load());
    } catch (e) {
      setFormError(humanError(e, 'Could not send the proposal.'));
    } finally {
      setBusy(null);
    }
  };

  const voidLink = async () => {
    if (!(await confirmDialog({ title: 'Void this signing link?', message: 'The link stops working at once. You can send a new one afterwards.', confirmLabel: 'Void Link', danger: true }))) return;
    setBusy('void');
    try {
      const r = await fetch(`/api/proposals/${proposalId}/esign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not void the link.');
      setManualLink(null);
      showToast('Link voided.', 'success');
      onChanged?.(await load());
    } catch (e) {
      showToast(humanError(e, 'Could not void the link.'), 'error');
      onChanged?.(await load());
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('pdf');
    try {
      const r = await fetch(`/api/proposals/${proposalId}/esign/pdf${latest ? `?request=${latest.id}` : ''}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || 'Could not open the signed PDF.');
      window.open(j.url as string, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showToast(humanError(e, 'Could not open the signed PDF.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!manualLink) return;
    try {
      await navigator.clipboard.writeText(manualLink);
      showToast('Link copied.', 'success');
    } catch (e) {
      showToast(humanError(e, 'Could not copy — select the link and copy it.'), 'error');
    }
  };

  if (!loaded) return <p className="k-hint" style={{ margin: '8px 0' }}>Loading signature status…</p>;

  const facts: string[] = [];
  if (latest) {
    facts.push(`Sent ${when(latest.sent_at)} to ${latest.signer_name}`);
    if (latest.viewed_at) facts.push(`Opened ${when(latest.viewed_at)}${latest.view_count > 1 ? ` (${latest.view_count} views)` : ''}`);
    if (latest.status === 'signed' && latest.signed_at) facts.push(`Signed ${when(latest.signed_at)} by ${latest.signed_name || latest.signer_name}`);
    if (latest.status === 'declined' && latest.declined_at) facts.push(`Declined ${when(latest.declined_at)}`);
    if (latest.status === 'voided' && latest.voided_at) facts.push(`Voided ${when(latest.voided_at)}`);
    if (latest.status === 'expired') facts.push(`Expired ${day(latest.expires_at)}`);
    if (isOpen) facts.push(`Link good until ${day(latest.expires_at)}`);
  }
  const trail = latest ? events.filter((e) => e.signature_id === latest.id) : [];

  return (
    <div className="pesign">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {loadError && <p className="k-error" role="alert">{loadError}</p>}

      <div className="pesign-head">
        {latest
          ? <Badge tone={TONE[latest.status]} dot>{SIGN_STATUS_LABEL[latest.status]}</Badge>
          : <Badge tone="neutral">Not Sent</Badge>}
        <div className="pesign-acts">
          {latest?.status === 'signed' && (
            <Button icon={<DownloadSimple size={15} />} onClick={() => void download()} disabled={busy === 'pdf'}>
              {busy === 'pdf' ? 'Opening…' : 'Download Signed PDF'}
            </Button>
          )}
          {isOpen && (
            <>
              <Button icon={<ArrowClockwise size={15} />} onClick={() => openForm('resend')} disabled={!!busy}>Resend</Button>
              <Button variant="danger" icon={<Prohibit size={15} />} onClick={() => void voidLink()} disabled={!!busy}>{busy === 'void' ? 'Voiding…' : 'Void Link'}</Button>
            </>
          )}
          {(!latest || latest.status === 'declined' || latest.status === 'voided' || latest.status === 'expired') && (
            <Button variant="primary" icon={<PaperPlaneTilt size={15} />} onClick={() => openForm(latest ? 'resend' : 'send')} disabled={!canSend || !!busy}
              title={canSend ? undefined : 'Add a line item or an amount first.'}>
              {latest ? 'Send a New Link' : 'Send for Signature'}
            </Button>
          )}
        </div>
      </div>

      {facts.length > 0 && <p className="pesign-facts">{facts.join(' · ')}</p>}
      {latest?.status === 'declined' && (
        <p className="pesign-reason">{latest.decline_reason ? `Their reason: “${latest.decline_reason}”` : 'They did not give a reason.'}</p>
      )}
      {latest?.status === 'signed' && (
        <p className="pesign-hash"><ShieldCheck size={14} weight="bold" aria-hidden /> Content fingerprint (SHA-256) {latest.content_hash.slice(0, 16)}…{latest.content_hash.slice(-8)}</p>
      )}
      {!latest && !canSend && <p className="pesign-facts">Add a line item or an amount, then send it for signature.</p>}

      {manualLink && (
        <div className="pesign-link">
          <span className="k-label">Signing link — send it yourself</span>
          <div className="pesign-link-row">
            <Input readOnly value={manualLink} aria-label="Signing link" onFocus={(e) => e.currentTarget.select()} />
            <Button icon={<Copy size={15} />} onClick={() => void copyLink()}>Copy</Button>
          </div>
        </div>
      )}

      {trail.length > 0 && (
        <div className="pesign-trail">
          <span className="k-label">Audit trail</span>
          <Timeline items={trail.slice().reverse().map((e) => ({
            key: e.id,
            icon: EVENT_ICON[e.event] || <Clock size={14} weight="bold" />,
            tone: EVENT_TONE[e.event] || 'neutral',
            title: EVENT_TITLE[e.event] || e.event,
            meta: `${when(e.created_at)}${e.ip ? ` · IP ${e.ip}` : ''}`,
            body: e.event === 'declined' && typeof e.detail?.reason === 'string' ? `“${e.detail.reason}”` : undefined,
          }))} />
        </div>
      )}

      <FormModal
        open={!!form}
        onClose={() => { if (!busy) setForm(null); }}
        title={form?.mode === 'resend' ? 'Resend for Signature' : 'Send for Signature'}
        subtitle={form?.mode === 'resend' ? 'The old link stops working and a new one goes out with the proposal as it is now.' : 'They read the proposal and sign it on their phone or computer.'}
        onSubmit={submit}
        submitLabel={busy === 'send' ? 'Sending…' : form?.mode === 'resend' ? 'Resend' : 'Send'}
        busy={busy === 'send'}
        error={formError}
      >
        {form && (
          <FormGrid cols={2}>
            <Field label="Signer Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
            </Field>
            <Field label="Signer Email" required>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" inputMode="email" />
            </Field>
            <Field label="Signer Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Owner" />
            </Field>
            <Field label="Link Good For">
              <Select options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '90', label: '90 days' }]}
                value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </Field>
            <Field label="Message" span hint="Shown in the email and on the signing page.">
              <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} />
            </Field>
            <div className="k-span-all">
              <label className="pesign-check">
                <input type="checkbox" checked={form.win} onChange={(e) => setForm({ ...form, win: e.target.checked })} />
                <span>When they sign, {winLabel}</span>
              </label>
              <span className="k-hint">Off: the proposal is marked Signed and you choose when to win it.</span>
            </div>
          </FormGrid>
        )}
      </FormModal>
    </div>
  );
}

const CSS = `
.pesign{display:flex;flex-direction:column;gap:10px}
.pesign-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pesign-acts{display:flex;gap:8px;flex-wrap:wrap}
.pesign-acts .k-btn{min-height:44px}
.pesign-facts{margin:0;font-size:13px;color:var(--text-secondary);line-height:1.5}
.pesign-reason{margin:0;font-size:14px;color:var(--text-primary)}
.pesign-hash{margin:0;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.pesign-link{display:flex;flex-direction:column;gap:6px}
.pesign-link-row{display:flex;gap:8px}
.pesign-link-row .k-input{flex:1;min-width:0}
.pesign-trail{display:flex;flex-direction:column;gap:6px;padding-top:4px}
.pesign-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px;color:var(--text-primary);cursor:pointer}
.pesign-check input{width:20px;height:20px;flex:none;accent-color:var(--brand-primary)}
@media (max-width:640px){.pesign-acts{width:100%}.pesign-acts .k-btn{flex:1 1 auto}}
`;
