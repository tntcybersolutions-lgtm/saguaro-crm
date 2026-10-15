/**
 * @jest-environment node
 *
 * Cash flow projects only what is really still owed: a closed, fully billed,
 * fully paid job projects $0; an active job spreads what is left to bill and
 * the committed costs only up to its end month; dated items land in their
 * month; retainage held comes in at the end.
 */
import { describe, test, expect } from '@jest/globals';
import { projectCashFlow, type CashFlowInput } from './cash-flow-projection';

const base: CashFlowInput = {
  today: '2026-10-15', status: 'active', endDate: '2027-03-31', openTaskEndDates: [],
  revisedContract: 0, billedToDate: 0, retainageHeld: 0, retainagePct: 10,
  unpaidPayApps: [], unpaidReceivables: [], unpaidPayables: [], committedUnbilled: 0,
};
const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe('cash flow projection', () => {
  test('closed, fully billed and paid job projects zero everywhere', () => {
    const r = projectCashFlow({
      ...base, status: 'completed', endDate: '2026-09-18',
      revisedContract: 2539650, billedToDate: 2539650, retainageHeld: 0, retainagePct: 5,
      committedUnbilled: 18544, // leftover budget on a finished job is not a forecast
    });
    expect(r.closed).toBe(true);
    for (const p of r.periods) {
      expect(p.receivables).toBe(0); expect(p.payables).toBe(0); expect(p.net).toBe(0); expect(p.running_balance).toBe(0);
    }
    expect(r.summary).toEqual({ total_receivables: 0, total_payables: 0, net_cash_flow: 0, retainage_due: 0, danger_zone: false });
  });

  test('closed job still shows its real open items, due now', () => {
    const r = projectCashFlow({
      ...base, status: 'closed', endDate: '2026-06-30', revisedContract: 100000, billedToDate: 100000, retainageHeld: 5000,
      unpaidPayables: [{ label: 'Bill: Vendor', amount: 1200, dueDate: '2026-08-01' }],
    });
    expect(r.periods[0].payables).toBe(1200);
    expect(r.periods[0].retainage_release).toBe(5000);
    expect(sum(r.periods.slice(1).map((p) => p.net))).toBe(0);
    expect(r.summary.retainage_due).toBe(5000);
  });

  test('active job half billed: remaining billing spread to the end month, net of retainage', () => {
    const r = projectCashFlow({
      ...base, endDate: '2027-01-20', revisedContract: 1000000, billedToDate: 500000, retainageHeld: 50000, retainagePct: 10,
      committedUnbilled: 300000,
    });
    // Oct, Nov, Dec, Jan = 4 months
    expect(r.periods.slice(0, 4).every((p) => p.receivables > 0 && p.payables > 0)).toBe(true);
    expect(r.periods.slice(4).every((p) => p.receivables === 0 && p.payables === 0)).toBe(true);
    expect(sum(r.periods.map((p) => p.receivables))).toBe(450000);
    expect(sum(r.periods.map((p) => p.payables))).toBe(300000);
    expect(r.periods[3].retainage_release).toBe(100000); // 50k held + 10% of the 500k still to bill
    expect(r.summary.net_cash_flow).toBe(250000);
    expect(r.summary.retainage_due).toBe(50000);
    expect(r.remainingToBill).toBe(500000);
  });

  test('unpaid bills land in their due month; overdue lands now; past the window drops out', () => {
    const r = projectCashFlow({
      ...base, unpaidPayables: [
        { label: 'Bill A', amount: 1000, dueDate: '2026-12-05' },
        { label: 'Bill B', amount: 250, dueDate: '2026-07-01' },
        { label: 'Bill C', amount: 999, dueDate: '2027-09-01' },
      ],
      unpaidPayApps: [{ label: 'Pay App #3', amount: 4000, expectedDate: '2026-11-14' }],
    });
    expect(r.periods[2].payables).toBe(1000);
    expect(r.periods[0].payables).toBe(250);
    expect(r.periods[1].receivables).toBe(4000);
    expect(r.summary.total_payables).toBe(1250);
    expect(r.summary.danger_zone).toBe(true); // Oct runs -250 before the pay app lands
  });

  test('retainage held lands in the end month', () => {
    const r = projectCashFlow({ ...base, endDate: '2026-12-31', revisedContract: 100, billedToDate: 100, retainageHeld: 7000 });
    expect(r.periods.map((p) => p.retainage_release)).toEqual([0, 0, 7000, 0, 0, 0]);
    expect(r.summary.danger_zone).toBe(false);
  });

  test('never projects past the end date, and a past end date bills now', () => {
    const r = projectCashFlow({ ...base, endDate: '2026-11-15', revisedContract: 20000, billedToDate: 0, retainagePct: 0, committedUnbilled: 6000 });
    expect(r.periods[0].receivables + r.periods[1].receivables).toBe(20000);
    expect(r.periods.slice(2).every((p) => p.receivables === 0 && p.payables === 0)).toBe(true);
    const late = projectCashFlow({ ...base, endDate: '2026-05-01', revisedContract: 9000, billedToDate: 0, retainagePct: 0 });
    expect(late.periods[0].receivables).toBe(9000);
    expect(sum(late.periods.slice(1).map((p) => p.receivables))).toBe(0);
  });

  test('a slipped open schedule task pushes the end month out', () => {
    const r = projectCashFlow({ ...base, endDate: '2026-10-31', openTaskEndDates: ['2026-12-10'], revisedContract: 3000, billedToDate: 0, retainagePct: 0 });
    expect(r.periods.slice(0, 3).map((p) => p.receivables)).toEqual([1000, 1000, 1000]);
  });
});
