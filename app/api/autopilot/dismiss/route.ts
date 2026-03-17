import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { alertId } = body;

    if (!alertId) {
      return NextResponse.json({ error: 'alertId is required' }, { status: 400 });
    }

    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();

    const { error } = await db
      .from('autopilot_alerts')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      .eq('id', alertId)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[autopilot/dismiss] error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
