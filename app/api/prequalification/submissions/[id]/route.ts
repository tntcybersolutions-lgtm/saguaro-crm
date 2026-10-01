import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();
    const ALLOWED_SUBMISSION_COLUMNS = [
      'invite_id', 'sub_id', 'template_id', 'answers', 'documents', 'score', 'status',
      'reviewed_by', 'reviewed_at', 'notes', 'updated_at',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_SUBMISSION_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    const { data, error } = await db
      .from('prequalification_submissions')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    // Scoring/approving a prequal (status, score, reviewed_by) that failed must
    // not read as a flat 500 with no trace — this gates whether a sub is
    // compliant to work. Honest surface + correlation id (§0/§3).
    return apiError('prequalification/submissions/id', e, 'Could not update the prequalification submission');
  }
}
