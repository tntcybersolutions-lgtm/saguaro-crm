import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError, apiFail } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  requestByToken, effectiveStatus, recordEvent, notifySender, noteOnDeal, requestMeta, REQUEST_COLUMNS,
  type LooseDb, type SignatureRequestRow,
} from '@/lib/proposal-esign';

export const runtime = 'nodejs';

/**
 * POST /api/portals/proposal/[token]/decline — the customer says no.
 * Body: { reason? } (up to 2000 characters, shown to the sender).
 * Same token rules as signing: one conditional update while the link is open,
 * so a declined link can never be signed afterwards (the sender resends).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!checkRateLimit(`proposal-decline:${getClientIP(req)}`, 10, 60_000).allowed) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
  }
  const { token } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;

  try {
    const db = createServerClient() as LooseDb;
    const r = await requestByToken(db, token);
    if (!r) return apiFail('This signing link is not valid.', 404);
    const state = effectiveStatus(r);
    if (state === 'signed') return apiFail('This proposal is already signed.', 409);
    if (state === 'declined') return apiFail('This proposal was already declined.', 409);
    if (state === 'voided') return apiFail('The sender withdrew this link.', 410);
    if (state === 'expired') return apiFail('This signing link has expired.', 410);

    const nowIso = new Date().toISOString();
    const { data: done, error } = await db.from('proposal_signatures')
      .update({ status: 'declined', declined_at: nowIso, decline_reason: reason })
      .eq('id', r.id).eq('tenant_id', r.tenant_id).in('status', ['sent', 'viewed']).gt('expires_at', nowIso)
      .select(REQUEST_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!done) return apiFail('This link was just used or closed. Reload the page.', 409);
    const { ip, userAgent } = requestMeta(req);
    await recordEvent(db, { tenantId: r.tenant_id, signatureId: r.id, proposalId: r.proposal_id, event: 'declined', actor: 'signer', ip, userAgent, detail: reason ? { reason } : {} });
    await must(db.from('proposals').update({ status: 'declined', declined_at: nowIso, decline_reason: reason })
      .eq('id', r.proposal_id).eq('tenant_id', r.tenant_id).is('locked_at', null), 'proposals declined');
    try {
      await notifySender(done as SignatureRequestRow, 'proposal_declined', `${r.signer_name} declined ${r.content_snapshot.title}`, reason ? `Reason: ${reason}` : 'No reason given.');
      await noteOnDeal(db, r.tenant_id, r.lead_id, 'note', `${r.signer_name} declined "${r.content_snapshot.title}"${reason ? `: ${reason}` : '.'}`);
    } catch (e) {
      console.error('[portals/proposal/decline] sender notice failed', r.id, e);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('portals/proposal/decline POST', e, 'Your answer could not be recorded. Please try again.');
  }
}
