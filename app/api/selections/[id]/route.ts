import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    // Real selections columns that may be updated directly. owner_approved and
    // the product attributes (manufacturer/model/color/finish/link) are real
    // columns now — owner_approved MUST be here or the "Record Owner Approval"
    // action silently no-ops (it was previously dropped, so approvals never
    // persisted and the Owner-Approved pill never showed on reload).
    const allowed = ['category','allowance','status','selected_by','due_date','notes','vendor','lead_time','photo_url','variance','description','owner_approved','manufacturer','model','color','finish','link'];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }
    // Map the page's field names onto real columns.
    if (body.item !== undefined) fields.item_name = body.item;
    else if (body.item_name !== undefined) fields.item_name = body.item_name;
    if (body.cost !== undefined) fields.selected_amount = Number(body.cost) || 0;
    else if (body.selected_amount !== undefined) fields.selected_amount = Number(body.selected_amount) || 0;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('selections')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, selection: data });
  } catch (e) {
    return apiError('selections/[id] PUT', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { error } = await db.from('selections').delete().eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('selections/[id] DELETE', e);
  }
}
