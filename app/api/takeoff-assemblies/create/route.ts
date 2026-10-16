import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

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
      .insert(record as Database['public']['Tables']['takeoff_assemblies']['Insert'])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ assembly: data }, { status: 201 });
  } catch (e) {
    return apiError('takeoff-assemblies/create POST', e);
  }
}
