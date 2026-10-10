import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { sendJacket, jacketSendResponse } from '@/lib/bid-issue';

/**
 * POST /api/bid-packages/[id]/issue — send the jacket out.
 *
 * The verb the module never had: "this is the jacket, it is complete, it goes
 * to these bidders, as of now". The work lives in lib/bid-issue, which
 * invite-subs uses too, so there is one send path and it always passes the
 * same gate:
 *
 *   1. REFUSES AN INCOMPLETE JACKET. A required section that is empty is
 *      answered 409 and named. `force: true` sends anyway, because sometimes a
 *      GC genuinely is issuing scope-only for pricing.
 *   2. SNAPSHOTS A MANIFEST — what was in the jacket, as v1, as of now — so a
 *      drawing revised later shows as drift instead of silently changing what
 *      everyone is pricing.
 *   3. FANS OUT and reports honestly: every invitee is named as emailed, failed
 *      (with the reason) or already holding the issued jacket. Issuing again
 *      sends only to the ones who do not hold it — a retry, never a repeat.
 *
 * Body: { force?: boolean, subs?: [{ email, name?, company?, contactName?, phone?, subId? }] }
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await sendJacket(createServerClient(), {
      tenantId: user.tenantId,
      packageId: id,
      subs: body.subs,
      force: body.force === true,
      scope: 'all',
    });
    return jacketSendResponse(result);
  } catch (e) {
    return apiError('bid_package_issue', e, 'The jacket could not be issued. Try again — nobody who already has it will be emailed twice.');
  }
}
