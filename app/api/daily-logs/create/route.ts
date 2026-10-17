import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { assertProjectInTenant } from '@/lib/assert-project';
import { requirePermission } from '@/lib/permissions';
import { recordLearning } from '@/lib/learning';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { readClientId, isUniqueViolation } from '@/lib/offline/client-id';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  /* PRE-FLIGHT SITS OUTSIDE THE TRY. None of it can fail in a way the catch
     should dress up, and keeping it here is what lets the catch name the
     project and the date when it reports a duplicate. */
  const body = await req.json().catch(() => ({}));
  /* A record with no project is invisible: every project screen filters on
     project_id, so this wrote a row the user was told had saved and could
     never see again. 400 naming the field, like the nineteen other create
     endpoints in this codebase already do. */
  if (!(body.projectId || body.project_id)) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }
  const projectId: string = body.projectId ?? body.project_id;
  const db = createServerClient();
  /* This project must belong to the caller's tenant. Without the check a
     project id from ANOTHER tenant satisfies the foreign key, and the row
     is written — stamped with the caller's tenant, pointing at a customer's
     job they cannot see. See lib/assert-project. */
  const notOurs = await assertProjectInTenant(db, user.tenantId, projectId);
  if (notOurs) return notOurs;

  const tenantId = user.tenantId;

  /* THE GUARD ABOVE ACCEPTS SNAKE_CASE AND THE INSERT BELOW DID NOT.
     `body.projectId || body.project_id` got a snake_case caller past the
     required-field check and past the tenant check, and then every field in
     the insert read camelCase only. The result was a 200 and a row with
     project_id NULL, work_performed '', crew_count 0 — a daily log that
     appears on no project screen, with the narrative that is the entire point
     of a daily log silently discarded. Weather, superintendent and notes
     survived only because those keys spell the same either way, which is what
     made it look like it had worked.
     Every field now reads both spellings, which is what the rest of the create
     endpoints in this codebase already do. */
  const pick = (camel: string, snake: string) => body[camel] ?? body[snake];
  /* A number the user sent, or null when they sent nothing. `||` read a real
     0 as blank: a 0 °F morning was saved as "no temperature" (and then
     overwritten by the forecast), 0 equipment hours as nothing. */
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sentHigh = num(pick('temperatureHigh', 'high_temp'));
  const sentLow = num(pick('temperatureLow', 'low_temp'));
  let pickedLogDate: string = pick('logDate', 'log_date') || '';
  /* A log written on a phone with no signal is sent again until the phone hears
     back. The id the phone gave it finds the row an earlier send already made,
     so a second send returns that log instead of a 409 or a second row. */
  const clientId = readClientId(req.headers, body);
  const alreadySent = async () => {
    if (!clientId) return null;
    const { data, error: findErr } = await db.from('daily_logs').select('*')
      .eq('tenant_id', tenantId).eq('client_id', clientId).limit(1);
    if (findErr) throw findErr;
    return ((data as Record<string, unknown>[] | null) || [])[0] ?? null;
  };

  try {
    const earlier = await alreadySent();
    if (earlier) return NextResponse.json({ success: true, log: earlier, replayed: true });

    // No date sent: the logger's day (device, else company zone) — not the UTC day, which is tomorrow by 7 PM in Iowa.
    if (!pickedLogDate) pickedLogDate = (await requestDay(req.headers, db, tenantId, 'daily-logs/create')).today;

    // Structured field-log data (was dropped before — only a scalar crew_count survived).
    const manpower = Array.isArray(body.manpowerByTrade ?? body.manpower_by_trade) ? (body.manpowerByTrade ?? body.manpower_by_trade) : null;
    const equipmentOnSite = Array.isArray(body.equipmentOnSite ?? body.equipment_on_site) ? (body.equipmentOnSite ?? body.equipment_on_site) : null;
    const deliveriesIn = Array.isArray(body.deliveries) ? body.deliveries : [];
    // Roll crew_count up from the manpower lines when present, else trust the scalar.
    const crewFromManpower = manpower && manpower.length > 0 ? manpower.reduce((s: number, m: any) => s + (Number(m.count ?? m.headcount ?? m.workers ?? 0) || 0), 0) : null;

    // AUTO WEATHER — a GC never types a temperature. If the client sent no
    // weather, stamp today's NWS forecast server-side via the shared
    // /api/weather brain (same source both surfaces use). Best-effort: any
    // failure just leaves the fields as the client sent them.
    let autoWx: any = null;
    if (!body.weather && sentHigh === null && sentLow === null) {
      try {
        const origin = req.nextUrl.origin;
        const wr = await fetch(`${origin}/api/weather?projectId=${projectId}`, {
          headers: { cookie: req.headers.get('cookie') || '', authorization: req.headers.get('authorization') || '' },
          signal: AbortSignal.timeout(8000),
        });
        const wd = await wr.json();
        if (wd?.available) {
          autoWx = wd;
          recordLearning(db, { tenantId, kind: 'weather_autofill', projectId, userId: user.id, meta: { conditions: wd.conditions } });
        }
      } catch (wxErr) {
        // The forecast is a convenience: the log still saves with the weather blank.
        console.warn('[daily-logs/create] weather autofill unavailable', wxErr);
      }
    }

    const { data: log, error } = await db.from('daily_logs').insert({
      tenant_id: tenantId,
      project_id: projectId,
      log_date: pickedLogDate,
      weather: body.weather || autoWx?.conditions || null,
      high_temp: sentHigh ?? num(autoWx?.highTemp),
      low_temp: sentLow ?? num(autoWx?.lowTemp),
      ...(autoWx ? { weather_source: 'nws', weather_api_data: autoWx.raw ?? null } : {}),
      crew_count: Math.max(0, Math.round(crewFromManpower ?? num(pick('crewCount', 'crew_count')) ?? 0)),
      work_performed: pick('workPerformed', 'work_performed') || '',
      delays: body.delays || '',
      safety_notes: pick('safetyNotes', 'safety_notes') || '',
      materials_delivered: pick('materialsDelivered', 'materials_delivered') || '',
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
      ...(clientId ? { client_id: clientId } : {}),
    } as never).select().single();

    if (error) throw error;

    // Deliveries are their own child table (project-scoped). Persist any provided.
    if (deliveriesIn.length > 0) {
      await db.from('deliveries').insert(deliveriesIn.map((d: any) => ({
        tenant_id: tenantId,
        project_id: projectId,
        item_name: d.itemName ?? d.item_name ?? '',
        vendor: d.vendor ?? null,
        quantity: d.quantity ?? null,
        received_by: d.receivedBy ?? d.received_by ?? null,
        notes: d.notes ?? null,
        delivered_at: d.deliveredAt ?? d.delivered_at ?? new Date().toISOString(),
      })) as never).then(({ error: delErr }) => { if (delErr) console.error('[daily-logs/create] deliveries insert:', delErr.message); });
    }

    return NextResponse.json({ success: true, log });
  } catch (err: unknown) {
    /* THE CATCH USED TO BE `catch { return 'Internal server error' }` — no
       variable, nothing logged, the exception discarded. Every failure this
       route ever had produced the same eight words and threw away the cause,
       which is why the one below stayed invisible.

       daily_logs carries a unique index, daily_logs_project_date_tenant, on
       (project_id, log_date, tenant_id). That is correct: a jobsite gets one
       daily log per day. But a superintendent filing today's log when one
       already exists is not a server error, it is a thing that happens every
       week — somebody already wrote it, or they tapped save twice on bad
       signal. They were told "Internal server error" and left to guess.

       409 with the id of the log that already exists, so the client can offer
       to open it instead of making them hunt. */
    const code = (err as { code?: string })?.code;
    const detail = String((err as { message?: string })?.message ?? '');
    // Two sends of the same offline log raced: the other one wrote it.
    if (clientId && isUniqueViolation(err)) {
      const earlier = await alreadySent().catch(() => null);
      if (earlier) return NextResponse.json({ success: true, log: earlier, replayed: true });
    }
    if (code === '23505' && detail.includes('daily_logs_project_date_tenant')) {
      const { data: existing } = await db
        .from('daily_logs')
        .select('id, log_date')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .eq('log_date', pickedLogDate)
        .maybeSingle();
      return NextResponse.json(
        {
          error: `A daily log already exists for ${pickedLogDate} on this project. Open it to add to the day instead of starting a second one.`,
          existingLogId: existing?.id ?? null,
          logDate: pickedLogDate,
        },
        { status: 409 },
      );
    }
    return apiError('daily-logs/create', err, 'Could not save the daily log');
  }
}
