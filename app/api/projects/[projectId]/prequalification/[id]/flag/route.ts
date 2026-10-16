import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Flag or resolve a compliance flag on a subcontractor prequalification submission.
 * Called from app/field/prequalification/page.tsx (toggleFlag).
 * Body: { compliance_flagged: boolean, compliance_flag_reason: string }
 *
 * No boolean flag column exists on prequalification_submissions, so flag state is
 * reflected in `status` ('under_review' when flagged) and the reason is appended to
 * the text `notes` log. Offline-capable: the page enqueues the write and updates
 * local state optimistically, so it only needs a 2xx here.
 */
async function handle(
  req: NextRequest,
  { params }: { params: { projectId: string; id: string } }
) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let flagged = false;
  let reason = '';
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    flagged = Boolean(body.compliance_flagged);
    reason = String(body.compliance_flag_reason || '').trim();
  } catch {
    /* safe default */
  }

  try {
    const db = createServerClient();

    const update: Record<string, unknown> = {
      status: flagged ? 'under_review' : 'pending',
      updated_at: new Date().toISOString(),
    };

    // Append a flag/resolve entry to the notes log without clobbering prior notes.
    const { data: existing } = await db
      .from('prequalification_submissions')
      .select('notes')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .single();

    const prior = (existing?.notes as string | null) || '';
    const stamp = new Date().toISOString();
    const who = user.email || 'Field Super';
    const entry = flagged
      ? `[${stamp}] ${who}: COMPLIANCE FLAG - ${reason || 'No reason provided'}`
      : `[${stamp}] ${who}: COMPLIANCE FLAG RESOLVED`;
    update.notes = prior ? `${prior}\n${entry}` : entry;

    const { error } = await db
      .from('prequalification_submissions')
      .update(update)
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      compliance_flagged: flagged,
      compliance_flag_reason: flagged ? reason : '',
    });
  } catch (e) {
    return apiError('projects/[projectId]/prequalification/[id]/flag', e);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { projectId: string; id: string } }
) {
  return handle(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: { projectId: string; id: string } }
) {
  return handle(req, ctx);
}
