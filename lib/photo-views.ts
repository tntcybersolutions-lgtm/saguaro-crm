/**
 * lib/photo-views.ts — the pure logic behind a job's Photos page views.
 *
 *   • groupByDay / groupByMonth  — the Timeline (newest first, "No date" last)
 *   • clusterByLocation          — the Location view (GPS rounded to a grid)
 *   • matchesPhotoFilter         — every filter on the page as one predicate
 *   • albumSummaries             — album tiles (cover + count)
 *
 * No React, no fetch: everything here takes the rows /api/photos/list returned
 * and is covered by lib/photo-views.sanity.test.ts.
 */

export interface PhotoLike {
  id: string;
  title?: string | null;
  description?: string | null;
  caption?: string | null;
  album?: string | null;
  location?: string | null;
  taken_at?: string | null;
  created_at?: string | null;
  taken_by?: string | null;
  tags?: unknown;
  is_flagged?: boolean | null;
  location_lat?: number | string | null;
  location_lng?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  thumbnail_url?: string | null;
  url?: string | null;
  media?: string | null;
}

export interface GeoFix { lat: number; lng: number }

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** The photo's GPS: the upload stamp (location_lat/lng) first, then the older latitude/longitude columns. */
export function photoGeo(p: PhotoLike): GeoFix | null {
  for (const [a, b] of [[p.location_lat, p.location_lng], [p.latitude, p.longitude]] as const) {
    const lat = num(a), lng = num(b);
    if (lat == null || lng == null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue; // a null island stamp is a failed fix, not a place
    return { lat, lng };
  }
  return null;
}

export function photoTags(p: PhotoLike): string[] {
  const t = p.tags;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  if (typeof t === 'string') return t.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Issues: the Issues album, an "issue" tag, or a flagged photo. */
export function isIssuePhoto(p: PhotoLike): boolean {
  if (p.album === 'Issues' || p.is_flagged === true) return true;
  return photoTags(p).some((t) => t.toLowerCase().includes('issue'));
}

/** The date a photo belongs to: when it was taken, else when it was added. */
export function photoDate(p: PhotoLike): Date | null {
  for (const v of [p.taken_at, p.created_at]) {
    if (!v) continue;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day key, YYYY-MM-DD. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local month key, YYYY-MM. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export interface PhotoGroup<T> { key: string; label: string; items: T[] }

function groupBy<T extends PhotoLike>(photos: T[], keyOf: (d: Date) => string, labelOf: (d: Date) => string): PhotoGroup<T>[] {
  const sorted = [...photos].sort((a, b) => (photoDate(b)?.getTime() ?? -Infinity) - (photoDate(a)?.getTime() ?? -Infinity));
  const out: PhotoGroup<T>[] = [];
  const byKey = new Map<string, PhotoGroup<T>>();
  for (const p of sorted) {
    const d = photoDate(p);
    const key = d ? keyOf(d) : 'none';
    let g = byKey.get(key);
    if (!g) { g = { key, label: d ? labelOf(d) : 'No date', items: [] }; byKey.set(key, g); out.push(g); }
    g.items.push(p);
  }
  return out;
}

/** Newest day first; each day's photos newest first; undated photos last. */
export function groupByDay<T extends PhotoLike>(photos: T[]): PhotoGroup<T>[] {
  return groupBy(photos, dayKey, (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
}

/** Newest month first — the Timeline's jump-to-month rail. */
export function groupByMonth<T extends PhotoLike>(photos: T[]): PhotoGroup<T>[] {
  return groupBy(photos, monthKey, (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
}

export interface GeoCluster<T> { key: string; lat: number; lng: number; items: T[] }

/**
 * Photos that share a spot. Coordinates are rounded to `decimals` places
 * (3 ≈ 110 m, a jobsite area); the cluster's point is the mean of its photos.
 * Biggest cluster first. Photos without GPS are left out.
 */
export function clusterByLocation<T extends PhotoLike>(photos: T[], decimals = 3): GeoCluster<T>[] {
  const f = Math.pow(10, decimals);
  const map = new Map<string, { items: T[]; sLat: number; sLng: number }>();
  for (const p of photos) {
    const g = photoGeo(p);
    if (!g) continue;
    const key = `${(Math.round(g.lat * f) / f).toFixed(decimals)},${(Math.round(g.lng * f) / f).toFixed(decimals)}`;
    const c = map.get(key) || { items: [], sLat: 0, sLng: 0 };
    c.items.push(p); c.sLat += g.lat; c.sLng += g.lng;
    map.set(key, c);
  }
  return [...map.entries()]
    .map(([key, c]) => ({ key, lat: c.sLat / c.items.length, lng: c.sLng / c.items.length, items: c.items }))
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
}

export interface PhotoFilter {
  search?: string;
  /** 'All' or '' for every album. */
  album?: string;
  /** YYYY-MM-DD, inclusive, local day. */
  from?: string;
  to?: string;
  /** '' for anyone. */
  uploader?: string;
  hasLocation?: boolean;
  issuesOnly?: boolean;
  /** Only this month (local). */
  thisMonth?: boolean;
  /** "Now", for thisMonth — injectable for tests. */
  now?: Date;
}

export function matchesPhotoFilter(p: PhotoLike, f: PhotoFilter): boolean {
  const q = (f.search || '').trim().toLowerCase();
  if (q) {
    const hay = [p.title, p.description, p.caption, p.location, p.taken_by, p.album, ...photoTags(p)]
      .filter(Boolean).join(' \n ').toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (f.album && f.album !== 'All' && (p.album || 'General') !== f.album) return false;
  if (f.uploader && (p.taken_by || '') !== f.uploader) return false;
  if (f.hasLocation && !photoGeo(p)) return false;
  if (f.issuesOnly && !isIssuePhoto(p)) return false;
  if (f.from || f.to || f.thisMonth) {
    const d = photoDate(p);
    if (!d) return false;
    const k = dayKey(d);
    if (f.from && k < f.from) return false;
    if (f.to && k > f.to) return false;
    if (f.thisMonth && monthKey(d) !== monthKey(f.now || new Date())) return false;
  }
  return true;
}

export interface AlbumSummary<T> { name: string; count: number; cover: T | null; latest: Date | null }

/**
 * One tile per album: count, newest photo with a picture as the cover, newest
 * date. `known` albums come first, in their order; the rest alphabetically.
 * An album with no photos is left out unless `keepEmpty`.
 */
export function albumSummaries<T extends PhotoLike>(photos: T[], known: string[] = [], keepEmpty = false): AlbumSummary<T>[] {
  const map = new Map<string, T[]>();
  for (const p of photos) {
    const a = p.album || 'General';
    const list = map.get(a) || [];
    list.push(p);
    map.set(a, list);
  }
  const names = [...known.filter((k) => keepEmpty || map.has(k)), ...[...map.keys()].filter((k) => !known.includes(k)).sort((a, b) => a.localeCompare(b))];
  return names.map((name) => {
    const items = [...(map.get(name) || [])].sort((a, b) => (photoDate(b)?.getTime() ?? -Infinity) - (photoDate(a)?.getTime() ?? -Infinity));
    const cover = items.find((p) => p.thumbnail_url || (p.media !== 'video' && p.url)) || null;
    return { name, count: items.length, cover, latest: items[0] ? photoDate(items[0]) : null };
  });
}

/** Distinct uploaders, alphabetical. */
export function uploaders(photos: PhotoLike[]): string[] {
  return [...new Set(photos.map((p) => (p.taken_by || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** A safe album name: trimmed, single-spaced, at most 60 characters. '' when unusable. */
export function cleanAlbumName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/* ── Map pins: screen-grid clustering ───────────────────────────────────── */

/** A Web Mercator world pixel at `zoom` (256-px tiles), as Leaflet / OSM tiles use. */
export function worldPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const size = 256 * Math.pow(2, zoom);
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}

export interface PointCluster<T> {
  key: string;
  /** Mean of the members — where the pin goes. */
  lat: number;
  lng: number;
  items: T[];
  /** South-west / north-east corners of the members, for zooming in on a cluster. */
  bounds: [[number, number], [number, number]];
  /** Every member sits on (practically) the same spot — zooming in will never split it. */
  samePlace: boolean;
}

/**
 * Pins that would overlap on screen, merged: every point is dropped into a
 * `cellPx`-square cell of the map at `zoom`, and each occupied cell becomes
 * one pin at its members' mean position. Zooming in shrinks the world under
 * the cells, so clusters split apart as you go. Points without a fix are left
 * out. Biggest cluster first, then by key, so the order is stable.
 */
export function clusterPoints<T>(items: T[], geoOf: (t: T) => GeoFix | null, zoom: number, cellPx = 56): PointCluster<T>[] {
  const z = Math.max(0, Math.min(22, Math.round(zoom)));
  const cell = cellPx > 0 ? cellPx : 56;
  const map = new Map<string, { items: T[]; sLat: number; sLng: number; minLat: number; minLng: number; maxLat: number; maxLng: number }>();
  for (const it of items) {
    const g = geoOf(it);
    if (!g) continue;
    const p = worldPx(g.lat, g.lng, z);
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const c = map.get(key) || { items: [], sLat: 0, sLng: 0, minLat: Infinity, minLng: Infinity, maxLat: -Infinity, maxLng: -Infinity };
    c.items.push(it); c.sLat += g.lat; c.sLng += g.lng;
    c.minLat = Math.min(c.minLat, g.lat); c.maxLat = Math.max(c.maxLat, g.lat);
    c.minLng = Math.min(c.minLng, g.lng); c.maxLng = Math.max(c.maxLng, g.lng);
    map.set(key, c);
  }
  return [...map.entries()]
    .map(([key, c]) => ({
      key,
      lat: c.sLat / c.items.length,
      lng: c.sLng / c.items.length,
      items: c.items,
      bounds: [[c.minLat, c.minLng], [c.maxLat, c.maxLng]] as [[number, number], [number, number]],
      // ~1 m: GPS stamps from one spot, or the same address geocoded twice.
      samePlace: c.maxLat - c.minLat < 1e-5 && c.maxLng - c.minLng < 1e-5,
    }))
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
}

/** The box around every fix, or null when there is none. */
export function boundsOf<T>(items: T[], geoOf: (t: T) => GeoFix | null): [[number, number], [number, number]] | null {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const it of items) {
    const g = geoOf(it);
    if (!g) continue;
    minLat = Math.min(minLat, g.lat); maxLat = Math.max(maxLat, g.lat);
    minLng = Math.min(minLng, g.lng); maxLng = Math.max(maxLng, g.lng);
  }
  return Number.isFinite(minLat) ? [[minLat, minLng], [maxLat, maxLng]] : null;
}

/* ── Grid tile size (Timeline S / M / L) ───────────────────────────────── */

export type TileSize = 's' | 'm' | 'l';
export const TILE_SIZES: TileSize[] = ['s', 'm', 'l'];
/** A stored value back to a size; anything unknown is the default, medium. */
export function parseTileSize(v: unknown): TileSize {
  return v === 's' || v === 'm' || v === 'l' ? v : 'm';
}
