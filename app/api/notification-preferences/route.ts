import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ preferences: data ?? [] });
  } catch { return NextResponse.json({ preferences: [] }); }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    // Upsert preferences in bulk
    const prefs = Array.isArray(body) ? body : [body];
    const records = prefs.map((p: { channel?: string; module: string; event_type: string; enabled?: boolean; frequency?: string }) => ({
      tenant_id: user.tenantId, user_id: user.id,
      channel: p.channel || 'in_app', module: p.module, event_type: p.event_type,
      enabled: p.enabled ?? true, frequency: p.frequency || 'instant',
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase.from('notification_preferences').upsert(records, { onConflict: 'tenant_id,user_id,channel,module,event_type' }).select();
    if (error) throw error;
    return NextResponse.json({ preferences: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
