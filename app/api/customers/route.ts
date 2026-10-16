import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/customers?status=lead&state=AZ&source=website&limit=50
 * List customer_profiles by tenant_id with optional filters.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const state = searchParams.get('state');
    const source = searchParams.get('source');
    const limit = parseInt(searchParams.get('limit') || '50');

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('customer_profiles')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);
    if (state) query = query.eq('state', state);
    if (source) query = query.eq('source', source);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ customers: data || [] });
  } catch (e) {
    return apiError('customers GET', e);
  }
}

/**
 * POST /api/customers
 * Create a new customer profile.
 */
export async function POST(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Sales', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json();
    const db = createServerClient();

    const allowed = [
      'email', 'name', 'phone', 'ip_address', 'city', 'state', 'zip_code',
      'country', 'latitude', 'longitude', 'climate_zone', 'avg_summer_high',
      'avg_winter_low', 'annual_snowfall_in', 'annual_rainfall_in',
      'avg_humidity_pct', 'utility_cost_kwh', 'utility_cost_gas',
      'sun_hours_year', 'wind_zone', 'seismic_zone', 'flood_zone',
      'source', 'status', 'score', 'assigned_gc_id',
    ];
    const fields: Record<string, unknown> = { tenant_id: user.tenantId };
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    const { data, error } = await db
      .from('customer_profiles')
      .insert(fields)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ customer: data }, { status: 201 });
  } catch (e) {
    return apiError('customers POST', e);
  }
}
