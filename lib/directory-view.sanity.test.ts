/**
 * @jest-environment node
 *
 * Directory rules: stable monogram color, company grouping, safe quick links.
 */
import { describe, test, expect } from '@jest/globals';
import { monoToken, groupByCompany, telHref, mailHref, MONO_TOKENS } from './directory-view';

describe('monoToken', () => {
  test('deterministic and token-only', () => {
    expect(monoToken('Desert Steel')).toBe(monoToken('  desert   steel '));
    expect(MONO_TOKENS.map((t) => `var(${t})`)).toContain(monoToken('Desert Steel'));
    expect(monoToken('')).toBe('var(--text-tertiary)');
  });
  test('spreads across the palette', () => {
    const seen = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((n) => monoToken(`Co ${n}`)));
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('groupByCompany', () => {
  test('groups people, adds sub companies with their trade and contact, no-company last', () => {
    const g = groupByCompany(
      [
        { id: '1', name: 'Pat Two', company: 'Alpha Electric' },
        { id: '2', name: 'Lee One', company: 'alpha electric ' },
        { id: '3', name: 'Solo Person', company: null },
      ],
      [
        { id: 's1', name: 'Alpha Electric', trade: 'Electrical', phone: '602-555-0100' },
        { id: 's2', name: 'Zed Plumbing', trade: 'Plumbing', contactName: 'Sam Contact', email: 'sam@zed.test' },
      ],
    );
    expect(g.map((x) => x.name)).toEqual(['Alpha Electric', 'Zed Plumbing', '']);
    expect(g[0].people.map((p) => p.name)).toEqual(['Lee One', 'Pat Two']);
    expect(g[0].trade).toBe('Electrical');
    expect(g[0].isSub).toBe(true);
    expect(g[1].people[0].name).toBe('Sam Contact');
    expect(g[2].people[0].name).toBe('Solo Person');
  });
  test('empty input', () => { expect(groupByCompany(null, null)).toEqual([]); });
});

describe('quick links', () => {
  test('tel', () => {
    expect(telHref('(602) 555-0100')).toBe('tel:6025550100');
    expect(telHref('+1 602 555 0100')).toBe('tel:+16025550100');
    expect(telHref('ext 12')).toBeNull();
  });
  test('mail', () => {
    expect(mailHref(' a@b.co ')).toBe('mailto:a@b.co');
    expect(mailHref('nope')).toBeNull();
  });
});
