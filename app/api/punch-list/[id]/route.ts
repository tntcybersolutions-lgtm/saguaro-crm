import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Role check, not just sign-in: Projects: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('punch_list')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (e) {
    return apiError('punch-list/[id] GET', e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    const allowed = ['title','description','location','trade','priority','status','due_date','notes','assigned_to'];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }
    if (body.status === 'completed' && !fields.completed_at) {
      fields.completed_at = new Date().toISOString();
    }
    const { error } = await db
      .from('punch_list')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('punch-list/[id] PUT', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('punch_list')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('punch-list/[id] DELETE', e);
  }
}
