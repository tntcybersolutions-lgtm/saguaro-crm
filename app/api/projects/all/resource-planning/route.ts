import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

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

type DbRow = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  resource_type: string | null;
  resource_name: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  hours_per_day: number | null;
  cost_rate: number | null;
  status: string | null;
  notes: string | null;
};

function toPage(r: DbRow) {
  return {
    id: r.id,
    person_name: r.resource_name || '',
    person_id: r.id,
    role: r.role || 'Laborer',
    trade: r.resource_type || 'General',
    certifications: [] as string[],
    start_date: r.start_date || '',
    end_date: r.end_date || '',
    hours_per_day: Number(r.hours_per_day ?? 8),
    days_per_week: 5,
    hourly_rate: Number(r.cost_rate ?? 0),
    status: (r.status as string) || 'assigned',
    notes: r.notes || '',
    project_id: r.project_id || '',
  };
}

export function toDb(body: Record<string, unknown>, tenantId: string) {
  const row: Record<string, unknown> = {};
  if (body.person_name !== undefined) row.resource_name = body.person_name;
  if (body.resource_name !== undefined) row.resource_name = body.resource_name;
  if (body.role !== undefined) row.role = body.role;
  if (body.trade !== undefined) row.resource_type = body.trade;
  if (body.resource_type !== undefined) row.resource_type = body.resource_type;
  if (body.start_date !== undefined) row.start_date = body.start_date || null;
  if (body.end_date !== undefined) row.end_date = body.end_date || null;
  if (body.hours_per_day !== undefined) row.hours_per_day = body.hours_per_day;
  if (body.hourly_rate !== undefined) row.cost_rate = body.hourly_rate;
  if (body.cost_rate !== undefined) row.cost_rate = body.cost_rate;
  if (body.status !== undefined) row.status = body.status;
  if (body.notes !== undefined) row.notes = body.notes;
  if (body.project_id !== undefined) row.project_id = body.project_id || null;
  row.tenant_id = tenantId;
  if (row.resource_type === undefined) row.resource_type = 'labor';
  return row;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ data: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('resource_assignments')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('start_date', { ascending: true });
    if (error) throw error;

    const mapped = (data || []).map((r) => toPage(r as DbRow));
    return NextResponse.json({ data: mapped, source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/all/resource-planning] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/all/resource-planning', e, 'Failed to load data');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const row = toDb(body, user.tenantId);

    const db = createServerClient();
    const { data, error } = await db
      .from('resource_assignments')
      .insert(row as Database['public']['Tables']['resource_assignments']['Insert'])
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data: toPage(data as DbRow) }, { status: 201 });
  } catch (e) {
    return apiError('projects/all/resource-planning', e, 'Internal server error');
  }
}
