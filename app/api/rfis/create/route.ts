import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { assertProjectInTenant } from '@/lib/assert-project';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { onRFICreated } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
    /* A record with no project is invisible: every project screen filters on
       project_id, so this wrote a row the user was told had saved and could
       never see again. 400 naming the field, like the nineteen other create
       endpoints in this codebase already do. */
    if (!(body.projectId || body.project_id)) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

  try {
    const db = createServerClient();
    /* This project must belong to the caller's tenant. Without the check a
       project id from ANOTHER tenant satisfies the foreign key, and the row
       is written — stamped with the caller's tenant, pointing at a customer's
       job they cannot see. See lib/assert-project. */
    const notOurs = await assertProjectInTenant(db, user.tenantId, (body.projectId || body.project_id) as string);
    if (notOurs) return notOurs;

    const { count: rawCount } = await db
      .from('rfis')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId);

    const rfi_number = `RFI-${String((rawCount || 0) + 1).padStart(3, '0')}`;

    // Accept both camelCase and snake_case from the client; default optionals to null.
    const priority      = (body.priority as string) || 'medium';
    const assignedToName = body.assignedToName || body.assigned_to_name || null;
    const costImpactRaw  = body.costImpact ?? body.cost_impact;
    const schedImpactRaw = body.scheduleImpactDays ?? body.schedule_impact_days;

    const row = {
      tenant_id:        user.tenantId,
      project_id:       body.projectId   || body.project_id  || null,
      rfi_number,
      subject:          body.subject     || '',
      question:         body.question    || body.description  || '',
      priority,
      spec_section:     body.specSection      || body.spec_section      || null,
      drawing_reference: body.drawingReference || body.drawing_reference || null,
      due_date:         body.dueDate     || body.due_date     || null,
      assigned_to_name: assignedToName,
      ball_in_court:    assignedToName,
      is_urgent:        (body.isUrgent ?? body.is_urgent) === true,
      cost_impact:
        costImpactRaw === undefined || costImpactRaw === null || costImpactRaw === ''
          ? null
          : Number(costImpactRaw),
      cost_impact_direction:
        body.costImpactDirection || body.cost_impact_direction || null,
      schedule_impact_days:
        schedImpactRaw === undefined || schedImpactRaw === null || schedImpactRaw === ''
          ? null
          : Number(schedImpactRaw),
      notes:            body.notes || null,
      status:           'open',
      submitted_by:     user.email       || 'Field User',
    };

    const { data, error } = await db
      .from('rfis')
      .insert(row as Database['public']['Tables']['rfis']['Insert'])
      .select()
      .single();

    if (error) throw error;

    // Fire the rfi.submitted lifecycle: architect email + in-app notification +
    // outbound webhook fan-out. Non-blocking — never fail the create on this.
    const rfiId = (data as { id?: string } | null)?.id;
    if (rfiId) runInBackground(onRFICreated(rfiId), 'onRFICreated');

    return NextResponse.json({ success: true, rfi: data });
  } catch (err: unknown) {
    return apiError('rfis/create POST', err);
  }
}
