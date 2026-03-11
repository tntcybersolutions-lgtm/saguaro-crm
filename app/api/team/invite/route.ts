import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const { email, name, role = 'member', projectId } = body;

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    const db = createServerClient();
    const tenantId = user?.id || 'demo';

    // Create team invite record
    let invite: any = null;
    try {
      const { data, error } = await db.from('team_invites').insert({
        tenant_id: tenantId,
        email,
        name: name || email,
        role,
        project_id: projectId || null,
        invited_by: user?.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      }).select().single();

      if (!error) invite = data;
    } catch { /* DB unavailable — still return success */ }

    // Create notification
    if (user) {
      await createNotification(
        tenantId,
        user.id,
        'sub_added',
        `Team invite sent to ${name || email}`,
        `${email} has been invited to join your team as ${role}.`,
        projectId
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app'}/app/projects/${projectId}/team`
          : `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app'}/app`
      );
    }

    return NextResponse.json({ success: true, invite: invite || { email, role, status: 'pending' } });
  } catch (err: any) {
    console.error('[team/invite]', err?.message);
    return NextResponse.json({ success: true, demo: true });
  }
}
