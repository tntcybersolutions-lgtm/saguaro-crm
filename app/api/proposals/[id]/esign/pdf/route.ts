import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiFail } from '@/lib/api-error';
import { guardProposal, ensureSignedPdf, ESIGN_BUCKET } from '@/lib/proposal-esign';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/proposals/[id]/esign/pdf?request=<signature request id>
 * → { url, sha256 } — a 5-minute signed URL to the signed proposal (proposal +
 * signature certificate) in the private 'esign' bucket. The PDF is rendered on
 * the first ask if signing could not render it at the time.
 * Without ?request, the proposal's signed request is used.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const g = await guardProposal(req, id, 'View');
    if (!g.ok) return g.res;
    const { db, user } = g;
    const wanted = new URL(req.url).searchParams.get('request');
    let q = db.from('proposal_signatures').select('id').eq('proposal_id', id).eq('tenant_id', user.tenantId).eq('status', 'signed');
    if (wanted) q = q.eq('id', wanted);
    const { data, error } = await q.order('signed_at', { ascending: false }).limit(1);
    if (error) throw error;
    const row = ((data || []) as Array<{ id: string }>)[0];
    if (!row) return apiFail('There is no signed copy of this proposal yet.', 404);

    const { path, sha256 } = await ensureSignedPdf(db, row.id, user.tenantId);
    const { data: signed, error: sErr } = await db.storage.from(ESIGN_BUCKET).createSignedUrl(path, 300, { download: 'signed-proposal.pdf' });
    if (sErr || !signed?.signedUrl) throw sErr ?? new Error('no signed URL');
    return NextResponse.json({ url: signed.signedUrl, sha256 });
  } catch (e) {
    return apiError('proposals/esign/pdf GET', e, 'Could not open the signed PDF.');
  }
}
