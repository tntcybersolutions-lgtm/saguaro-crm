import { NextRequest, NextResponse } from 'next/server';
import { companyDisplayName } from '@/lib/company-name';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendClientPortalInvite, sendSubPortalInvite } from '@/lib/email';
import { apiError } from '@/lib/api-error';
import { subPortalExpiry } from '@/lib/sub-portal-expiry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/resend-invite
 * Resend the portal invitation email for an existing session.
 * Body: { sessionId, type: 'client' | 'sub' }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'Email service not configured. Add RESEND_API_KEY to your Vercel environment variables.' },
        { status: 503 }
      );
    }

    const { sessionId, type } = await req.json();
    if (!sessionId || !type) {
      return NextResponse.json({ error: 'sessionId and type required' }, { status: 400 });
    }

    const db = createServerClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

    // Get GC company name
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, company')
      .eq('id', user.id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    // The company, not the person who clicked (live QA D18).
    const gcCompanyName = (await companyDisplayName(db as never, user.tenantId, user.id))
      || (profile as { company?: string; full_name?: string } | null)?.company
      || 'Your General Contractor';

    if (type === 'client') {
      const { data: session, error: sessErr } = await db
        .from('portal_client_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (sessErr) throw sessErr;

      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const { data: project } = await db
        .from('projects').select('name').eq('id', session.project_id).eq('tenant_id', user.tenantId).maybeSingle();

      const mail = await sendClientPortalInvite({
        to: session.client_email,
        clientName: session.client_name,
        gcCompanyName,
        projectName: project?.name || 'Your Project',
        portalUrl: `${appUrl}/portals/client/${session.token}`,
        expiresAt: session.expires_at,
        isResend: true,
      });
      if (!mail.sent) return NextResponse.json({ error: mail.error || 'The invite was not sent.', sentTo: session.client_email }, { status: 502 });

      return NextResponse.json({ success: true, sentTo: session.client_email });

    } else {
      const { data: session, error: sessErr } = await db
        .from('portal_sub_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (sessErr) throw sessErr;

      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const [{ data: project }, { data: sub }] = await Promise.all([
        db.from('projects').select('name').eq('id', session.project_id!).eq('tenant_id', user.tenantId).maybeSingle(),
        session.sub_id
          ? db.from('subcontractors').select('company_name, contact_name, email').eq('id', session.sub_id).eq('tenant_id', user.tenantId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      /* An email-only invite has no roster sub — its address is on the session.
         Requiring a roster email made "Resend" fail for every one of those. */
      const s = session as Record<string, string | null>;
      const to = sub?.email || s.sub_email;
      if (!to) {
        return NextResponse.json({ error: 'No email address found for this subcontractor' }, { status: 400 });
      }
      // A revoked link stays revoked — resending it would mail a dead link.
      if (s.status !== 'active') {
        return NextResponse.json({ error: 'This portal link was turned off. Send the sub a new invite instead.' }, { status: 409 });
      }
      /* Reissue: the link the sub gets is good for another 90 days from now,
         including one that had already expired. */
      const { error: expErr } = await db
        .from('portal_sub_sessions')
        .update({ expires_at: subPortalExpiry() } as never)
        .eq('id', sessionId)
        .eq('tenant_id', user.tenantId);
      if (expErr) throw expErr;

      const mail = await sendSubPortalInvite({
        to,
        contactName: sub?.contact_name || s.sub_contact_name || '',
        companyName: sub?.company_name || s.sub_company || to,
        gcCompanyName,
        projectName: project?.name || 'Your Project',
        portalUrl: `${appUrl}/portals/sub/${session.token}`,
        isResend: true,
        replyTo: user.email || null,
      });
      if (!mail.sent) return NextResponse.json({ error: mail.error || 'The invite was not sent.', sentTo: to }, { status: 502 });

      return NextResponse.json({ success: true, sentTo: to });
    }
  } catch (err: unknown) {
    return apiError('portal/resend-invite', err);
  }
}
