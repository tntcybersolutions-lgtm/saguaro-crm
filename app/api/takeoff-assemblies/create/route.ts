import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const optionalFields = [
      'description', 'csi_division', 'csi_code', 'category', 'unit',
      'default_quantity', 'material_items', 'labor_hours', 'labor_rate',
      'total_material_cost', 'total_labor_cost', 'total_cost',
    ];
    const record: Record<string, any> = {
      name,
      tenant_id: user.tenantId,
      created_by: user.id,
    };
    for (const k of optionalFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_assemblies')
      .insert(record)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ assembly: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
