import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { toPage, toDb, canSeeRates, canSetRates, type AssignmentRow } from '@/lib/resource-assignments';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { assertProjectInTenant } from '@/lib/assert-project';

export const dynamic = 'force-dynamic';

/**
 * Cross-project resource planning (staffing assignments).
 * Backs /app/resource-planning page.
 *
 * The page works in its own "Assignment" shape; the DB table `resource_assignments`
 * uses different column names. These helpers map between the two so the page contract
 * is preserved while only writing real columns.
 *
 *   page.person_name  <-> db.resource_name
 *   page.hourly_rate  <-> db.cost_rate
 *   page.trade        -> stored in resource_type (no dedicated trade column)
 *   page.days_per_week / certifications -> not persisted (no columns); echoed safe defaults
 */

/* Page shape, the column mapping and the rate rule live in lib/resource-assignments. */

export async function GET(req: NextRequest) {
  try {
    // Staffing is a Projects tool (role_gate_sel_resource_assignments); what each
    // person costs is shown only with Budget or Admin view (lib/resource-assignments).
    const g = await requirePermission(req, 'Projects', 'View');
    if (!g.ok) return g.res;
    const user = g.user;
    const showRates = canSeeRates(g.perms);

    const db = g.db;
    const { data, error } = await db
      .from('resource_assignments')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('start_date', { ascending: true });
    if (error) throw error;

    const mapped = (data || []).map((r) => toPage(r as AssignmentRow, showRates));
    return NextResponse.json({ data: mapped, ratesVisible: showRates, source: 'live' });
  } catch (e) {
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/all/resource-planning', e, 'Failed to load data');
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json().catch(() => ({}));
    // A rate is kept only from a role that may set one (Budget or Admin: Edit).
    const row = toDb(body, user.tenantId, canSetRates(g.perms), { insert: true });

    /* resource_name and project_id are NOT NULL: a missing one used to reach
       Postgres and come back as a 500. Name the field instead. */
    if (!String(row.resource_name ?? '').trim()) {
      return NextResponse.json({ error: 'Enter the person’s name.' }, { status: 400 });
    }
    if (!row.project_id) {
      return NextResponse.json({ error: 'Pick the project they are assigned to.' }, { status: 400 });
    }

    const db = g.db;
    // project_id comes from the body: it must be one of the caller's jobs.
    const notOurs = await assertProjectInTenant(db, user.tenantId, String(row.project_id));
    if (notOurs) return notOurs;
    const { data, error } = await db
      .from('resource_assignments')
      .insert(row as Database['public']['Tables']['resource_assignments']['Insert'])
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data: toPage(data as AssignmentRow, canSeeRates(g.perms)) }, { status: 201 });
  } catch (e) {
    return apiError('projects/all/resource-planning', e, "Couldn't save the assignment. Please try again.");
  }
}
