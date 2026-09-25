import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * DELETE /api/team/users/[id] — remove a person from the company account.
 *
 * There was no way to do this. An admin could invite a team member and reset
 * their password, and that was the whole lifecycle: a superintendent who quit
 * on Friday still had full access to the company's projects, contracts,
 * payroll and photos on Monday, and forever after. For a product that holds
 * pay applications and certified payroll that is not a missing feature, it is
 * an access-control hole.
 *
 * It also closes an App Store gap. The app has in-app messaging between
 * coworkers (app/conversations.tsx), which makes it a user-generated-content
 * app under Guideline 1.2, and 1.2 wants a way to remove an abusive user. In
 * this product the answer is that membership is controlled by the company's
 * own admin — which is only true if the admin can actually remove someone.
 *
 * Deliberate refusals:
 *
 *   yourself     — use Delete account. Removing yourself here would leave you
 *                  signed in with a token whose profile no longer exists,
 *                  which is a worse state than either outcome.
 *
 *   the owner    — a tenant's id is, for every tenant in this database that
 *                  owns projects, the founding user's auth id. Removing that
 *                  person is not a membership change, it is the end of the
 *                  company, and it goes through account deletion where that is
 *                  spelled out. (The FK now RESTRICTs rather than cascading,
 *                  so the database would refuse anyway — but refusing here
 *                  says why instead of surfacing a constraint violation.)
 *
 *   last member  — removing the only person leaves a workspace nobody can ever
 *                  sign into, with no way to get the data back out.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const { user } = g;

  if (!id) return NextResponse.json({ error: 'A user id is required' }, { status: 400 });

  if (id === user.id) {
    return NextResponse.json(
      { error: 'You cannot remove yourself here. Use Delete account instead.' },
      { status: 400 },
    );
  }

  if (id === user.tenantId) {
    return NextResponse.json(
      { error: 'That is the account owner. Ownership has to be transferred before they can be removed.' },
      { status: 409 },
    );
  }

  try {
    const db = createServerClient();

    /* Scoped by id AND tenant_id. An id on its own would let anyone who learns
       another company's user id remove that person. 404 rather than 403 for
       the same reason it is a 404 elsewhere: confirming the id is real but
       belongs to someone else is itself a disclosure. */
    const { data: target, error: findErr } = await db
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: members, error: cErr } = await db
      .from('profiles')
      .select('id')
      .eq('tenant_id', user.tenantId);
    if (cErr) throw cErr;
    if ((members ?? []).length <= 1) {
      return NextResponse.json(
        { error: 'This is the only person on the account. Removing them would leave it with no way in.' },
        { status: 409 },
      );
    }

    const { error: pErr } = await db.from('profiles').delete().eq('id', id).eq('tenant_id', user.tenantId);
    if (pErr) throw pErr;

    /* The credential, so access actually ends rather than merely disappearing
       from a roster. Their authored records keep their created_by id and stay
       with the company, which is correct — the daily log they wrote is the
       company's record of that day. */
    const { error: aErr } = await db.auth.admin.deleteUser(id);
    if (aErr) throw aErr;

    return NextResponse.json({ removed: true, email: target.email ?? null });
  } catch (e) {
    return apiError('team/users/remove', e, 'Could not remove that person');
  }
}
