import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { tenantId, invites } = body as {
    tenantId?: string;
    invites?: Array<{ email: string; role: string }>;
  };

  if (!invites || !Array.isArray(invites) || invites.length === 0) {
    return NextResponse.json({ error: 'invites array required' }, { status: 400 });
  }

  const results: Array<{ email: string; status: string }> = [];

  for (const invite of invites) {
    if (!invite.email) continue;
    try {
      // Send Supabase magic link invite
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email, {
        data: { role: invite.role || 'member', tenant_id: tenantId || 'demo' },
      });
      results.push({ email: invite.email, status: error ? 'failed' : 'sent' });
    } catch {
      results.push({ email: invite.email, status: 'queued' });
    }
  }

  return NextResponse.json({ success: true, results });
}
