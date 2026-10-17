/**
 * lib/change-order-stages.ts — the three stages of a change, on one record.
 *
 *   Potential change (PCO)   something happened; a rough estimate. No money moves.
 *   Change order request     priced; sent to the owner on the approval link.
 *   Approved change order    the contract and budget moved — once — through
 *                            lib/change-order-status writeChangeOrder.
 *
 * change_orders.stage holds the stage; a database trigger (20261017g) keeps it
 * tied to status, so "approved" can only ever be reached through an approved
 * status — which only writeChangeOrder writes with the tiers checked. Several
 * PCOs roll up into one request through change_orders.cor_id.
 *
 * Server only.
 */
import { randomUUID } from 'crypto';
import { writeChangeOrder, type CoWriteResult } from './change-order-status';
import { coAmount } from './change-order-amount';
import { isApprovedCoStatus, originalContract, approvedChangeTotal } from './job-contract';
import { nextCoNumber } from './change-order-number';
import { approvalState, tierFor, tierRange, tierNeeds, meetsLevel, soloLimit, type ApprovalState, type CoTier, type TierLevel } from './change-order-tiers';
import { loadTiers, loadDecisions, actorLevel, actorName, recordDecision } from './change-order-approval';
import { ownerContact } from './project-parties';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

export type Stage = 'pco' | 'cor' | 'approved';
export const STAGES: readonly Stage[] = ['pco', 'cor', 'approved'];
export const STAGE_LABEL: Record<Stage, string> = {
  pco: 'Potential change',
  cor: 'Request to owner',
  approved: 'Approved',
};

/** A CO's stage, read the way the trigger writes it (rows from before the column read the same). */
export function stageOf(co: Row): Stage {
  const s = String(co.stage || '').toLowerCase();
  const st = String(co.status || '').toLowerCase();
  if (isApprovedCoStatus(st)) return 'approved';
  if (s === 'pco' || s === 'cor') return s;
  return st === 'draft' || st === 'identified' || String(co.change_type || '').toLowerCase() === 'pco' ? 'pco' : 'cor';
}

const CLOSED = new Set(['rejected', 'void']);
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function loadCo(db: Db, tenantId: string, id: string): Promise<Row | null> {
  const { data, error } = await db.from('change_orders').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  const r = data as Row | null;
  return r && !r.deleted_at ? r : null;
}

export type StageResult = { ok: true; changeOrder: Row } | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * PCO → request: price it. The amount is required (a request is priced); a
 * PCO already inside a request is priced on that request instead.
 */
export async function promoteToRequest(db: Db, tenantId: string, id: string, actorId: string, amount?: number | null): Promise<StageResult> {
  const co = await loadCo(db, tenantId, id);
  if (!co) return { ok: false, status: 404, error: 'Change order not found' };
  if (stageOf(co) !== 'pco') return { ok: false, status: 409, error: 'This is already a change order request.' };
  if (co.cor_id) return { ok: false, status: 409, error: 'This potential change is part of a change order request. Price the request instead.' };
  const price = amount === undefined || amount === null ? coAmount(co as never) : Number(amount);
  if (!Number.isFinite(price) || price === 0) return { ok: false, status: 400, error: 'amount is required: price the change before it goes to the owner.' };
  const w = await writeChangeOrder(db, tenantId, id, {
    stage: 'cor', status: 'pending', amount: price, cost_impact: price, submitted_at: new Date().toISOString(),
  }, { actorId, before: co });
  if (!w.ok) return { ok: false, status: w.status === 404 ? 404 : 409, error: w.error };
  return { ok: true, changeOrder: w.after };
}

