import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onSubInvitedToBid } from '@/lib/triggers';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { tryWrite } from '@/lib/db-write';
import { logActivity } from '@/lib/activity';

/**
 * POST /api/bid-packages/[id]/invite-subs
 *
 * Invites subcontractors to bid. This is the GC half of the loop; the sub half
 * reads the same table through the portal.
 *
 * Two things were wrong here, and together they meant no invitation could ever
 * reach a bidder:
 *
 *   1. `const tenantId = user?.id || pkg?.tenant_id`. user.id is the AUTH USER
 *      id, not the tenant — getUser returns them as separate fields. It is also
 *      always truthy for a signed-in caller, so the `|| pkg.tenant_id` fallback
 *      never once ran. Every invite was written under a tenant_id that belongs
 *      to no tenant, so every later query filtering on tenant_id missed it.
 *
 *   2. Only sub_name / sub_email / status were written. token was left to its
 *      column default and never used, and trade, company_name, contact_name,
 *      contact_phone and invitation_sent_at were left null — so the invite
 *      email had nothing to address and nothing to link to.
 *
 * The read-then-insert also raced: two clicks a second apart both saw no
 * existing row and both inserted. There is a unique index on
 * (bid_package_id, sub_email), so the second one failed and reported "Invite
 * could not be sent" for a sub who was in fact already invited. Upsert instead.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const db = createServerClient();

    /* The package must belong to the caller before anything is written against
       it — id comes from the URL and this client is the service role key. */
    const { data: pkg } = await db
      .from('bid_packages')
      .select('id, tenant_id, project_id, trade, name, status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    const p = pkg as Record<string, unknown>;

    const subs = Array.isArray(body.subs) ? body.subs : [];
    if (!subs.length) {
      return NextResponse.json({ error: 'subs is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results: Array<{ email: string; status: string; error?: string }> = [];
    const mails: Promise<void>[] = [];

    for (const sub of subs as Array<Record<string, string | undefined>>) {
      const email = String(sub.email || '').trim().toLowerCase();
      if (!email) { results.push({ email: '', status: 'error', error: 'Email is required.' }); continue; }

      /* Upsert on the unique (bid_package_id, sub_email) pair: re-inviting a sub
         refreshes their invite rather than failing as a duplicate. The stored
         token is preserved by leaving it out of the update — re-inviting must
         not invalidate a link the sub may already have open. */
      const { data: invite, error } = await db
        .from('bid_package_invites')
        .upsert(
          {
            tenant_id: user.tenantId,
            bid_package_id: id,
            sub_id: sub.subId || null,
            sub_name: sub.name || sub.company || email,
            sub_email: email,
            company_name: sub.company || sub.name || null,
            contact_name: sub.contactName || sub.name || null,
            contact_phone: sub.phone || null,
            trade: (p.trade as string) || null,
            status: 'invited',
            response_status: 'invited',
            invitation_sent_at: now,
          } as never,
          { onConflict: 'bid_package_id,sub_email' },
        )
        .select()
        .single();

      if (error) {
        /* The GC needs to know WHICH sub failed, not what the database said
           about it — that text names tables and constraints. */
        console.error('[bid-packages/invite-subs]', email, error.message);
        results.push({ email, status: 'error', error: 'Invite could not be sent.' });
        continue;
      }

      results.push({ email, status: 'invited' });
      mails.push(onSubInvitedToBid(id, (invite as Record<string, string>).id).catch((e) =>
        console.error('[bid-packages/invite-subs] email failed', email, e),
      ));
    }
    /* Wait for the invitations to go out (and onto the jacket's record) before
       answering: a serverless function is frozen once it has responded, so an
       un-awaited send could be cut off half way. */
    await Promise.all(mails);

    /* Who was asked to bid, and when — the record a GC needs when a package
       comes back with two responses and they cannot remember who else was on
       it. One line for the batch, not one per sub: inviting five companies is
       a single act. */
    const invitedNow = results.filter(r => r.status === 'invited');
    if (invitedNow.length) {
      const p = pkg as Record<string, any>;
      void logActivity({
        tenantId: user.tenantId,
        projectId: p?.project_id ?? null,
        userId: user.id,
        userName: user.email,
        action: 'invited',
        entityType: 'bid_package',
        entityId: id,
        description: `Invited ${invitedNow.length} sub${invitedNow.length === 1 ? '' : 's'} to bid ${p?.name || p?.trade || 'a package'}`,
        metadata: { emails: invitedNow.map(r => r.email), trade: p?.trade ?? null },
      });
    }

    /* num_invited is read by the package list and the jacket cover; leaving it
       stale showed "0 invited" on a package with a full bidder list. */
    const { count } = await db
      .from('bid_package_invites')
      .select('id', { count: 'exact', head: true })
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId);

    /* tryWrite, not a bare await: supabase-js returns { error } rather than
       throwing, so a failed counter update would vanish and the package would
       keep reporting "0 invited" with a full bidder list. The invites
       themselves are already committed, so this must not fail the request —
       but it must not fail silently either. */
    await tryWrite(
      db.from('bid_packages')
        .update({
          num_invited: count ?? results.filter((r) => r.status === 'invited').length,
          invite_sent_at: now,
          /* Inviting a subcontractor IS granting them portal access — the two
             are the same act. sub_portal_enabled defaults to false and nothing
             had ever set it, so a portal that honoured it would refuse every
             invite link ever issued. Setting it here makes the flag mean what
             it says, and leaves it available as a genuine kill switch: a GC
             who sets it false shuts the whole package's portal off. */
          sub_portal_enabled: true,
          /* A package goes OUT FOR BID when the first invite goes out — not when
             it is written. Auto-built packages are created 'draft' (ready, not
             sent), and the sub portal refuses to take a bid on a draft, so
             without this flip every invited sub would hit "not issued yet".
             Only draft/pending/unset move; closed/awarded are never reopened. */
          ...(invitedNow.length > 0 && ['', 'draft', 'pending'].includes(String((pkg as Record<string, unknown>).status ?? '').toLowerCase())
            ? { status: 'open' }
            : {}),
        } as never)
        .eq('id', id)
        .eq('tenant_id', user.tenantId),
      'bid_packages num_invited',
    );

    return NextResponse.json({ results, invited: results.filter((r) => r.status === 'invited').length, success: true });
  } catch (e) {
    return apiError('bid_package_invites', e);
  }
}
