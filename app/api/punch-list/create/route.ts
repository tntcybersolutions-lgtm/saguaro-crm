import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { assertProjectInTenant } from '@/lib/assert-project';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (!body.projectId && !body.project_id) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();
    /* This project must belong to the caller's tenant. Without the check a
       project id from ANOTHER tenant satisfies the foreign key, and the row
       is written — stamped with the caller's tenant, pointing at a customer's
       job they cannot see. See lib/assert-project. */
    const notOurs = await assertProjectInTenant(db, user.tenantId, (body.projectId || body.project_id) as string);
    if (notOurs) return notOurs;
    const projectId = (body.projectId || body.project_id) as string;

    // Assign the next per-project item number (punch_list.item_number).
    let item_number = 1;
    try {
      const { data: last } = await db
        .from('punch_list')
        .select('item_number')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', projectId)
        .order('item_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      item_number = (Number((last as Record<string, unknown> | null)?.item_number) || 0) + 1;
    } catch { /* default to 1 */ }

    const row = {
      project_id:  projectId,
      tenant_id:   user.tenantId,
      item_number,
      title:       body.title       || '',
      description: body.description || '',
      location:    body.location    || '',
      trade:       body.trade       || 'General',
      priority:    body.priority    || 'medium',
      status:      body.status      || 'open',
      due_date:    body.dueDate     || body.due_date     || null,
      // Person/company responsible. App sends snake_case `assigned_to`; also
      // accept camelCase `assignedTo`. Real punch_list column the detail/list
      // screens read from is `assigned_to`.
      assigned_to: body.assigned_to ?? body.assignedTo ?? null,
      notes:       body.notes       || '',
    };

    const { data, error } = await db
      .from('punch_list')
      .insert(row as Database['public']['Tables']['punch_list']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
