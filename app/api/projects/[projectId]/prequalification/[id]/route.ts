import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const now = new Date().toISOString();

    // forms keep template config inside form_data jsonb; only status/score/form_data
    // are real top-level columns on prequalification_forms.
    const formConfigKeys = ['name','description','questions','scoring_criteria','required_documents','auto_qualify_threshold'];
    const formUpdates: Record<string, unknown> = { updated_at: now };
    if (typeof body.status !== 'undefined') formUpdates.status = body.status;
    if (typeof body.score !== 'undefined') formUpdates.score = body.score;
    const formDataPatch: Record<string, unknown> = {};
    for (const k of formConfigKeys) if (body[k] !== undefined) formDataPatch[k] = body[k];

    let data: unknown = null;
    let error: unknown = null;

    // Try forms first. Merge into existing form_data so we don't clobber prior config.
    const { data: existingForm } = await supabase
      .from('prequalification_forms').select('form_data').eq('id', params.id).eq('tenant_id', user.tenantId).maybeSingle();
    if (existingForm) {
      const merged = Object.keys(formDataPatch).length
        ? { ...((existingForm as Record<string, unknown>).form_data as Record<string, unknown> || {}), ...formDataPatch }
        : undefined;
      if (merged) formUpdates.form_data = merged;
      const res = await supabase.from('prequalification_forms').update(formUpdates).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
      data = res.data; error = res.error;
    } else {
      // submissions: status/score/reviewed_by/reviewed_at/notes are real columns;
      // documents is real jsonb; review_notes maps to notes.
      const subUpdates: Record<string, unknown> = { updated_at: now };
      for (const k of ['status','answers','documents','score','reviewed_by','reviewed_at'] as const) {
        if (body[k] !== undefined) subUpdates[k] = body[k];
      }
      if (body.review_notes !== undefined) subUpdates.notes = body.review_notes;
      const res = await supabase.from('prequalification_submissions').update(subUpdates).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
      data = res.data; error = res.error;
    }
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/prequalification/[id] PATCH', e);
  }
}
