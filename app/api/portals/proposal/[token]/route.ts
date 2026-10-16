import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  requestByToken, effectiveStatus, recordEvent, notifySender, noteOnDeal, requestMeta,
  ESIGN_CONSENT_TEXT, type LooseDb,
} from '@/lib/proposal-esign';

export const runtime = 'nodejs';

/** Re-opening the page inside this window is one view on the audit trail, not twenty. */
const VIEW_EVENT_GAP_MS = 15 * 60 * 1000;

/**
 * GET /api/portals/proposal/[token] — the customer opens the signing link.
 *
 * Public: the token is the credential. Only its hash is looked up; the tenant
 * and the proposal come from that row, never from the request. An open link
 * returns the frozen snapshot (exactly what will be signed) and its SHA-256;
 * a signed / declined / voided / expired link returns only its state.
 * The first open stamps viewed_at, logs a 'viewed' event and tells the sender.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIP(req);
  if (!checkRateLimit(`proposal-view:${ip}`, 60, 60_000).allowed) {
    return NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 });
  }
  const { token } = await params;
  try {
    const db = createServerClient() as LooseDb;
    const r = await requestByToken(db, token);
    if (!r) return NextResponse.json({ state: 'invalid', error: 'This signing link is not valid.' }, { status: 404 });

    const company = r.content_snapshot?.company?.name || '';
    const state = effectiveStatus(r);
    if (state === 'signed') {
      return NextResponse.json({ state, company, title: r.content_snapshot.title, signed_at: r.signed_at, signed_name: r.signed_name }, { status: 409 });
    }
    if (state === 'declined') return NextResponse.json({ state, company, title: r.content_snapshot.title, declined_at: r.declined_at }, { status: 409 });
    if (state === 'voided') return NextResponse.json({ state, company, error: 'The sender withdrew this link. Ask them for a new one.' }, { status: 410 });
    if (state === 'expired') return NextResponse.json({ state, company, error: 'This signing link has expired. Ask the sender for a new one.' }, { status: 410 });

    const now = new Date();
    const nowIso = now.toISOString();
    const first = !r.viewed_at;
    const { data: upd, error: uErr } = await db.from('proposal_signatures')
      .update({ status: 'viewed', viewed_at: r.viewed_at || nowIso, last_viewed_at: nowIso, view_count: (Number(r.view_count) || 0) + 1 })
      .eq('id', r.id).eq('tenant_id', r.tenant_id).in('status', ['sent', 'viewed'])
      .select('id').maybeSingle();
    if (uErr) throw uErr;
    const meta = requestMeta(req);
    const lastSeen = r.last_viewed_at ? new Date(r.last_viewed_at).getTime() : 0;
    if (upd && (first || now.getTime() - lastSeen > VIEW_EVENT_GAP_MS)) {
      await recordEvent(db, { tenantId: r.tenant_id, signatureId: r.id, proposalId: r.proposal_id, event: 'viewed', actor: 'signer', ip: meta.ip, userAgent: meta.userAgent });
    }
    if (upd && first) {
      // Telling the sender never stands between the customer and the proposal.
      try {
        await notifySender(r, 'proposal_viewed', `${r.signer_name} opened ${r.content_snapshot.title}`, 'They have the proposal open now. Nothing is signed yet.');
        await noteOnDeal(db, r.tenant_id, r.lead_id, 'note', `${r.signer_name} opened "${r.content_snapshot.title}".`);
      } catch (e) {
        console.error('[portals/proposal GET] first-view notice failed', e);
      }
    }

    return NextResponse.json({
      state: 'open',
      proposal: r.content_snapshot,
      content_hash: r.content_hash,
      signer: { name: r.signer_name, email: r.signer_email, title: r.signer_title },
      message: r.message,
      expires_at: r.expires_at,
      consent_text: ESIGN_CONSENT_TEXT,
    });
  } catch (e) {
    return apiError('portals/proposal GET', e, 'This proposal could not be loaded. Please try the link again.');
  }
}
