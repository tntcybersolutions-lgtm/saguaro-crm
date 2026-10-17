'use client';
/**
 * The owner's pay-application review — opened from the link in the
 * "Pay App submitted" email (/portals/owner/<token>, and the older
 * /owner-portal/approve/<token> address, which renders this same page).
 *
 * Every figure on it is the pay application's own. There is no sample data:
 * an unknown link says so, and a link whose application was already decided
 * says when and how, instead of offering the buttons again.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Cactus, Check, CheckCircle, FilePdf, Warning, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import { retainageHeld, retainageRate, type RetainageLedger } from '@/lib/retainage';
import CoReview, { type CoReviewData } from './CoReview';

// Postgres numerics arrive as strings; a string's toLocaleString() does not group digits.
const fmt = (n: unknown) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (iso: unknown) => {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

type Review = { open: boolean; decision: 'approved' | 'rejected' | 'withdrawn' | null; decidedAt: string | null };

const CSS = `
.opWrap{min-height:100vh;background:var(--bg-base);color:var(--text-primary);font-family:system-ui,-apple-system,sans-serif}
.opTop{background:var(--bg-surface);border-bottom:1px solid var(--border-default);padding:14px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.opMain{max-width:900px;margin:0 auto;padding:24px 16px 48px}
.opKpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}
.opKpi{background:var(--bg-surface);border:1px solid var(--border-default);border-radius:10px;padding:14px 16px}
.opKpiL{font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:5px}
.opKpiV{font-size:20px;font-weight:800;color:var(--text-primary)}
.opSec{background:var(--bg-surface);border:1px solid var(--border-default);border-radius:10px;overflow:hidden;margin-bottom:20px}
.opSecH{padding:12px 16px;border-bottom:1px solid var(--border-default);font-weight:700;font-size:14px}
.opRow{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:13px}
.opRow span:first-child{color:var(--text-secondary)}
.opRow span:last-child{font-weight:700;white-space:nowrap}
.opTbl{width:100%;border-collapse:collapse;font-size:12px}
.opTbl th{padding:8px 10px;text-align:right;color:var(--text-secondary);font-weight:700;white-space:nowrap;border-bottom:1px solid var(--border-default);background:var(--bg-surface-2)}
.opTbl td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--border-subtle)}
.opTbl td.opDesc,.opTbl th.opDesc{text-align:left;max-width:240px}
.opBtns{display:flex;gap:12px;flex-wrap:wrap}
.opBtn{flex:1 1 220px;min-height:48px;padding:12px 16px;border-radius:9px;font-weight:800;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.opBtn:disabled{opacity:.6;cursor:not-allowed}
.opApprove{background:var(--brand-primary);color:var(--on-brand);border:1px solid var(--brand-primary)}
.opReturn{background:var(--danger-bg);color:var(--danger-fg);border:1px solid var(--danger-border)}
.opNote{width:100%;box-sizing:border-box;background:var(--bg-input);border:1px solid var(--border-default);border-radius:8px;padding:10px 14px;color:var(--text-primary);font-size:16px;resize:vertical}
.opCenter{min-height:100vh;background:var(--bg-base);display:flex;align-items:center;justify-content:center;padding:24px 16px;font-family:system-ui,-apple-system,sans-serif}
.opMsg{text-align:center;max-width:460px}
.opMsgT{font-size:22px;font-weight:800;color:var(--text-primary);margin-top:14px}
.opMsgB{font-size:14px;color:var(--text-secondary);margin-top:10px;line-height:1.6}
.opErr{margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger-fg);font-size:14px}
.opDl{padding:10px 16px;min-height:44px;display:inline-flex;align-items:center;gap:6px;background:var(--bg-surface-2);border:1px solid var(--border-default);border-radius:7px;color:var(--link);font-size:13px;font-weight:700;text-decoration:none}
`;

function Centered({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="opCenter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="opMsg">
        {icon}
        <div className="opMsgT">{title}</div>
        <div className="opMsgB">{body}</div>
      </div>
    </div>
  );
}

export default function OwnerApprovalPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState<'not_found' | 'failed' | null>(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch('/api/owner-portal/approve/' + encodeURIComponent(token));
      if (r.status === 404) { setLoadError('not_found'); return; }
      const d = await r.json();
      if (!r.ok || (!d.payApp && !d.changeOrder)) { setLoadError('failed'); return; }
      setData(d);
      setReview(d.review ?? null);
    } catch (e) {
      console.error('[owner portal] load failed', e);
      setLoadError('failed');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(act: 'approved' | 'rejected') {
    if (act === 'rejected' && !note.trim()) {
      setActionError('Tell the contractor what to fix in the notes box, then return it.');
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      const res = await fetch('/api/owner-portal/approve/' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, note }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) setReview(d.review ?? { open: false, decision: act, decidedAt: new Date().toISOString() });
      else if (res.status === 409 && d.review) setReview(d.review);
      else setActionError(d.error || "That didn't go through. Please try again.");
    } catch (e) {
      console.error('[owner portal] decision failed', e);
      setActionError("That didn't go through — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  // A change order request sent to the owner has its own review (./CoReview).
  if (!loading && data?.changeOrder) return <CoReview token={token} data={data as CoReviewData} />;

  if (loading) return <div className="opCenter" style={{ color: 'var(--text-secondary)' }}><style dangerouslySetInnerHTML={{ __html: CSS }} />Loading…</div>;

  if (loadError === 'not_found') return (
    <Centered icon={<Warning size={48} weight="fill" color="var(--danger)" />} title="This link isn't valid"
      body="We couldn't find a pay application or change order for this link. It may have been replaced by a newer one — ask your contractor to send the approval link again." />
  );
  if (loadError || !data?.payApp) return (
    <Centered icon={<Warning size={48} weight="fill" color="var(--warning)" />} title="Couldn't load the pay application"
      body="Something went wrong on our side. Nothing has changed — reload the page to try again." />
  );

  const pa = data.payApp;
  const project = data.project || null;
  const lineItems: any[] = data.lineItems || [];
  const appLabel = `Pay Application #${pa.app_number ?? ''}`.trim();
  const due = fmt(pa.current_payment_due);

  if (review && !review.open) {
    const when = fmtDay(review.decidedAt);
    if (review.decision === 'approved') return (
      <Centered icon={<CheckCircle size={56} weight="fill" color="var(--success)" />} title={`${appLabel} approved`}
        body={`${project?.name ? project.name + ' — ' : ''}${due} was approved${when ? ` on ${when}` : ''}. The contractor has been notified. Nothing more is needed from you on this application.`} />
    );
    if (review.decision === 'rejected') return (
      <Centered icon={<ArrowCounterClockwise size={56} weight="bold" color="var(--warning)" />} title={`${appLabel} returned for revision`}
        body={`This application was returned to the contractor${when ? ` on ${when}` : ''}${pa.rejection_reason ? ` with the note: “${pa.rejection_reason}”` : ''}. You'll get a new email when the revised application is ready.`} />
    );
    return (
      <Centered icon={<Warning size={48} weight="fill" color="var(--warning)" />} title={`${appLabel} isn't waiting on you`}
        body="The contractor pulled this application back before a decision. You'll get a new email when it's resubmitted." />
    );
  }

  /* G702 figures from the live columns, one reader with the GC's screens
     (lib/retainage): a 0 % release app reads 0 %, line 7 is the previous
     application's line 6, and line 3 is line 1 + line 2 when not stored. */
  const ledger: RetainageLedger | null = data.retainage ?? null;
  const retPct = retainageRate(pa.retainage_percent);
  const held = retainageHeld(pa);
  const contractToDate = Number(pa.contract_sum_to_date) || ((Number(pa.contract_sum) || 0) + (Number(pa.change_orders_total) || 0));
  const completedToDate = Number(pa.total_completed_stored ?? pa.total_completed) || 0;
  const lessPrevious = ledger ? ledger.previousCertificates : Number(pa.less_previous_certificates ?? pa.prev_payments) || 0;
  const period = [fmtDay(pa.period_from), fmtDay(pa.period_to)].filter(Boolean).join(' – ');

  const g702: Array<[string, string]> = [
    ['1. Original contract sum', fmt(pa.contract_sum)],
    ['2. Net change by change orders', fmt(pa.change_orders_total)],
    ['3. Contract sum to date', fmt(contractToDate)],
    ['4. Total completed & stored to date', fmt(completedToDate)],
    [`5. Retainage (${retPct}%)`, '(' + fmt(held) + ')'],
    ...(ledger && ledger.releasedThisApp > 0 ? [['Retainage released this application', fmt(ledger.releasedThisApp)] as [string, string]] : []),
    ['6. Total earned less retainage', fmt(pa.total_earned_less_retainage)],
    ['7. Less previous certificates', '(' + fmt(lessPrevious) + ')'],
    ['8. Current payment due', due],
    ['9. Balance to finish, including retainage', fmt(Math.max(0, contractToDate - (Number(pa.total_earned_less_retainage) || 0)))],
  ];

  return (
    <div className="opWrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="opTop">
        <Cactus size={22} weight="fill" color="var(--text-secondary)" />
        <span style={{ fontWeight: 800, fontSize: 16 }}>Saguaro Control Systems</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Owner pay application review</span>
      </div>

      <div className="opMain">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 22 }}>{appLabel}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {[project?.name, period ? `Period ${period}` : '', pa.submitted_at ? `Submitted ${fmtDay(pa.submitted_at)}` : ''].filter(Boolean).join(' · ')}
          </div>
        </div>

        <div className="opKpis">
          {([
            ['Contract sum to date', fmt(contractToDate)],
            ['This period', fmt(pa.this_period)],
            ['Retainage held', fmt(held)],
            ['Current payment due', due],
          ] as Array<[string, string]>).map(([l, v]) => (
            <div key={l} className="opKpi">
              <div className="opKpiL">{l}</div>
              <div className="opKpiV">{v}</div>
            </div>
          ))}
        </div>

        <div className="opSec">
          <div className="opSecH">AIA G702 — Application summary</div>
          <div style={{ padding: '8px 16px 12px' }}>
            {g702.map(([l, v]) => <div key={l} className="opRow"><span>{l}</span><span>{v}</span></div>)}
          </div>
        </div>

        {lineItems.length > 0 && (
          <div className="opSec">
            <div className="opSecH">AIA G703 — Schedule of values</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="opTbl">
                <thead>
                  <tr>
                    {['#', 'Description', 'Scheduled', 'From previous', 'This period', 'Stored', 'Completed', '%', 'Balance'].map((h) => (
                      <th key={h} className={h === 'Description' ? 'opDesc' : undefined}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-secondary)' }}>{item.line_number || i + 1}</td>
                      <td className="opDesc">{item.description}</td>
                      <td>{fmt(item.scheduled_value)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{fmt(item.prev_completed)}</td>
                      <td>{fmt(item.this_period)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{fmt(item.stored_materials)}</td>
                      <td>{fmt(item.total_completed)}</td>
                      <td>{(Number(item.percent_complete) || 0).toFixed(0)}%</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{fmt(item.balance_to_finish)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(pa.g702_pdf_url || pa.g703_pdf_url) && (
          <div className="opSec" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, width: '100%' }}>AIA documents</div>
            {pa.g702_pdf_url && <a className="opDl" href={pa.g702_pdf_url} target="_blank" rel="noreferrer"><FilePdf size={14} weight="fill" /> G702</a>}
            {pa.g703_pdf_url && <a className="opDl" href={pa.g703_pdf_url} target="_blank" rel="noreferrer"><FilePdf size={14} weight="fill" /> G703</a>}
          </div>
        )}

        <div className="opSec">
          <div className="opSecH">Your decision</div>
          <div style={{ padding: 16 }}>
            <label htmlFor="opNote" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Notes for the contractor (required to return it)
            </label>
            <textarea id="opNote" className="opNote" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Conditions, questions, or what needs fixing" />
            <div className="opBtns" style={{ marginTop: 14 }}>
              <button className="opBtn opApprove" onClick={() => handleAction('approved')} disabled={saving}>
                <Check size={16} weight="bold" /> Approve {due}
              </button>
              <button className="opBtn opReturn" onClick={() => handleAction('rejected')} disabled={saving}>
                <X size={16} weight="bold" /> Return for revision
              </button>
            </div>
            {actionError && <div className="opErr" role="alert">{actionError}</div>}
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
              Approving authorizes the contractor to invoice the amount shown.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
