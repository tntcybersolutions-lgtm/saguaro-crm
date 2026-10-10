import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { requestDay } from '@/lib/time-zone';

export const dynamic = 'force-dynamic';

/**
 * Weather impact notes for a project's resource forecast.
 * Called by the field Resource Planning "Save Weather Notes" action.
 *
 * GET  ?projectId=...  -> { notes }
 * POST  Body: { projectId, notes, date }
 *
 * Notes are stored on resource_forecast.notes for the week containing `date`
 * (week_start = Monday of that week). One forecast row per project/week is reused.
 */

function mondayOf(d: Date): string {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() - ((r.getUTCDay() + 6) % 7));
  return r.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const db = createServerClient();

    let query = db
      .from('resource_forecast')
      .select('notes, week_start, project_id')
      .eq('tenant_id', user.tenantId)
      .order('week_start', { ascending: false })
      .limit(1);
    if (projectId) query = query.eq('project_id', projectId);

    const { data } = await query.maybeSingle();
    return NextResponse.json({ notes: data?.notes || '' });
  } catch {
    return NextResponse.json({ notes: '' });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Schedule', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId: string | null = body.projectId || null;
    const notes: string = body.notes ?? '';
    const db = createServerClient();
    // No date sent: this week on the planner's calendar (device, else company zone) —
    // the server's clock put a Sunday-evening note in Iowa into next week.
    const weekStart = mondayOf(new Date(body.date
      ? body.date
      : `${(await requestDay(req.headers, db, user.tenantId, 'resource-planning/weather-notes')).today}T00:00:00Z`));

    // Reuse the forecast row for this project/week if it exists; else insert one.
    let existing = db
      .from('resource_forecast')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('week_start', weekStart);
    if (projectId) existing = existing.eq('project_id', projectId);
    const { data: found } = await existing.limit(1).maybeSingle();

    if (found?.id) {
      await must(db.from('resource_forecast').update({ notes }).eq('tenant_id', g.user.tenantId).eq('id', found.id), 'resource_forecast update');
    } else {
      await must(db.from('resource_forecast').insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        week_start: weekStart,
        notes,
      }), 'resource_forecast insert');
    }

    return NextResponse.json({ success: true, notes });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
