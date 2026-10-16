import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get('sheet_id');

  try {
    const db = createServerClient();
    let query = db
      .from('takeoff_line_items')
      // Links to the takeoff project via `takeoff_project_id` (added by migration
      // 2026-07-28_takeoff_line_items_project_link) — matches the POST insert.
      .select('*')
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    // sheet_id has no dedicated column — it is stored inside the metadata jsonb (see POST).
    if (sheetId) query = query.eq('metadata->>sheet_id', sheetId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ lineItems: data || [] });
  } catch (e) {
    return apiError('takeoff-projects/[id]/line-items GET', e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    // Fields that map directly to real columns on takeoff_line_items
    const directFields = [
      'csi_code', 'csi_division', 'csi_description', 'category',
      'quantity', 'unit', 'notes', 'sort_order',
    ];
    // Generic cost aliases -> real column names (per codebase export-route convention:
    // unit_cost==unit_material_cost, material_cost==total_material, etc.)
    const costAliasMap: Record<string, string> = {
      unit_cost: 'unit_material_cost',
      material_cost: 'total_material',
      labor_cost: 'total_labor',
      equipment_cost: 'total_equipment',
    };
    const record: Record<string, any> = {
      description,
      // This is the takeoff_projects id — it must go in takeoff_project_id, NOT takeoff_id
      // (takeoff_id is a FK to the `takeoffs` table and would FK-violate). Requires the
      // takeoff_project_id column added by migration 2026-07-28_takeoff_line_items_project_link.
      takeoff_project_id: id,
      tenant_id: user.tenantId,
    };
    for (const k of directFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }
    for (const [alias, col] of Object.entries(costAliasMap)) {
      if (body[alias] !== undefined) record[col] = body[alias];
    }

    // Fields with no dedicated column are folded into the metadata jsonb.
    const metaFields = [
      'sheet_id', 'assembly_id', 'cost_code_id', 'measurement_type', 'markup_pct',
    ];
    const metadata: Record<string, any> = {};
    for (const k of metaFields) {
      if (body[k] !== undefined) metadata[k] = body[k];
    }
    if (Object.keys(metadata).length > 0) record.metadata = metadata;

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_line_items')
      .insert(record as Database['public']['Tables']['takeoff_line_items']['Insert'])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ lineItem: data }, { status: 201 });
  } catch (e) {
    return apiError('takeoff-projects/[id]/line-items POST', e);
  }
}
