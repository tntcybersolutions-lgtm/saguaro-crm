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
  const lineItemId = searchParams.get('line_item_id');

  try {
    const db = createServerClient();

    // Get all line item IDs for this takeoff project to scope measurements
    const { data: lineItems, error: liError } = await db
      .from('takeoff_line_items')
      .select('id')
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId);

    if (liError) throw liError;

    const lineItemIds = (lineItems || []).map((li: any) => li.id);
    if (lineItemIds.length === 0) {
      return NextResponse.json({ measurements: [] });
    }

    let query = db
      .from('takeoff_measurements')
      .select('*')
      .in('line_item_id', lineItemIds)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });

    if (sheetId) query = query.eq('sheet_id', sheetId);
    if (lineItemId) query = query.eq('line_item_id', lineItemId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ measurements: data || [] });
  } catch (e) {
    return apiError('takeoff-projects/[id]/measurements GET', e);
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
    const { line_item_id, sheet_id, measurement_type, geometry } = body;

    if (!line_item_id || !sheet_id || !measurement_type || !geometry) {
      return NextResponse.json(
        { error: 'line_item_id, sheet_id, measurement_type, and geometry are required' },
        { status: 400 },
      );
    }

    // Verify line item belongs to this takeoff project and tenant
    const db = createServerClient();
    const { data: lineItem, error: liError } = await db
      .from('takeoff_line_items')
      .select('id')
      .eq('id', line_item_id)
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (liError || !lineItem) {
      return NextResponse.json({ error: 'Line item not found in this project' }, { status: 404 });
    }

    const optionalFields = ['raw_value', 'scaled_value', 'unit', 'label', 'color'];
    const record: Record<string, any> = {
      line_item_id,
      sheet_id,
      measurement_type,
      geometry,
      tenant_id: user.tenantId,
    };
    for (const k of optionalFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }

    const { data, error } = await db
      .from('takeoff_measurements')
      .insert(record as Database['public']['Tables']['takeoff_measurements']['Insert'])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ measurement: data }, { status: 201 });
  } catch (e) {
    return apiError('takeoff-projects/[id]/measurements POST', e);
  }
}
