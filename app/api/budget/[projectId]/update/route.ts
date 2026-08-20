import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const body = await req.json();
    const { lineItemId, uncommitted_cost, notes, cost_code } = body;

    if (!lineItemId) {
      return NextResponse.json({ error: 'Missing required field: lineItemId' }, { status: 400 });
    }

    const db = createServerClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (uncommitted_cost !== undefined) updates.uncommitted_cost = uncommitted_cost;
    if (notes !== undefined) updates.notes = notes;
    if (cost_code !== undefined) updates.cost_code = cost_code;

    const { data, error } = await db
      .from('budget_line_items')
      .update(updates)
      .eq('id', lineItemId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Budget line item not found' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
