import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
      .select('*')
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    if (sheetId) query = query.eq('sheet_id', sheetId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ lineItems: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const optionalFields = [
      'sheet_id', 'assembly_id', 'cost_code_id', 'csi_code', 'category',
      'measurement_type', 'quantity', 'unit', 'unit_cost', 'material_cost',
      'labor_cost', 'equipment_cost', 'total_cost', 'markup_pct', 'sell_price',
      'color', 'notes', 'sort_order', 'group_name',
    ];
    const record: Record<string, any> = {
      description,
      takeoff_project_id: id,
      tenant_id: user.tenantId,
    };
    for (const k of optionalFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_line_items')
      .insert(record)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ lineItem: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
