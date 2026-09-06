import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const vendor = searchParams.get('vendor');
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

  try {
    const db = createServerClient();

    // network_vendor_guides rows with tenant_id IS NULL are the shared seed
    // library visible to every tenant. Tenant-owned rows are visible only to
    // their own tenant. Include both.
    const tenantFilter = `tenant_id.is.null,tenant_id.eq.${user.tenantId}`;

    let query = db
      .from('network_vendor_guides')
      .select('id, vendor, model_family, category, title, difficulty, estimated_minutes, tags, created_at', { count: 'exact' }).eq('tenant_id', user.tenantId)
      .or(tenantFilter)
      .order('vendor')
      .order('title')
      .range(offset, offset + limit - 1);

    if (vendor) query = query.eq('vendor', vendor);
    if (category) query = query.eq('category', category);
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%,vendor.ilike.%${search}%,model_family.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    // Distinct vendors and categories for filter dropdowns
    const { data: vRows } = await db
      .from('network_vendor_guides')
      .select('vendor').eq('tenant_id', user.tenantId)
      .or(tenantFilter)
      .order('vendor');
    const vendors = [...new Set((vRows || []).map((r: { vendor: string }) => r.vendor))];

    const { data: cRows } = await db
      .from('network_vendor_guides')
      .select('category').eq('tenant_id', user.tenantId)
      .or(tenantFilter)
      .order('category');
    const categories = [...new Set((cRows || []).map((r: { category: string }) => r.category))];

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      vendors,
      categories,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message || 'Internal server error' }, { status: 500 });
  }
}
