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
 *   original = stored original → prime contract → contract_amount → accepted proposal
 *   current  = original + approved change orders
 *   pending  = change orders still waiting on a decision
 * Pure; tested in job-contract.sanity.test.ts.
 */
import { coTotal, type CoMoney } from './change-order-amount';

const N = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Change-order statuses that still wait on the owner / GC. */
export const OPEN_CO_STATUSES = ['open', 'pending', 'submitted', 'in_review', 'draft'];

export type ContractInputs = {
  project: { original_contract_amount?: unknown; contract_amount?: unknown } | null | undefined;
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

export function contractMoney({ project, prime, acceptedProposal, changeOrders }: ContractInputs): ContractMoney {
  const original =
    N(project?.original_contract_amount) ||
    (prime ? N(prime.original_amount) || N(prime.contract_amount) || N(prime.amount) : 0) ||
    N(project?.contract_amount) ||
    (acceptedProposal ? N(acceptedProposal.amount) || N(acceptedProposal.total_amount) : 0);
  const cos = changeOrders || [];
  const approved = cos.filter((c) => c.status === 'approved');
  const pending = cos.filter((c) => OPEN_CO_STATUSES.includes(String(c.status || '')));
  const approvedChanges = coTotal(approved);
  return {
    original,
    approvedChanges,
    approvedCount: approved.length,
    current: original + approvedChanges,
    pendingChanges: coTotal(pending),
    pendingCount: pending.length,
  };
}
