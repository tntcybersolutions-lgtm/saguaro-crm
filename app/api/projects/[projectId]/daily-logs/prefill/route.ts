import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

/**
 * Daily-log prefill — assembles the one-tap draft the auto-first composer
 * opens with. The GC should only type what the system cannot already know:
 *
 *   crewCount           distinct people clocked in on the date: time_entries
 *                       shifts (every surface writes there) plus clock_punches
 *                       audit rows, de-duplicated by identity
 *   manpowerByTrade     active crews joined with their rosters, grouped by trade
 *   subcontractorsOnSite distinct companies on the project team
 *   deliveriesToday     deliveries logged for the date (table probed in a try)
 *   carryForward        phase / equipment / superintendent off the last log
 *
 * Partial-tolerant by design: every source runs in its own try so one missing
 * table or empty system never blanks the rest of the draft.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { projectId } = await params;

  const url = new URL(req.url);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') ?? '')
    ? (url.searchParams.get('date') as string)
    : new Date().toISOString().split('T')[0];

  const db = createServerClient() as any;

  const out: Record<string, any> = {
    date,
    crewCount: 0,
    manpowerByTrade: [] as { trade: string; count: number; crews: string[] }[],
    subcontractorsOnSite: [] as string[],
    deliveriesToday: [] as any[],
    carryForward: null as null | Record<string, any>,
    weatherNote: 'stamped automatically on save',
  };

  // ── Headcount from the clock — one canonical shift table plus the punch
  // audit trail. time_entries is where every surface records a shift; a punch
  // in clock_punches can exist without one (geofence auto-punches), so both
  // are counted and de-duplicated by identity.
  const people = new Set<string>();
  try {
    const { data } = await db
      .from('time_entries')
      .select('employee_id')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .eq('work_date', date);
    for (const r of (data ?? []) as any[]) {
      if (r.employee_id) people.add(`e:${String(r.employee_id).trim().toLowerCase()}`);
    }
  } catch { /* shift table unavailable — punches still count */ }
  try {
    // Punch audit trail: keyed by name (its only identity column), counted on
    // the punch's local date.
    const { data } = await db
      .from('clock_punches')
      .select('employee_name, punched_at')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .gte('punched_at', `${date}T00:00:00`)
      .lte('punched_at', `${date}T23:59:59.999`);
    for (const r of (data ?? []) as any[]) {
      if (r.employee_name) people.add(`n:${String(r.employee_name).trim().toLowerCase()}`);
    }
  } catch { /* punch trail unavailable */ }
  out.crewCount = people.size;

  // ── Manpower by trade — active crews joined with their rosters ──
  try {
    const { data: crews } = await db
      .from('crews')
      .select('id, name, trade, status')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .is('deleted_at', null);
    const active = ((crews ?? []) as any[]).filter(
      (c) => !c.status || String(c.status).toLowerCase() === 'active'
    );
    if (active.length > 0) {
      const byId: Record<string, any> = Object.fromEntries(active.map((c) => [c.id, c]));
      const { data: members } = await db
        .from('crew_members')
        .select('crew_id, trade')
        .eq('tenant_id', user.tenantId)
        .in('crew_id', active.map((c) => c.id))
        .is('deleted_at', null);
      const groups: Record<string, { trade: string; count: number; crews: Set<string> }> = {};
      const groupFor = (trade: string) => (groups[trade] ||= { trade, count: 0, crews: new Set<string>() });
      for (const m of (members ?? []) as any[]) {
        const crew = byId[m.crew_id];
        if (!crew) continue;
        const gr = groupFor(m.trade || crew.trade || 'General');
        gr.count += 1;
        gr.crews.add(crew.name);
      }
      // Crews with an empty roster still surface (count 0) so the GC can type
      // the headcount instead of retyping the trade.
      for (const c of active) {
        const gr = groupFor(c.trade || 'General');
        gr.crews.add(c.name);
      }
      out.manpowerByTrade = Object.values(groups)
        .map((gr) => ({ trade: gr.trade, count: gr.count, crews: Array.from(gr.crews) }))
        .sort((a, b) => b.count - a.count || a.trade.localeCompare(b.trade));
    }
  } catch { /* crews tables unavailable */ }

  // ── Subcontractors on site — distinct companies on the project team ──
  try {
    const { data: team } = await db
      .from('project_team')
      .select('company')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId);
    out.subcontractorsOnSite = Array.from(
      new Set(
        ((team ?? []) as any[])
          .map((t) => String(t.company ?? '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  } catch { /* project_team unavailable */ }

  // ── Deliveries logged for the date — probe the table, tolerate absence ──
  try {
    const next = new Date(new Date(`${date}T12:00:00Z`).getTime() + 86400000)
      .toISOString().split('T')[0];
    const { data: deliveries, error } = await db
      .from('deliveries')
      .select('id, item_name, vendor, quantity')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .gte('delivered_at', `${date}T00:00:00`)
      .lt('delivered_at', `${next}T00:00:00`);
    if (!error) out.deliveriesToday = deliveries ?? [];
  } catch { /* deliveries table absent — fine */ }

  // ── Carry-forward off the most recent prior log ──
  try {
    const { data: prev } = await db
      .from('daily_logs')
      .select('log_date, phase_of_work, equipment, superintendent')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .lt('log_date', date)
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev) {
      out.carryForward = {
        log_date: prev.log_date ?? null,
        phase_of_work: prev.phase_of_work ?? null,
        equipment: prev.equipment ?? null,
        superintendent: prev.superintendent ?? null,
      };
    }
  } catch { /* no prior log */ }

  return NextResponse.json(out);
}
