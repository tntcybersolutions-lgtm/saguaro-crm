import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { toDb } from '../route';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

type DbRow = {
  id: string;
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const db = createServerClient();
    const { data, error } = await db
      .from('resource_assignments')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error) throw error;
    return NextResponse.json({ data: toPage(data as DbRow) });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

async function update(req: NextRequest, id: string) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const row = toDb(body, user.tenantId);
    // Never overwrite tenant scoping via body; updated_at maintained by trigger/default.
    delete (row as Record<string, unknown>).tenant_id;

    const db = createServerClient();
    const { data, error } = await db
      .from('resource_assignments')
      .update(row)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data: toPage(data as DbRow) });
  } catch (e) {
    return apiError('projects/all/resource-planning/id', e, 'Internal server error');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return update(req, id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return update(req, id);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const db = createServerClient();
    const { error } = await db
      .from('resource_assignments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('projects/all/resource-planning/id', e, 'Internal server error');
  }
}
