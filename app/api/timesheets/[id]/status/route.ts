import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }
    const db = createServerClient();
    const updatePayload: Record<string, any> = { status: body.status };
    if (body.status === 'approved') {
      updatePayload.approved_by = user.id;
      updatePayload.approved_at = new Date().toISOString();
    }
    const { error } = await db
      .from('timesheets')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
