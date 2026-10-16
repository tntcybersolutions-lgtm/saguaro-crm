import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/client-portal/users/[id]/resend
 * Resend a portal invitation. Re-stamps invited_at and keeps the user pending.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('portal_users')
      .update({ invited_at: new Date().toISOString(), status: 'pending' })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, user: data });
  } catch (err) {
    return apiError('client-portal/users/[id]/resend POST', err, 'Failed to resend invite');
  }
}
