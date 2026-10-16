import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const now = new Date();
    const signer = body.signedBy ?? body.signed_by ?? body.signedName ?? body.signed_name;
    const { data, error } = await db.from('lien_waivers').update({
      status: 'signed',
      // The signer's day (device, else company zone): a 7:30 PM signature in Iowa is dated that day, not tomorrow.
      signed_date: (await requestDay(req.headers, db, user.tenantId, 'lien-waivers/sign', now)).today,
      signed_at: now.toISOString(),
      signed_by: signer,
      signed_name: body.signedName ?? body.signed_name ?? signer,
      signature_method: body.signatureMethod ?? body.signature_method ?? 'mobile',
    })
      .eq('id', id)
      .eq('tenant_id', user.tenantId) // tenant guard: prevent cross-tenant sign
      .is('deleted_at', null) // a deleted waiver cannot be signed
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError('lien-waivers/sign', err, "Couldn't sign the lien waiver. Please try again.");
  }
}
