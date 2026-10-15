/**
 * lib/job-banner — the pure rules behind the job home banner
 * (components/jobs/JobBanner, /api/projects/[id]/banner and /weather).
 *
 *  - outlookFromPeriods: NWS forecast periods -> today + next 3 days
 *  - stopWorkFlags:      which days would stop work (rain, wind, heat)
 *  - windMph:            "10 to 25 mph" -> 25
 *  - trimTeam:           the avatar row (max N, then "+N")
 *  - initials:           "Ana María López" -> "AL"
 *  - photoFit:           cover only when the picture is already a wide band,
 *                        otherwise contain, so nobody is cut out of the frame
 *  - daysLeft:           calendar days from today to the finish date
 *
 * No I/O here; everything is tested in lib/job-banner.sanity.test.ts.
 */

/** Work-stopping thresholds. */
export const STOP_RAIN_PCT = 60;
export const STOP_WIND_MPH = 25;
export const STOP_HEAT_F = 110;
/** Amber = getting close to the line (within these margins). */
const WARN_RAIN_PCT = 40;
const WARN_WIND_MPH = 20;
const WARN_HEAT_F = 105;

export type WeatherDay = {
  date: string;             // YYYY-MM-DD (the forecast's local day)
  name: string;             // "Today", "Thursday", …
  conditions: string | null;
  icon: string | null;      // NWS icon URL
  highF: number | null;
  lowF: number | null;
  windMph: number | null;   // the top of the day's range
  wind: string | null;      // as NWS says it: "10 to 25 mph SW"
  rainPct: number | null;
};

export type StopFlag = { level: 'stop' | 'watch'; reasons: string[] };

/** "5 mph" -> 5, "10 to 25 mph" -> 25, "" -> null. Gusts never under-read: the highest number wins. */
export function windMph(s: unknown): number | null {
  if (typeof s === 'number' && Number.isFinite(s)) return s;
  if (typeof s !== 'string') return null;
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : null;
}

