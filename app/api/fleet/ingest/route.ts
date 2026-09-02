/**
 * Telematics ingest — provider-agnostic GPS webhook.
 *
 * A GC pastes THIS url (with their per-tenant token) into any GPS/telematics
 * provider that can POST a webhook — Bouncie, Samsara, Motive, or a plain
 * tracker. Each ping is matched to a fleet_asset by VIN / plate / serial /
 * asset id, then written as a fleet_locations row and folded into the asset's
 * last-known position + odometer (the same feed the live map + phone-GPS use).
 *
 * NO user session — auth is the tenant's opaque ingest_token, looked up in
 * fleet_integrations (service-role). Unknown/blank/inactive token → 401, and
 * every write is pinned to that token's tenant_id, so a token can only ever
 * touch its own tenant's assets.
 *
 * Accepted body shapes (all normalized to a list of pings):
 *   { token, vin?|plate?|serial?|asset_id?, lat, lng, speed_mph?|speed?, heading?, odometer?|odometer_miles?, at? }
 *   { token, pings: [ {…}, {…} ] }         // batch
 *   { token, vehicles: [ {…} ] }           // batch alias
 * Token may also arrive as ?token= or an `x-ingest-token` header instead of in the body.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const numOrNull = (x: any): number | null => {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (x: any): string => String(x ?? '').trim();

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const token =
    str(body?.token) ||
    str(new URL(req.url).searchParams.get('token')) ||
    str(req.headers.get('x-ingest-token'));
  if (!token) return Response.json({ error: 'Missing ingest token' }, { status: 401 });

  // Cast to any: fleet_* tables + the ingest RPC post-date the generated Database types
  // (the browser fleet page uses an untyped client for the same reason).
  const admin = createServerClient() as any;
  const { data: integ } = await admin
    .from('fleet_integrations')
    .select('id, tenant_id, active')
    .eq('ingest_token', token)
    .maybeSingle();
  if (!integ || (integ as any).active === false) {
    return Response.json({ error: 'Invalid or inactive ingest token' }, { status: 401 });
  }
  const tenantId = (integ as any).tenant_id as string;

  // Normalize to a list of raw pings.
  const raw: any[] = Array.isArray(body?.pings) ? body.pings
    : Array.isArray(body?.vehicles) ? body.vehicles
    : Array.isArray(body?.data) ? body.data
    : [body];

  // Pull the tenant's assets once to match on VIN / plate / serial / asset-tag / id (one query).
  const { data: assets } = await admin
    .from('fleet_assets')
    .select('id, vin, license_plate, serial_number, asset_tag, odometer')
    .eq('tenant_id', tenantId);
  const norm = (s: string) => str(s).toUpperCase().replace(/\s+/g, '');
  const byVin = new Map<string, any>();
  const byPlate = new Map<string, any>();
  const bySerial = new Map<string, any>();
  const byTag = new Map<string, any>();
  const byId = new Map<string, any>();
  for (const a of (assets || []) as any[]) {
    if (a.vin) byVin.set(str(a.vin).toUpperCase(), a);
    if (a.license_plate) byPlate.set(norm(a.license_plate), a);
    if (a.serial_number) bySerial.set(str(a.serial_number).toUpperCase(), a);
    if (a.asset_tag) byTag.set(norm(a.asset_tag), a);
    byId.set(str(a.id), a);
  }

  const nowISO = new Date().toISOString();
  const matched: string[] = [];
  const unmatched: any[] = [];
  const pingRows: any[] = [];
  // Keep only the newest ping per asset for the last-known update.
  const lastByAsset = new Map<string, any>();

  for (const p of raw) {
    const lat = numOrNull(p?.lat ?? p?.latitude);
    const lng = numOrNull(p?.lng ?? p?.longitude ?? p?.lon);
    if (lat == null || lng == null) { unmatched.push({ reason: 'no-coords', ping: p }); continue; }

    const asset =
      (p?.asset_id && byId.get(str(p.asset_id))) ||
      (p?.vin && byVin.get(str(p.vin).toUpperCase())) ||
      ((p?.plate ?? p?.license_plate) && byPlate.get(norm(p.plate ?? p.license_plate))) ||
      ((p?.serial ?? p?.serial_number) && bySerial.get(str(p.serial ?? p.serial_number).toUpperCase())) ||
      ((p?.asset_tag ?? p?.device_id ?? p?.imei) && byTag.get(norm(p.asset_tag ?? p.device_id ?? p.imei))) ||
      null;
    if (!asset) {
      unmatched.push({ reason: 'no-asset', vin: p?.vin, plate: p?.plate ?? p?.license_plate, serial: p?.serial ?? p?.serial_number });
      continue;
    }

    // Speed: accept explicit mph, or m/s (`speed`) converted.
    const mph = numOrNull(p?.speed_mph) ??
      (numOrNull(p?.speed) != null ? Math.round((numOrNull(p?.speed) as number) * 2.23694) : null);
    const heading = numOrNull(p?.heading ?? p?.bearing);
    const odometer = numOrNull(p?.odometer ?? p?.odometer_miles ?? p?.odo);
    const at = str(p?.at) || str(p?.timestamp) || nowISO;

    pingRows.push({
      tenant_id: tenantId, asset_id: asset.id, lat, lng,
      speed_mph: mph, heading, source: 'telematics', at,
    });
    matched.push(asset.id);

    const prev = lastByAsset.get(asset.id);
    if (!prev || at >= prev.at) {
      lastByAsset.set(asset.id, { at, lat, lng, mph, odometer, current: asset.odometer });
    }
  }

  if (pingRows.length) {
    await must(admin.from('fleet_locations').insert(pingRows), 'fleet_locations insert');
  }
  // Fold newest ping into each asset's last-known + odometer (never regress the odometer).
  for (const [assetId, v] of lastByAsset) {
    const patch: any = {
      last_lat: v.lat, last_lng: v.lng, last_speed_mph: v.mph, last_location_at: v.at,
    };
    if (v.odometer != null && (v.current == null || v.odometer >= v.current)) patch.odometer = Math.round(v.odometer);
    await must(admin.from('fleet_assets').update(patch).eq('id', assetId).eq('tenant_id', tenantId), 'fleet_assets update');
  }
  // Heartbeat on the integration.
  await admin.rpc('increment_fleet_ping', { p_id: (integ as any).id, p_n: pingRows.length, p_at: nowISO })
    .then(() => {}, async () => {
      // Fallback if the RPC isn't present: plain update of last_ping_at.
      await must(admin.from('fleet_integrations').update({ last_ping_at: nowISO }).eq('id', (integ as any).id), 'fleet_integrations update');
    });

  return Response.json({
    ok: true,
    received: raw.length,
    written: pingRows.length,
    matched: Array.from(new Set(matched)).length,
    unmatched: unmatched.length,
    detail: unmatched.slice(0, 10),
  });
}
