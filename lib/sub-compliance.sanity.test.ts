/**
 * @jest-environment node
 *
 * The one compliance rule: a W-9 on file and insurance not expired, read from
 * every place either can live — so the W-9 screen, the Compliance screen, the
 * sub portal's invoice gate and the award gate agree.
 */
import { describe, test, expect } from '@jest/globals';
import { subCompliance, missingWords } from './sub-compliance';

const T = '2026-10-17';
const gl = (exp: string, status = 'active') => ({ policy_type: 'General Liability', expiry_date: exp, gl_expiry: exp, wc_expiry: exp, status });

describe('sub is compliant', () => {
  test('W-9 marked on file + a current COI = compliant (the four Pima subs)', () => {
    const r = subCompliance({ sub: { w9_on_file: true, insurance_expiry: '2027-04-10' }, certs: [gl('2027-04-10')], w9Requests: [], portalDocs: [] }, T);
    expect(r.compliant).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.w9).toBe('on_file');
    expect(r.insurance).toBe('current');
  });

  test('no W-9 request is not "W-9 missing" when the directory has it on file', () => {
    expect(subCompliance({ sub: { w9_on_file: true }, certs: [gl('2027-01-01')] }, T).w9).toBe('on_file');
  });

  test('a returned W-9 request, or a W-9 uploaded in the portal, counts as on file', () => {
    expect(subCompliance({ sub: { w9_on_file: false }, w9Requests: [{ status: 'submitted' }], certs: [gl('2027-01-01')] }, T).compliant).toBe(true);
    expect(subCompliance({ sub: {}, portalDocs: [{ doc_type: 'w9', status: 'pending_review' }], certs: [gl('2027-01-01')] }, T).compliant).toBe(true);
  });

  test('a rejected portal W-9 does not count; a pending request is "requested"', () => {
    const r = subCompliance({ sub: {}, portalDocs: [{ doc_type: 'w9', status: 'rejected' }], w9Requests: [{ status: 'pending' }], certs: [gl('2027-01-01')] }, T);
    expect(r.w9).toBe('requested');
    expect(r.missing).toEqual(['w9']);
  });

  test('expired insurance is a hold; good through the last day', () => {
    expect(subCompliance({ sub: { w9_on_file: true }, certs: [gl('2026-10-16')] }, T).missing).toEqual(['insurance']);
    expect(subCompliance({ sub: { w9_on_file: true }, certs: [gl('2026-10-17')] }, T).compliant).toBe(true);
  });

  test('a COI request with no dates is not insurance', () => {
    expect(subCompliance({ sub: { w9_on_file: true }, certs: [{ policy_type: 'General Liability', status: 'pending' }] }, T).insurance).toBe('missing');
  });

  test('the directory COI date stands in for a certificate', () => {
    expect(subCompliance({ sub: { w9_on_file: true, insurance_expiry: '2027-02-28' }, certs: [] }, T).compliant).toBe(true);
  });

  test('a COI uploaded in the portal counts until its expiry day', () => {
    expect(subCompliance({ sub: { w9_on_file: true }, portalDocs: [{ doc_type: 'insurance', expiry_date: '2026-12-01', status: 'pending_review' }] }, T).compliant).toBe(true);
    expect(subCompliance({ sub: { w9_on_file: true }, portalDocs: [{ doc_type: 'insurance', expiry_date: '2026-10-01' }] }, T).missing).toEqual(['insurance']);
  });

  test('expiring inside 30 days is still compliant, flagged expiring', () => {
    const r = subCompliance({ sub: { w9_on_file: true }, certs: [gl('2026-11-10')] }, T);
    expect(r.compliant).toBe(true);
    expect(r.insurance).toBe('expiring');
    expect(r.insuranceExpiry).toBe('2026-11-10');
  });

  test('nothing on file names both, in plain words', () => {
    const r = subCompliance({ sub: {} }, T);
    expect(r.compliant).toBe(false);
    expect(r.missing).toEqual(['insurance', 'w9']);
    expect(missingWords(r.missing)).toBe('insurance certificate and W-9');
  });
});
