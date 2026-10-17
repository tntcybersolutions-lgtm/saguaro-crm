import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { assertProjectInTenant } from '@/lib/assert-project';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  // Role check, not just sign-in: Projects: Edit, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    if (!body.projectId || !body.item) {
      return NextResponse.json({ error: 'projectId and item are required' }, { status: 400 });
    }
    const db = createServerClient();
    /* This project must belong to the caller's tenant. Without the check a
       project id from ANOTHER tenant satisfies the foreign key, and the row
       is written — stamped with the caller's tenant, pointing at a customer's
       job they cannot see. See lib/assert-project. */
    const notOurs = await assertProjectInTenant(db, user.tenantId, body.projectId);
    if (notOurs) return notOurs;

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
      selected_amount: Number(body.cost ?? body.selected_amount) || 0,
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
  } catch (e) {
    return apiError('selections/create POST', e);
  }
}
