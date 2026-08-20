import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('observations')
      .select('*')
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ observation: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    // Whitelist to real observations columns (corrective-action sub-object is not a column).
    const allowed = [
      'title', 'description', 'observation_type', 'severity', 'location',
      'photo_urls', 'assigned_to', 'status', 'due_date',
    ];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    // Stamp resolved_at when the corrective action is verified / observation closed.
    if (typeof body.status === 'string') {
      const s = body.status.toLowerCase();
      updates.resolved_at = (s === 'closed' || s === 'resolved' || s === 'verified')
        ? new Date().toISOString()
        : null;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('observations')
      .update(updates)
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ observation: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db
      .from('observations')
      .delete()
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
