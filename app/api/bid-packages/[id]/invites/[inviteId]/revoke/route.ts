import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { logActivity } from '@/lib/activity';
import { inviteState } from '@/lib/bid-invite-state';

/**
 * POST /api/bid-packages/[id]/invites/[inviteId]/revoke — cut off one
 * bidder's link.
 *
 * The jacket read and the respond route have always refused a 'revoked'
 * invite, but nothing could ever write it: the status CHECK constraint allowed
 * only suggested / invited / viewed / submitted / declined. A link sent to the
 * wrong address, or to a sub the GC has since dropped, stayed live until the
 * package closed. supabase/migrations/20261010_bid_invite_revoked.sql adds the
 * value; until it is applied this answers 503 and changes nothing.
 *
 * A bid already in stays on the leveling sheet — revoking stops the link, it
 * does not delete what the sub sent. Inviting the same address again restores
 * the link (lib/bid-issue).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id, inviteId } = await params;

  try {
    const db = createServerClient();
    const { data: invite, error } = await db
      .from('bid_package_invites')
      .select('id, status, response_status, sub_email, company_name, sub_name, bid_package_id')
      .eq('id', inviteId)
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!invite) return NextResponse.json({ error: 'That invitation is not on this bid package.' }, { status: 404 });
    const inv = invite as Record<string, any>;
    const who = inv.company_name || inv.sub_name || inv.sub_email || 'This bidder';

    if (inviteState(inv) === 'revoked') {
      return NextResponse.json({ success: true, alreadyRevoked: true, message: `${who}'s link was already revoked.` });
    }

    try {
      await must(
        db.from('bid_package_invites')
          .update({ status: 'revoked', response_status: 'revoked' } as never)
          .eq('id', inviteId)
          .eq('tenant_id', user.tenantId),
        'bid_package_invites revoke',
      );
    } catch (e) {
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
      if (code === '23514') {
        console.error('[bid-packages/revoke] revoked not allowed yet — migration 20261010_bid_invite_revoked.sql not applied', e);
        return NextResponse.json(
          { error: 'Revoking a link needs a database update that has not been applied yet. Nothing was changed — the link still works.' },
          { status: 503 },
        );
      }
      throw e;
    }

    /* num_invited counts the people who can still open the package. */
    const { count, error: countErr } = await db
      .from('bid_package_invites')
      .select('id', { count: 'exact', head: true })
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .neq('status', 'revoked');
    if (countErr) throw countErr;
    await must(
      db.from('bid_packages').update({ num_invited: count ?? 0 } as never).eq('id', id).eq('tenant_id', user.tenantId),
      'bid_packages num_invited',
    );

    void logActivity({
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.email,
      action: 'revoked',
      entityType: 'bid_package',
      entityId: id,
      description: `Revoked ${who}'s bid link`,
      metadata: { inviteId, email: inv.sub_email ?? null, was: inviteState(inv) },
    });

    return NextResponse.json({ success: true, message: `${who}'s link is revoked. It no longer opens the jacket.` });
  } catch (e) {
    return apiError('bid-packages/revoke', e, 'The link could not be revoked. It still works — try again.');
  }
}
