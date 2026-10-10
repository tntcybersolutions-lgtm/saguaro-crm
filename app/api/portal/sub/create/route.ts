import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendSubPortalInvite } from '@/lib/email';
import { randomUUID } from 'crypto';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

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

    // Retire this company's earlier links on this job before issuing a new one,
    // so a re-invite never leaves two working tokens behind.
    //  • by roster sub, when there is one;
    //  • by invited email, always. An email-only invite has sub_id = null, so
    //    the sub_id pass alone never matched it and every re-invite stacked
    //    another active token. sub_email is stored lower-cased and trimmed
    //    (see the insert below), so an exact match finds every earlier one.
    const inviteEmail = String(email).toLowerCase().trim();
    if (resolvedSubId) {
      await must(db
        .from('portal_sub_sessions')
        .update({ status: 'inactive' })
        .eq('sub_id', resolvedSubId)
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId), 'portal_sub_sessions write');
    }
    if (inviteEmail) {
      await must(db
        .from('portal_sub_sessions')
        .update({ status: 'inactive' })
        .eq('sub_email', inviteEmail)
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .eq('status', 'active'), 'portal_sub_sessions write');
    }

    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

    const { data: session, error: insertError } = await db
      .from('portal_sub_sessions')
      .insert({
        tenant_id:  user.tenantId,
        project_id: projectId,
        sub_id:     resolvedSubId,
        sub_company: companyName || null,
        sub_contact_name: contactName || null,
        sub_email: inviteEmail || null,
        token,
        status:     'active',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const portalUrl = `${appUrl}/portals/sub/${token}`;

    // Get GC company name for the email
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, company')
      .eq('id', user.id)
      .maybeSingle();
    const gcCompanyName = (profile as { company?: string; full_name?: string } | null)?.company
      || (profile as { company?: string; full_name?: string } | null)?.full_name
      || 'Your General Contractor';

    // Fire invite email — track actual send result
    let emailSent = false;
    if (process.env.RESEND_API_KEY && email) {
      try {
        await sendSubPortalInvite({
          to: email.toLowerCase().trim(),
          contactName: contactName || '',
          companyName: companyName || email,
          gcCompanyName,
          projectName: project.name,
          portalUrl,
        });
        emailSent = true;
      } catch (err) {
        console.warn('[portal/sub/create] email send failed:', err);
        emailSent = false;
      }
    }

    return NextResponse.json({
      session,
      portalUrl,
      projectName: project.name,
      companyName: companyName || null,
      contactName: contactName || null,
      emailSent,
      emailWarning: !emailSent ? 'Email could not be sent. Share the portal link manually.' : undefined,
    });
  } catch (err: unknown) {
    return apiError('portal/sub/create', err, "Couldn't create the portal link. Please try again.");
  }
}
