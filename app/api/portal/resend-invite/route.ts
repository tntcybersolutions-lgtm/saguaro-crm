import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendClientPortalInvite, sendSubPortalInvite } from '@/lib/email';

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
      .from('user_profiles')
      .select('full_name, company_name')
      .eq('user_id', user.id)
      .maybeSingle();
    const gcCompanyName = (profile as { company_name?: string; full_name?: string } | null)?.company_name
      || (profile as { company_name?: string; full_name?: string } | null)?.full_name
      || 'Your General Contractor';

    if (type === 'client') {
      const { data: session } = await db
        .from('portal_client_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('tenant_id', user.tenantId)
        .single();

      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const { data: project } = await db
        .from('projects').select('name').eq('id', session.project_id).maybeSingle();

      await sendClientPortalInvite({
        to: session.client_email,
        clientName: session.client_name,
        gcCompanyName,
        projectName: project?.name || 'Your Project',
        portalUrl: `${appUrl}/portals/client/${session.token}`,
        expiresAt: session.expires_at,
        isResend: true,
      });

      return NextResponse.json({ success: true, sentTo: session.client_email });

    } else {
      const { data: session } = await db
        .from('portal_sub_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('tenant_id', user.tenantId)
        .single();

      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const [{ data: project }, { data: sub }] = await Promise.all([
        db.from('projects').select('name').eq('id', session.project_id).maybeSingle(),
        session.sub_id
          ? db.from('subcontractors').select('company_name, contact_name, email').eq('id', session.sub_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (!sub?.email) {
        return NextResponse.json({ error: 'No email address found for this subcontractor' }, { status: 400 });
      }

      await sendSubPortalInvite({
        to: sub.email,
        contactName: sub.contact_name || '',
        companyName: sub.company_name || sub.email,
        gcCompanyName,
        projectName: project?.name || 'Your Project',
        portalUrl: `${appUrl}/portals/subcontractor/${session.token}`,
        isResend: true,
      });

      return NextResponse.json({ success: true, sentTo: sub.email });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to resend invite';
    console.error('[portal/resend-invite]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
