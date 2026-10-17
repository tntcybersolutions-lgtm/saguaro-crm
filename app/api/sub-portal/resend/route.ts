import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendSubPortalInvite } from '@/lib/email';
import { apiError } from '@/lib/api-error';
import { subPortalExpiry } from '@/lib/sub-portal-expiry';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * POST /api/sub-portal/resend
 * Body: { userId }
 * Re-sends the sub portal invite email to the given portal user.
 * Returns { success, sentTo }.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requirePermission(req, 'Projects', 'Full');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const db = createServerClient();

    // Look up the sub portal user (tenant-scoped).
    const { data: portalUser, error: puErr } = await db
      .from('portal_users')
      .select('*')
      .eq('id', userId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (puErr) throw puErr;

    if (!portalUser) return NextResponse.json({ error: 'Portal user not found' }, { status: 404 });

    const pu = portalUser as Record<string, any>;
    const to: string | undefined = pu.email;
    if (!to) return NextResponse.json({ error: 'No email address on file for this user' }, { status: 400 });

    // GC company name from the current user's profile.
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, company')
      .eq('id', user.id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    const prof = (profile || {}) as Record<string, any>;
    const gcCompanyName = prof.company || prof.full_name || 'Your General Contractor';

    // Project name (optional).
    let projectName = 'Your Project';
    if (pu.project_id) {
      const { data: project } = await db
        .from('projects')
        .select('name')
        .eq('id', pu.project_id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      projectName = (project as Record<string, any> | null)?.name || projectName;
    }

    const portalUrl = pu.token
      ? `${APP_URL}/portals/sub/${pu.token}`
      : `${APP_URL}/portals/sub/login`;
    // Re-sending a link reissues it for another 90 days (lib/sub-portal-expiry).
    if (pu.token) {
      const { error: expErr } = await db
        .from('portal_sub_sessions')
        .update({ expires_at: subPortalExpiry() } as never)
        .eq('token', String(pu.token))
        .eq('tenant_id', user.tenantId)
        .eq('status', 'active');
      if (expErr) throw expErr;
    }

    const mail = await sendSubPortalInvite({
      to,
      contactName: pu.name || '',
      companyName: pu.company || pu.name || to,
      gcCompanyName,
      projectName,
      portalUrl,
      isResend: true,
    });
    // "Sent" only when it was: the button used to say so even when nothing left.
    if (!mail.sent) return NextResponse.json({ error: mail.error || 'The invite was not sent.', sentTo: to }, { status: 502 });

    return NextResponse.json({ success: true, sentTo: to });
  } catch (err) {
    return apiError('sub-portal/resend', err);
  }
}
