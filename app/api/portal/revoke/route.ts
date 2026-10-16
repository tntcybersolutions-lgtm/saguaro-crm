import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/revoke
 * GC revokes portal access for a session.
 * Body: { sessionId, type: 'client' | 'sub' }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, type } = await req.json();
    if (!sessionId || !type) {
      return NextResponse.json({ error: 'sessionId and type required' }, { status: 400 });
    }

    const db = createServerClient();
    const table = type === 'client' ? 'portal_client_sessions' : 'portal_sub_sessions';

    const { error } = await db
      .from(table)
      .update({ status: 'inactive' })
      .eq('id', sessionId)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('portal/revoke POST', err);
  }
}
