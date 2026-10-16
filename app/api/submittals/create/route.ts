import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { assertProjectInTenant } from '@/lib/assert-project';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Submittals', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    if (!body.project_id && !body.projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }
    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    const db = createServerClient();
    /* This project must belong to the caller's tenant. Without the check a
       project id from ANOTHER tenant satisfies the foreign key, and the row
       is written — stamped with the caller's tenant, pointing at a customer's
       job they cannot see. See lib/assert-project. */
    const notOurs = await assertProjectInTenant(db, user.tenantId, (body.project_id || body.projectId));
    if (notOurs) return notOurs;
    const { data, error } = await db.from('submittals').insert({
      tenant_id: user.tenantId,
      created_by: user.id,
      project_id: body.project_id || body.projectId,
      title: body.title,
      submittal_number: body.submittal_number || body.submittalNumber || null,
      spec_section: body.spec_section || body.specSection || null,
      description: body.description || null,
      submitted_by: body.submitted_by || body.submittedBy || null,
      submitted_to: body.submitted_to || body.submittedTo || null,
      subcontractor: body.subcontractor || null,
      trade: body.trade || null,
      status: body.status || 'pending',
      priority: body.priority || null,
      ball_in_court: body.ball_in_court || 'Contractor',
      due_date: body.required_date || body.due_date || body.dueDate || null,
      // Client (submittals page) posts `submitted_at` + `revision_number`. Accept
      // those real column names first, then the legacy camel/alt aliases, so the
      // submitted date and revision the user entered actually persist on create
      // (previously only `submitted_date`/`revision` were read → both dropped).
      submitted_at: body.submitted_at || body.submitted_date || body.submittedAt || null,
      revision_number: body.revision_number ?? body.revision ?? body.revisionNumber ?? 0,
      notes: body.notes || null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, submittal: data });
  } catch (e) {
    return apiError('submittals/create POST', e);
  }
}
