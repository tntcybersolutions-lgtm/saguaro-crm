import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const [projectRes, sheetsRes, lineItemsRes] = await Promise.all([
      db
        .from('takeoff_projects')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .single(),
      db
        .from('takeoff_sheets')
        .select('*')
        .eq('takeoff_project_id', id)
        .eq('tenant_id', user.tenantId)
        .order('sort_order', { ascending: true }),
      db
        .from('takeoff_line_items')
        .select('*, takeoff_assemblies(*)')
        .eq('takeoff_project_id', id)
        .eq('tenant_id', user.tenantId)
        .order('sort_order', { ascending: true }),
    ]);

    if (projectRes.error || !projectRes.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (sheetsRes.error) throw sheetsRes.error;
    if (lineItemsRes.error) throw lineItemsRes.error;

    return NextResponse.json({
      takeoffProject: projectRes.data,
      sheets: sheetsRes.data || [],
      lineItems: lineItemsRes.data || [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const allowed = [
      'name', 'description', 'status', 'overhead_pct', 'profit_pct',
      'contingency_pct', 'sell_price', 'gross_margin', 'total_cost',
      'material_cost', 'labor_cost', 'equipment_cost', 'notes',
      'locked', 'locked_at', 'locked_by',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_projects')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ takeoffProject: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { error } = await db
      .from('takeoff_projects')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
