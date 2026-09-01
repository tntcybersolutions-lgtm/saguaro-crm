import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();
    // Whitelist to real correspondence columns; map type->correspondence_type and
    // to/cc->to_names/cc_names. Drop client-only fields (priority/direction/etc).
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const direct = ['subject','body','status','from_name','from_email','sent_at','pdf_url'];
    for (const k of direct) if (body[k] !== undefined) updates[k] = body[k];
    if (body.correspondence_type !== undefined) updates.correspondence_type = body.correspondence_type;
    else if (body.type !== undefined) updates.correspondence_type = body.type;
    if (body.to_names !== undefined) updates.to_names = body.to_names;
    else if (body.to !== undefined) updates.to_names = body.to;
    if (body.cc_names !== undefined) updates.cc_names = body.cc_names;
    else if (body.cc !== undefined) updates.cc_names = body.cc;
    if (body.attachments !== undefined) updates.attachments = body.attachments;
    const { data, error } = await supabase
      .from('correspondence')
      .update(updates)
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    // Do NOT echo the request body back as if it saved — that turns a failed
    // write into a fake success. Surface the real failure. PGRST116 = 0 rows
    // matched (wrong id / project / tenant) -> 404, everything else -> 500.
    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      return apiError('projects/projectId/correspondence/id', error, "Failed to update", status);
    }
    return NextResponse.json({ item: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  // Read receipt endpoint
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    // Record read receipt
    const { error } = await supabase
      .from('correspondence_read_receipts')
      .upsert({
        correspondence_id: params.id,
        recipient_email: user.email,
        read_at: new Date().toISOString(),
      });
    if (error) return NextResponse.json({ success: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record read receipt' }, { status: 500 });
  }
}
