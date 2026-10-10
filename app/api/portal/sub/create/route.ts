import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendSubPortalInvite } from '@/lib/email';
import { randomUUID } from 'crypto';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { orValue } from '@/lib/pg-filter';

export const dynamic = 'force-dynamic';

type Db = ReturnType<typeof createServerClient>;
type SubMatch = { id: string; email: string | null; contact_email: string | null; updated_at: string | null; created_at: string | null };

/** Newest first by updated_at, then created_at (missing dates last), then id — a total order. */
function newestFirst(a: SubMatch, b: SubMatch): number {
  const t = (v: string | null) => {
    const n = v ? Date.parse(v) : NaN;
    return Number.isFinite(n) ? n : -Infinity;
  };
  return (t(b.updated_at) - t(a.updated_at)) || (t(b.created_at) - t(a.created_at)) || a.id.localeCompare(b.id);
}

/**
 * The roster subcontractor an invited email belongs to, or null when none.
 * Matches subcontractors.email OR contact_email, case-insensitively, inside
 * this tenant only. A real lookup error is thrown, never read as "no sub".
 *
 * When more than one sub carries the address (two divisions of one company,
 * a bookkeeper who files for several), the pick is deterministic: a sub on
 * THIS project's roster (project_subcontractors) wins; among several — or
 * when none is on the job — the most recently updated one, then the most
 * recently created, then the lowest id.
 */
async function rosterSubForEmail(db: Db, tenantId: string, projectId: string, inviteEmail: string): Promise<string | null> {
  const v = orValue(inviteEmail);
  if (!v) return null;
  const { data, error } = await db
    .from('subcontractors')
    .select('id, email, contact_email, updated_at, created_at')
    .eq('tenant_id', tenantId)
    .or(`email.ilike.${v},contact_email.ilike.${v}`)
    .limit(50);
  if (error) throw error;
  // ilike reads _ and % as wildcards; keep only real (case-insensitive) matches.
  const same = (e: string | null) => String(e ?? '').trim().toLowerCase() === inviteEmail;
  const matches = ((data ?? []) as SubMatch[]).filter((s) => same(s.email) || same(s.contact_email));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  const { data: onJob, error: rosterErr } = await db
    .from('project_subcontractors')
    .select('subcontractor_id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .in('subcontractor_id', matches.map((m) => m.id));
  if (rosterErr) throw rosterErr;
  const onJobIds = new Set(((onJob ?? []) as { subcontractor_id: string }[]).map((r) => r.subcontractor_id));
  const pool = matches.some((m) => onJobIds.has(m.id)) ? matches.filter((m) => onJobIds.has(m.id)) : matches;
  return [...pool].sort(newestFirst)[0].id;
}

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
    const { data: project, error: projectErr } = await db
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (projectErr) throw projectErr;

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const inviteEmail = String(email).toLowerCase().trim();

    // Look up or resolve sub_id from the invited email — on either email
    // column of the roster. This used to match subcontractors.email only, so a
    // sub whose address sat in contact_email was missed, and it ignored the
    // lookup's error: two subs sharing the address made maybeSingle() fail,
    // the error was dropped, and the invite silently went out email-only.
    /* A subId from the request must be one of THIS company's subs — it used to
       be stored as sent, so a crafted request could tie the portal session
       (and everything the sub files through it) to another company's sub. */
    if (subId) {
      const { data: own, error: ownErr } = await db
        .from('subcontractors')
        .select('id')
        .eq('id', subId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (ownErr) throw ownErr;
      if (!own) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
    }
    let resolvedSubId: string | null = subId || null;
    if (!resolvedSubId && inviteEmail) {
      resolvedSubId = await rosterSubForEmail(db, user.tenantId, projectId, inviteEmail);
    }

    // Retire this company's earlier links on this job before issuing a new one,
    // so a re-invite never leaves two working tokens behind.
    //  • by roster sub, when there is one;
    //  • by invited email, always. An email-only invite has sub_id = null, so
    //    the sub_id pass alone never matched it and every re-invite stacked
    //    another active token. sub_email is stored lower-cased and trimmed
    //    (see the insert below), so an exact match finds every earlier one.
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
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('full_name, company')
      .eq('id', user.id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (profileErr) console.error('[portal/sub/create] profile read', profileErr);
    const gcCompanyName = (profile as { company?: string; full_name?: string } | null)?.company
      || (profile as { company?: string; full_name?: string } | null)?.full_name
      || 'Your General Contractor';

    // The invite email — reported as sent only when the provider accepted it.
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const mail = await sendSubPortalInvite({
        to: inviteEmail,
        contactName: contactName || '',
        companyName: companyName || email,
        gcCompanyName,
        projectName: project.name,
        portalUrl,
      });
      emailSent = mail.sent;
      emailError = mail.error;
    } catch (err) {
      console.error('[portal/sub/create] email send failed:', err);
    }
    if (!emailSent) console.error('[portal/sub/create] invite not emailed to', inviteEmail, '-', emailError);

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
