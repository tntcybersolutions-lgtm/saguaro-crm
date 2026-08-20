import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const userId = searchParams.get('userId');
  try {
    const db = createServerClient();
    let query = db.from('network_access_tokens').select('*, network_connections(name, ssid, network_type)').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    if (userId) query = query.eq('issued_to_user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tokens: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.connection_id || !body.project_id) return NextResponse.json({ error: 'connection_id and project_id required' }, { status: 400 });

    const db = createServerClient();
    const recipients = body.recipients || [{ name: body.name, email: body.email, role: body.role, user_id: body.user_id }];
    const expiryHours = body.expiry_hours || 24;
    const expiresAt = new Date(Date.now() + expiryHours * 3600000).toISOString();
    const created: any[] = [];

    for (const r of recipients) {
      const token = crypto.randomBytes(32).toString('hex');
      const { data, error } = await db.from('network_access_tokens').insert({
        tenant_id: user.tenantId,
        project_id: body.project_id,
        connection_id: body.connection_id,
        token,
        issued_to_user_id: r.user_id || null,
        issued_to_name: r.name || null,
        issued_to_email: r.email || null,
        issued_to_role: r.role || null,
        expires_at: expiresAt,
        message: body.message || null,
        status: 'active',
        created_by: user.id,
      }).select().single();
      if (error) { console.error('[access-tokens] insert error:', error.message); continue; }
      created.push(data);
    }

    return NextResponse.json({ success: true, tokens: created, count: created.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