/** Request → PCO: take an unapproved request back to a potential change. */
export async function demoteToPotential(db: Db, tenantId: string, id: string, actorId: string): Promise<StageResult> {
  const co = await loadCo(db, tenantId, id);
  if (!co) return { ok: false, status: 404, error: 'Change order not found' };
  if (stageOf(co) !== 'cor') return { ok: false, status: 409, error: stageOf(co) === 'approved' ? 'Un-approve it first: an approved change order is on the contract.' : 'This is already a potential change.' };
  const { data: kids, error } = await db.from('change_orders').select('id').eq('tenant_id', tenantId).eq('cor_id', id);
  if (error) throw error;
  if ((kids || []).length > 0) return { ok: false, status: 409, error: 'This request carries potential changes. Remove them first, or reject the request.' };
  const w = await writeChangeOrder(db, tenantId, id, { stage: 'pco', status: 'draft' }, { actorId, before: co });
  // Back to a potential change: approvals given on the request start over.
  if (w.ok) {
    await recordDecision(db, tenantId, id, {
      decision: 'rejected', role: 'internal', amount: coAmount(co as never),
      byId: actorId, byName: await actorName(db, actorId), note: 'Moved back to a potential change',
    });
  }
  if (!w.ok) return { ok: false, status: w.status === 404 ? 404 : 409, error: w.error };
  return { ok: true, changeOrder: w.after };
}

/**
 * Roll several PCOs on one job into a new request. The request's amount is
 * their sum; each PCO points at it (cor_id) and stays a PCO, so its money is
 * counted once — on the request.
 */
export async function rollUpToRequest(db: Db, tenantId: string, actorId: string, input: { projectId: string; pcoIds: string[]; title?: string | null }): Promise<StageResult> {
  const ids = Array.from(new Set((input.pcoIds || []).filter((x) => typeof x === 'string' && x)));
  if (ids.length === 0) return { ok: false, status: 400, error: 'pcoIds is required: pick the potential changes to put in the request.' };
  const { data, error } = await db.from('change_orders').select('*').eq('tenant_id', tenantId).in('id', ids);
  if (error) throw error;
  const rows = ((data || []) as Row[]).filter((r) => !r.deleted_at);
  if (rows.length !== ids.length) return { ok: false, status: 404, error: 'One of those potential changes was not found.' };
  for (const r of rows) {
    if (String(r.project_id) !== String(input.projectId)) return { ok: false, status: 400, error: 'Every potential change in a request must be on the same job.' };
    if (stageOf(r) !== 'pco') return { ok: false, status: 409, error: `CO #${r.co_number} is not a potential change.` };
    if (r.cor_id) return { ok: false, status: 409, error: `PCO #${r.co_number} is already in a request.` };
    if (CLOSED.has(String(r.status || '').toLowerCase())) return { ok: false, status: 409, error: `PCO #${r.co_number} was ${String(r.status)}.` };
  }
  const amount = Math.round(rows.reduce((s, r) => s + coAmount(r as never), 0) * 100) / 100;
  if (amount === 0) return { ok: false, status: 400, error: 'amount is required: price the potential changes before rolling them into a request.' };
  const pkgs = Array.from(new Set(rows.map((r) => r.related_bid_package_id).filter(Boolean)));
  const days = rows.reduce((s, r) => s + (num(r.schedule_impact_days) || num(r.schedule_impact)), 0);
  const number = await nextCoNumber(db, tenantId, input.projectId);
  const sorted = [...rows].sort((a, b) => num(a.co_number) - num(b.co_number));
  const title = (input.title || '').trim() || (sorted.length === 1 ? String(sorted[0].title || 'Change order request') : `${sorted.length} changes: ${sorted.map((r) => r.title).filter(Boolean).slice(0, 3).join(', ')}`.slice(0, 200));
  const { data: cor, error: insErr } = await db.from('change_orders').insert({
    tenant_id: tenantId,
    project_id: input.projectId,
    co_number: number,
    title,
    description: sorted.map((r) => `PCO #${r.co_number} — ${r.title || 'Untitled'} (${usd(coAmount(r as never))})`).join('\n'),
    reason: sorted[0].reason ?? null,
    stage: 'cor',
    status: 'pending',
    change_type: 'additive',
    amount,
    cost_impact: amount,
    schedule_impact: days,
    schedule_impact_days: days,
    related_bid_package_id: pkgs.length === 1 ? pkgs[0] : null,
    submitted_by: actorId,
    submitted_at: new Date().toISOString(),
  }).select('*').single();
  if (insErr) throw insErr;
  const corId = String((cor as Row).id);
  const { error: linkErr } = await db.from('change_orders').update({ cor_id: corId })
    .eq('tenant_id', tenantId).in('id', ids);
  if (linkErr) throw linkErr;
  return { ok: true, changeOrder: cor as Row };
}

