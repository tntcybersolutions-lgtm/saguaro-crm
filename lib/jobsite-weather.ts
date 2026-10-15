/**
 * lib/jobsite-weather.ts — today's weather at a job's address. One brain for
 * the GC's daily logs (/api/weather) and the owner's portal
 * (/api/portal/client/dashboard), so neither ever shows a made-up number.
 *
 * Sources (free, keyless, reliable):
 *  - US National Weather Service (api.weather.gov) — public-domain forecasts.
 *  - US Census geocoder — resolves a project address to coordinates once;
 *    the coordinates are cached back onto the project row.
 *
 * Graceful: anything missing (no address, non-US, NWS hiccup) returns
 * { available: false } and the screen says there is no forecast.
 */

import { outlookFromPeriods, type WeatherDay } from '@/lib/job-banner';

const UA = { 'User-Agent': 'SaguaroControl (support@saguarocontrol.net)' };

export type JobsiteWeather =
  | { available: false; reason: string }
  | {
      available: true;
      source: 'nws';
      conditions: string | null;
      highTemp: string | null;
      lowTemp: string | null;
      wind: string | null;
      precipitation: string | null;
      raw: { point: { lat: number; lng: number }; period: { name?: string; detailed?: string } };
    };

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    const m = d?.result?.addressMatches?.[0]?.coordinates;
    if (m?.y != null && m?.x != null) return { lat: Number(m.y), lng: Number(m.x) };
  } catch { /* no match — the caller reports no location */ }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Today's forecast for one of this company's jobs. Never throws. */
export async function jobsiteWeather(db: Db, tenantId: string, projectId: string): Promise<JobsiteWeather> {
  try {
    const { data: project } = await db
      .from('projects')
      .select('id, latitude, longitude, address, city, state, zip')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = project as any;
    if (!p) return { available: false, reason: 'project not found' };

    let lat = Number(p.latitude) || null;
    let lng = Number(p.longitude) || null;
    // One-time geocode from the address; cache the pin on the project.
    if ((lat == null || lng == null) && (p.address || p.zip)) {
      const oneLine = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
      const geo = await geocode(oneLine);
      if (geo) {
        lat = geo.lat; lng = geo.lng;
        db.from('projects').update({ latitude: lat, longitude: lng } as never).eq('id', projectId).eq('tenant_id', tenantId).then(() => {}, () => {});
      }
    }
    if (lat == null || lng == null) return { available: false, reason: 'no location on project' };

    // NWS two-step: point metadata -> forecast URL -> today's periods.
    const pt = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!pt.ok) return { available: false, reason: 'outside NWS coverage' };
    const ptd = await pt.json();
    const fUrl = ptd?.properties?.forecast;
    if (!fUrl) return { available: false, reason: 'no forecast for point' };
    const fc = await fetch(fUrl, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!fc.ok) return { available: false, reason: 'forecast unavailable' };
    const fcd = await fc.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periods: any[] = fcd?.properties?.periods || [];
    if (!periods.length) return { available: false, reason: 'empty forecast' };

    // Today = first daytime period (or first period overnight) + its night.
    const day = periods.find((x) => x.isDaytime) || periods[0];
    const night = periods.find((x) => !x.isDaytime) || null;
    const temps = [day?.temperature, night?.temperature].filter((t) => typeof t === 'number') as number[];
    const high = temps.length ? Math.max(...temps) : null;
    const low = temps.length ? Math.min(...temps) : null;
    const precipPct = day?.probabilityOfPrecipitation?.value ?? null;
    return {
      available: true,
      source: 'nws',
      conditions: day?.shortForecast ?? null,
      highTemp: high != null ? String(high) : null,
      lowTemp: low != null ? String(low) : null,
      wind: [day?.windSpeed, day?.windDirection].filter(Boolean).join(' ') || null,
      precipitation: precipPct != null ? `${precipPct}% chance` : null,
      raw: { point: { lat, lng }, period: { name: day?.name, detailed: day?.detailedForecast } },
    };
  } catch {
    return { available: false, reason: 'weather lookup failed' };
  }
}

/* ── 4-day outlook for the job home banner ─────────────────────────────── */

export type JobsiteOutlook =
  | { available: false; reason: string }
  | { available: true; source: 'nws'; updatedAt: string | null; days: WeatherDay[] };

/* Forecast by grid point, kept 30 minutes per server instance: NWS updates
   about hourly, and every job on the same few square miles shares a point. */
const OUTLOOK_TTL_MS = 30 * 60 * 1000;
const outlookCache = new Map<string, { until: number; value: JobsiteOutlook }>();

/** Today + the next 3 days at one of this company's jobs. Never throws. */
export async function jobsiteOutlook(db: Db, tenantId: string, projectId: string, days = 4): Promise<JobsiteOutlook> {
  try {
    const { data: project } = await db
      .from('projects')
      .select('id, latitude, longitude, address, city, state, zip')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = project as any;
    if (!p) return { available: false, reason: 'project not found' };

    let lat = Number(p.latitude) || null;
    let lng = Number(p.longitude) || null;
    if ((lat == null || lng == null) && (p.address || p.zip)) {
      const geo = await geocode([p.address, p.city, p.state, p.zip].filter(Boolean).join(', '));
      if (geo) {
        lat = geo.lat; lng = geo.lng;
        db.from('projects').update({ latitude: lat, longitude: lng } as never).eq('id', projectId).eq('tenant_id', tenantId).then(() => {}, () => {});
      }
    }
    if (lat == null || lng == null) return { available: false, reason: 'no location on project' };

    const key = `${lat.toFixed(3)},${lng.toFixed(3)}:${days}`;
    const hit = outlookCache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;

    const pt = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!pt.ok) return { available: false, reason: 'outside NWS coverage' };
    const fUrl = (await pt.json())?.properties?.forecast;
    if (!fUrl) return { available: false, reason: 'no forecast for point' };
    const fc = await fetch(fUrl, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!fc.ok) return { available: false, reason: 'forecast unavailable' };
    const fcd = await fc.json();
    const out = outlookFromPeriods(fcd?.properties?.periods || [], days);
    if (!out.length) return { available: false, reason: 'empty forecast' };
    const value: JobsiteOutlook = { available: true, source: 'nws', updatedAt: fcd?.properties?.updateTime ?? fcd?.properties?.generatedAt ?? null, days: out };
    if (outlookCache.size > 2000) outlookCache.clear();
    outlookCache.set(key, { until: Date.now() + OUTLOOK_TTL_MS, value });
    return value;
  } catch (e) {
    console.error('[jobsite-weather] outlook failed', e);
    return { available: false, reason: 'weather lookup failed' };
  }
}
