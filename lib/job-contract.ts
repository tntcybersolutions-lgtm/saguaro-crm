/**
 * lib/job-contract.ts — a job's contract money, read one way for the GC's
 * screens (/api/project-context) and the owner's portal
 * (/api/portal/client/dashboard).
 *
 * Jobs carry the contract in several columns that drift apart
 * (original_contract_amount, contract_amount, revised_contract_value, the
 * prime contract row, the accepted proposal). The portal used to read
 * contract_amount alone, so an owner whose job stored its contract in
 * original_contract_amount saw "Original Contract $0.00" and a red
 * "+$12,345" change that never happened, while the GC saw $12,345.
 *
 *   original = an ORIGINAL column → prime contract → a revised column less
 *              the approved change orders → contract_value → accepted proposal
 *   current  = original + approved change orders
 *   pending  = change orders still waiting on a decision
 *
 * Double count (FOUND, 15 Oct): projects.contract_amount is the REVISED
 * contract — approving a change order adds its amount to it
 * (lib/triggers onChangeOrderApproved) — and revised_contract_value is
 * original + approved by definition. Reading either as the original and then
 * adding approved change orders counted every approved CO twice: Pima's job
 * summary read $2,667,300 against a $2,539,650 contract. `originalContract`
 * is the one rule every reader uses.
 * Pure; tested in job-contract.sanity.test.ts.
 */
import { coTotal, type CoMoney } from './change-order-amount';

const N = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Change-order statuses that still wait on the owner / GC. */
export const OPEN_CO_STATUSES = ['open', 'pending', 'submitted', 'in_review', 'draft'];

/** The contract columns a projects row may carry. */
export type ProjectContractColumns = {
  original_contract_amount?: unknown;
  original_contract_value?: unknown;
  original_contract?: unknown;
  revised_contract_value?: unknown;
  contract_amount?: unknown;
  contract_value?: unknown;
};

export type ContractInputs = {
  project: ProjectContractColumns | null | undefined;
  prime?: { original_amount?: unknown; contract_amount?: unknown; amount?: unknown } | null;
  acceptedProposal?: { amount?: unknown; total_amount?: unknown } | null;
  changeOrders?: Array<CoMoney & { status?: string | null }> | null;
};

export type ContractMoney = {
  original: number;
  approvedChanges: number;
  approvedCount: number;
  current: number;
  pendingChanges: number;
  pendingCount: number;
};

/**
 * A job's ORIGINAL contract sum (G702 line 1), never a figure that already
 * carries approved change orders.
 *
 *  1. a column that only ever holds the original: original_contract_amount,
 *     original_contract_value, original_contract
 *  2. the prime contract row's original amount
 *  3. a revised column less the approved changes: revised_contract_value,
 *     then contract_amount (the CO trigger adds to it)
 *  4. contract_value — written once at creation; nothing adds COs to it
 *  5. the accepted proposal
 * The first positive figure wins; a revised figure smaller than the approved
 * changes is not an original and is skipped.
 */
export function originalContract(
  project: ProjectContractColumns | null | undefined,
  approvedChanges: number,
  opts: { prime?: ContractInputs['prime']; acceptedProposal?: ContractInputs['acceptedProposal'] } = {},
): number {
  const p = project || {};
  const stored = N(p.original_contract_amount) || N(p.original_contract_value) || N(p.original_contract);
  if (stored > 0) return stored;
  const prime = opts.prime;
  const fromPrime = prime ? N(prime.original_amount) || N(prime.contract_amount) || N(prime.amount) : 0;
  if (fromPrime > 0) return fromPrime;
  const approved = N(approvedChanges);
  for (const revised of [N(p.revised_contract_value), N(p.contract_amount)]) {
    if (revised > 0 && revised - approved > 0) return Math.round((revised - approved) * 100) / 100;
  }
  const cv = N(p.contract_value);
  if (cv > 0) return cv;
  const ap = opts.acceptedProposal;
  return ap ? N(ap.amount) || N(ap.total_amount) : 0;
}

/** Sum of APPROVED change orders on a job, both money columns (lib/change-order-amount). */
export function approvedChangeTotal(changeOrders: Array<CoMoney & { status?: string | null }> | null | undefined): number {
  return coTotal((changeOrders || []).filter((c) => c.status === 'approved'));
}

export function contractMoney({ project, prime, acceptedProposal, changeOrders }: ContractInputs): ContractMoney {
  const cos = changeOrders || [];
  const approved = cos.filter((c) => c.status === 'approved');
  const pending = cos.filter((c) => OPEN_CO_STATUSES.includes(String(c.status || '')));
  const approvedChanges = coTotal(approved);
  const original = originalContract(project, approvedChanges, { prime, acceptedProposal });
  return {
    original,
    approvedChanges,
    approvedCount: approved.length,
    current: original + approvedChanges,
    pendingChanges: coTotal(pending),
    pendingCount: pending.length,
  };
}
