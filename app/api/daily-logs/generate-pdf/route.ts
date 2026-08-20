import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateDailyLog } from '@/lib/pdf-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { logId } = await req.json();
    if (!logId) {
      return NextResponse.json({ error: 'logId is required' }, { status: 400 });
    }

    const db = createServerClient();

    const { data: log, error: logErr } = await db
      .from('daily_logs')
      .select('*, projects(id, name, project_number)')
      .eq('id', logId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (logErr || !log) {
      return NextResponse.json({ error: 'Daily log not found' }, { status: 404 });
    }

    const l = log as Record<string, unknown>;
    const project = l.projects as Record<string, unknown> | null;

    const pdfBytes = await generateDailyLog({
      logDate:           String(l.log_date || ''),
      status:            String(l.status || 'draft'),
      weather:           l.weather ? String(l.weather) : undefined,
      highTemp:          l.high_temp ? String(l.high_temp) : undefined,
      lowTemp:           l.low_temp ? String(l.low_temp) : undefined,
      precipitation:     l.precipitation ? String(l.precipitation) : undefined,
      windConditions:    l.wind_conditions ? String(l.wind_conditions) : undefined,
      workPerformed:     l.work_performed ? String(l.work_performed) : undefined,
      workStopped:       Boolean(l.work_stopped),
      workStoppedReason: l.work_stopped_reason ? String(l.work_stopped_reason) : undefined,
      delays:            l.delays ? String(l.delays) : undefined,
      delayType:         l.delay_type ? String(l.delay_type) : undefined,
      delayHours:        l.delay_hours ? Number(l.delay_hours) : undefined,
      crewCount:         l.crew_count ? Number(l.crew_count) : undefined,
      manpowerCount:     l.manpower_count ? Number(l.manpower_count) : undefined,
      manpowerDetail:    Array.isArray(l.manpower_detail) ? l.manpower_detail as any : undefined,
      equipmentOnSite:   Array.isArray(l.equipment_on_site) ? l.equipment_on_site as any : undefined,
      visitorsDetail:    Array.isArray(l.visitors_detail) ? l.visitors_detail as any : undefined,
      incidentsDetail:   Array.isArray(l.incidents_detail) ? l.incidents_detail as any : undefined,
      safetyNotes:       l.safety_notes ? String(l.safety_notes) : undefined,
      materialsDelivered:l.materials_delivered ? String(l.materials_delivered) : undefined,
      notes:             l.notes ? String(l.notes) : undefined,
      superintendent:    l.superintendent ? String(l.superintendent) : undefined,
      projectName:       project ? String(project.name || '') : '',
      projectNumber:     project ? String(project.project_number || '') : '',
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="DailyLog-${l.log_date || 'log'}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
