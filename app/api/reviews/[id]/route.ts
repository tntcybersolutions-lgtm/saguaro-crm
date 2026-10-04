/**
 * DELETE /api/reviews/[id] — remove one customer review.
 *
 * The reviews page could add a review and never take one back (a typo, a
 * duplicate, a test). Same shape as app/api/permits/[id]/route.ts: scoped by
 * id AND tenant_id, 404 for a row that is not ours.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // customer_reviews is not in the generated Database type (the list route has the
    // same gap), so the chain is typed loosely here rather than deep-instantiated.
    const db = createServerClient() as unknown as { from: (t: string) => any };
    const { data, error } = await db
      .from('customer_reviews')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    return apiError('reviews/[id]', e, 'Could not remove the review');
  }
}
