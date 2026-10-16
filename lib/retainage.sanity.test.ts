/**
 * @jest-environment node
 *
 * Retainage, read one way (lib/retainage): a 0 % rate stays 0 %, and
 * "Released to Date" is the sum of every drop in the held balance.
 * Fixtures are Pima County Adult Detention Center's five live applications.
 */
import { describe, test, expect } from '@jest/globals';
import { retainageRate, retainageHeld, retainageLedger } from './retainage';

const PIMA = [
  { id: 'a1', app_number: 1, total_retainage: '9000', total_earned_less_retainage: '171000', less_previous_certificates: '0' },
  { id: 'a2', app_number: 2, total_retainage: '30000', total_earned_less_retainage: '570000', less_previous_certificates: '171000' },
  { id: 'a3', app_number: 3, total_retainage: '64000', total_earned_less_retainage: '1216000', less_previous_certificates: '570000' },
  { id: 'a4', app_number: 4, total_retainage: '108500', total_earned_less_retainage: '2061500', less_previous_certificates: '1216000' },
  { id: 'a5', app_number: 5, total_retainage: '0', total_earned_less_retainage: '2539650', less_previous_certificates: '2061500' },
];

describe('retainageRate', () => {
  test('a stored 0 is 0 %, never the 10 % default', () => {
    expect(retainageRate(0)).toBe(0);
    expect(retainageRate('0')).toBe(0);
    expect(retainageRate('0.00')).toBe(0);
  });
  test('missing or unreadable falls back; out of range clamps', () => {
    expect(retainageRate(null)).toBe(10);
    expect(retainageRate(undefined)).toBe(10);
    expect(retainageRate('')).toBe(10);
    expect(retainageRate('abc')).toBe(10);
    expect(retainageRate('5%')).toBe(5);
    expect(retainageRate(150)).toBe(100);
    expect(retainageRate(null, 5)).toBe(5);
  });
});

describe('retainageLedger', () => {
  test('the release app: App #5 at 0 % releases the $108,500 held on App #4', () => {
    const l = retainageLedger(PIMA, 'a5');
    expect(l.heldBefore).toBe(108500);
    expect(l.heldNow).toBe(0);
    expect(l.releasedThisApp).toBe(108500);
    expect(l.releasedBefore).toBe(0);
    expect(l.releasedToDate).toBe(108500);
    expect(l.previousCertificates).toBe(2061500);
    expect(l.priorAppNumber).toBe(4);
  });
  test('a building-up app releases nothing', () => {
    const l = retainageLedger(PIMA, 'a3');
    expect(l.heldBefore).toBe(30000);
    expect(l.heldNow).toBe(64000);
    expect(l.releasedThisApp).toBe(0);
    expect(l.releasedToDate).toBe(0);
    expect(l.previousCertificates).toBe(570000);
  });
  test('App #1 has nothing before it; line 7 reads its own stored value', () => {
    const l = retainageLedger(PIMA, 'a1');
    expect(l.heldBefore).toBe(0);
    expect(l.releasedToDate).toBe(0);
    expect(l.previousCertificates).toBe(0);
    expect(l.priorAppNumber).toBeNull();
  });
  test('a rate cut part way (10 % → 5 %) counts as a release, and later apps keep it', () => {
    const apps = [
      { id: 'b1', app_number: 1, total_retainage: 50000 },
      { id: 'b2', app_number: 2, total_retainage: 30000 },   // rate cut: 20,000 released
      { id: 'b3', app_number: 3, total_retainage: 35000 },   // builds again
      { id: 'b4', app_number: 4, total_retainage: 0 },       // final: 35,000 released
    ];
    expect(retainageLedger(apps, 'b2').releasedToDate).toBe(20000);
    const l3 = retainageLedger(apps, 'b3');
    expect(l3.releasedThisApp).toBe(0);
    expect(l3.releasedBefore).toBe(20000);
    expect(l3.releasedToDate).toBe(20000);
    expect(retainageLedger(apps, 'b4').releasedToDate).toBe(55000);
  });
  test('apps arrive out of order and deleted apps are skipped', () => {
    const apps = [PIMA[4], PIMA[1], { ...PIMA[3], deleted_at: '2026-10-01' }, PIMA[0], PIMA[2]];
    // With #4 deleted, #5's prior is #3 (64,000 held).
    const l = retainageLedger(apps, 'a5');
    expect(l.priorAppNumber).toBe(3);
    expect(l.releasedThisApp).toBe(64000);
  });
  test('a draft being edited: the live held figure overrides the stored one', () => {
    const l = retainageLedger(PIMA, 'a5', 50000);
    expect(l.heldNow).toBe(50000);
    expect(l.releasedThisApp).toBe(58500);
    expect(l.releasedToDate).toBe(58500);
  });
  test('the current app is missing from the list: no invented history', () => {
    const l = retainageLedger(PIMA.slice(0, 2), 'zz', 1234.5);
    expect(l.heldNow).toBe(1234.5);
    expect(l.releasedToDate).toBe(0);
  });
  test('held reads total_retainage, then the legacy text column', () => {
    expect(retainageHeld({ total_retainage: '0', retainage_amount: '999' })).toBe(0);
    expect(retainageHeld({ total_retainage: null, retainage_amount: '1,250.50' })).toBe(1250.5);
  });
});