/** Take one PCO back out of its request (the request's amount is left as priced). */
export async function removeFromRequest(db: Db, tenantId: string, pcoId: string): Promise<StageResult> {
  const co = await loadCo(db, tenantId, pcoId);
  if (!co) return { ok: false, status: 404, error: 'Change order not found' };
  if (!co.cor_id) return { ok: false, status: 409, error: 'This potential change is not in a request.' };
  const { data, error } = await db.from('change_orders').update({ cor_id: null }).eq('id', pcoId).eq('tenant_id', tenantId).select('*').maybeSingle();
  if (error) throw error;
  return { ok: true, changeOrder: data as Row };
}

/* ── The owner's approval link ─────────────────────────────────────────────── */

/** Change order tokens carry a prefix so the owner link resolves without guessing the table. */
export const CO_TOKEN_PREFIX = 'co_';
export const isCoToken = (t: string) => typeof t === 'string' && t.startsWith(CO_TOKEN_PREFIX) && t.length > 20;

export function ownerLink(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';
  return `${base}/portals/owner/${encodeURIComponent(token)}`;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export type SendResult = { ok: true; link: string; emailed: boolean; to: string; changeOrder: Row } | { ok: false; status: 400 | 404 | 409; error: string };

/** Send a request to the owner: a link, an email, and the record of when. */
export async function sendToOwner(db: Db, tenantId: string, id: string, input: { email?: string | null }): Promise<SendResult> {
  const co = await loadCo(db, tenantId, id);
  if (!co) return { ok: false, status: 404, error: 'Change order not found' };
  const stage = stageOf(co);
  if (stage === 'pco') return { ok: false, status: 409, error: 'Price it first: a potential change becomes a request before it goes to the owner.' };
  if (stage === 'approved') return { ok: false, status: 409, error: 'This change order is already approved.' };
  if (CLOSED.has(String(co.status || '').toLowerCase())) return { ok: false, status: 409, error: `This change order was ${String(co.status)}.` };
  const { data: project, error: pErr } = await db.from('projects').select('*').eq('id', co.project_id).eq('tenant_id', tenantId).maybeSingle();
  if (pErr) throw pErr;
  const email = String(input.email || co.owner_email || ownerContact(project as Row).email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: "email is required: add the owner's email address." };
  const token = String(co.owner_approval_token || '').startsWith(CO_TOKEN_PREFIX)
    ? String(co.owner_approval_token)
    : `${CO_TOKEN_PREFIX}${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  const { data: updated, error } = await db.from('change_orders').update({
    owner_approval_token: token, owner_email: email, sent_to_owner_at: now,
  }).eq('id', id).eq('tenant_id', tenantId).select('*').maybeSingle();
  if (error) throw error;

  const link = ownerLink(token);
  const { data: ts } = await db.from('tenant_settings').select('company_name').eq('tenant_id', tenantId).maybeSingle();
  const company = String((ts as Row | null)?.company_name || 'Your contractor');
  const p = (project || {}) as Row;
  const html = `
    <h2 style="margin:0 0 16px;color:#0D1116;font-size:20px;">Change Order #${esc(co.co_number)} for your approval</h2>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.65;">${esc(company)} sent a change order on <strong>${esc(p.name || 'your project')}</strong> for your review.</p>
    <p style="margin:0 0 12px;color:#111827;font-size:22px;font-weight:800;">${esc(usd(coAmount(co as never)))}</p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.65;">${esc(co.title || '')}</p>
    <a href="${esc(link)}" style="display:inline-block;margin-top:12px;padding:13px 30px;background:#FFE600;color:#0D1116;font-weight:700;font-size:14px;text-decoration:none;border-radius:6px;">Review and approve</a>`;
  let emailed = false;
  try {
    const { sendEmail } = await import('./email/send');
    const r = await sendEmail({ to: email, subject: `Change Order #${co.co_number} for approval — ${String(p.name || '')}`.trim(), html });
    emailed = !!r;
  } catch (e) {
    console.error('[change-order-stages] owner email failed', e);
  }
  return { ok: true, link, emailed, to: email, changeOrder: updated as Row };
}

