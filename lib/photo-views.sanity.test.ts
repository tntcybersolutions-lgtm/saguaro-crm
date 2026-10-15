/**
 * @jest-environment node
 *
 * The Photos page's views: day / month grouping (newest first, undated last),
 * GPS clustering, the one filter predicate, album tiles.
 */
import { describe, test, expect } from '@jest/globals';
import {
  groupByDay, groupByMonth, clusterByLocation, matchesPhotoFilter, albumSummaries,
  photoGeo, isIssuePhoto, uploaders, cleanAlbumName, type PhotoLike,
} from './photo-views';

const P = (id: string, x: Partial<PhotoLike> = {}): PhotoLike => ({ id, ...x });
// Local noon so the day never shifts with the machine's zone.
const at = (ymd: string) => new Date(`${ymd}T12:00:00`).toISOString();

describe('grouping', () => {
  const rows = [
    P('a', { taken_at: at('2026-09-30') }),
    P('b', { taken_at: at('2026-10-02') }),
    P('c', { taken_at: null, created_at: null }),
    P('d', { taken_at: at('2026-10-02') }),
    P('e', { taken_at: null, created_at: at('2026-10-01') }),
  ];
  test('by day: newest day first, undated last, falls back to created_at', () => {
    const g = groupByDay(rows);
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([['b', 'd'], ['e'], ['a'], ['c']]);
    expect(g[g.length - 1].label).toBe('No date');
    expect(g[0].key).toBe('2026-10-02');
  });
  test('by month', () => {
    const g = groupByMonth(rows);
    expect(g.map((x) => [x.key, x.items.length])).toEqual([['2026-10', 3], ['2026-09', 1], ['none', 1]]);
    expect(g[0].label).toBe('Oct 2026');
  });
});

describe('location', () => {
  test('reads upload stamp first, rejects junk and 0,0', () => {
    expect(photoGeo(P('a', { location_lat: 33.8, location_lng: -112.1 }))).toEqual({ lat: 33.8, lng: -112.1 });
    expect(photoGeo(P('a', { latitude: '33.5', longitude: '-112' }))).toEqual({ lat: 33.5, lng: -112 });
    expect(photoGeo(P('a', { location_lat: 0, location_lng: 0 }))).toBeNull();
    expect(photoGeo(P('a', { location_lat: 120, location_lng: 3 }))).toBeNull();
    expect(photoGeo(P('a'))).toBeNull();
  });
  test('clusters nearby photos, biggest first, skips no-GPS', () => {
    const c = clusterByLocation([
      P('a', { location_lat: 33.80001, location_lng: -112.10001 }),
      P('b', { location_lat: 33.80003, location_lng: -112.10003 }),
      P('c', { location_lat: 33.9, location_lng: -112.2 }),
      P('d'),
    ]);
    expect(c.map((x) => x.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
    expect(c[0].lat).toBeCloseTo(33.80002, 5);
  });
});

describe('filter', () => {
  const now = new Date('2026-10-15T12:00:00');
  const p = P('a', {
    title: 'Footing pour', description: 'North wall', album: 'Progress', taken_by: 'crew@x.com',
    tags: ['concrete'], taken_at: at('2026-10-03'), location_lat: 33.8, location_lng: -112.1,
  });
  test('search covers title, description, tags, uploader; all words must match', () => {
    expect(matchesPhotoFilter(p, { search: 'north' })).toBe(true);
    expect(matchesPhotoFilter(p, { search: 'concrete footing' })).toBe(true);
    expect(matchesPhotoFilter(p, { search: 'footing roof' })).toBe(false);
  });
  test('album, uploader, location, issues, dates, month', () => {
    expect(matchesPhotoFilter(p, { album: 'All' })).toBe(true);
    expect(matchesPhotoFilter(p, { album: 'Issues' })).toBe(false);
    expect(matchesPhotoFilter(P('x'), { album: 'General' })).toBe(true);
    expect(matchesPhotoFilter(p, { uploader: 'someone' })).toBe(false);
    expect(matchesPhotoFilter(p, { hasLocation: true })).toBe(true);
    expect(matchesPhotoFilter(P('x'), { hasLocation: true })).toBe(false);
    expect(matchesPhotoFilter(p, { issuesOnly: true })).toBe(false);
    expect(matchesPhotoFilter(p, { from: '2026-10-03', to: '2026-10-03' })).toBe(true);
    expect(matchesPhotoFilter(p, { from: '2026-10-04' })).toBe(false);
    expect(matchesPhotoFilter(p, { thisMonth: true, now })).toBe(true);
    expect(matchesPhotoFilter(P('x'), { from: '2026-01-01' })).toBe(false);
  });
  test('issues: album, tag or flag', () => {
    expect(isIssuePhoto(P('a', { album: 'Issues' }))).toBe(true);
    expect(isIssuePhoto(P('a', { tags: ['Issue-roof'] }))).toBe(true);
    expect(isIssuePhoto(P('a', { is_flagged: true }))).toBe(true);
    expect(isIssuePhoto(P('a', { tags: 'concrete, issue' }))).toBe(true);
    expect(isIssuePhoto(P('a'))).toBe(false);
  });
});

describe('albums', () => {
  test('known albums first, cover is newest with a picture, counts real', () => {
    const s = albumSummaries([
      P('a', { album: 'Progress', taken_at: at('2026-10-01'), thumbnail_url: 't1' }),
      P('b', { album: 'Progress', taken_at: at('2026-10-05'), thumbnail_url: null, url: '' }),
      P('c', { album: 'Zeta', taken_at: at('2026-10-02'), url: 'u' }),
      P('d', { album: null }),
    ], ['General', 'Progress', 'Issues']);
    expect(s.map((x) => [x.name, x.count])).toEqual([['General', 1], ['Progress', 2], ['Zeta', 1]]);
    expect(s[1].cover?.id).toBe('a');
    expect(s[2].cover?.id).toBe('c');
  });
  test('uploaders and album names', () => {
    expect(uploaders([P('a', { taken_by: 'b' }), P('b', { taken_by: 'a' }), P('c', { taken_by: 'b' }), P('d')])).toEqual(['a', 'b']);
    expect(cleanAlbumName('  Level  2   North ')).toBe('Level 2 North');
    expect(cleanAlbumName('   ')).toBe('');
  });
});
