import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/** GET — the sub's full timestamped history: every upload, submission, and
 *  completion logged through portal_activity for this session. */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
    if (!token) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });
    const db = createServerClient();
    const { data: session } = await db
      .from('portal_sub_sessions')
      .select('*')
      .eq('token', token)
      .eq('status', 'active')
      .single();
    if (!session) return NextResponse.json({ error: 'Invalid or expired portal token' }, { status: 401 });

    const { data: events, error } = await db
      .from('portal_activity')
      .select('id, action, description, metadata, created_at')
      .eq('tenant_id', session.tenant_id)
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ events: events || [] });
  } catch (e) {
    return apiError('portal/sub/activity GET', e);
  }
}
