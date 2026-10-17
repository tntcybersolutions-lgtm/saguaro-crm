/**
 * @jest-environment node
 *
 * Billing cap: a sub can't bill past their subcontract (revised value less
 * everything already billed, waiting invoices included), measured gross so
 * retainage can't carry an invoice over.
 */
import { describe, test, expect } from '@jest/globals';
import { billingRoom, checkBillingCap, invoiceGross, remainingSentence, approvalCapMessage, subContracts } from './sub-billing-cap';
import { buildCommitments } from './commitments';

const contract = (revised: number, billed: number, retainage_pct: number | null = 10) => ({ revised, billed, retainage_pct });

describe('billing room', () => {
  test('revised value less billed, waiting invoices counted', () => {
    const room = billingRoom({ contracts: [contract(100_000, 40_000)], invoices: [{ id: 'a', status: 'submitted', amount: 10_000 }] })!;
    expect(room.contract).toBe(100_000);
    expect(room.billed).toBe(50_000);
    expect(room.remaining).toBe(50_000);
  });

  test('approved invoices are not counted twice once posted to the subcontract', () => {
    // posted: billed on record already includes the approved 20k
    const posted = billingRoom({ contracts: [contract(100_000, 60_000)], invoices: [{ status: 'approved', amount: 20_000 }] })!;
    expect(posted.remaining).toBe(40_000);
    // not posted: record says 40k, approved portal invoices add to 60k — the larger wins
    const unposted = billingRoom({ contracts: [contract(100_000, 0)], invoices: [{ status: 'approved', amount: 20_000 }, { status: 'paid', amount: 40_000 }] })!;
    expect(unposted.remaining).toBe(40_000);
  });

  test('sent-back invoices do not use up the contract', () => {
    const room = billingRoom({ contracts: [contract(50_000, 0)], invoices: [{ status: 'rejected', amount: 50_000 }] })!;
    expect(room.remaining).toBe(50_000);
  });

  test('the invoice being approved is checked against the others, not itself', () => {
    const inv = [{ id: 'x', status: 'submitted', amount: 30_000 }, { id: 'y', status: 'under_review', amount: 10_000 }];
    const room = billingRoom({ contracts: [contract(40_000, 0)], invoices: inv, excludeInvoiceId: 'x' })!;
    expect(room.remaining).toBe(30_000);
    expect(checkBillingCap(room, 30_000).ok).toBe(true);
    expect(checkBillingCap(room, 30_000.02).ok).toBe(false);
  });

  test('never negative, and a fully billed contract says so', () => {
    const room = billingRoom({ contracts: [contract(612_000, 612_000)], invoices: [] })!;
    expect(room.remaining).toBe(0);
    expect(remainingSentence(room)).toMatch(/fully billed/);
    const over = billingRoom({ contracts: [contract(10_000, 12_000)], invoices: [] })!;
    expect(over.remaining).toBe(0);
  });

  test('two subcontracts with the same sub on a job are summed', () => {
    const room = billingRoom({ contracts: [contract(10_000, 2_000), contract(5_000, 0)], invoices: [] })!;
    expect(room.contract).toBe(15_000);
    expect(room.remaining).toBe(13_000);
  });

  test('no subcontract → nothing to cap against', () => {
    expect(billingRoom({ contracts: [], invoices: [] })).toBeNull();
    expect(checkBillingCap(null, 1e9).ok).toBe(true);
  });

  test('exact cents: 0.1 + 0.2 style sums do not trip the cap', () => {
    const room = billingRoom({ contracts: [contract(0.3, 0)], invoices: [{ status: 'submitted', amount: 0.1 }] })!;
    expect(room.remaining).toBe(0.2);
    expect(checkBillingCap(room, 0.2).ok).toBe(true);
  });
});

describe('retainage-aware', () => {
  test('gross (retainage included) is what counts — net would slip past by the retainage', () => {
    // a $10,000 invoice at 10% retainage nets $9,000; the contract has $9,500 left
    const room = billingRoom({ contracts: [contract(9_500, 0)], invoices: [] })!;
    const inv = { amount: 10_000, net_amount: 9_000, retainage: 1_000 };
    expect(invoiceGross(inv)).toBe(10_000);
    expect(checkBillingCap(room, invoiceGross(inv)).ok).toBe(false);
  });

  test('gross falls back to net + retainage when no amount was stored', () => {
    expect(invoiceGross({ net_amount: 9_000, retainage: 1_000 })).toBe(10_000);
  });

  test('what is left is also given net of the contract retainage', () => {
    const room = billingRoom({ contracts: [contract(20_000, 8_000, 5)], invoices: [] })!;
    expect(room.remaining).toBe(12_000);
    expect(room.retainagePct).toBe(5);
    expect(room.remainingNet).toBe(11_400);
  });
});

describe('messages', () => {
  test('the sub sees the amount left in plain words', () => {
    const room = billingRoom({ contracts: [contract(50_000, 37_600)], invoices: [] })!;
    const cap = checkBillingCap(room, 20_000);
    expect(cap.ok).toBe(false);
    if (!cap.ok) {
      expect(cap.message).toBe('You can bill up to $12,400 more on this contract.');
      expect(cap.over).toBe(7_600);
      expect(approvalCapMessage('Valley Sheet Metal Co.', cap)).toMatch(/Valley Sheet Metal Co\. \$7,600 past their \$50,000 contract — only \$12,400 is left/);
    }
  });
});

describe('which subcontracts are the sub\'s', () => {
  test('live subcontracts named for the sub, from the commitments list', () => {
    const rows = buildCommitments({
      projectId: 'p',
      contracts: [
        { id: 'c1', contract_type: 'subcontract', party_company: 'Valley Sheet Metal Co.', party_name: 'Hector Alvarado', amount: 612000, approved_changes: 12000, invoiced_amount: 600000, status: 'executed', retainage_pct: 5 },
        { id: 'c2', contract_type: 'subcontract', party_company: 'Valley Sheet Metal Co', amount: 1000, status: 'void' },
        { id: 'c3', contract_type: 'prime', party_company: 'Valley Sheet Metal Co.', amount: 9e6, status: 'executed' },
        { id: 'c4', contract_type: 'subcontract', party_company: 'Sonoran Electric LLC', amount: 438000, status: 'executed' },
      ],
      purchaseOrders: [], legacy: [], bills: [],
    });
    const mine = subContracts(rows, 'valley sheet metal co');
    expect(mine.map((r) => r.id)).toEqual(['c1']);
    const room = billingRoom({ contracts: mine, invoices: [] })!;
    expect(room.contract).toBe(624_000);
    expect(room.remaining).toBe(24_000);
  });
});
