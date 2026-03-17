import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendClientPortalInvite } from '@/lib/email';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/client/create
 * GC creates portal access for a client.
 * Body: { projectId, clientName, clientEmail, expiresInDays? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, clientName, clientEmail, expiresInDays } = await req.json();

    if (!projectId || !clientName || !clientEmail) {
      return NextResponse.json(
        { error: 'projectId, clientName, and clientEmail are required' },
        { status: 400 }
      );
    }

    const db = createServerClient();

    // Verify project belongs to this tenant
    const { data: project } = await db
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Deactivate any existing sessions for this email + project
    await db
      .from('portal_client_sessions')
      .update({ status: 'inactive' })
      .eq('client_email', clientEmail.toLowerCase().trim())
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);

    // Generate secure token
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

    // Calculate expiry
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null; // null = never expires

    // Create new session
    const { data: session, error: insertError } = await db
      .from('portal_client_sessions')
      .insert({
        tenant_id:   user.tenantId,
        project_id:  projectId,
        client_name: clientName.trim(),
        client_email: clientEmail.toLowerCase().trim(),
        token,
        status: 'active',
        expires_at: expiresAt,
        permissions: ['view_project', 'approve_documents', 'view_financials', 'messaging'],
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const portalUrl = `${appUrl}/portals/client/${token}`;

    // Get GC company name for the email
    const { data: profile } = await db
      .from('user_profiles')
      .select('full_name, company_name')
      .eq('user_id', user.id)
      .maybeSingle();
    const gcCompanyName = (profile as { company_name?: string; full_name?: string } | null)?.company_name
      || (profile as { company_name?: string; full_name?: string } | null)?.full_name
      || 'Your General Contractor';

    // Fire invite email — non-blocking, never fails the request
    sendClientPortalInvite({
      to: clientEmail.toLowerCase().trim(),
      clientName: clientName.trim(),
      gcCompanyName,
      projectName: project.name,
      portalUrl,
      expiresAt: expiresAt,
    }).catch(err => console.warn('[portal/client/create] email send failed (non-fatal):', err));

    return NextResponse.json({
      session,
      portalUrl,
      projectName: project.name,
      emailSent: !!process.env.RESEND_API_KEY,
    });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[portal/client/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
