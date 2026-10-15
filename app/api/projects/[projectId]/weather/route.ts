/**
 * GET /api/projects/:projectId/weather — today + the next 3 days at the job
 * site (NWS via lib/jobsite-weather, the same source the daily logs stamp).
 * { available: false } when the job has no usable address or NWS is down;
 * the banner then hides its weather instead of showing a guess.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { jobsiteOutlook } from '@/lib/jobsite-weather';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const db = createServerClient();
  const g = await requirePermission(req, 'Projects', 'View', { projectId: params.projectId, db });
  if (!g.ok) return g.res;
  const outlook = await jobsiteOutlook(db, g.user.tenantId, params.projectId);
  const res = NextResponse.json(outlook);
  // Forecasts move slowly: 20 minutes of private browser cache on a good answer.
  res.headers.set('Cache-Control', outlook.available ? 'private, max-age=1200' : 'no-store');
  return res;
}
