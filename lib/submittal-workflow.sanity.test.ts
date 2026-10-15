/**
 * @jest-environment node
 *
 * The submittal approval chain: phase from status + ball in court, real
 * dates only, days held, overdue vs required-by, and the list's holder cell.
 */
import { describe, test, expect } from '@jest/globals';
import { buildChain, ballHolder, isWithDesign, partyOf, daysBetween, initialsOf, eventsFromHistory } from './submittal-workflow';

const TODAY = '2026-10-15';
const base = {
  created_at: '2026-09-20T15:00:00Z', subcontractor: 'Desert Steel LLC', submitted_to: 'Architect',
  due_date: '2026-10-10', revision_number: 0,
};

describe('helpers', () => {
  test('daysBetween is calendar days', () => {
    expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14);
    expect(daysBetween(null, '2026-10-15')).toBeNull();
  });
  test('initials skip LLC / Inc', () => {
    expect(initialsOf('Desert Steel LLC')).toBe('DS');
    expect(initialsOf('Acme')).toBe('AC');
    expect(initialsOf('')).toBe('');
  });
  test('party words', () => {
    expect(partyOf('Contractor')).toBe('gc');
    expect(partyOf('Architect')).toBe('design');
    expect(partyOf('Structural Engineer')).toBe('design');
    expect(partyOf('Owner')).toBe('design');
    expect(partyOf('Desert Steel LLC', base)).toBe('sub');
    expect(partyOf('Someone Else', base)).toBeNull();
  });
});

describe('buildChain', () => {
  test('pending, not submitted: the sub holds it, days since created, overdue', () => {
    const c = buildChain({ ...base, status: 'pending', ball_in_court: 'Contractor' }, [], TODAY);
    expect(c.current).toBe('sub');
    expect(c.steps.map((s) => s.state)).toEqual(['current', 'waiting', 'waiting', 'waiting']);
    expect(c.steps[0].who).toBe('Desert Steel LLC');
    expect(c.steps[0].initials).toBe('DS');
    expect(c.steps[0].daysHeld).toBe(25);
    expect(c.steps[0].overdue).toBe(true);
    expect(c.steps[0].daysLate).toBe(5);
    expect(c.steps[1].sentAt).toBeNull();
  });

  test('submitted with the architect: sub + GC done, A/E current, dates from history', () => {
    const ev = eventsFromHistory([
      { created_at: '2026-10-01T16:00:00Z', changes: { status: 'submitted', submitted_at: '2026-10-01' }, previous_values: { status: 'pending' } },
      { created_at: '2026-10-03T16:00:00Z', changes: { ball_in_court: 'Architect' }, previous_values: { ball_in_court: 'Contractor' } },
    ]);
    const c = buildChain({ ...base, status: 'submitted', ball_in_court: 'Architect', submitted_at: '2026-10-01' }, ev, TODAY);
    expect(c.current).toBe('design');
    expect(c.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'waiting']);
    expect(c.steps[1].sentAt).toBe('2026-10-01');
    expect(c.steps[1].returnedAt).toBe('2026-10-03T16:00:00Z');
    expect(c.steps[1].daysHeld).toBe(2);
    expect(c.steps[2].role).toBe('Architect review');
    expect(c.steps[2].daysHeld).toBe(12);
    expect(c.steps[2].overdue).toBe(true);
    // "Architect" is a role, not a name — never shown as who.
    expect(c.steps[2].who).toBeNull();
    expect(c.steps[2].initials).toBe('AE');
  });

  test('under review with the GC (ball Contractor)', () => {
    const c = buildChain({ ...base, status: 'under_review', ball_in_court: 'Contractor', submitted_at: '2026-10-12', due_date: '2026-10-20' }, [], TODAY, { gcName: 'Copper State Builders' });
    expect(c.current).toBe('gc');
    expect(c.steps[1].who).toBe('Copper State Builders');
    expect(c.steps[1].daysHeld).toBe(3);
    expect(c.steps[1].overdue).toBe(false);
  });

  test('approved: chain complete, verdict on the reviewer, late return flagged', () => {
    const c = buildChain({ ...base, status: 'approved', ball_in_court: 'Contractor', submitted_at: '2026-10-01', reviewed_at: '2026-10-12T18:00:00Z', submitted_to: 'Studio Ma Architects' }, [], TODAY);
    expect(c.complete).toBe(true);
    expect(c.steps.every((s) => s.state === 'done')).toBe(true);
    expect(c.steps[2].who).toBe('Studio Ma Architects');
    expect(c.steps[2].verdict).toBe('Approved');
    expect(c.steps[2].daysLate).toBe(2);
    // No recorded GC → A/E handoff: the GC's days are unknown, not zero.
    expect(c.steps[1].returnedAt).toBeNull();
    expect(c.steps[1].daysHeld).toBeNull();
    expect(c.steps[2].overdue).toBe(true);
    expect(c.steps[3].sentAt).toBe('2026-10-12T18:00:00Z');
  });

  test('revise & resubmit: back with the sub, verdict shown', () => {
    const c = buildChain({ ...base, status: 'revise_resubmit', ball_in_court: 'Desert Steel LLC', submitted_at: '2026-10-01', reviewed_at: '2026-10-08', due_date: '2026-10-30', revision_number: 1 }, [], TODAY);
    expect(c.current).toBe('return');
    expect(c.revision).toBe(1);
    expect(c.steps[3].state).toBe('current');
    expect(c.steps[3].verdict).toBe('Revise & resubmit');
    expect(c.steps[3].daysHeld).toBe(7);
  });

  test('missing dates stay null — no invented days', () => {
    const c = buildChain({ status: 'under_review', ball_in_court: 'Architect' }, [], TODAY);
    expect(c.current).toBe('design');
    expect(c.steps[2].sentAt).toBeNull();
    expect(c.steps[2].daysHeld).toBeNull();
    expect(c.steps[0].who).toBeNull();
    expect(c.steps[0].initials).toBe('SB');
  });
});

