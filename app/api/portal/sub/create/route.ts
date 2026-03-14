import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/sub/create
 * GC creates portal access for a subcontractor.
 * Body: { projectId, subId?, companyName, contactName, email }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, subId, companyName, contactName, email } = await req.json();

    if (!projectId || !email) {
      return NextResponse.json(
        { error: 'projectId and email are required' },
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

    // Look up or resolve sub_id
    let resolvedSubId = subId;
    if (!resolvedSubId && email) {
      const { data: sub } = await db
        .from('subcontractors')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      resolvedSubId = sub?.id || null;
    }

    // Deactivate existing sessions for this email + project
    if (resolvedSubId) {
      await db
        .from('portal_sub_sessions')
        .update({ status: 'inactive' })
        .eq('sub_id', resolvedSubId)
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId);
    }

    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

    const { data: session, error: insertError } = await db
      .from('portal_sub_sessions')
      .insert({
        tenant_id:  user.tenantId,
        project_id: projectId,
        sub_id:     resolvedSubId,
        token,
        status:     'active',
        created_by: user.id,
        // Store name/email in metadata columns if they exist, otherwise just use sub_id
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const portalUrl = `${req.nextUrl.origin}/portals/subcontractor/${token}`;

    return NextResponse.json({
      session,
      portalUrl,
      projectName: project.name,
      companyName: companyName || null,
      contactName: contactName || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create portal access';
    console.error('[portal/sub/create]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
