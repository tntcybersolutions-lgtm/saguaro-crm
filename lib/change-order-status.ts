/**
 * lib/change-order-status.ts — the ONE way a change order is written once it
 * exists: approve, reject, un-approve, an amount edit, a status picked on the
 * record page, the approvals inbox, the command-center flow, bulk edit.
 *
 * A change order's status is money. Approving one moves the job's contract
 * (projects.contract_amount / revised_contract_value), the prime contract's
 * approved_changes and the budget's approved_changes (its cost-code line or the
 * CO-UNALLOCATED line) — lib/change-order-cascade. Rejecting or un-approving an
 * approved CO takes all of that back off; editing the amount of an approved CO
 * moves it by the difference. The cascade recomputes from the approved COs on
 * the job, so running it twice changes nothing.
 *
 * What it used to be: /approve, /reject, PUT and PATCH ran the cascade, but the
 * record page's status picker (PATCH /api/items/change_orders/:id), the
 * catch-all's POST /api/change-orders/:id/approve and the command-center flow
 * each wrote `status` themselves and stopped there — the CO read Approved and
 * the contract never moved. Every one of them now calls writeChangeOrder().
 */
import { applyChangeOrderMoney } from './change-order-cascade';
import { isApprovedCoStatus } from './job-contract';
import { runInBackground } from './background';
import { coAmount } from './change-order-amount';
import { approvalState, tierFor, meetsLevel, soloLimit, tierNeeds, LEVEL_LABEL, type ApprovalState } from './change-order-tiers';
import { loadTiers, loadDecisions, actorLevel, actorName, recordDecision } from './change-order-approval';
type Row = Record<string, unknown>;

/** True when a write to `status` decides or reverses a decision — the Full-permission moves. */
export function isCoDecision(before: { status?: unknown } | null | undefined, nextStatus: unknown): boolean {
  if (typeof nextStatus !== 'string') return false;
  const next = nextStatus.toLowerCase();
  const prev = String(before?.status ?? '').toLowerCase();
  if (next === prev) return false;
  // Approving or rejecting, or moving a CO that was approved anywhere else (un-approving it).
  return isApprovedCoStatus(next) || next === 'rejected' || isApprovedCoStatus(prev);
}

/**
 * The permission a route checks before handing a status write to
 * writeChangeOrder: a fresh approval needs only Change Orders: Edit at the door
 * — the company's approval tiers, enforced in writeChangeOrder, decide whether
 * this person may approve this amount. Rejecting, voiding and un-approving stay
 * Change Orders: Full. null = not a decision.
 */
export function coDecisionLevel(before: { status?: unknown } | null | undefined, nextStatus: unknown): 'Edit' | 'Full' | null {
  if (!isCoDecision(before, nextStatus)) return null;
  const next = String(nextStatus).toLowerCase();
  return isApprovedCoStatus(next) && !isApprovedCoStatus(String(before?.status ?? '')) ? 'Edit' : 'Full';
}

export type CoWriteResult =
  | { ok: true; before: Row; after: Row; delta: number; newlyApproved: boolean; approval: ApprovalState | null }
  | {
      ok: false;
      /** 202 = written and held for more approvals (or the owner's signature); no money moved. */
      status: 202 | 403 | 404 | 409;
      error: string;
      held?: 'approvers' | 'owner';
      approval?: ApprovalState | null;
      after?: Row;
    };

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const APPROVAL_STAMPS = ['status', 'approved_at', 'approved_by'] as const;

/**
 * The response a route sends for a write that did not finish — the error, or,
 * for a 202, where the approvals stand so the screen can show who is next.
 */
export function coWriteFailure(w: Extract<CoWriteResult, { ok: false }>) {
  return {
    status: w.status,
    body: w.status === 202
      ? { success: true, held: w.held, message: w.error, approval: w.approval ?? null, changeOrder: w.after ?? null }
      : { error: w.error },
  };
}

/**
 * Write `patch` to change order `id` and apply what it does to the job's money.
 * Stamps approved_at/by on approval and rejected_at/by on rejection when the
 * caller did not. `select` is what comes back as `after` (default every column).
 *
 * Approval tiers (lib/change-order-tiers) are enforced HERE, so no screen can
 * skip them: a CO becomes approved only when enough people at the tier's level
 * have approved it at its current amount. Short of that the approval is
 * recorded, the status stays, and the result is a 202 that says who is next.
 * When the owner has the approval link and has not signed, the company's
 * approval takes it to 'submitted' and it books when the owner signs.
 *
 * opts.owner: the owner's decision from the approval link (lib/change-order-
 * stages) — counted as the owner's signature, never as an internal approver.
 * opts.system: a proof script or migration path with no person behind it.
 */
