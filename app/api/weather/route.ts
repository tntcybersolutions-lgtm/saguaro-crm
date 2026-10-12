import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { jobsiteWeather } from '@/lib/jobsite-weather';

/**
 * GET ?projectId= — TODAY'S jobsite weather, fully automatic.
 *
 * GCs never type a temperature: daily logs auto-fill from this endpoint on
 * BOTH surfaces (web + mobile call the same route — one brain, no drift).
 * The lookup itself (NWS + Census geocoder) lives in lib/jobsite-weather,
 * which the owner's portal reads too.
 *
 * Graceful: anything missing (no address, non-US, NWS hiccup) returns
 * { available: false } and the form simply stays manual for that day.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const weather = await jobsiteWeather(g.db, g.user.tenantId, projectId);
  const res = NextResponse.json(weather);
  // Forecasts change slowly — 20 min of private cache keeps repeat opens instant.
  if (weather.available) res.headers.set('Cache-Control', 'private, max-age=1200');
  return res;
}
