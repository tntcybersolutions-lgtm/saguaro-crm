import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { recordLearning } from '@/lib/learning';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    /* A record with no project is invisible: every project screen filters on
       project_id, so this wrote a row the user was told had saved and could
       never see again. 400 naming the field, like the nineteen other create
       endpoints in this codebase already do. */
    if (!(body.projectId || body.project_id)) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }
    const db = createServerClient();

    const tenantId = user.tenantId;

    // Structured field-log data (was dropped before — only a scalar crew_count survived).
    const manpower = Array.isArray(body.manpowerByTrade ?? body.manpower_by_trade) ? (body.manpowerByTrade ?? body.manpower_by_trade) : null;
    const equipmentOnSite = Array.isArray(body.equipmentOnSite ?? body.equipment_on_site) ? (body.equipmentOnSite ?? body.equipment_on_site) : null;
    const deliveriesIn = Array.isArray(body.deliveries) ? body.deliveries : [];
    // Roll crew_count up from the manpower lines when present, else trust the scalar.
    const crewFromManpower = manpower ? manpower.reduce((s: number, m: any) => s + (Number(m.count ?? m.headcount ?? m.workers ?? 0) || 0), 0) : null;

    // AUTO WEATHER — a GC never types a temperature. If the client sent no
    // weather, stamp today's NWS forecast server-side via the shared
    // /api/weather brain (same source both surfaces use). Best-effort: any
    // failure just leaves the fields as the client sent them.
    let autoWx: any = null;
    if (!body.weather && !body.temperatureHigh && body.projectId) {
      try {
        const origin = req.nextUrl.origin;
        const wr = await fetch(`${origin}/api/weather?projectId=${body.projectId}`, {
          headers: { cookie: req.headers.get('cookie') || '', authorization: req.headers.get('authorization') || '' },
          signal: AbortSignal.timeout(8000),
        });
        const wd = await wr.json();
        if (wd?.available) {
          autoWx = wd;
          recordLearning(db, { tenantId, kind: 'weather_autofill', projectId: body.projectId, userId: user.id, meta: { conditions: wd.conditions } });
        }
      } catch { /* stay manual for the day */ }
    }

    const { data: log, error } = await db.from('daily_logs').insert({
      tenant_id: tenantId,
      project_id: body.projectId,
      log_date: body.logDate || new Date().toISOString().split('T')[0],
      weather: body.weather || autoWx?.conditions || null,
      high_temp: body.temperatureHigh || autoWx?.highTemp || null,
      low_temp: body.temperatureLow || autoWx?.lowTemp || null,
      ...(autoWx ? { weather_source: 'nws', weather_api_data: autoWx.raw ?? null } : {}),
      crew_count: crewFromManpower ?? body.crewCount ?? 0,
      work_performed: body.workPerformed || '',
      delays: body.delays || '',
      safety_notes: body.safetyNotes || '',
      materials_delivered: body.materialsDelivered || '',
      visitors: body.visitors || '',
      notes: body.notes || '',
      // Mobile-app text columns (app/daily.tsx writes these). Persist them so a
      // web-created log carries the same fields the native app expects, and the
      // web read below can round-trip a mobile-created log without dropping data.
      superintendent: body.superintendent || null,
      precipitation: body.precipitation || autoWx?.precipitation || null,
      wind_conditions: body.windConditions ?? body.wind_conditions ?? autoWx?.wind ?? null,
      phase_of_work: body.phaseOfWork ?? body.phase_of_work ?? null,
      equipment: body.equipment || null,
      // Structured columns (jsonb / text[]) — persisted when the client sends them.
      manpower_by_trade: manpower,
      equipment_on_site: equipmentOnSite,
      equipment_hours: body.equipmentHours ?? body.equipment_hours ?? null,
      materials_received: body.materialsReceived ?? body.materials_received ?? null,
      subcontractors_on_site: Array.isArray(body.subcontractorsOnSite ?? body.subcontractors_on_site) ? (body.subcontractorsOnSite ?? body.subcontractors_on_site) : null,
      created_by: user?.id,
    } as never).select().single();

    if (error) throw error;

    // Deliveries are their own child table (project-scoped). Persist any provided.
    if (deliveriesIn.length > 0) {
      await db.from('deliveries').insert(deliveriesIn.map((d: any) => ({
        tenant_id: tenantId,
        project_id: body.projectId,
        item_name: d.itemName ?? d.item_name ?? '',
        vendor: d.vendor ?? null,
        quantity: d.quantity ?? null,
        received_by: d.receivedBy ?? d.received_by ?? null,
        notes: d.notes ?? null,
        delivered_at: d.deliveredAt ?? d.delivered_at ?? new Date().toISOString(),
      })) as never).then(({ error: delErr }) => { if (delErr) console.error('[daily-logs/create] deliveries insert:', delErr.message); });
    }

    return NextResponse.json({ success: true, log });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
