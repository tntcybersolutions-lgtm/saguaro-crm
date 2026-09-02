import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';

/**
 * Crew location — ON-SHIFT, DISCLOSED tracking for dispatch + the human heatmap.
 *
 * POST { projectId, lat, lng, accuracy?, battery?, trade?, source? }
 *   Upserts the caller's live position (crew_locations) and appends a history
 *   ping (crew_location_pings). The mobile app sends this only while the user
 *   is clocked in or actively on the Radio screen, with a visible indicator.
 *
 * GET ?projectId=            -> live positions (last 10 min) for the dispatch map
 * GET ?projectId=&heatmap=1&hours=24
 *   -> density bins (~5m grid) + bounds for the human heatmap canvas
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  try {
    const b = await req.json().catch(() => ({}));
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!b.projectId || !isFinite(lat) || !isFinite(lng)) {
      return NextResponse.json({ error: 'projectId, lat, lng required' }, { status: 400 });
    }
    const db = createServerClient() as any;
    const name = g.user.email || 'Team member';

    // Live position: one row per user per project.
    const { data: existing } = await db.from('crew_locations').select('id').eq('tenant_id', t).eq('project_id', b.projectId).eq('user_id', g.user.id).limit(1);
    const row = {
      tenant_id: t, project_id: b.projectId, user_id: g.user.id,
      latitude: lat, longitude: lng,
      accuracy_meters: Number(b.accuracy) || null,
      battery_level: Number.isFinite(Number(b.battery)) ? Math.round(Number(b.battery)) : null,
      trade: b.trade ?? null, status: 'on_site', updated_at: new Date().toISOString(),
    };
    if (existing?.length) await must(db.from('crew_locations').update(row as never).eq('id', existing[0].id), 'crew_locations update');
    else await must(db.from('crew_locations').insert(row as never), 'crew_locations insert');

    // History ping (heatmap fuel) — thin append.
    db.from('crew_location_pings').insert({
      tenant_id: t, project_id: b.projectId, user_id: g.user.id, display_name: name,
      trade: b.trade ?? null, latitude: lat, longitude: lng,
      accuracy_meters: Number(b.accuracy) || null, source: b.source || 'radio',
    } as never).then(() => {}, () => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const t = g.user.tenantId;
  try {
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    const db = createServerClient() as any;

    if (req.nextUrl.searchParams.get('heatmap')) {
      const hours = Math.max(1, Math.min(168, Number(req.nextUrl.searchParams.get('hours')) || 24));
      const since = new Date(Date.now() - hours * 3600000).toISOString();
      const { data } = await db.from('crew_location_pings')
        .select('latitude, longitude')
        .eq('tenant_id', t).eq('project_id', projectId)
        .gte('created_at', since).limit(20000);
      const pings = (data || []) as { latitude: number; longitude: number }[];
      // ~5m bins (0.00005 deg lat ≈ 5.5m); density per bin.
      const bins = new Map<string, { lat: number; lng: number; n: number }>();
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const p of pings) {
        const la = Math.round(p.latitude / 0.00005) * 0.00005;
        const ln = Math.round(p.longitude / 0.00005) * 0.00005;
        const k = la + ',' + ln;
        const bcur = bins.get(k) || { lat: la, lng: ln, n: 0 };
        bcur.n++; bins.set(k, bcur);
        if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
        if (ln < minLng) minLng = ln; if (ln > maxLng) maxLng = ln;
      }
      const res = NextResponse.json({
        hours, samples: pings.length,
        bounds: pings.length ? { minLat, maxLat, minLng, maxLng } : null,
        bins: Array.from(bins.values()),
      });
      res.headers.set('Cache-Control', 'private, max-age=60');
      return res;
    }

    const since = new Date(Date.now() - 10 * 60000).toISOString();
    const { data } = await db.from('crew_locations')
      .select('user_id, latitude, longitude, accuracy_meters, trade, status, battery_level, updated_at')
      .eq('tenant_id', t).eq('project_id', projectId)
      .gte('updated_at', since)
      .order('updated_at', { ascending: false });
    // Attach display names from the latest pings (crew_locations has no name column).
    const rows = (data || []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: ppl } = await db.from('crew_location_pings')
        .select('user_id, display_name').in('user_id', ids)
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(200);
      for (const p of (ppl || []) as any[]) if (p.user_id && !names.has(p.user_id)) names.set(p.user_id, p.display_name);
    }
    return NextResponse.json({
      crew: rows.map((r) => ({ ...r, name: names.get(r.user_id) || 'Team member' })),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