export async function writeChangeOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  id: string,
  patch: Row,
  opts: {
    actorId?: string | null; select?: string; before?: Row | null;
    /** false: skip the owner email + notification (proof scripts). */ notify?: boolean;
    owner?: { name: string } | null;
    system?: boolean;
  } = {},
): Promise<CoWriteResult> {
  let before = opts.before ?? null;
  if (!before) {
    const { data, error } = await db.from('change_orders').select('*')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    before = (data as Row | null) ?? null;
  }
  if (!before) return { ok: false, status: 404, error: 'Change order not found' };
  before = { ...before }; // the row as it stood — never the object a write may touch

  const write: Row = { ...patch };
  const prev = String(before.status ?? '').toLowerCase();
  if (typeof write.status === 'string') write.status = write.status.toLowerCase();
  const next = typeof write.status === 'string' ? (write.status as string) : prev;
  const prevApproved = isApprovedCoStatus(prev);
  const nextApproved = isApprovedCoStatus(next);
  const amountBefore = coAmount(before as never);
  const amountAfter = coAmount({ ...before, ...write } as never);
  const amountChanged = cents(amountBefore) !== cents(amountAfter);

  /* ── Approval tiers ─────────────────────────────────────────────────────── */
  let approval: ApprovalState | null = null;
  let held: 'approvers' | 'owner' | null = null;
  const projectId = (before.project_id as string | null) ?? null;

  if (nextApproved && !prevApproved) {
    // A PCO inside a COR carries no money of its own: the COR does.
    if (before.cor_id) {
      return { ok: false, status: 409, error: 'This potential change is part of a change order request. Approve the request instead.' };
    }
    if (!opts.system) {
      const tiers = await loadTiers(db, tenantId);
      const { tier } = tierFor(amountAfter, tiers);
      if (!opts.owner) {
        if (!opts.actorId) return { ok: false, status: 403, error: 'Sign in to approve change orders.' };
        const level = await actorLevel(db, tenantId, opts.actorId, projectId);
        if (!meetsLevel(level, tier.level)) {
          const lim = soloLimit(level, tiers);
          const yours = lim === null ? '' : lim > 0 ? ` Your role can approve up to ${usd(lim)}.` : ' Your role cannot approve change orders.';
          return { ok: false, status: 403, error: `Approving ${usd(Math.abs(amountAfter))} takes ${tier.level === 'Admin' ? 'a company admin' : `${LEVEL_LABEL[tier.level]}`}.${yours}` };
        }
        const decisions = await loadDecisions(db, tenantId, id);
        const already = approvalState(decisions, amountAfter, tiers).approvers.some((a) => a.id === opts.actorId);
        if (!already) {
          await recordDecision(db, tenantId, id, {
            decision: 'approved', role: 'internal', amount: amountAfter,
            byId: opts.actorId, byName: await actorName(db, opts.actorId), level,
          });
        }
      }
      // Read back after writing: two approvers at once both see the second approval.
      approval = approvalState(await loadDecisions(db, tenantId, id), amountAfter, tiers);
      const ownerHasLink = !!before.sent_to_owner_at;
      if (!approval.satisfied) {
        held = 'approvers';
      } else if (ownerHasLink && !approval.owner && !opts.owner) {
        held = 'owner';
      }
      if (held) {
        // Nothing books: drop the approval stamps, keep any other field the caller sent.
        for (const k of APPROVAL_STAMPS) delete write[k];
        if (held === 'owner' && prev !== 'submitted') write.status = 'submitted';
      }
    }
  } else if (prevApproved && nextApproved && amountChanged && !opts.system) {
    /* Re-pricing an approved CO moves the contract by the difference, so it
       takes the level of the tier the new amount lands in — and a re-price
       into a tier that needs more than one approver goes back for approval. */
    if (!opts.actorId) return { ok: false, status: 403, error: 'Sign in to change an approved change order.' };
    const tiers = await loadTiers(db, tenantId);
    const was = tierFor(amountBefore, tiers);
    const now = tierFor(amountAfter, tiers);
    const level = await actorLevel(db, tenantId, opts.actorId, projectId);
    if (!meetsLevel(level, now.tier.level)) {
      return { ok: false, status: 403, error: `${usd(Math.abs(amountAfter))} takes ${now.tier.level === 'Admin' ? 'a company admin' : LEVEL_LABEL[now.tier.level]} to approve.` };
    }
    if (now.tier.approvers > 1 && now.index > was.index) {
      return { ok: false, status: 409, error: `${usd(Math.abs(amountAfter))} needs ${tierNeeds(now.tier).toLowerCase()}. Set it back to pending and approve it again at the new amount.` };
    }
    await recordDecision(db, tenantId, id, {
      decision: 'approved', role: 'internal', amount: amountAfter,
      byId: opts.actorId, byName: await actorName(db, opts.actorId), level,
      note: `Re-priced from ${usd(amountBefore)} after approval`,
    });
  }

  // Re-pricing a request the company already approved sends it back for approval.
  if (!nextApproved && prev === 'submitted' && amountChanged && write.status === undefined) write.status = 'pending';

  /* A decision taken back — rejected, voided, un-approved, or pulled back from
     the owner — starts the approvals over. */
  const finalStatus = typeof write.status === 'string' ? (write.status as string) : prev;
  const reversal = finalStatus !== prev && (
    finalStatus === 'rejected' || finalStatus === 'void'
    || (prevApproved && !isApprovedCoStatus(finalStatus))
    || (prev === 'submitted' && (finalStatus === 'pending' || finalStatus === 'draft'))
  );
  if (reversal && !opts.system) {
    const reason = typeof write.rejection_reason === 'string' && write.rejection_reason ? write.rejection_reason
      : finalStatus === 'rejected' ? 'Rejected' : finalStatus === 'void' ? 'Voided' : `Sent back (${finalStatus})`;
    await recordDecision(db, tenantId, id, {
      decision: 'rejected', role: opts.owner ? 'owner' : 'internal', amount: amountBefore,
      byId: opts.owner ? null : opts.actorId ?? null,
      byName: opts.owner ? `Owner: ${opts.owner.name}` : await actorName(db, opts.actorId),
      note: String(reason).slice(0, 2000),
    });
  }

  if (typeof write.status === 'string') {
    const nextNow = write.status as string;
    const now = new Date().toISOString();
    if (nextNow === 'approved' && prev !== 'approved') {
      if (write.approved_at === undefined) write.approved_at = now;
      if (write.approved_by === undefined && opts.actorId) write.approved_by = opts.actorId;
    }
    if (nextNow === 'rejected' && prev !== 'rejected') {
      if (write.rejected_at === undefined) write.rejected_at = now;
      if (write.rejected_by === undefined && opts.actorId) write.rejected_by = opts.actorId;
    }
  }

  if (held && Object.keys(write).length === 0) {
    // Held with nothing else to write (the approval itself is the record).
    return { ok: false, status: 202, error: heldMessage(held, approval), held: held ?? undefined, approval, after: before };
  }

  const { data: after, error } = await db.from('change_orders').update(write)
    .eq('id', id).eq('tenant_id', tenantId).select(opts.select || '*').maybeSingle();
  if (error) throw error;
  if (!after) return { ok: false, status: 404, error: 'Change order not found' };

  /* The money moves BEFORE the answer: the screen reloads the contract right
     after this returns, and a failure here is one the GC has to hear about.
     `after` may be a narrow select — the cascade needs status, amount and the
     bid package, so it is handed the full row merged over what was read. */
  const full = { ...before, ...write, ...(after as Row) };
  const { delta } = await applyChangeOrderMoney(db, tenantId, before as never, full as never);
  if (held) return { ok: false, status: 202, error: heldMessage(held, approval), held, approval, after: after as Row };
  const newlyApproved = isApprovedCoStatus(String(full.status ?? '')) && !isApprovedCoStatus(prev);
  if (newlyApproved && opts.notify !== false) {
    // Owner email + notification; the money is already done (money: false).
    // Loaded on use: lib/triggers builds service clients at import, which a
    // route that never approves anything should not pay for.
    runInBackground(async () => {
      const { onChangeOrderApproved } = await import('./triggers');
      await onChangeOrderApproved(id, { money: false });
    }, 'onChangeOrderApproved');
  }
  return { ok: true, before, after: after as Row, delta, newlyApproved, approval };
}

/** What a held approval tells the person who just approved. */
export function heldMessage(held: 'approvers' | 'owner' | null, a: ApprovalState | null): string {
  if (held === 'owner') return 'Approved inside the company. It books when the owner signs — they have the approval link.';
  if (held === 'approvers' && a) {
    const who = a.tier.level === 'Admin' ? 'company admin' : `person with ${LEVEL_LABEL[a.tier.level]}`;
    return a.approvers.length === 0
      ? `Recorded. This change needs ${tierNeeds(a.tier).toLowerCase()} to approve it.`
      : `Your approval is in. ${a.remaining} more ${who}${a.remaining === 1 ? '' : 's'} to go.`;
  }
  return 'Saved.';
}
