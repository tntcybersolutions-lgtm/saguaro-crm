/**
 * Fleet engine — deterministic, DOM-free. Maintenance-due (mileage OR date
 * triggers), document/expiration warnings, GPS trip stats (distance + speed), and
 * exec-summary rollups. Shared AS-IS by web + iOS. Mirrors lib/finance / lib/timeclock.
 * All "now" is passed in (nowISO / current odometer) so results are testable + stable.
 */

export type DueStatus = 'ok' | 'soon' | 'overdue' | 'unknown';
export type AssetType = 'vehicle' | 'equipment';
export type AssetStatus = 'active' | 'in_shop' | 'retired' | 'out_of_service';

export interface Asset {
  id: string; type: AssetType; name: string; category?: string;
  make?: string; model?: string; year?: number; vin?: string; serial_number?: string; license_plate?: string;
  status?: AssetStatus; odometer?: number; odometer_unit?: 'mi' | 'km' | 'hr';
  assigned_to?: string | null;
}
export interface MaintenanceRecord {
  id: string; asset_id: string; kind?: string; description?: string;
  performed_at?: string; odometer_at?: number; cost_cents?: number;
  next_due_odometer?: number | null; next_due_date?: string | null;
}
export interface AssetDoc {
  id: string; asset_id: string; category: string; file_url?: string; label?: string; expires_at?: string | null;
}
export interface LocationPing { asset_id?: string; lat: number; lng: number; speed_mph?: number | null; heading?: number | null; at: string; }

const DAY = 86400000;
const daysBetween = (aISO: string, bISO: string) => Math.floor((Date.parse(bISO) - Date.parse(aISO)) / DAY);

/** Maintenance-due status from a mileage target and/or a date target. */
export function dueStatus(currentOdometer: number | undefined, nowISO: string, nextDueOdometer?: number | null, nextDueDateISO?: string | null, soonMiles = 500, soonDays = 14): { status: DueStatus; remainingMiles?: number; remainingDays?: number } {
  let byMiles: { status: DueStatus; remainingMiles: number } | null = null;
  let byDate: { status: DueStatus; remainingDays: number } | null = null;
  if (typeof nextDueOdometer === 'number' && typeof currentOdometer === 'number') {
    const rem = nextDueOdometer - currentOdometer;
    byMiles = { status: rem < 0 ? 'overdue' : rem <= soonMiles ? 'soon' : 'ok', remainingMiles: rem };
  }
  if (nextDueDateISO) {
    const rem = daysBetween(nowISO, nextDueDateISO);
    byDate = { status: rem < 0 ? 'overdue' : rem <= soonDays ? 'soon' : 'ok', remainingDays: rem };
  }
  if (!byMiles && !byDate) return { status: 'unknown' };
  // Worst of the two wins (overdue > soon > ok).
  const rank = (s: DueStatus) => (s === 'overdue' ? 3 : s === 'soon' ? 2 : s === 'ok' ? 1 : 0);
  const worst = [byMiles?.status, byDate?.status].filter(Boolean).reduce((a, b) => (rank(a as DueStatus) >= rank(b as DueStatus) ? a : b)) as DueStatus;
  return { status: worst, ...(byMiles ? { remainingMiles: byMiles.remainingMiles } : {}), ...(byDate ? { remainingDays: byDate.remainingDays } : {}) };
}

/** Expiration status for a doc/warranty/registration/insurance/contract date. */
export function expiryStatus(dateISO: string | null | undefined, nowISO: string, soonDays = 30): { status: 'ok' | 'soon' | 'expired' | 'none'; daysUntil?: number } {
  if (!dateISO) return { status: 'none' };
  const d = daysBetween(nowISO, dateISO);
  return { status: d < 0 ? 'expired' : d <= soonDays ? 'soon' : 'ok', daysUntil: d };
}

const R = 3958.8; // earth radius, miles
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))) * 100) / 100;
}

