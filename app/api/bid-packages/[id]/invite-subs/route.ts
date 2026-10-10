import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { logActivity } from '@/lib/activity';
import { normalizeSubs, sendJacket, jacketSendResponse } from '@/lib/bid-issue';

/**
 * POST /api/bid-packages/[id]/invite-subs — invite subcontractors to bid.
 *
 * Body: { subs: [{ email, name?, company?, contactName?, phone?, subId? }], force?: boolean }
 *
 * This route used to email the portal link the instant a sub was added and
 * flip the package to 'open'. The wizard calls it straight after creating a
 * package, so 48 packages reached bidders without the completeness check
 * /issue applies and without any record of what was sent — and a later /issue
 * emailed every one of them again.
 *
 * It now sends through the same path as /issue (lib/bid-issue):
 *
 *   • package not issued yet → inviting issues it, now. An incomplete jacket
 *     is answered 409 with the empty sections named (nothing is written), and
 *     `force: true` is the GC's "send anyway". The jacket is snapshotted as v1
 *     and the bidder portal switched on before anyone is emailed.
 *   • already issued → just these subs are sent the issued jacket. Anyone named
 *     who already holds it is not emailed again.
 *
 * Re-inviting someone already on the package refreshes their contact details
 * and never resets a bid in or a decline back to 'invited'. The answer names
 * every sub: emailed, failed (why), or already had it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { valid, invalid } = normalizeSubs(body.subs);
    if (!valid.length) {
      return NextResponse.json(
        { error: invalid.length ? 'None of those are usable email addresses.' : 'subs is required', invalid },
        { status: 400 },
      );
    }

    const result = await sendJacket(createServerClient(), {
      tenantId: user.tenantId,
      packageId: id,
      subs: body.subs,
      force: body.force === true,
      scope: 'named',
    });

    if (result.kind === 'sent') {
      /* Who was asked to bid, and when — one history line for the batch. */
      const emailed = result.delivery.filter((d) => d.sent);
      if (emailed.length) {
        void logActivity({
          tenantId: user.tenantId,
          projectId: result.pkg.project_id ?? null,
          userId: user.id,
          userName: user.email,
          action: 'invited',
          entityType: 'bid_package',
          entityId: id,
          description: `Invited ${emailed.length} sub${emailed.length === 1 ? '' : 's'} to bid ${result.pkg.name || result.pkg.trade || 'a package'}`,
          metadata: { emails: emailed.map((d) => d.email), trade: result.pkg.trade ?? null, issuedNow: result.issuedNow, version: result.version },
        });
      }
    }

    /* `results` keeps the shape older callers read. */
    const results = result.kind === 'sent'
      ? [
          ...result.delivery.map((d) => ({ email: d.email, status: d.sent ? 'invited' : 'error', ...(d.error ? { error: d.error } : {}) })),
          ...result.skipped.map((d) => ({ email: d.email, status: 'already_invited' })),
          ...result.invalid.map((d) => ({ email: d.email, status: 'error', error: d.error })),
        ]
      : undefined;
    return jacketSendResponse(result, results ? { results } : {});
  } catch (e) {
    return apiError('bid_package_invites', e, 'The invitations could not be sent. Try again — nobody who already has the jacket will be emailed twice.');
  }
}
