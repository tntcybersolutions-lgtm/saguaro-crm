import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
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

    const portalUrl = `${req.nextUrl.origin}/portals/client/${token}`;

    return NextResponse.json({
      session,
      portalUrl,
      projectName: project.name,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create portal access';
    console.error('[portal/client/create]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