type OwnerReview = { open: boolean; decision: 'approved' | 'rejected' | null; decidedAt: string | null; booked: boolean };

function ownerReviewState(co: Row, approval: ApprovalState): OwnerReview {
  const st = String(co.status || '').toLowerCase();
  if (isApprovedCoStatus(st)) return { open: false, decision: 'approved', decidedAt: String(co.owner_actioned_at || co.approved_at || '') || null, booked: true };
  if (st === 'rejected' || st === 'void') return { open: false, decision: 'rejected', decidedAt: String(co.owner_actioned_at || co.rejected_at || '') || null, booked: false };
  if (approval.owner) return { open: false, decision: 'approved', decidedAt: approval.owner.at, booked: false };
  return { open: true, decision: null, decidedAt: null, booked: false };
}

async function loadByToken(db: Db, token: string): Promise<Row | null> {
  if (!isCoToken(token)) return null;
  const { data, error } = await db.from('change_orders').select('*').eq('owner_approval_token', token).maybeSingle();
  if (error) throw error;
  const co = data as Row | null;
  return co && !co.deleted_at ? co : null;
}

/** What the owner's link shows: the change, the price, the job — none of the GC's internals. */
export async function ownerView(db: Db, token: string) {
  const co = await loadByToken(db, token);
  if (!co) return null;
  const tenantId = String(co.tenant_id);
  const [projectRes, tsRes, tiers, decisions] = await Promise.all([
    db.from('projects').select('name, address').eq('id', co.project_id).eq('tenant_id', tenantId).maybeSingle(),
    db.from('tenant_settings').select('company_name, logo_url').eq('tenant_id', tenantId).maybeSingle(),
    loadTiers(db, tenantId),
    loadDecisions(db, tenantId, String(co.id)),
  ]);
  const amount = coAmount(co as never);
  const approval = approvalState(decisions, amount, tiers);
  return {
    changeOrder: {
      co_number: co.co_number, title: co.title ?? '', description: co.description ?? '', reason: co.reason ?? '',
      scope_of_change: co.scope_of_change ?? '', amount, schedule_impact_days: num(co.schedule_impact_days) || num(co.schedule_impact),
      sent_at: co.sent_to_owner_at ?? null,
    },
    project: (projectRes as { data: Row | null }).data || null,
    company: ((tsRes as { data: Row | null }).data || null) as Row | null,
    review: ownerReviewState(co, approval),
  };
}

export type OwnerDecisionResult =
  | { ok: true; review: OwnerReview }
  | { ok: false; status: 400 | 404 | 409; error: string; review?: OwnerReview };

/**
 * The owner approves or returns a request from the link. An approval is the
 * owner's signature: it books the change (writeChangeOrder) when the company's
 * approvers are done, or waits for them. A return sends it back with the reason.
 */
export async function ownerDecision(db: Db, token: string, action: 'approved' | 'rejected', input: { note?: string | null; name?: string | null }): Promise<OwnerDecisionResult> {
  const co = await loadByToken(db, token);
  if (!co) return { ok: false, status: 404, error: 'This approval link is not valid. Ask your contractor to send it again.' };
  return decideAsOwner(db, co, action, { note: input.note ?? null, name: (input.name || '').trim() || String(co.owner_email || 'Owner') });
}

/**
 * The GC records the owner's signature taken outside the link (paper, email).
 * Same booking rule as the link; the record says who recorded it.
 */
