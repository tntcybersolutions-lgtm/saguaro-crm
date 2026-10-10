import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase-server';
import { DocumentNotStoredError } from '@/lib/pdf-engine';
import { requirePermission } from '@/lib/permissions';
import { storeJacketPdf } from '@/lib/bid-jacket-pdf';

/**
 * POST /api/bid-packages/[id]/generate-jacket: the GC's Download PDF.
 *
 * Builds the printed jacket from the live jacket (lib/bid-jacket-pdf), stores
 * it, points bid_packages.jacket_pdf_url at it, and returns a link that opens
 * now. When the jacket has not changed since the last PDF, that PDF comes back
 * rather than a duplicate.
 *
 * This route used to be reached only by server-side fetches that carried no
 * login, so the permission check refused every one of them and an empty catch
 * hid it. The server paths now call storeJacketPdf directly; this route is for
 * a signed-in GC.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  try {
    const out = await storeJacketPdf(createServerClient(), { packageId: id, tenantId: g.user.tenantId });
    if (!out) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    return NextResponse.json({ success: true, ...out });
  } catch (e) {
    // Storage refused the file: say so in our words, not as a generic failure.
    if (e instanceof DocumentNotStoredError) return apiError('bid-packages/generate-jacket', e, e.message, 502);
    return apiError('bid-packages/generate-jacket', e, "Couldn't build the bid jacket PDF. Please try again.");
  }
}
