import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customers/profiles?status=lead&state=AZ&source=Website&search=jane&limit=200
 * List customer_profiles for the tenant, mapped to the shape the
 * /app/customers CRM page consumes (lead_score, utility_rate, …).
 *
 * The page reads `data.customers` as an array of:
 *   { id, name, email, phone, state, city, climate_zone, utility_rate,
 *     status, lead_score, source, created_at, updated_at }
 * with several optional nested collections it degrades gracefully without.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const state = searchParams.get('state');
    const source = searchParams.get('source');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '200', 10);

    const db = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db
      .from('customer_profiles')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(Number.isFinite(limit) ? limit : 200);

    if (status && status !== 'all') query = query.eq('status', status);
    if (state && state !== 'all') query = query.eq('state', state);
    if (source && source !== 'all') query = query.eq('source', source);
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customers = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      state: c.state || '',
      city: c.city || '',
      climate_zone: c.climate_zone || '',
      utility_rate: c.utility_cost_kwh != null ? Number(c.utility_cost_kwh) : 0,
      status: c.status || 'lead',
      lead_score: c.score != null ? Number(c.score) : 0,
      source: c.source || '',
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    return NextResponse.json({ customers });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/customers/profiles
 * Create a new customer profile. Accepts the page's field names
 * (lead_score, utility_rate) as well as the underlying column names
 * (score, utility_cost_kwh) and maps them onto the table.
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

    // Accept the page's aliased field names too.
    if (fields.score === undefined && body.lead_score !== undefined) {
      fields.score = body.lead_score;
    }
    if (fields.utility_cost_kwh === undefined && body.utility_rate !== undefined) {
      fields.utility_cost_kwh = body.utility_rate;
    }

    const { data, error } = await db
      .from('customer_profiles')
      .insert(fields)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ customer: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
