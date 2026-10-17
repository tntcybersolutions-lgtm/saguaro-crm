'use client';
/**
 * Change order workflow — where one change stands, laid on the page:
 *
 *   Potential change ─── Request to owner ─── Approved      (who + when on each)
 *   $18,250              contract $1,000,000 → $1,018,250
 *   approvals: ✓ Ada Admin Oct 16   ○ waiting               owner: sent Oct 15
 *   [ the one next action ]
 *
 * Everything comes from GET /api/change-orders/[id]/workflow (lib/change-order-
 * stages workflowView), and every button goes through a route that runs the
 * shared step — the tiers and the money are the server's, never this file's.
 * Wide: the three stages side by side. Narrow (its own width under 560px):
 * stacked, so a phone reads it without sideways scroll.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Circle, PaperPlaneTilt, Link as LinkIcon, Signature, XCircle, ArrowUUpLeft, CurrencyDollar } from '@phosphor-icons/react';
import { Button } from '@/components/ui/kit';
import { textPrompt, confirmDialog } from '@/lib/ui/async-dialog';
import type { CoWorkflowView } from '@/lib/change-order-stages';

const usd = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? '+' : '') + usd(n);
const day = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, status: r.status, data };
}

export default function CoWorkflow({ coId, projectId, refreshKey, onChanged, show, canFull }: {
  coId: string;
  projectId: string;
  refreshKey?: unknown;
  /** Called after any action changed the record (reload the list / the page). */
  onChanged?: () => void;
  show: (msg: string, tone?: 'good' | 'bad') => void;
  /** Change Orders: Full — reject and record the owner's paper signature. */
  canFull?: boolean;
}) {
  const [wf, setWf] = useState<CoWorkflowView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch(`/api/change-orders/${coId}/workflow`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Couldn't load where this change stands."); return; }
      setWf(j.workflow as CoWorkflowView);
    } catch (e) {
      console.error('[CoWorkflow] load failed', e);
      setErr("Couldn't load where this change stands.");
    }
  }, [coId]);
  useEffect(() => { if (!String(coId).startsWith('temp-')) void load(); }, [load, coId, refreshKey]);

  const after = async (r: { ok: boolean; status: number; data: Record<string, unknown> }, okMsg: string) => {
    if (r.status === 202) show(String(r.data.message || 'Recorded.'));
    else if (r.ok) show(okMsg);
    else show(String(r.data.error || "That didn't go through."), 'bad');
    await load();
    if (r.ok) onChanged?.();
  };

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { console.error('[CoWorkflow]', key, e); show("That didn't go through. Try again.", 'bad'); } finally { setBusy(null); }
  }

  const price = () => run('price', async () => {
    if (!wf) return;
    const v = await textPrompt({ title: 'Price this change', label: 'Price ($)', type: 'number', defaultValue: wf.amount ? String(wf.amount) : '', required: true, submitLabel: 'Make it a request' });
    if (v === null) return;
    await after(await post(`/api/change-orders/${coId}/stage`, { to: 'cor', amount: Number(v) }), 'Priced. It is a change order request now.');
  });
  const send = () => run('send', async () => {
    if (!wf) return;
    const email = await textPrompt({ title: 'Send to owner', label: "Owner's email", type: 'email', defaultValue: wf.owner.email || '', required: true, submitLabel: wf.owner.sentAt ? 'Send again' : 'Send' });
    if (email === null) return;
    const r = await post(`/api/change-orders/${coId}/send-to-owner`, { email });
    if (r.ok && r.data.link) {
      try { await navigator.clipboard.writeText(String(r.data.link)); } catch (e) { console.error('[CoWorkflow] clipboard', e); }
    }
    await after(r, r.data.emailed ? `Sent to ${String(r.data.to)}. Link copied.` : 'Link copied — email is not set up, so send it yourself.');
  });
  const approve = () => run('approve', async () => {
    await after(await post(`/api/change-orders/${coId}/approve`, {}), 'Approved. The contract and budget moved.');
  });
  const reject = () => run('reject', async () => {
    const reason = await textPrompt({ title: 'Reject this change order?', label: 'Why (the record keeps it)', multiline: true, submitLabel: 'Reject' });
    if (reason === null) return;
    await after(await post(`/api/change-orders/${coId}/reject`, { reason }), 'Rejected. Nothing is on the contract.');
  });
  const paper = () => run('paper', async () => {
    const name = await textPrompt({ title: "Owner's signature, on paper", label: 'Who signed', defaultValue: '', required: true, submitLabel: 'Record it' });
    if (name === null) return;
    await after(await post(`/api/change-orders/${coId}/owner-signoff`, { name }), "Owner's signature recorded.");
  });
  const back = () => run('back', async () => {
    if (!(await confirmDialog({ title: 'Back to a potential change?', message: 'It leaves the owner’s queue. Nothing is on the contract.', confirmLabel: 'Move back' }))) return;
    await after(await post(`/api/change-orders/${coId}/stage`, { to: 'pco' }), 'Back to a potential change.');
  });
  const copyLink = async () => {
    if (!wf?.owner.link) return;
    try { await navigator.clipboard.writeText(wf.owner.link); show('Owner link copied.'); } catch (e) { console.error('[CoWorkflow] clipboard', e); show("Couldn't copy the link.", 'bad'); }
  };

  if (err) return <div className="cow-err" role="alert"><style dangerouslySetInnerHTML={{ __html: CSS }} />{err} <button type="button" className="cow-link" onClick={() => void load()}>Try again</button></div>;
  if (!wf) return <div className="cow-loading" aria-busy="true"><style dangerouslySetInnerHTML={{ __html: CSS }} />Loading where this change stands…</div>;

  const a = wf.approval;
  const slots = Math.max(a.needed, a.approvers.length);
  const isReq = wf.stage === 'cor' && !wf.closed;
  const primary = wf.next.action;
  const b = (k: string) => busy === k;

  return (
    <div className="cow-cq">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <ol className="cow-steps" aria-label="Change order stages">
        {wf.steps.map((s, i) => (
          <li key={s.key} className="cow-step" data-state={s.state} data-closed={wf.closed && s.key === 'cor' ? 'true' : undefined}>
            <span className="cow-dot" aria-hidden>{s.state === 'done' ? <Check size={14} weight="bold" /> : i + 1}</span>
            <span className="cow-step-l">{s.label}</span>
            <span className="cow-step-m">{s.note || [s.who, day(s.at)].filter(Boolean).join(' · ') || (s.state === 'todo' ? 'Not yet' : '')}</span>
          </li>
        ))}
      </ol>

      <div className="cow-money" aria-label="Money impact">
        <div className="cow-fig cow-fig-main">
          <span className="cow-fig-l">{wf.stage === 'pco' && !wf.cor ? 'Estimate' : 'This change'}</span>
          <span className="cow-fig-v" data-neg={wf.amount < 0 ? 'true' : undefined}>
            {wf.stage === 'pco' && wf.estimate && wf.estimate.min !== wf.estimate.max ? `${usd(wf.estimate.min)}–${usd(wf.estimate.max)}` : signed(wf.amount)}
          </span>
        </div>
        <div className="cow-fig">
          <span className="cow-fig-l">Contract now</span>
          <span className="cow-fig-v2">{usd(wf.money.contractNow)}</span>
        </div>
        {wf.stage !== 'approved' && !wf.closed && !wf.cor && (
          <div className="cow-fig">
            <span className="cow-fig-l">When approved</span>
            <span className="cow-fig-v2">{usd(wf.money.contractAfter)}</span>
          </div>
        )}
      </div>

      {wf.pcos.length > 0 && (
        <div className="cow-line">
          <span className="cow-line-l">In this request</span>
          <span className="cow-line-v">{wf.pcos.map((p) => `PCO #${p.number ?? ''} ${usd(p.amount)}`).join(' · ')}</span>
        </div>
      )}
      {wf.cor && (
        <div className="cow-line">
          <span className="cow-line-l">Part of</span>
          <a className="cow-link" href={`/app/projects/${projectId}/items/change_orders/${wf.cor.id}`}>CO #{wf.cor.number} · {wf.cor.title}</a>
        </div>
      )}

      {(isReq || wf.stage === 'approved') && (
        <div className="cow-appr">
          <div className="cow-line">
            <span className="cow-line-l">Approvals</span>
            <span className="cow-line-v">{wf.tier.range} · {wf.tier.needs}</span>
          </div>
          <ul className="cow-slots">
            {Array.from({ length: slots }).map((_, i) => {
              const p = a.approvers[i];
              return (
                <li key={i} data-done={p ? 'true' : undefined}>
                  {p ? <Check size={15} weight="bold" /> : <Circle size={15} />}
                  <span>{p ? p.name : 'Waiting'}</span>
                  {p && <span className="cow-when">{day(p.at)}</span>}
                </li>
              );
            })}
            <li data-done={wf.owner.signedAt ? 'true' : undefined} data-owner="true">
              {wf.owner.signedAt ? <Signature size={15} weight="bold" /> : <PaperPlaneTilt size={15} />}
              <span>{wf.owner.signedAt ? `Owner signed — ${wf.owner.name?.replace(/^Owner:\s*/, '')}` : wf.owner.sentAt ? `Sent to ${wf.owner.email || 'owner'}` : 'Owner: not sent'}</span>
              <span className="cow-when">{day(wf.owner.signedAt || wf.owner.sentAt)}</span>
            </li>
          </ul>
          {wf.owner.returnedAt && wf.closed && <div className="cow-hint">Owner returned it {day(wf.owner.returnedAt)}{wf.owner.note ? `: “${wf.owner.note}”` : ''}</div>}
        </div>
      )}

      <div className="cow-actions">
        {primary === 'price' && <Button variant="primary" icon={<CurrencyDollar size={16} />} onClick={price} disabled={!!busy}>{b('price') ? 'Saving…' : wf.next.label}</Button>}
        {primary === 'send' && <Button variant="primary" icon={<PaperPlaneTilt size={16} />} onClick={send} disabled={!!busy}>{b('send') ? 'Sending…' : wf.next.label}</Button>}
        {primary === 'approve' && <Button variant="primary" icon={<Check size={16} weight="bold" />} onClick={approve} disabled={!!busy}>{b('approve') ? 'Approving…' : wf.next.label}</Button>}

        {isReq && primary !== 'approve' && wf.you.canApprove && wf.status !== 'submitted' && <Button icon={<Check size={16} />} onClick={approve} disabled={!!busy}>{b('approve') ? 'Approving…' : `Approve ${usd(Math.abs(wf.amount))}`}</Button>}
        {isReq && primary !== 'send' && !wf.owner.signedAt && <Button variant="ghost" icon={<PaperPlaneTilt size={16} />} onClick={send} disabled={!!busy}>{wf.owner.sentAt ? 'Send again' : 'Send to owner'}</Button>}
        {isReq && wf.owner.link && !wf.owner.signedAt && <Button variant="ghost" icon={<LinkIcon size={16} />} onClick={() => void copyLink()}>Copy owner link</Button>}
        {isReq && canFull && !wf.owner.signedAt && <Button variant="ghost" icon={<Signature size={16} />} onClick={paper} disabled={!!busy}>Owner signed on paper</Button>}
        {isReq && canFull && <Button variant="ghost" icon={<XCircle size={16} />} onClick={reject} disabled={!!busy}>Reject</Button>}
        {isReq && wf.pcos.length === 0 && wf.status !== 'submitted' && a.approvers.length === 0 && <Button variant="ghost" icon={<ArrowUUpLeft size={16} />} onClick={back} disabled={!!busy}>Back to potential</Button>}
      </div>
      {wf.next.hint && <div className="cow-hint">{wf.next.hint}</div>}
    </div>
  );
}

