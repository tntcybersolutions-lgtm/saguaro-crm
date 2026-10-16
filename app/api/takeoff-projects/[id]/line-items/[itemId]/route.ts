import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_line_items')
      .select('*')
      .eq('id', itemId)
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ lineItem: data });
  } catch (e) {
    return apiError('takeoff-projects/[id]/line-items/[itemId] GET', e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json();
    // Fields that map directly to real columns on takeoff_line_items
    const directFields = [
      'description', 'csi_code', 'csi_division', 'csi_description',
      'category', 'quantity', 'unit', 'notes', 'sort_order',
    ];
    // Generic cost aliases -> real column names (per codebase export-route convention)
    const costAliasMap: Record<string, string> = {
      unit_cost: 'unit_material_cost',
      material_cost: 'total_material',
      labor_cost: 'total_labor',
      equipment_cost: 'total_equipment',
    };
    const fields: Record<string, any> = {};
    for (const k of directFields) {
      if (body[k] !== undefined) fields[k] = body[k];
    }
    for (const [alias, col] of Object.entries(costAliasMap)) {
      if (body[alias] !== undefined) fields[col] = body[alias];
    }

    // Fields with no dedicated column are folded into the metadata jsonb.
    const metaFields = [
      'sheet_id', 'assembly_id', 'cost_code_id', 'measurement_type', 'markup_pct',
    ];
    const metaPatch: Record<string, any> = {};
    for (const k of metaFields) {
      if (body[k] !== undefined) metaPatch[k] = body[k];
    }

    const db = createServerClient();

    // Merge incoming metadata keys onto the existing jsonb so unrelated keys are
    // preserved rather than clobbered.
    if (Object.keys(metaPatch).length > 0) {
      const { data: current } = await db
        .from('takeoff_line_items')
        .select('metadata')
        .eq('id', itemId)
        .eq('takeoff_project_id', id)
        .eq('tenant_id', user.tenantId)
        .single();
      fields.metadata = { ...((current?.metadata as Record<string, any>) || {}), ...metaPatch };
    }

    const { data, error } = await db
      .from('takeoff_line_items')
      .update(fields)
      .eq('id', itemId)
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ lineItem: data });
  } catch (e) {
    return apiError('takeoff-projects/[id]/line-items/[itemId] PATCH', e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();
    const { error } = await db
      .from('takeoff_line_items')
      .delete()
      .eq('id', itemId)
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('takeoff-projects/[id]/line-items/[itemId] DELETE', e);
  }
}
