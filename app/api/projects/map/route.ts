/**
 * GET /api/projects/map — every active job of this company as a map pin:
 *   { pins: [{ id, name, status, stage, lat, lng, contract, pct_complete, cover_url, address }],
 *     unplaced: [{ id, name }] }
 *
 * Where a pin goes: projects.latitude / longitude when stored; otherwise the
 * job's address through the same free US Census geocoder the site weather
 * uses (lib/jobsite-weather). A fresh fix is kept in memory per server
 * instance and written back onto the project row (as the weather does), so a
 * job is looked up once. At most GEOCODE_PER_CALL lookups per request keep
 * the call quick; the rest land on the next load. Jobs with no usable
 * address are returned in `unplaced` so the panel can say how many are off
 * the map — never a made-up spot.
 *
 * Cover: projects.cover_photo_url, else the job's newest photo thumbnail.
 * Every query is tenant-filtered; storage URLs are signed on the way out.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { geocode } from '@/lib/jobsite-weather';
import { signFields } from '@/lib/storage-signing';
import { isMappableJob, jobAddressLine, jobGeo, jobPin, billedByJob, type JobPin } from '@/lib/job-map';
import type { GeoFix } from '@/lib/photo-views';

export const dynamic = 'force-dynamic';

const GEOCODE_PER_CALL = 8;
/* Address → fix (or null for "the geocoder had no match"), per server instance. */
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map<string, { until: number; fix: GeoFix | null }>();

async function lookup(address: string): Promise<GeoFix | null> {
  const key = address.toLowerCase();
  const hit = geoCache.get(key);
  if (hit && hit.until > Date.now()) return hit.fix;
  const fix = await geocode(address);
  // A miss is remembered for an hour only, so a fixed address shows up soon.
  geoCache.set(key, { until: Date.now() + (fix ? GEO_TTL_MS : 60 * 60 * 1000), fix });
  return fix;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .or('is_archived.is.null,is_archived.eq.false')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobs = ((data || []) as Record<string, any>[]).filter(isMappableJob);
    if (!jobs.length) return NextResponse.json({ pins: [], unplaced: [] });
    const ids = jobs.map((j) => String(j.id));

    const [payRes, photoRes] = await Promise.all([
      db.from('pay_applications').select('project_id, app_number, total_completed_stored').eq('tenant_id', user.tenantId).is('deleted_at', null).in('project_id', ids),
      db.from('photos').select('project_id, thumbnail_url, url, taken_at').eq('tenant_id', user.tenantId).in('project_id', ids)
        .order('taken_at', { ascending: false, nullsFirst: false }).limit(2000),
    ]);
    if (payRes.error) console.error('[projects/map] pay app read failed', payRes.error);
    if (photoRes.error) console.error('[projects/map] photo read failed', photoRes.error);
    // A failed pay-app read leaves % complete to the job's own figure rather than a confident zero.
    const billed = payRes.error ? new Map<string, number>() : billedByJob(payRes.data as Record<string, unknown>[]);
    const newest = new Map<string, string>();
    for (const p of (photoRes.data || []) as Record<string, string | null>[]) {
      const pid = p.project_id;
      if (!pid || newest.has(pid)) continue;
      const pic = p.thumbnail_url || p.url;
      if (pic) newest.set(pid, pic);
    }

    /* Spots: stored first, then a bounded number of lazy lookups. */
    const geo = new Map<string, GeoFix>();
    const needLookup: { id: string; line: string }[] = [];
    for (const j of jobs) {
      const g = jobGeo(j);
      if (g) { geo.set(String(j.id), g); continue; }
      const line = jobAddressLine(j);
      if (line) needLookup.push({ id: String(j.id), line });
    }
    const batch = needLookup.slice(0, GEOCODE_PER_CALL);
    const found = await Promise.all(batch.map((n) => lookup(n.line).catch(() => null)));
    batch.forEach((n, i) => {
      const fix = found[i];
      if (!fix) return;
      geo.set(n.id, fix);
      // Keep the pin on the job (as the weather does) so it is looked up once.
      db.from('projects').update({ latitude: fix.lat, longitude: fix.lng } as never)
        .eq('id', n.id).eq('tenant_id', user.tenantId).then(() => {}, (e: unknown) => console.error('[projects/map] pin save failed', e));
    });

    const raw = jobs.map((j) => ({
      j,
      cover: (j.cover_photo_url as string | null) || newest.get(String(j.id)) || null,
    }));
    const signed = await signFields(raw.map((r) => ({ id: String(r.j.id), cover_url: r.cover || '' })), ['cover_url'], 3600, { strict: false });
    const coverById = new Map(signed.map((s) => [s.id, s.cover_url || null]));

    const pins: JobPin[] = [];
    const unplaced: { id: string; name: string; reason: 'no address' | 'not found' | 'pending' }[] = [];
    const pending = new Set(needLookup.slice(GEOCODE_PER_CALL).map((n) => n.id));
    for (const { j } of raw) {
      const id = String(j.id);
      const pin = jobPin(j, geo.get(id) || null, billed.has(id) ? billed.get(id)! : null, coverById.get(id) || null);
      if (pin) pins.push(pin);
      else unplaced.push({
        id,
        name: String(j.name || j.project_name || 'Untitled job'),
        reason: !jobAddressLine(j) ? 'no address' : pending.has(id) ? 'pending' : 'not found',
      });
    }
    const res = NextResponse.json({ pins, unplaced });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  } catch (e) {
    return apiError('projects/map', e, "Couldn't load the jobs map.");
  }
}
