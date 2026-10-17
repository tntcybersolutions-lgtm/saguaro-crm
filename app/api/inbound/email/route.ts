/**
 * POST /api/inbound/email — Resend inbound webhook (`email.received`).
 *
 * An architect / engineer / owner answers an RFI, reviews a submittal or
 * comments on a change order by replying to the email they got. The reply is
 * addressed to `reply+<token>@<INBOUND_REPLY_DOMAIN>` (lib/inbound-reply/token);
 * this route posts it on the item.
 *
 * Public by design — the sender has no login. Two checks stand in for one:
 *   1. the request is Resend's: Svix signature with RESEND_INBOUND_WEBHOOK_SECRET
 *      over the RAW body (401 otherwise);
 *   2. the token is ours and names the item: HMAC with INBOUND_REPLY_SECRET,
 *      checked against the item's own tenant, plus the sender must be the
 *      person the email went to or on the item's distribution
 *      (lib/inbound-reply/server).
 * CLAUDE.md §3: the token-route exception — every query after the token check
 * is scoped to the item's tenant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySvix } from '@/lib/inbound-reply/svix';
import { handleInboundEmail } from '@/lib/inbound-reply/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const check = verifySvix(
    process.env.RESEND_INBOUND_WEBHOOK_SECRET,
    { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    raw,
  );
  if (!check.ok) {
    console.warn('[inbound-email] webhook refused:', check.reason);
    // Not configured is a 503 (Resend retries once it is set); a bad signature is a 401.
    return NextResponse.json({ error: 'Invalid webhook' }, { status: check.reason === 'no_secret' ? 503 : 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.warn('[inbound-email] body is not JSON', e);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const outcome = await handleInboundEmail(event);
  return NextResponse.json({ status: outcome.status, ...(outcome.reason ? { reason: outcome.reason } : {}) }, { status: outcome.http });
}
