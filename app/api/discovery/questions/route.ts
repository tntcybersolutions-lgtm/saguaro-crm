import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/discovery/questions?category=lifestyle  (public — no auth required)
 * List discovery_questions ordered by display_order. Optionally filter by category.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    const db = createServerClient();
    // Public, unauthenticated route with NO tenant context — it can only ever
    // serve the shared global question set. discovery_questions carries a
    // tenant_id column, so scope to the global (tenant_id IS NULL) rows: this
    // matches intent and closes a latent cross-tenant leak (a tenant's private
    // questions must never surface on another tenant's public discovery flow).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('discovery_questions')
      .select('*')
      .is('tenant_id', null)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ questions: data || [] });
  } catch (e) {
    return apiError('discovery/questions GET', e);
  }
}