export async function recordOwnerSignoff(db: Db, tenantId: string, id: string, actorId: string, input: { note?: string | null; name?: string | null }): Promise<OwnerDecisionResult> {
  const co = await loadCo(db, tenantId, id);
  if (!co) return { ok: false, status: 404, error: 'Change order not found' };
  const by = await actorName(db, actorId);
  const name = (input.name || '').trim() || String(co.owner_email || 'Owner');
  return decideAsOwner(db, co, 'approved', { note: input.note ?? `Signed outside the app — recorded by ${by}`, name, recordedBy: actorId });
}

async function decideAsOwner(db: Db, co: Row, action: 'approved' | 'rejected', input: { note: string | null; name: string; recordedBy?: string }): Promise<OwnerDecisionResult> {
  const tenantId = String(co.tenant_id);
  const id = String(co.id);
  const amount = coAmount(co as never);
  const tiers = await loadTiers(db, tenantId);
  const review = ownerReviewState(co, approvalState(await loadDecisions(db, tenantId, id), amount, tiers));
  if (!review.open) return { ok: false, status: 409, error: 'This change order has already been reviewed.', review };
  if (stageOf(co) !== 'cor') return { ok: false, status: 409, error: 'This change order is not waiting on the owner.' };
  const note = input.note ? String(input.note).slice(0, 4000) : null;
  if (action === 'rejected' && !note) return { ok: false, status: 400, error: 'Tell the contractor what to change in the notes box, then return it.' };

  const now = new Date().toISOString();
  const { error } = await db.from('change_orders').update({
    owner_actioned_at: now,
    owner_approval_notes: note,
    ...(action === 'approved' ? { owner_signed_at: now, owner_signature: input.name.slice(0, 200) } : {}),
  }).eq('id', id).eq('tenant_id', tenantId);
  if (error) throw error;
  const owner = { name: input.name.slice(0, 200) };

  let w: CoWriteResult;
  if (action === 'approved') {
    await recordDecision(db, tenantId, id, {
      decision: 'approved', role: 'owner', amount, byId: null, byName: `Owner: ${owner.name}`, note,
    });
    w = await writeChangeOrder(db, tenantId, id, { status: 'approved' }, { owner, actorId: input.recordedBy ?? null });
  } else {
    w = await writeChangeOrder(db, tenantId, id, { status: 'rejected', rejection_reason: note }, { owner, actorId: null });
  }
  if (!w.ok && w.status !== 202) return { ok: false, status: w.status === 404 ? 404 : 409, error: w.error };

  // The GC hears about it in the app either way.
  try {
    const { createNotification } = await import('./notifications');
    const booked = w.ok;
    await createNotification(
      tenantId, null, 'change_order_approved',
      action === 'approved' ? `Owner approved CO #${co.co_number}` : `Owner returned CO #${co.co_number}`,
      action === 'approved'
        ? booked ? `${usd(amount)} is on the contract.` : `${usd(amount)} — your approval books it.`
        : `Reason: ${note}`,
      `/app/projects/${co.project_id}/items/change_orders/${id}`, String(co.project_id),
    );
  } catch (e) {
    console.error('[change-order-stages] owner decision notification failed', e);
  }
  const fresh = (await loadCo(db, tenantId, id)) || co;
  return { ok: true, review: ownerReviewState(fresh, approvalState(await loadDecisions(db, tenantId, id), coAmount(fresh as never), tiers)) };
}

/* ── The record page's view ────────────────────────────────────────────────── */

export type StepView = { key: Stage; label: string; state: 'done' | 'current' | 'todo'; who: string | null; at: string | null; note: string | null };
export type NextAction = 'price' | 'send' | 'approve' | 'await_owner' | 'none';

export type CoWorkflowView = {
  id: string;
  number: number | null;
  title: string;
  stage: Stage;
  status: string;
  closed: boolean;
  amount: number;
  estimate: { min: number; max: number } | null;
  cor: { id: string; number: number | null; title: string } | null;
  pcos: { id: string; number: number | null; title: string; amount: number }[];
  steps: StepView[];
  approval: ApprovalState;
  approvers: { name: string; at: string }[];
  tier: { range: string; needs: string; level: TierLevel; approvers: number };
  tiers: CoTier[];
  owner: { email: string | null; sentAt: string | null; signedAt: string | null; name: string | null; link: string | null; returnedAt: string | null; note: string | null };
  money: { contractNow: number; contractAfter: number; original: number; approvedToDate: number; pendingExposure: number };
  you: { level: TierLevel | null; canApprove: boolean; alreadyApproved: boolean; soloLimit: number | null };
  next: { action: NextAction; label: string; hint: string };
};

