import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * GET /api/discovery/questions?category=lifestyle  (public — no auth required)
 * List discovery_questions ordered by display_order. Optionally filter by category.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('discovery_questions')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ questions: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