const CSS = `
.cow-cq{container:cow / inline-size;display:flex;flex-direction:column;gap:16px;min-width:0}
.cow-loading,.cow-err{font-size:14px;color:var(--text-secondary);padding:8px 0}
.cow-err{color:var(--danger)}
.cow-link{background:none;border:0;padding:0;font:inherit;font-weight:650;color:var(--link);cursor:pointer;text-decoration:none}
.cow-link:hover{color:var(--link-hover)}
.cow-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}
.cow-step{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;column-gap:10px;row-gap:2px;padding:4px 12px 4px 0}
.cow-step::after{content:'';position:absolute;left:34px;right:8px;top:16px;height:2px;background:var(--border-default)}
.cow-step:last-child::after{display:none}
.cow-step[data-state="done"]::after{background:var(--success)}
.cow-dot{grid-row:1/3;position:relative;z-index:1;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;font-size:13px;font-weight:800;background:var(--bg-base);color:var(--text-tertiary);border:2px solid var(--border-default)}
.cow-step[data-state="done"] .cow-dot{background:var(--success-bg);color:var(--success-fg);border-color:var(--success)}
.cow-step[data-state="current"] .cow-dot{background:var(--selected-control-bg);color:var(--selected-control-fg);border-color:var(--selected-control-bg)}
.cow-step[data-closed="true"] .cow-dot{background:var(--danger-bg);color:var(--danger-fg);border-color:var(--danger)}
.cow-step-l{position:relative;z-index:1;font-size:14px;font-weight:700;color:var(--text-primary);background:var(--bg-base);padding-right:8px;justify-self:start;margin-top:4px}
.cow-step[data-state="todo"] .cow-step-l{color:var(--text-secondary)}
.cow-step-m{font-size:13px;color:var(--text-secondary);overflow-wrap:anywhere}
.cow-money{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 32px}
.cow-fig{display:flex;flex-direction:column;gap:2px;min-width:0}
.cow-fig-l{font-size:13px;font-weight:600;color:var(--text-tertiary)}
.cow-fig-v{font-size:36px;font-weight:800;line-height:1.1;color:var(--text-primary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.cow-fig-v[data-neg="true"]{color:var(--success)}
.cow-fig-v2{font-size:20px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums}
.cow-line{display:flex;gap:12px;flex-wrap:wrap;align-items:baseline;font-size:14px}
.cow-line-l{font-size:13px;font-weight:700;color:var(--text-tertiary);min-width:96px}
.cow-line-v{color:var(--text-primary)}
.cow-appr{display:flex;flex-direction:column;gap:8px}
.cow-slots{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 24px}
.cow-slots li{display:inline-flex;align-items:center;gap:6px;min-height:32px;font-size:14px;color:var(--text-secondary)}
.cow-slots li[data-done="true"]{color:var(--text-primary)}
.cow-slots li[data-done="true"] > svg{color:var(--success)}
.cow-when{font-size:12px;color:var(--text-tertiary)}
.cow-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cow-hint{font-size:13px;color:var(--text-secondary);line-height:1.5}
@container cow (max-width:560px){
  .cow-steps{grid-template-columns:minmax(0,1fr);row-gap:10px}
  .cow-step::after{left:13px;right:auto;top:32px;bottom:-10px;width:2px;height:auto}
  .cow-fig-v{font-size:30px}
  .cow-actions .k-btn{flex:1 1 100%;min-height:44px;justify-content:center}
}
`;
