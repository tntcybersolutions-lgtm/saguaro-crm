/**
 * lib/job-map.ts — the company Jobs map, as data. GET /api/projects/map
 * builds one pin per active job with these rules; the Home "Jobs map" panel
 * draws them. Pure (no fetch, no React) and held by lib/job-map.sanity.test.ts.
 *
 *   • isMappableJob  — active jobs only: not archived, not deleted, not closed
 *   • jobAddressLine — the one-line address the geocoder is asked about
 *   • jobGeo         — the stored pin (projects.latitude / longitude), if usable
 *   • jobPin         — the row the route returns: status, contract, % complete
 *
 * % complete is the same figure the Jobs list shows: 100 for a finished job,
 * else billed-to-date over contract from the latest pay app, else the job's
 * own percent_complete — never a guess. No contract and no figure → null.
 */
import { jobStage, stageLabel, billedPct } from './job-page';
import { isClosedStatus, isDoneStatus } from './project-lifecycle';
import type { GeoFix } from './photo-views';
import { isLiveJob } from '@/lib/live-jobs';

export interface JobPin {
  id: string;
  name: string;
  status: string;
  stage: 'bidding' | 'building' | 'closed' | 'complete';
  lat: number;
  lng: number;
  contract: number | null;
  pct_complete: number | null;
  cover_url: string | null;
  address: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** On the map: live jobs only. Archived, deleted, closed, complete, lost and cancelled jobs are left off. */
export function isMappableJob(p: Row | null | undefined): boolean {
  if (!p || !p.id) return false;
  if (!isLiveJob(p)) return false;
  return !isClosedStatus(p.status);
}

/** "1 Main St, Phoenix, AZ, 85004" — '' when the job has no address to look up. */
export function jobAddressLine(p: Row): string {
  const parts = [p.address, p.city, p.state, p.zip]
    .map((s) => (typeof s === 'string' ? s.trim() : s == null ? '' : String(s).trim()))
    .filter(Boolean);
  // A state alone ("AZ") would drop a pin in the middle of the state — not the job.
  if (!(p.address && String(p.address).trim()) && !(p.zip && String(p.zip).trim())) return '';
  return parts.join(', ');
}

/** The job's stored pin, when it is a real place (not 0,0 and in range). */
export function jobGeo(p: Row): GeoFix | null {
  const lat = num(p.latitude), lng = num(p.longitude);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** % complete as the Jobs list computes it; null when nothing says. */
export function jobPctComplete(p: Row, billedToDate: number | null): number | null {
  if (isDoneStatus(p.status)) return 100;
  const contract = num(p.contract_amount) ?? num(p.contract_value) ?? 0;
  if (billedToDate != null && contract > 0) return Math.min(100, billedPct(billedToDate, contract) ?? 0);
  const own = num(p.percent_complete);
  return own != null && own > 0 ? Math.min(100, Math.round(own)) : null;
}

/** One pin. `geo` is the stored or freshly geocoded spot; null → the job is not on the map. */
export function jobPin(p: Row, geo: GeoFix | null, billedToDate: number | null, coverUrl: string | null): JobPin | null {
  if (!geo) return null;
  const raw = jobStage(p);
  const stage: JobPin['stage'] = raw === 'closed' ? (isDoneStatus(p.status) ? 'complete' : 'closed') : raw;
  const contract = num(p.contract_amount) ?? num(p.contract_value);
  return {
    id: String(p.id),
    name: String(p.name || p.project_name || 'Untitled job'),
    status: stageLabel(p),
    stage,
    lat: geo.lat,
    lng: geo.lng,
    contract: contract != null && contract > 0 ? contract : null,
    pct_complete: jobPctComplete(p, billedToDate),
    cover_url: coverUrl,
    address: jobAddressLine(p) || null,
  };
}

/** Latest pay app's completed-and-stored to date, per job (the highest app number wins). */
export function billedByJob(rows: Row[] | null | undefined): Map<string, number> {
  const best = new Map<string, { app: number; billed: number }>();
  for (const r of rows || []) {
    if (!r?.project_id) continue;
    const n = num(r.app_number) ?? 0;
    const cur = best.get(r.project_id);
    if (!cur || n >= cur.app) best.set(r.project_id, { app: n, billed: num(r.total_completed_stored) ?? 0 });
  }
  return new Map([...best.entries()].map(([k, v]) => [k, v.billed]));
}
