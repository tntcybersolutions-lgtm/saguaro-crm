import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; measId: string }> },
) {
  const { measId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_measurements')
      .select('*')
      .eq('id', measId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ measurement: data });
  } catch (e) {
    return apiError('takeoff-projects/[id]/measurements/[measId] GET', e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; measId: string }> },
) {
  const { measId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json();
    const allowed = [
      'measurement_type', 'geometry', 'raw_value', 'scaled_value',
      'unit', 'label', 'color', 'sheet_id', 'line_item_id',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_measurements')
      .update(fields)
      .eq('id', measId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ measurement: data });
  } catch (e) {
    return apiError('takeoff-projects/[id]/measurements/[measId] PATCH', e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; measId: string }> },
) {
  const { measId } = await params;
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();
    const { error } = await db
      .from('takeoff_measurements')
      .delete()
      .eq('id', measId)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('takeoff-projects/[id]/measurements/[measId] DELETE', e);
  }
}
