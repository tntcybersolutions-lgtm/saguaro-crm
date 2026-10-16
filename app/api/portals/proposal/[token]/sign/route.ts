import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError, apiFail } from '@/lib/api-error';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  requestByToken, effectiveStatus, snapshotHash, recordEvent, applySignature, ensureSignedPdf,
  notifySender, noteOnDeal, requestMeta, money, ESIGN_BUCKET, ESIGN_CONSENT_TEXT, REQUEST_COLUMNS,
  type LooseDb, type SignatureRequestRow,
} from '@/lib/proposal-esign';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_PNG_BYTES = 1_000_000;

/**
 * POST /api/portals/proposal/[token]/sign — Accept & Sign.
 * Body: { typed_name, signer_title?, method: 'drawn'|'typed', signature_png
 *         (data:image/png;base64,…), consent: true, content_hash }
 *
 *  1. The link must be open (not signed, declined, voided or expired).
 *  2. The stored snapshot must still hash to content_hash, and the hash the
 *     customer was shown must be that same one — they sign what they saw.
 *  3. The signature image goes to the private 'esign' bucket.
 *  4. ONE conditional update flips the request to signed only while it is
 *     still open: a second submit, a replay or a race gets 409, and the image
 *     it uploaded is removed.
 *  5. Then: lock the proposal (and win it only if the sender chose that),
 *     render + store the signed PDF with its certificate, tell the sender.
 *     The signature is recorded before these; a failure in them is logged for
 *     the GC and never reported to the customer as "not signed".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const clientIp = getClientIP(req);
  if (!checkRateLimit(`proposal-sign:${clientIp}`, 10, 60_000).allowed) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
  }
  const { token } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiFail('Send a JSON body.', 400);

  const typedName = typeof body.typed_name === 'string' ? body.typed_name.trim().replace(/\s+/g, ' ') : '';
  const title = typeof body.signer_title === 'string' ? body.signer_title.trim().slice(0, 120) || null : null;
  const method = body.method === 'typed' ? 'typed' : body.method === 'drawn' ? 'drawn' : null;
  if (typedName.length < 2 || typedName.length > 120) return apiFail('Type your full name (2 to 120 characters).', 400);
  if (!method) return apiFail('method must be drawn or typed.', 400);
  if (body.consent !== true) return apiFail('Tick the box to agree to sign electronically.', 400);
  if (typeof body.content_hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.content_hash)) return apiFail('content_hash is required.', 400);
  const m = typeof body.signature_png === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(body.signature_png) : null;
  if (!m) return apiFail('Add your signature before signing.', 400);
  const png = Buffer.from(m[1], 'base64');
  if (png.length < 100 || png.length > MAX_PNG_BYTES || !PNG_MAGIC.every((b, i) => png[i] === b)) {
    return apiFail('The signature image could not be read. Clear it and sign again.', 400);
  }

  try {
    const db = createServerClient() as LooseDb;
    const r = await requestByToken(db, token);
    if (!r) return apiFail('This signing link is not valid.', 404);
    const state = effectiveStatus(r);
    if (state === 'signed') return apiFail('This proposal has already been signed. A link signs once.', 409);
    if (state === 'declined') return apiFail('This proposal was declined. Ask the sender for a new link.', 409);
    if (state === 'voided') return apiFail('The sender withdrew this link. Ask them for a new one.', 410);
    if (state === 'expired') return apiFail('This signing link has expired. Ask the sender for a new one.', 410);

    // The content is what was sent, and what the customer saw is what they sign.
    if (snapshotHash(r.content_snapshot) !== r.content_hash) {
      console.error('[portals/proposal/sign] snapshot no longer matches its hash', r.id);
      return apiFail('This proposal could not be verified. Ask the sender for a new link.', 409);
    }
    if (body.content_hash !== r.content_hash) return apiFail('This proposal changed since you opened it. Reload the page to see the current version.', 409);

    const { ip, userAgent } = requestMeta(req);
    const path = `${r.tenant_id}/proposals/${r.proposal_id}/${r.id}/signature-${Date.now()}.png`;
    const up = await db.storage.from(ESIGN_BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
    if (up.error) throw up.error;

    const signedAt = new Date().toISOString();
    const { data: signed, error: sErr } = await db.from('proposal_signatures')
      .update({
        status: 'signed', signed_at: signedAt, signed_name: typedName, signed_title: title || r.signer_title,
        signature_method: method, signature_path: path, signer_ip: ip, signer_user_agent: userAgent, consent_text: ESIGN_CONSENT_TEXT,
      })
      .eq('id', r.id).eq('tenant_id', r.tenant_id)
      .in('status', ['sent', 'viewed']).gt('expires_at', signedAt)
      .select(`${REQUEST_COLUMNS}, signature_path`).maybeSingle();
    if (sErr || !signed) {
      const rm = await db.storage.from(ESIGN_BUCKET).remove([path]);
      if (rm.error) console.error('[portals/proposal/sign] orphan signature not removed', path, rm.error);
      if (sErr) throw sErr;
      return apiFail('This link was just used or closed. Reload the page.', 409);
    }
    const row = signed as SignatureRequestRow;
    await recordEvent(db, {
      tenantId: r.tenant_id, signatureId: r.id, proposalId: r.proposal_id, event: 'signed', actor: 'signer', ip, userAgent,
      detail: { name: typedName, title: title || r.signer_title, method, content_hash: r.content_hash, consent: ESIGN_CONSENT_TEXT },
    });

    let won = false;
    try {
      won = (await applySignature(db, row, signedAt)).won;
    } catch (e) {
      console.error('[portals/proposal/sign] locking / winning the proposal failed', r.id, e);
    }
    try {
      await ensureSignedPdf(db, r.id, r.tenant_id);
    } catch (e) {
      // The GC's download renders it on first ask (GET /api/proposals/[id]/esign/pdf).
      console.error('[portals/proposal/sign] signed PDF not rendered yet', r.id, e);
    }
    try {
      const what = `${r.content_snapshot.title} (${money(r.content_snapshot.total)})`;
      await notifySender(row, 'proposal_signed', `${typedName} signed ${r.content_snapshot.title}`,
        won ? `${what} is signed and the deal is marked Won.` : `${what} is signed. Mark the deal Won and open the job when you are ready.`);
      await noteOnDeal(db, r.tenant_id, r.lead_id, 'note', `${typedName} signed "${r.content_snapshot.title}" (${money(r.content_snapshot.total)}).`);
    } catch (e) {
      console.error('[portals/proposal/sign] sender notice failed', r.id, e);
    }

    return NextResponse.json({ success: true, signed_at: signedAt, content_hash: r.content_hash });
  } catch (e) {
    return apiError('portals/proposal/sign POST', e, 'Your signature could not be recorded. Please try again.');
  }
}