function toF(temp: unknown, unit: unknown): number | null {
  const t = typeof temp === 'number' ? temp : Number(temp);
  if (temp == null || temp === '' || !Number.isFinite(t)) return null;
  return String(unit || 'F').toUpperCase().startsWith('C') ? Math.round(t * 9 / 5 + 32) : Math.round(t);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Period = Record<string, any>;

/**
 * NWS 12-hour periods -> one row per day, today first, at most `days` rows.
 * A day's high, rain and wind come from its daytime period, its low from the
 * night after it.
 * When the forecast starts at night ("Tonight"), today has a low only.
 */
export function outlookFromPeriods(periods: Period[], days = 4): WeatherDay[] {
  const out: WeatherDay[] = [];
  const byDate = new Map<string, WeatherDay>();
  const dayHas = new Set<string>();
  for (const p of Array.isArray(periods) ? periods : []) {
    const date = String(p?.startTime || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let d = byDate.get(date);
    if (!d) {
      if (out.length >= days) break;
      d = { date, name: '', conditions: null, icon: null, highF: null, lowF: null, windMph: null, wind: null, rainPct: null };
      byDate.set(date, d);
      out.push(d);
    }
    const t = toF(p.temperature, p.temperatureUnit);
    const rain = p?.probabilityOfPrecipitation?.value;
    const rainPct = typeof rain === 'number' && Number.isFinite(rain) ? rain : null;
    const w = windMph(p.windSpeed);
    if (p.isDaytime) {
      d.name = String(p.name || '');
      d.conditions = p.shortForecast ?? d.conditions;
      d.icon = p.icon ?? d.icon;
      if (t != null) d.highF = t;
      d.wind = [p.windSpeed, p.windDirection].filter(Boolean).join(' ') || d.wind;
    } else {
      if (!d.name) d.name = String(p.name || '');
      if (!d.conditions) d.conditions = p.shortForecast ?? null;
      if (!d.icon) d.icon = p.icon ?? null;
      if (t != null) d.lowF = t;
      if (!d.wind) d.wind = [p.windSpeed, p.windDirection].filter(Boolean).join(' ') || null;
    }
    /* Rain and wind are the WORKING day's: the daytime period sets them, the
       night only fills in when the forecast has no daytime left (tonight). */
    if (p.isDaytime) { dayHas.add(date); d.rainPct = rainPct; d.windMph = w; }
    else if (!dayHas.has(date)) {
      if (rainPct != null) d.rainPct = Math.max(d.rainPct ?? 0, rainPct);
      if (w != null) d.windMph = Math.max(d.windMph ?? 0, w);
    }
  }
  if (out[0]) out[0].name = 'Today';
  return out;
}

/** Would this day stop work? null when nothing is near a line. */
export function stopWorkFlags(d: Pick<WeatherDay, 'rainPct' | 'windMph' | 'highF'>): StopFlag | null {
  const stop: string[] = [];
  const watch: string[] = [];
  if (d.rainPct != null) {
    if (d.rainPct >= STOP_RAIN_PCT) stop.push(`Rain ${d.rainPct}%`);
    else if (d.rainPct >= WARN_RAIN_PCT) watch.push(`Rain ${d.rainPct}%`);
  }
  if (d.windMph != null) {
    if (d.windMph >= STOP_WIND_MPH) stop.push(`Wind ${d.windMph} mph`);
    else if (d.windMph >= WARN_WIND_MPH) watch.push(`Wind ${d.windMph} mph`);
  }
  if (d.highF != null) {
    if (d.highF >= STOP_HEAT_F) stop.push(`Heat ${d.highF}°F`);
    else if (d.highF >= WARN_HEAT_F) watch.push(`Heat ${d.highF}°F`);
  }
  if (stop.length) return { level: 'stop', reasons: stop };
  if (watch.length) return { level: 'watch', reasons: watch };
  return null;
}

/** "Ana María López" -> "AL"; "sam@x.com" -> "S"; "" -> "?". */
export function initials(name: string | null | undefined): string {
  const s = String(name || '').trim().replace(/@.*$/, '');
  if (!s) return '?';
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type TeamFace = { key: string; name: string; role: string | null; avatarUrl: string | null };

/**
 * The avatar row: de-duplicated (same user or email once), people with a
 * photo first, then the order they were added; at most `max` faces, the rest
 * counted as "+N".
 */
export function trimTeam<T extends TeamFace>(team: T[], max = 6): { shown: T[]; more: number } {
  const seen = new Set<string>();
  const uniq: T[] = [];
  for (const t of Array.isArray(team) ? team : []) {
    if (!t || !String(t.name || '').trim()) continue;
    const k = String(t.key || t.name).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(t);
  }
  const ordered = uniq
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.avatarUrl ? 0 : 1) - (b.t.avatarUrl ? 0 : 1) || a.i - b.i)
    .map((x) => x.t);
  const cap = Math.max(1, Math.floor(max));
  return { shown: ordered.slice(0, cap), more: Math.max(0, ordered.length - cap) };
}

/**
 * How to fit a photo into its box without cutting anyone out. `cover` only
 * when the picture is at least ~85% as wide (relative to its height) as the
 * box, so the crop is a thin strip of sky or ground; anything taller (a
 * phone portrait, a square) is shown whole with `contain`.
 */
export function photoFit(imgW: number, imgH: number, boxW: number, boxH: number): 'cover' | 'contain' {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) return 'contain';
  const img = imgW / imgH;
  const box = boxW / boxH;
  return img >= box * 0.85 ? 'cover' : 'contain';
}

/** Calendar days from today to the finish (negative = past it). null without a valid finish. */
export function daysLeft(end: string | null | undefined, today: string): number | null {
  const e = String(end || '').slice(0, 10);
  const t = String(today || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(e + 'T00:00:00Z') - Date.parse(t + 'T00:00:00Z');
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}
