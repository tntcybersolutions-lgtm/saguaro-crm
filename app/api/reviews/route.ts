import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * Customer reviews / reputation — the one sales feature the audit found fully
 * missing. GET lists tenant reviews (optionally for one customer/project) with
 * the average; POST captures one. Tenant-scoped on every call; writes need
 * Sales:Edit.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const url = new URL(req.url);
    const customerId = url.searchParams.get('customerId');
    const projectId = url.searchParams.get('projectId');

    let q = db.from('customer_reviews').select('*').eq('tenant_id', user.tenantId);
    if (customerId) q = q.eq('customer_id', customerId);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    const reviews = data ?? [];
    const rated = reviews.filter((r: any) => typeof r.rating === 'number');
    const avg = rated.length
      ? Math.round((rated.reduce((s: number, r: any) => s + Number(r.rating), 0) / rated.length) * 10) / 10
      : null;

    return NextResponse.json({ reviews, count: reviews.length, avgRating: avg });
  } catch (e) {
    return apiError('reviews', e, 'Could not load reviews');
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rating = Math.round(Number((body as any).rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 });
    }
    const reviewer = String((body as any).reviewer_name ?? '').trim();
    const text = String((body as any).body ?? '').trim();
    if (!reviewer && !text) {
      return NextResponse.json({ error: 'Add a name or a review' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db.from('customer_reviews').insert({
      tenant_id: user.tenantId,
      customer_id: (body as any).customer_id ?? null,
      project_id: (body as any).project_id ?? null,
      reviewer_name: reviewer || null,
      rating,
      body: text || null,
      source: (body as any).source ? String((body as any).source) : 'internal',
      created_by: user.id,
    } as never).select().single();
    if (error) throw error;
    return NextResponse.json({ review: data }, { status: 201 });
  } catch (e) {
    return apiError('reviews', e, 'Could not save the review');
  }
}
