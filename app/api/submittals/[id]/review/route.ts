import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Submittals', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;

  try {
    const { action, notes } = await req.json();
    if (!action || !['approve', 'reject', 'resubmit'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be approve, reject, or resubmit.' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Map action to status
    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      resubmit: 'resubmit',
    };
    const newStatus = statusMap[action];

    // Update the submittal status — tenant-scoped so a caller can only review
    // submittals belonging to their own tenant (prevents cross-tenant IDOR).
    const { data: submittal, error: updateError } = await supabase
      .from('submittals')
      .update({
        status: newStatus,
        reviewer_notes: notes || null,
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ status: newStatus, submittal });
  } catch (err: unknown) {
    return apiError('submittals/[id]/review POST', err);
  }
}
