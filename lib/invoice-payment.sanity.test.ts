/**
 * @jest-environment node
 *
 * Recording a payment on an invoice (lib/invoice-payment): Paid stamps when
 * and how much; leaving Paid clears it; a caller's own figures win.
 */
import { describe, test, expect } from '@jest/globals';
import { stampPayment, invoiceTotal } from './invoice-payment';

const NOW = new Date('2026-10-16T18:00:00.000Z');

describe('invoiceTotal', () => {
  test('stored total wins; a 0 total falls back to amount + tax', () => {
    expect(invoiceTotal({ total: '67800', amount: '60000', tax: '7800' })).toBe(67800);
    expect(invoiceTotal({ total: 0, amount: '60000', tax: '7800.25' })).toBe(67800.25);
    expect(invoiceTotal(null)).toBe(0);
  });
});

describe('stampPayment', () => {
  test('into Paid: stamps now and the full total', () => {
    const u = stampPayment({ status: 'paid' }, { status: 'sent', total: 12500, amount: 12500, tax: 0 }, NOW);
    expect(u.paid_at).toBe('2026-10-16T18:00:00.000Z');
    expect(u.paid_amount).toBe(12500);
  });
  test('into Paid with the amount edited in the same save: the new total', () => {
    const u = stampPayment({ status: 'Paid', amount: 1000, tax: 80, total: 1080 }, { status: 'approved', total: 900 }, NOW);
    expect(u.paid_amount).toBe(1080);
  });
  test("the caller's own date and amount win (a part payment)", () => {
    const u = stampPayment({ status: 'paid', paid_at: '2026-10-01T12:00:00Z', paid_amount: 5000 }, { status: 'sent', total: 12500 }, NOW);
    expect(u.paid_at).toBe('2026-10-01T12:00:00Z');
    expect(u.paid_amount).toBe(5000);
  });
  test('already Paid: a re-save does not move the payment date', () => {
    const u = stampPayment({ status: 'paid', notes: 'x' }, { status: 'paid', paid_at: '2026-09-01T00:00:00Z', total: 100 }, NOW);
    expect(u.paid_at).toBeUndefined();
    expect(u.paid_amount).toBeUndefined();
  });
  test('out of Paid: clears the payment', () => {
    const u = stampPayment({ status: 'sent' }, { status: 'paid', paid_at: '2026-09-01T00:00:00Z', paid_amount: 100 }, NOW);
    expect(u.paid_at).toBeNull();
    expect(u.paid_amount).toBeNull();
  });
  test('no status in the write: untouched', () => {
    const u = stampPayment({ amount: 5 }, { status: 'sent' }, NOW);
    expect(u).toEqual({ amount: 5 });
  });
});