describe('ballHolder', () => {
  test('prefers the recorded handoff', () => {
    const h = ballHolder({ ...base, status: 'submitted', ball_in_court: 'Architect', submitted_at: '2026-10-01', bic_since: '2026-10-05T10:00:00Z' }, TODAY)!;
    expect(h.party).toBe('design');
    expect(h.initials).toBe('AE');
    expect(h.daysHeld).toBe(10);
    expect(h.overdue).toBe(true);
  });
  test('falls back to the phase date', () => {
    const h = ballHolder({ ...base, status: 'pending', ball_in_court: 'Contractor', due_date: '2026-11-01' }, TODAY)!;
    expect(h.since).toBe(base.created_at);
    expect(h.daysHeld).toBe(25);
    expect(h.overdue).toBe(false);
  });
  test('approved: no clock', () => {
    const h = ballHolder({ ...base, status: 'approved', ball_in_court: 'Contractor', reviewed_at: '2026-10-12' }, TODAY)!;
    expect(h.daysHeld).toBeNull();
    expect(h.overdue).toBe(false);
  });
  test('no ball → null; with design count', () => {
    expect(ballHolder({ status: 'pending' }, TODAY)).toBeNull();
    expect(isWithDesign({ status: 'submitted', ball_in_court: 'Engineer' })).toBe(true);
    expect(isWithDesign({ status: 'approved', ball_in_court: 'Architect' })).toBe(false);
  });
});

describe('architect of record', () => {
  test('names the architect step when the row only says Architect', () => {
    const c = buildChain({ status: 'submitted', ball_in_court: 'Architect', submitted_to: 'Architect' }, [], TODAY, { architectName: 'Firm of Record' });
    expect(c.steps[2].who).toBe('Firm of Record');
    const e = buildChain({ status: 'submitted', ball_in_court: 'Engineer' }, [], TODAY, { architectName: 'Firm of Record' });
    expect(e.steps[2].who).toBe(null);
    expect(e.steps[2].role).toBe('Engineer review');
  });
});
