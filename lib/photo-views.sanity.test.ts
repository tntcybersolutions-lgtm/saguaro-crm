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
  worldPx, clusterPoints, boundsOf, parseTileSize,
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

describe('map pins', () => {
  const g = (lat: number, lng: number) => ({ lat, lng });
  const pts = [
    { id: 'a', geo: g(33.4484, -112.0740) },   // downtown Phoenix
    { id: 'b', geo: g(33.4485, -112.0741) },   // ~15 m away
    { id: 'c', geo: g(33.8303, -112.1430) },   // Anthem, ~43 km north
    { id: 'd', geo: null as null | { lat: number; lng: number } },
  ];
  const geoOf = (p: typeof pts[number]) => p.geo;

  test('worldPx: the origin tile corners', () => {
    expect(worldPx(0, -180, 0)).toEqual({ x: 0, y: 128 });
    const c = worldPx(0, 0, 1);
    expect(c.x).toBeCloseTo(256, 6);
    expect(c.y).toBeCloseTo(256, 6);
  });

  test('zoomed out, the valley is one pin; zoomed in, it splits', () => {
    const far = clusterPoints(pts, geoOf, 6);
    expect(far).toHaveLength(1);
    expect(far[0].items.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
    const near = clusterPoints(pts, geoOf, 12);
    expect(near.map((c) => c.items.length)).toEqual([2, 1]);
    expect(near[0].samePlace).toBe(false);
  });

  test('cluster sits at the mean, bounds hold every member, no-GPS left out', () => {
    const [c] = clusterPoints(pts.slice(0, 2), geoOf, 10);
    expect(c.lat).toBeCloseTo(33.44845, 6);
    expect(c.lng).toBeCloseTo(-112.07405, 6);
    expect(c.bounds).toEqual([[33.4484, -112.0741], [33.4485, -112.0740]]);
    expect(clusterPoints([pts[3]], geoOf, 10)).toEqual([]);
  });

  test('same spot never splits', () => {
    const same = [{ id: 'x', geo: g(40, -100) }, { id: 'y', geo: g(40, -100) }];
    const [c] = clusterPoints(same, (p) => p.geo, 22);
    expect(c.items).toHaveLength(2);
    expect(c.samePlace).toBe(true);
  });

  test('boundsOf', () => {
    expect(boundsOf(pts, geoOf)).toEqual([[33.4484, -112.1430], [33.8303, -112.0740]]);
    expect(boundsOf([pts[3]], geoOf)).toBeNull();
  });

  test('tile size: stored value or medium', () => {
    expect(parseTileSize('s')).toBe('s');
    expect(parseTileSize('l')).toBe('l');
    expect(parseTileSize(null)).toBe('m');
    expect(parseTileSize('huge')).toBe('m');
  });
});