/** Trip stats from ordered (or unordered) location pings. */
export function tripStats(pings: LocationPing[]): { distanceMiles: number; maxSpeedMph: number; avgSpeedMph: number; durationMin: number; points: number } {
  const p = [...pings].filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (p.length < 2) return { distanceMiles: 0, maxSpeedMph: p[0]?.speed_mph ?? 0, avgSpeedMph: 0, durationMin: 0, points: p.length };
  let dist = 0, maxSpeed = 0;
  for (let i = 1; i < p.length; i++) { dist += haversineMiles(p[i - 1], p[i]); const sp = p[i].speed_mph ?? 0; if (sp > maxSpeed) maxSpeed = sp; }
  const durationMin = Math.round((Date.parse(p[p.length - 1].at) - Date.parse(p[0].at)) / 60000);
  const avg = durationMin > 0 ? Math.round((dist / (durationMin / 60)) * 10) / 10 : 0;
  return { distanceMiles: Math.round(dist * 100) / 100, maxSpeedMph: Math.round(maxSpeed), avgSpeedMph: avg, durationMin, points: p.length };
}

export interface AssetHealth { assetId: string; maintenance: { status: DueStatus; remainingMiles?: number; remainingDays?: number; label?: string }; expiries: { category: string; status: string; daysUntil?: number }[]; overall: DueStatus; }

/** Roll one asset's records + docs into a health verdict. */
export function assetHealth(asset: Asset, records: MaintenanceRecord[], docs: AssetDoc[], nowISO: string): AssetHealth {
  const mine = records.filter((r) => r.asset_id === asset.id && (r.next_due_odometer != null || r.next_due_date));
  let worst: { status: DueStatus; remainingMiles?: number; remainingDays?: number; label?: string } = { status: 'unknown' };
  const rank = (s: DueStatus) => (s === 'overdue' ? 3 : s === 'soon' ? 2 : s === 'ok' ? 1 : 0);
  for (const r of mine) {
    const d = dueStatus(asset.odometer, nowISO, r.next_due_odometer, r.next_due_date);
    if (rank(d.status) > rank(worst.status)) worst = { ...d, label: r.description || r.kind };
  }
  const expiries = docs.filter((x) => x.asset_id === asset.id && x.expires_at).map((x) => { const e = expiryStatus(x.expires_at, nowISO); return { category: x.category, status: e.status, daysUntil: e.daysUntil }; });
  const worstExpiry = expiries.reduce((acc, e) => (e.status === 'expired' ? 3 : e.status === 'soon' ? 2 : 1) > acc ? (e.status === 'expired' ? 3 : e.status === 'soon' ? 2 : 1) : acc, 0);
  const overallRank = Math.max(rank(worst.status), worstExpiry);
  const overall: DueStatus = overallRank >= 3 ? 'overdue' : overallRank === 2 ? 'soon' : overallRank === 1 ? 'ok' : 'unknown';
  return { assetId: asset.id, maintenance: worst, expiries, overall };
}

export interface FleetSummary {
  total: number; byType: Record<string, number>; byStatus: Record<string, number>;
  maintenanceOverdue: number; maintenanceSoon: number; docsExpired: number; docsExpiringSoon: number;
  totalMaintenanceCostCents: number; needsAttention: string[];
}
export function fleetSummary(assets: Asset[], records: MaintenanceRecord[], docs: AssetDoc[], nowISO: string): FleetSummary {
  const byType: Record<string, number> = {}, byStatus: Record<string, number> = {};
  let overdue = 0, soon = 0; const needs: string[] = [];
  for (const a of assets) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    byStatus[a.status || 'active'] = (byStatus[a.status || 'active'] || 0) + 1;
    const h = assetHealth(a, records, docs, nowISO);
    if (h.overall === 'overdue') { overdue++; needs.push(a.name); }
    else if (h.overall === 'soon') soon++;
  }
  const docsExpired = docs.filter((d) => expiryStatus(d.expires_at, nowISO).status === 'expired').length;
  const docsExpiringSoon = docs.filter((d) => expiryStatus(d.expires_at, nowISO).status === 'soon').length;
  const totalMaintenanceCostCents = records.reduce((s, r) => s + (r.cost_cents || 0), 0);
  return { total: assets.length, byType, byStatus, maintenanceOverdue: overdue, maintenanceSoon: soon, docsExpired, docsExpiringSoon, totalMaintenanceCostCents, needsAttention: needs };
}

export const STATUS_COLOR: Record<DueStatus, string> = { overdue: '#FF3B30', soon: '#FF8A00', ok: '#2CFF7A', unknown: '#8b949e' };
