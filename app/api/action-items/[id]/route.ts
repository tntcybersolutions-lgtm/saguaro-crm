import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();

    // Load existing action item
    const { data: existing, error: loadError } = await db
      .from('action_items')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .single();

    if (loadError) throw loadError;
    if (!existing) return NextResponse.json({ error: 'Action item not found' }, { status: 404 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'complete') {
        updates.completed_at = new Date().toISOString();
      }
    }
    if (body.completion_notes !== undefined) updates.completion_notes = body.completion_notes;
    if (body.due_date !== undefined) updates.due_date = body.due_date;

    // Handle convert_to RFI
    if (body.convert_to === 'rfi') {
      const { data: rfi, error: rfiError } = await db
        .from('rfis')
        .insert({
          tenant_id: user.tenantId,
          project_id: existing.project_id,
          subject: existing.description || existing.title || 'Converted from action item',
          question: existing.description || existing.title || '',
          status: 'open',
          priority: 'medium',
          created_by: user.id,
        })
        .select()
        .single();

      if (rfiError) throw rfiError;

      updates.related_rfi_id = rfi.id;
      updates.converted_to = 'rfi';
    }

    const { data, error } = await db
      .from('action_items')
      .update(updates)
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ action_item: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
