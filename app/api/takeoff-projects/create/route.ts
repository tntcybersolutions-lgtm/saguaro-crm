import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { project_id, name } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: 'project_id and name are required' }, { status: 400 });
    }

    const optionalFields = [
      'description', 'overhead_pct', 'profit_pct', 'contingency_pct', 'notes',
    ];
    const record: Record<string, any> = {
      project_id,
      name,
      tenant_id: user.tenantId,
      created_by: user.id,
    };
    for (const k of optionalFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_projects')
      .insert(record)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ takeoffProject: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
