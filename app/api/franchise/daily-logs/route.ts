import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
import { companyTimeZone, dayIn, requestDay, stateTimeZone } from '@/lib/time-zone';
// Each site's "before 4 PM local" deadline is judged in that site's own time:
// the zone its US state keeps (lib/time-zone stateTimeZone — code or full name).
// A site with no (or an unknown) state is judged in the company's own zone
// (tenants.time_zone, else the viewer's device) — never a built-in home market.
function tzForState(state: unknown, fallback: string): string {
  return stateTimeZone(state) ?? fallback;
}

/**
 * Cross-site daily superintendent reports (reuses daily_logs). FAIL-CLOSED + tenant-scoped.
 * Surfaces today's 4 PM submission compliance across every active site.
 */
export async function GET(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: View, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'View');
    if (!g.ok) return g.res;
    const user = g.user;
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ logs: [], todayByProject: {}, gated: true }, { status: 403 });

    const since = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10); // a 3-week read window, not a day boundary
    const db = createServerClient();
    // A site with no state is judged in the company's zone, else the viewer's device zone (UTC, logged, only if neither is known).
    const fallbackZone = (await companyTimeZone(db, user.tenantId))
      ?? (await requestDay(req.headers, db, null, 'franchise/daily-logs')).zone;
    const { data: rows, error } = await db.from('daily_logs').select('*')
      .eq('tenant_id', user.tenantId).gte('log_date', since)
      .or('deleted_at.is.null')
      .order('log_date', { ascending: false });
    if (error) throw error;

    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    // Compliance: reported-today + whether it beat the 4 PM *local* deadline, using
    // each site's timezone (derived from its US state; else the company's zone) — and
    // "today" is each site's own day, not the server's UTC day.
    const hourInTz = (isoTs: string, tz: string): number | null => {
      try { return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date(isoTs))); }
      catch { return null; }
    };
    const tzForProject = (pid: string): string => tzForState(pmap[pid]?.state, fallbackZone);
    const siteToday = new Map<string, string>();
    const todayAt = (pid: string): string => {
      let d = siteToday.get(pid);
      if (!d) { d = dayIn(tzForProject(pid)); siteToday.set(pid, d); }
      return d;
    };
    const todayByProject: Record<string, boolean> = {};
    const lateByProject: Record<string, boolean> = {};
    (rows || []).forEach((r: any) => {
      if (String(r.log_date) === todayAt(r.project_id)) {
        todayByProject[r.project_id] = true;
        if (r.submitted_at) { const h = hourInTz(r.submitted_at, tzForProject(r.project_id)); if (h != null && h >= 16) lateByProject[r.project_id] = true; }
      }
    });

    const logs = (rows || []).map((r: any) => ({ ...r, project_name: pmap[r.project_id]?.name ?? null }));
    return NextResponse.json({ logs, todayByProject, lateByProject });
  } catch (e) {
    // Was a 2xx with an empty body: the screen showed "no daily logs" with
    // total confidence while the query was actually failing. A soft fail on
    // a read is indistinguishable from real emptiness, which is the whole
    // problem. Real status, real log, correlation id.
    return apiError('franchise/daily-logs', e, 'Could not load daily logs');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body?.project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });

    const db = createServerClient();
    const { data: proj } = await db.from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const s = (v: any, n = 4000) => (v ? String(v).slice(0, n) : null);
    const row: Record<string, any> = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      log_date: body.log_date || (await requestDay(req.headers, db, user.tenantId, 'franchise/daily-logs')).today,
      superintendent_name: s(body.superintendent_name, 160),
      superintendent: s(body.superintendent_name, 160),
      manpower_count: body.manpower_count != null && body.manpower_count !== '' ? parseInt(body.manpower_count, 10) : null,
      crew_count: body.manpower_count != null && body.manpower_count !== '' ? parseInt(body.manpower_count, 10) : null,
      weather: s(body.weather, 200),
      work_performed: s(body.work_performed),
      activities: s(body.work_performed),
      delays: s(body.delays),
      materials_delivered: s(body.materials_delivered),
      issues: s(body.problems),
      quality_issues: s(body.inspections_text, 2000),
      safety_notes: s(body.safety_notes),
      notes: body.tomorrow ? `Tomorrow: ${s(body.tomorrow, 2000)}` : null,
      photos_count: body.photos_count != null && body.photos_count !== '' ? parseInt(body.photos_count, 10) : null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('daily_logs').insert(row as any).select('id, log_date').single();
    if (error) throw error;
    return NextResponse.json({ log: data });
  } catch (e: any) {
    return apiError('franchise/daily-logs', e, "submit failed", 500);
  }
}
