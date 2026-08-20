import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('inspections')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    return NextResponse.json({ inspection: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  try {
    const db = createServerClient();

    // Verify ownership
    const { data: existing, error: findErr } = await db
      .from('inspections')
      .select('id, checklist')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (findErr || !existing) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};

    // Update checklist responses
    if (body.checklist) {
      updates.checklist = body.checklist;
      const items = body.checklist as Array<Record<string, unknown>>;
      updates.checklist_total = items.length;
      updates.checklist_passed = items.filter(i => i.response === 'yes' || i.response === 'na').length;
      updates.deficiency_count = items.filter(i => i.response === 'no').length;
    }

    // Submit inspection: calculate pass/fail
    if (body.submit) {
      const checklist = (body.checklist || (existing as Record<string, unknown>).checklist || []) as Array<Record<string, unknown>>;
      const requiredFails = checklist.filter(
        f => f.required !== false && f.response === 'no'
      );
      const overallResult = requiredFails.length > 0 ? 'Failed' : 'Passed';

      updates.result = overallResult;
      updates.status = 'Complete';
      updates.inspected_at = new Date().toISOString();

      if (overallResult === 'Failed') {
        updates.deficiencies = requiredFails.map(f => ({
          field: f.label || f.name,
          notes: f.notes || '',
        }));
      }
    }

    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.inspector) updates.inspector = body.inspector;
    if (body.agency) updates.agency = body.agency;
    if (body.result && !body.submit) updates.result = body.result;
    if (body.status && !body.submit) updates.status = body.status;

    const { data, error } = await db
      .from('inspections')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ inspection: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
