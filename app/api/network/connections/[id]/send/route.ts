import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: connectionId } = await params;

  try {
    const body = await req.json();
    const { user_ids, expires_hours = 12, message } = body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json({ error: 'user_ids array required' }, { status: 400 });
    }

    const db = createServerClient();

    // Verify connection belongs to tenant
    const { data: conn, error: connErr } = await db
      .from('network_connections')
      .select('id, tenant_id, project_id, name')
      .eq('id', connectionId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (connErr || !conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

    const expiresAt = new Date(Date.now() + expires_hours * 3600000).toISOString();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.saguarocrm.com';
    const links: Array<{ user_id: string; url: string; expires_at: string; token_id: string }> = [];

    // Fetch user names for labeling
    const { data: profiles } = await db
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .in('id', user_ids);
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    for (const uid of user_ids) {
      const token = crypto.randomBytes(32).toString('hex');
      const profile = profileMap.get(uid);
      const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Team Member';

      const { data: tokenData, error: tErr } = await db
        .from('network_access_tokens')
        .insert({
          tenant_id: user.tenantId,
          project_id: conn.project_id,
          connection_id: connectionId,
          token,
          issued_to_user_id: uid,
          issued_to_name: name,
          issued_to_email: profile?.email || null,
          issued_to_role: profile?.role || null,
          expires_at: expiresAt,
          message: message || null,
          status: 'active',
          label: `Sent by ${user.email}`,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (tErr) { console.error('[send] token insert error:', tErr.message); continue; }

      const connectUrl = `${appUrl}/field/network/connect?token=${token}`;
      links.push({ user_id: uid, url: connectUrl, expires_at: expiresAt, token_id: tokenData!.id });

      // Create in-app notification
      await db.from('notifications').insert({
        tenant_id: user.tenantId,
        user_id: uid,
        title: 'Network Access Ready',
        body: `WiFi access for ${conn.name}: ${connectUrl}`,
        type: 'network_access',
        link: connectUrl,
        created_by: user.id,
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ success: true, tokens_created: links.length, links });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
