'use client';
/**
 * Homeowner Update — written from the daily logs, approved by the PM, then
 * sent (lib/owner-update, /api/projects/[id]/owner-updates). Nothing reaches
 * the client until Approve & Send: the draft is saved on the job, editable,
 * and discardable. Sent updates show in the client portal (Updates tab and
 * Messages) and go by email to everyone with portal access.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiErrorFrom } from '@/lib/api-refusal';
import { FormModal, Field, Input, Textarea, Button, Select } from '@/components/ui/kit';
import { PaperPlaneTilt, Sparkle, Trash } from '@phosphor-icons/react';
import { localDay } from '@/lib/calendar-day';

type Update = {
  id: string; title: string; body: string; status: 'draft' | 'sent';
  period: { start: string; end: string }; sent_at?: string | null; recipients?: string[]; created_at: string;
};

const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function OwnerUpdateModal({ projectId, open, onClose, onToast }: {
  projectId: string; open: boolean; onClose: () => void; onToast: (msg: string, tone?: 'good' | 'bad') => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'draft' | 'save' | 'send' | 'discard'>('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Update | null>(null);
  const [sent, setSent] = useState<Update[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [days, setDays] = useState('7');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/owner-updates`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load the updates.');
      const all = (j.updates || []) as Update[];
      const d = all.find((u) => u.status === 'draft') || null;
      setDraft(d);
      setTitle(d?.title || '');
      setBody(d?.body || '');
      setSent(all.filter((u) => u.status === 'sent').slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the updates.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function write() {
    setBusy('draft');
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/owner-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(days), today: localDay() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.update) throw new Error(j.error || 'The update could not be written.');
      setDraft(j.update);
      setTitle(j.update.title);
      setBody(j.update.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The update could not be written.');
    } finally {
      setBusy('');
    }
  }

  async function save(send: boolean) {
    if (!draft) return;
    if (!title.trim() || body.trim().length < 10) { setError('Give it a subject and a few lines first.'); return; }
    setBusy(send ? 'send' : 'save');
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/owner-updates/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, ...(send ? { action: 'send' } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save the update.');
      if (send) {
        onToast(j.portalClients === 0
          ? 'Posted to the client portal. Your client has no portal access yet — invite them from Portals.'
          : `Sent — emailed ${j.emailed} client${j.emailed === 1 ? '' : 's'} and posted to their portal.${j.failed?.length ? ` ${j.failed.length} email${j.failed.length === 1 ? '' : 's'} did not go.` : ''}`);
        onClose();
      } else {
        setDraft(j.update);
        onToast('Draft saved — nothing has been sent.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the update.');
    } finally {
      setBusy('');
    }
  }

  async function discard() {
    if (!draft) return;
    setBusy('discard');
    try {
      const r = await fetch(`/api/projects/${projectId}/owner-updates/${draft.id}`, { method: 'DELETE' });
      if (!r.ok) throw await apiErrorFrom(r, 'discard');
      setDraft(null);
      setTitle('');
      setBody('');
    } catch {
      setError('Could not discard the draft.');
    } finally {
      setBusy('');
    }
  }

  const footer = draft ? (
    <>
      {error && <span className="k-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>{error}</span>}
      <Button variant="ghost" icon={<Trash size={15} />} onClick={discard} disabled={!!busy}>Discard</Button>
      <Button onClick={() => save(false)} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save Draft'}</Button>
      <Button variant="primary" icon={<PaperPlaneTilt size={15} weight="fill" />} onClick={() => save(true)} disabled={!!busy}>
        {busy === 'send' ? 'Sending…' : 'Approve & Send'}
      </Button>
    </>
  ) : (
    <>
      {error && <span className="k-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>{error}</span>}
      <Button variant="ghost" onClick={onClose} disabled={!!busy}>Close</Button>
      <Button variant="primary" icon={<Sparkle size={15} weight="fill" />} onClick={write} disabled={!!busy || loading}>
        {busy === 'draft' ? 'Writing from the logs…' : 'Write Draft'}
      </Button>
    </>
  );

  return (
    <FormModal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Homeowner Update"
      subtitle={draft
        ? `Draft from the logs of ${fmtDay(draft.period.start)} – ${fmtDay(draft.period.end)}. Edit it — nothing goes to your client until you approve.`
        : 'Saguaro writes it from your daily logs. You read it, edit it, and approve before your client sees a word.'}
      busy={!!busy}
      footer={footer}
    >
      {loading ? (
        <div className="k-hint" style={{ padding: 16 }}>Loading…</div>
      ) : draft ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Subject" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} style={{ fontSize: 16 }} />
          </Field>
          <Field label="Update" required hint="Plain words for the homeowner. Lines starting with “- ” become bullets.">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={{ fontSize: 16, lineHeight: 1.55 }} />
          </Field>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Write from the last" hint="Days of daily logs to cover, ending today.">
            <Select value={days} onChange={(e) => setDays(e.target.value)} options={[
              { value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' },
            ]} />
          </Field>
          {sent.length > 0 && (
            <div>
              <div className="k-label" style={{ marginBottom: 6 }}>Sent before</div>
              {sent.map((u) => (
                <div key={u.id} style={{ padding: '8px 0', borderTop: '1px solid var(--sg-border)' }}>
                  <div style={{ fontWeight: 700 }}>{u.title}</div>
                  <div className="k-hint">{u.sent_at ? `Sent ${fmtDay(u.sent_at)}` : ''}{u.recipients?.length ? ` · emailed ${u.recipients.length}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </FormModal>
  );
}
