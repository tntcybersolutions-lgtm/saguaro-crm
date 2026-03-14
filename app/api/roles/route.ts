import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: roles } = await supabase.from('role_definitions').select('*').eq('tenant_id', user.tenantId).order('name');
    const { data: assignments } = await supabase.from('user_role_assignments').select('*').eq('tenant_id', user.tenantId);
    return NextResponse.json({ roles: roles ?? [], assignments: assignments ?? [] });
  } catch { return NextResponse.json({ roles: [], assignments: [] }); }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    if (body._type === 'assignment') {
      const { data, error } = await supabase.from('user_role_assignments').insert({
        tenant_id: user.tenantId, user_id: body.user_id, project_id: body.project_id || null,
        role_id: body.role_id, granted_by: user.id,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ assignment: data }, { status: 201 });
    }
    const { data, error } = await supabase.from('role_definitions').insert({
      tenant_id: user.tenantId, name: body.name, description: body.description || null,
      permissions: body.permissions || {},
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ role: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
