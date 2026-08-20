import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * GET /api/smart-packages  (public — no auth required)
 * List smart_packages ordered by tier for website display.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('smart_packages')
      .select('*')
      .eq('is_active', true)
      .order('tier', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ packages: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
