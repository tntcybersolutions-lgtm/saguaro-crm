import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/smart-packages  (public — no auth required)
 * List smart_packages ordered by tier for website display.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = createServerClient();
    // Public, unauthenticated route with NO tenant context — it can only ever
    // serve the shared global catalog. smart_packages carries a tenant_id column,
    // so scope to the global (tenant_id IS NULL) rows: this both matches intent
    // and closes a latent cross-tenant leak (a tenant's private package must
    // never surface on another tenant's public site).
    const { data, error } = await db
      .from('smart_packages')
      .select('*')
      .is('tenant_id', null)
      .eq('is_active', true)
      .order('tier', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ packages: data || [] });
  } catch (e) {
    return apiError('smart-packages GET', e);
  }
}