const SECOND = (a: string | null | undefined) => (a ? String(a) : null);

/** Everything the stage bar, the money figures and the next action need, from the live rows. */
export async function workflowView(db: Db, tenantId: string, id: string, userId: string): Promise<CoWorkflowView | null> {
  const co = await loadCo(db, tenantId, id);
  if (!co) return null;
  const projectId = String(co.project_id);
  const [tiers, decisions, level, projectRes, siblingsRes] = await Promise.all([
    loadTiers(db, tenantId),
    loadDecisions(db, tenantId, id),
    actorLevel(db, tenantId, userId, projectId),
    db.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle(),
    db.from('change_orders').select('id, co_number, title, status, stage, change_type, amount, cost_impact, cor_id, deleted_at')
      .eq('tenant_id', tenantId).eq('project_id', projectId),
  ]);
  if (projectRes.error) throw projectRes.error;
  if (siblingsRes.error) throw siblingsRes.error;
  const siblings = ((siblingsRes.data || []) as Row[]).filter((r) => !r.deleted_at);
  const amount = coAmount(co as never);
  const stage = stageOf(co);
  const status = String(co.status || '').toLowerCase();
  const closed = CLOSED.has(status);
  const approval = approvalState(decisions, amount, tiers);
  const { tier } = tierFor(amount, tiers);

  const approvedToDate = approvedChangeTotal(siblings as never);
  const original = originalContract(projectRes.data as never, approvedToDate);
  const contractNow = Math.round((original + approvedToDate) * 100) / 100;
  const contractAfter = stage === 'approved' || closed ? contractNow : Math.round((contractNow + amount) * 100) / 100;
  const pendingExposure = siblings
    .filter((r) => stageOf(r) !== 'approved' && !CLOSED.has(String(r.status || '').toLowerCase()) && !r.cor_id)
    .reduce((s, r) => s + coAmount(r as never), 0);

  const corRow = co.cor_id ? siblings.find((r) => r.id === co.cor_id) || null : null;
  const pcos = siblings.filter((r) => r.cor_id === id)
    .sort((a, b) => num(a.co_number) - num(b.co_number))
    .map((r) => ({ id: String(r.id), number: (r.co_number as number) ?? null, title: String(r.title || ''), amount: coAmount(r as never) }));

  const pco = ((co.line_items as Row | null)?.pco as Row | undefined) || null;
  const minE = num(co.estimated_min ?? pco?.estimated_min);
  const maxE = num(co.estimated_max ?? pco?.estimated_max);

  const [createdBy, approvedBy] = await Promise.all([
    actorName(db, (co.submitted_by as string) || null),
    co.approved_by && /^[0-9a-f-]{36}$/i.test(String(co.approved_by)) ? actorName(db, String(co.approved_by)) : Promise.resolve(co.approved_by ? String(co.approved_by) : null),
  ]);
  const lastApprover = approval.approvers[approval.approvers.length - 1];
  const idx = STAGES.indexOf(stage);
  const steps: StepView[] = STAGES.map((k, i) => ({
    key: k,
    label: STAGE_LABEL[k],
    state: i < idx || (k === 'approved' && stage === 'approved') ? 'done' : i === idx ? 'current' : 'todo',
    who: k === 'pco' ? createdBy : k === 'cor' ? (i <= idx ? (co.sent_to_owner_at ? `Sent to ${co.owner_email || 'owner'}` : createdBy) : null) : (stage === 'approved' ? approvedBy || lastApprover?.name || null : null),
    at: k === 'pco' ? SECOND(co.created_at as string) : k === 'cor' ? (i <= idx ? SECOND((co.sent_to_owner_at || co.submitted_at || co.created_at) as string) : null) : (stage === 'approved' ? SECOND(co.approved_at as string) : null),
    note: k === 'cor' && closed && stage === 'cor' ? (status === 'void' ? 'Voided' : `Returned${co.rejection_reason ? `: ${co.rejection_reason}` : ''}`) : null,
  }));

  const alreadyApproved = approval.approvers.some((a) => a.id === userId);
  const canApprove = meetsLevel(level, tier.level) && !alreadyApproved;
  const sent = !!co.sent_to_owner_at;
  let next: CoWorkflowView['next'];
  if (closed) next = { action: 'none', label: '', hint: status === 'void' ? 'Voided — not on the contract.' : 'Returned — not on the contract.' };
  else if (stage === 'approved') next = { action: 'none', label: '', hint: 'On the contract and the budget.' };
  else if (stage === 'pco' && co.cor_id) next = { action: 'none', label: '', hint: `Priced and approved on CO #${corRow?.co_number ?? ''}.` };
  else if (stage === 'pco') next = { action: 'price', label: 'Price it and send for approval', hint: 'No money moves until the owner change order is approved.' };
  else if (status === 'submitted' && !approval.owner) next = { action: 'await_owner', label: '', hint: 'Approved inside the company. Waiting on the owner to sign.' };
  else if (approval.owner || (approval.approvers.length > 0 && !approval.satisfied) || (sent && !approval.satisfied)) {
    next = canApprove
      ? { action: 'approve', label: `Approve ${usd(Math.abs(amount))}`, hint: approval.owner ? `The owner signed. ${approval.remaining === 1 ? 'Your approval books it.' : `${approval.remaining} approvals to go.`}` : `${approval.remaining} of ${approval.needed} approvals to go.` }
      : { action: 'none', label: '', hint: alreadyApproved ? `You approved. Waiting on ${tierNeeds(tier).toLowerCase()}.` : `Waiting on ${tierNeeds(tier).toLowerCase()}.` };
  } else if (!sent) next = { action: 'send', label: 'Send to owner', hint: 'The owner reviews and signs on a link — no login.' };
  else next = canApprove ? { action: 'approve', label: `Approve ${usd(Math.abs(amount))}`, hint: '' } : { action: 'none', label: '', hint: `Waiting on ${tierNeeds(tier).toLowerCase()}.` };

  const ownerDec = [...decisions].reverse().find((d) => d.approver_role === 'owner');
  const returned = ownerDec && ownerDec.decision === 'rejected' ? ownerDec : null;
  const tierIdx = tierFor(amount, tiers).index;
  return {
    id,
    number: (co.co_number as number) ?? null,
    title: String(co.title || ''),
    stage, status, closed, amount,
    estimate: minE || maxE ? { min: minE, max: maxE } : null,
    cor: corRow ? { id: String(corRow.id), number: (corRow.co_number as number) ?? null, title: String(corRow.title || '') } : null,
    pcos,
    steps,
    approval,
    approvers: approval.approvers.map((a) => ({ name: a.name, at: a.at })),
    tier: { range: tierRange(tiers, tierIdx), needs: tierNeeds(tier), level: tier.level, approvers: tier.approvers },
    tiers,
    owner: {
      email: (co.owner_email as string) || ownerContact(projectRes.data as Row).email,
      sentAt: SECOND(co.sent_to_owner_at as string),
      signedAt: approval.owner?.at ?? null,
      name: approval.owner?.name ?? null,
      link: co.owner_approval_token && isCoToken(String(co.owner_approval_token)) ? ownerLink(String(co.owner_approval_token)) : null,
      returnedAt: returned?.decided_at ?? null,
      note: returned?.note ?? null,
    },
    money: { contractNow, contractAfter, original, approvedToDate, pendingExposure: Math.round(pendingExposure * 100) / 100 },
    you: { level, canApprove, alreadyApproved, soloLimit: soloLimit(level, tiers) },
    next,
  };
}
