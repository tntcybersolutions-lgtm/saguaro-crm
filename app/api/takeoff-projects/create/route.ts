import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

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
      .insert(record as Database['public']['Tables']['takeoff_projects']['Insert'])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ takeoffProject: data }, { status: 201 });
  } catch (e) {
    return apiError('takeoff-projects/create POST', e);
  }
}
