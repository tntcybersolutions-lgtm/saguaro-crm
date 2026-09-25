import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * Account deletion — App Store Guideline 5.1.1(v).
 *
 * Apple requires that an app which lets you CREATE an account also lets you
 * DELETE it from inside the app. Not an email link, not a support request: a
 * control in the app that actually removes the account. An app without one is
 * rejected, and the rejection is automatic.
 *
 * A construction CRM makes this less trivial than a consumer app, because the
 * person deleting their account is usually not the only one who depends on the
 * data. Two cases, and the user is told which one they are in BEFORE they
 * confirm (see GET below):
 *
 *   member    — other people still work in this company. Their own account goes
 *               immediately. The company's projects, pay applications and daily
 *               logs stay with the company, because those records are the
 *               company's, not theirs. This is what an App Review reviewer
 *               expects from a team product and it is what a GC would expect if
 *               a superintendent quit.
 *
 *   workspace — they are the last member. Their account still goes immediately,
 *               and the whole workspace is scheduled for deletion. It is not
 *               destroyed in the same breath: certified payroll, lien waivers
 *               and pay applications carry statutory retention, and the privacy
 *               policy already promises thirty days. So the tenant is marked
 *               deleted, nothing can sign into it again, and the purge runs on
 *               the date recorded here.
 *
 * In both cases the auth user is deleted, so the credential stops working the
 * moment this returns. That is the part Apple actually checks.
 */

const PURGE_DAYS = 30;

/** Tell the caller what deleting their account will actually do. */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data: members, error } = await db
      .from('profiles')
      .select('id')
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    const others = (members || []).filter((m: { id: string }) => m.id !== user.id).length;
    const lastMember = others === 0;

    return NextResponse.json({
      email: user.email,
      otherMembers: others,
      scope: lastMember ? 'workspace' : 'member',
      purgeDays: PURGE_DAYS,
      /* Written to be read on a phone by someone who is about to do something
         irreversible. No jargon, no "tenant", and it says what SURVIVES as
         plainly as what goes — that is the part people actually want to know. */
      summary: lastMember
        ? `You are the only person on this account. Deleting it signs you out for good and schedules this company's projects, photos, logs and documents for permanent deletion in ${PURGE_DAYS} days. Records we are required by law to keep, such as certified payroll and lien waivers, are kept until that obligation ends and are not used for anything else.`
        : `Your sign-in and your personal profile are deleted right away. The company's projects, daily logs, photos and pay applications stay with the ${others === 1 ? 'other person' : `${others} other people`} on this account — that work belongs to the company, not to your login.`,
    });
  } catch (e) {
    return apiError('account/delete:preview', e, 'Could not check this account');
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: Record<string, unknown> = await req.json().catch(() => ({}));

  /* Typing your own email is the confirmation. A checkbox is too easy to hit by
     accident on a phone held in a work glove, and this cannot be undone. */
  const typed = String(body.confirm_email ?? body.confirmEmail ?? '').trim().toLowerCase();
  if (!typed) {
    return NextResponse.json({ error: 'confirm_email is required' }, { status: 400 });
  }
  if (!user.email || typed !== user.email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: 'That is not the email address on this account.' },
      { status: 400 },
    );
  }

  try {
    const db = createServerClient();

    const { data: members, error: mErr } = await db
      .from('profiles')
      .select('id')
      .eq('tenant_id', user.tenantId);
    /* If we cannot tell whether anyone else is on this account we cannot tell
       whether deleting it takes the company with it. Stop rather than guess. */
    if (mErr) throw mErr;

    const lastMember = (members || []).filter((m: { id: string }) => m.id !== user.id).length === 0;
    const scope: 'member' | 'workspace' = lastMember ? 'workspace' : 'member';
    const purgeAfter = new Date(Date.now() + PURGE_DAYS * 86_400_000).toISOString();

    /* Record the request FIRST. If the auth delete succeeds and this row was
       never written, the account is gone with no trace of why — support could
       not answer the person, and the purge would never run. */
    const { error: logErr } = await db.from('account_deletion_requests').insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      email: user.email ?? null,
      scope,
      purge_after: lastMember ? purgeAfter : null,
      source: String(body.source ?? 'app'),
    } as never);
    if (logErr) throw logErr;

    if (lastMember) {
      const { error: tErr } = await db
        .from('tenants')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', user.tenantId);
      if (tErr) throw tErr;
    }

    // The personal record goes now, in both cases.
    const { error: pErr } = await db.from('profiles').delete().eq('id', user.id);
    if (pErr) throw pErr;

    /* The credential itself. Everything above is bookkeeping; this is the line
       that makes the account actually deleted, and it is what a reviewer tests
       by trying to sign back in. */
    const { error: aErr } = await db.auth.admin.deleteUser(user.id);
    if (aErr) throw aErr;

    return NextResponse.json({
      deleted: true,
      scope,
      purgeAfter: lastMember ? purgeAfter : null,
    });
  } catch (e) {
    return apiError('account/delete', e, 'Could not delete the account');
  }
}
