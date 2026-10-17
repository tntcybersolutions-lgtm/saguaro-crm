/**
 * @jest-environment node
 *
 * A sub's invoice reaches the job's money: the right subcontract is found (and
 * never guessed when there are two), approve adds the gross, sending back an
 * approved invoice takes it off, paid adds the net, and the cost lands on the
 * budget line that belongs to that subcontract.
 */
import { describe, test, expect } from '@jest/globals';
import { pickSubCommitment, postingFor, budgetLineForCommitment, commitmentSummary } from './sub-invoice-posting';

const SUB = '3beb38aa-46dc-4f09-b3b1-81d65433c8f0';
const PKG = 'e88342e3-4f84-45a5-899e-df385c249aa8';
const valley = { id: 'k1', contract_type: 'subcontract', party_company: 'Valley Sheet Metal Co.', amount: 612000, invoiced_amount: 408000, paid_amount: 300000, status: 'executed', bid_package_id: PKG };
const sonoran = { id: 'k2', contract_type: 'subcontract', party_company: 'Sonoran Electric LLC', amount: 438000, invoiced_amount: 0, status: 'executed' };
const prime = { id: 'k0', contract_type: 'prime', party_company: 'Valley Sheet Metal Co.', amount: 9e6, status: 'executed' };

describe('pickSubCommitment', () => {
  test('the subcontract whose company is the sub (prime contracts and other subs ignored)', () => {
    const c = pickSubCommitment({ subId: SUB, subName: 'Valley Sheet Metal Co', contracts: [prime, valley, sonoran], legacy: [] });
    expect(c).toMatchObject({ source: 'contracts', id: 'k1', revised: 612000, billed: 408000, paid: 300000 });
  });

  test('two live subcontracts with the same sub: not guessed', () => {
    const second = { ...valley, id: 'k3', bid_package_id: null };
    expect(pickSubCommitment({ subId: SUB, subName: 'Valley Sheet Metal Co.', contracts: [valley, second], legacy: [] })).toBeNull();
  });

  test('a voided subcontract does not count', () => {
    const voided = { ...valley, id: 'k3', status: 'void' };
    expect(pickSubCommitment({ subId: SUB, subName: 'Valley Sheet Metal Co.', contracts: [valley, voided], legacy: [] })?.id).toBe('k1');
  });

  test('no subcontract: the commitments row that names the sub', () => {
    const legacy = [{ id: 'c1', subcontractor_id: SUB, vendor_name: 'Valley', original_amount: 100000, approved_changes: 5000, invoiced_to_date: 20000, status: 'active' }];
    expect(pickSubCommitment({ subId: SUB, subName: 'Valley Sheet Metal Co.', contracts: [], legacy })).toMatchObject({ source: 'commitments', id: 'c1', revised: 105000, billed: 20000 });
  });

  test('a bid-award subcontract carries its commitments twin', () => {
    const twin = { id: 'c9', bid_package_id: PKG, invoiced_to_date: 0, budget_line_id: 'L3' };
    expect(pickSubCommitment({ subId: SUB, subName: 'Valley Sheet Metal Co.', contracts: [valley], legacy: [twin] })?.twin?.id).toBe('c9');
  });
});

describe('postingFor', () => {
  const inv = { amount: 5000, retainage: 500, net_amount: 4500 };
  test('approve adds the gross; review, a second approve and plain send-back add nothing', () => {
    expect(postingFor('submitted', 'approved', inv)).toEqual({ billed: 5000, paid: 0 });
    expect(postingFor('under_review', 'approved', inv)).toEqual({ billed: 5000, paid: 0 });
    expect(postingFor('submitted', 'under_review', inv)).toEqual({ billed: 0, paid: 0 });
    expect(postingFor('submitted', 'rejected', inv)).toEqual({ billed: 0, paid: 0 });
  });
  test('sending back an approved invoice takes it off; paid adds the net', () => {
    expect(postingFor('approved', 'rejected', inv)).toEqual({ billed: -5000, paid: 0 });
    expect(postingFor('approved', 'paid', inv)).toEqual({ billed: 0, paid: 4500 });
  });
  test('no gross on the row: net + retainage', () => {
    expect(postingFor('submitted', 'approved', { net_amount: 900, retainage: 100 })).toEqual({ billed: 1000, paid: 0 });
  });
});

describe('budgetLineForCommitment', () => {
  const lines = [
    { id: 'L1', cost_code: '23-0900', description: 'DDC panels', division: '23' },
    { id: 'L2', cost_code: '23-3100', description: 'Ductwork and VAV terminals — Valley Sheet Metal Co.', division: '23' },
    { id: 'L3', cost_code: '26-0500', description: 'Controls rough-in — Sonoran Electric LLC', division: '26' },
  ];
  const c = (row: Record<string, unknown>, twin: Record<string, unknown> | null = null) =>
    ({ source: 'contracts' as const, id: 'k1', number: null, vendor: 'Valley Sheet Metal Co.', title: '', revised: 1, billed: 0, paid: 0, twin, row });

  test('the commitment\'s own line wins', () => {
    expect(budgetLineForCommitment(c(valley, { budget_line_id: 'L3' }), lines, [])?.id).toBe('L3');
  });
  test('else the cost code on its bid award PO', () => {
    expect(budgetLineForCommitment(c(valley), lines, [{ cost_code: '23-0900', notes: `Drafted from bid award (package ${PKG})` }])?.id).toBe('L1');
  });
  test('else the one line that names the sub', () => {
    expect(budgetLineForCommitment(c({ ...valley, bid_package_id: null }), lines, [])?.id).toBe('L2');
  });
  test('nothing clearly theirs: no line', () => {
    expect(budgetLineForCommitment({ ...c({ id: 'x' }), vendor: 'Someone Else' }, lines, [])).toBeNull();
  });
});

describe('commitmentSummary', () => {
  const c = pickSubCommitment({ subId: SUB, subName: 'Valley Sheet Metal Co.', contracts: [{ ...valley, invoiced_amount: 610000 }], legacy: [] });
  test('a waiting invoice shows where it would take the subcontract, and by how much it goes over', () => {
    expect(commitmentSummary(c, { amount: 5000 }, 'submitted')).toMatchObject({ billed: 610000, billed_after: 615000, over_by: 3000 });
  });
  test('an approved invoice is already inside billed', () => {
    expect(commitmentSummary(c, { amount: 5000 }, 'approved')).toMatchObject({ billed_after: 610000, over_by: 0 });
  });
});
