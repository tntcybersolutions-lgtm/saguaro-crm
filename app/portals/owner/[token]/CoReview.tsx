'use client';
/**
 * The owner's change order review — the same /portals/owner/<token> link as a
 * pay application, for a change order request the contractor sent
 * (lib/change-order-stages sendToOwner). No login: the token is the credential.
 *
 * It shows the price first, then the change in the contractor's words, then
 * the two answers. Approving is the owner's signature; the contractor's
 * approvers book it onto the contract (lib/change-order-status).
 */
import React, { useState } from 'react';
import { Cactus, Check, CheckCircle, ArrowCounterClockwise, X } from '@phosphor-icons/react';

type Review = { open: boolean; decision: 'approved' | 'rejected' | null; decidedAt: string | null; booked: boolean };
export type CoReviewData = {
  changeOrder: { co_number: number | null; title: string; description: string; reason: string; scope_of_change: string; amount: number; schedule_impact_days: number; sent_at: string | null };
  project: { name?: string | null; address?: string | null } | null;
  company: { company_name?: string | null } | null;
  review: Review;
};

const usd = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const CSS = `
.ocWrap{min-height:100vh;background:var(--bg-base);color:var(--text-primary);font-family:system-ui,-apple-system,sans-serif}
.ocTop{background:var(--bg-surface);border-bottom:1px solid var(--border-default);padding:14px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ocMain{max-width:760px;margin:0 auto;padding:28px 16px 48px}
.ocKicker{font-size:13px;font-weight:700;color:var(--text-secondary)}
.ocTitle{font-size:22px;font-weight:800;margin-top:6px;overflow-wrap:anywhere}
.ocBig{font-size:44px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;margin:18px 0 6px}
.ocBig[data-neg="true"]{color:var(--success)}
.ocFacts{display:flex;gap:24px;flex-wrap:wrap;font-size:14px;color:var(--text-secondary);padding-bottom:20px;border-bottom:1px solid var(--border-default)}
.ocFacts b{color:var(--text-primary)}
.ocSec{padding:18px 0;border-bottom:1px solid var(--border-default)}
.ocSecH{font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:6px}
.ocProse{font-size:15px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.ocField{display:flex;flex-direction:column;gap:6px;margin-top:18px}
.ocField label{font-size:13px;font-weight:700;color:var(--text-secondary)}
.ocInput{width:100%;box-sizing:border-box;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px 14px;color:var(--text-primary);font-size:16px}
.ocBtns{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
.ocBtn{flex:1 1 220px;min-height:52px;padding:12px 16px;border-radius:10px;font-weight:800;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.ocBtn:disabled{opacity:.6;cursor:not-allowed}
.ocApprove{background:var(--brand-primary);color:var(--on-brand);border:1px solid var(--brand-primary)}
.ocReturn{background:transparent;color:var(--text-primary);border:1px solid var(--border-default)}
.ocErr{margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger-fg);font-size:14px}
.ocDone{min-height:100vh;background:var(--bg-base);display:flex;align-items:center;justify-content:center;padding:24px 16px;font-family:system-ui,-apple-system,sans-serif;text-align:center}
.ocDoneT{font-size:22px;font-weight:800;color:var(--text-primary);margin-top:14px}
.ocDoneB{font-size:15px;color:var(--text-secondary);margin-top:10px;line-height:1.6;max-width:460px}
`;

export default function CoReview({ token, data }: { token: string; data: CoReviewData }) {
  const co = data.changeOrder;
  const [review, setReview] = useState<Review>(data.review);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const label = `Change Order #${co.co_number ?? ''}`.trim();
  const company = data.company?.company_name || 'Your contractor';

  async function decide(action: 'approved' | 'rejected') {
    if (action === 'approved' && !name.trim()) { setErr('Type your name to sign.'); return; }
    if (action === 'rejected' && !note.trim()) { setErr('Tell the contractor what to change, then return it.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/owner-portal/approve/' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note, name }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.review) setReview(d.review);
      else if (r.status === 409 && d.review) setReview(d.review);
      else setErr(d.error || "That didn't go through. Please try again.");
    } catch (e) {
      console.error('[owner CO review] decision failed', e);
      setErr("That didn't go through. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!review.open) {
    const when = day(review.decidedAt);
    return (
      <div className="ocDone">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div>
          {review.decision === 'approved'
            ? <CheckCircle size={56} weight="fill" color="var(--success)" />
            : <ArrowCounterClockwise size={56} weight="bold" color="var(--warning)" />}
          <div className="ocDoneT">{review.decision === 'approved' ? `${label} approved` : `${label} returned`}</div>
          <div className="ocDoneB">
            {review.decision === 'approved'
              ? `${usd(co.amount)}${when ? `, signed ${when}` : ''}. ${review.booked ? 'It is on the contract.' : `${company} has been told and will book it.`} Nothing more is needed from you.`
              : `Sent back to ${company}${when ? ` on ${when}` : ''}. You'll get a new email when the revised change order is ready.`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ocWrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ocTop">
        <Cactus size={22} weight="fill" color="var(--text-secondary)" />
        <span style={{ fontWeight: 800, fontSize: 16 }}>{company}</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Change order for your approval</span>
      </div>
      <div className="ocMain">
        <div className="ocKicker">{[label, data.project?.name].filter(Boolean).join(' · ')}</div>
        <div className="ocTitle">{co.title || 'Change order'}</div>
        <div className="ocBig" data-neg={co.amount < 0 ? 'true' : undefined}>{usd(co.amount)}</div>
        <div className="ocFacts">
          <span>{co.amount < 0 ? 'Credit to you' : 'Added to the contract'}</span>
          <span>Schedule <b>{co.schedule_impact_days > 0 ? `+${co.schedule_impact_days} day${co.schedule_impact_days === 1 ? '' : 's'}` : 'no change'}</b></span>
          {co.sent_at && <span>Sent {day(co.sent_at)}</span>}
        </div>
        {(co.scope_of_change || co.description) && (
          <div className="ocSec">
            <div className="ocSecH">What changes</div>
            <div className="ocProse">{co.scope_of_change || co.description}</div>
          </div>
        )}
        {co.reason && (
          <div className="ocSec">
            <div className="ocSecH">Why</div>
            <div className="ocProse">{co.reason}</div>
          </div>
        )}
        <div className="ocField">
          <label htmlFor="ocName">Your name (your signature)</label>
          <input id="ocName" className="ocInput" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="ocField">
          <label htmlFor="ocNote">Note for {company} (needed to return it)</label>
          <textarea id="ocNote" className="ocInput" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="ocBtns">
          <button type="button" className="ocBtn ocApprove" onClick={() => decide('approved')} disabled={saving}><Check size={18} weight="bold" /> Approve {usd(co.amount)}</button>
          <button type="button" className="ocBtn ocReturn" onClick={() => decide('rejected')} disabled={saving}><X size={18} weight="bold" /> Return it</button>
        </div>
        {err && <div className="ocErr" role="alert">{err}</div>}
      </div>
    </div>
  );
}
