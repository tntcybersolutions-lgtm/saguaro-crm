import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.item) {
      return NextResponse.json({ error: 'projectId and item are required' }, { status: 400 });
    }
    const db = createServerClient();
    const rawAmount = body.cost ?? body.selected_amount;

    // The page sends a richer model than the legacy schema: item->item_name,
    // cost->selected_amount. Product attributes (manufacturer/model/color/finish/
    // link) and owner_approved now have real columns (added by migration
    // selections_add_structured_attrs_and_owner_approved) so they persist as
    // structured data and round-trip to the UI instead of being folded into
    // free text / dropped.
    const insert: Record<string, unknown> = {
      tenant_id: user.tenantId,
      project_id: body.projectId,
      category: body.category || 'Other',
      item_name: body.item || body.item_name || '',
      /* NULL when nothing has been chosen, never 0.
         `Number(...) || 0` turned an empty price box into a decision made at no
         cost: the row read as "selected, exactly on allowance" the moment it was
         created, so an untouched $8,000 allowance looked settled. 0 stays a real
         value — an option that genuinely costs nothing is a decision. */
      selected_amount: rawAmount === undefined || rawAmount === null || rawAmount === ''
        ? null
        : (Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null),
      allowance: Number(body.allowance) || 0,
      status: body.status || 'pending',
      selected_by: body.selected_by || body.selectedBy || '',
      due_date: body.due_date || null,
      notes: body.notes || '',
      manufacturer: body.manufacturer || null,
      model: body.model || null,
      color: body.color || null,
      finish: body.finish || null,
      link: body.link || null,
      owner_approved: body.owner_approved === true,
    };
    if (body.description !== undefined) insert.description = body.description;

    const { data, error } = await db.from('selections').insert(insert as Database['public']['Tables']['selections']['Insert']).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, selection: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
