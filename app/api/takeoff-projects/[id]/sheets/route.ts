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

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_sheets')
      .select('*')
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ sheets: data || [] });
  } catch (e) {
    return apiError('takeoff-projects/[id]/sheets GET', e);
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
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const optionalFields = [
      'sheet_number', 'discipline', 'file_url', 'thumbnail_url',
      'page_number', 'scale', 'scale_factor', 'sort_order',
    ];
    const record: Record<string, any> = {
      name,
      takeoff_project_id: id,
      tenant_id: user.tenantId,
    };
    for (const k of optionalFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_sheets')
      .insert(record as Database['public']['Tables']['takeoff_sheets']['Insert'])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ sheet: data }, { status: 201 });
  } catch (e) {
    return apiError('takeoff-projects/[id]/sheets POST', e);
  }
}
