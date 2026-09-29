import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

/**
 * GET /api/customers/[id]
 * Full profile with discovery_answers count + recommendations count.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();

    const { data: customer, error } = await db
      .from('customer_profiles')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fetch discovery answers
    const { data: answers } = await db
      .from('discovery_answers')
      .select('*')
      .eq('customer_id', id)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });

    // Count recommendations
    const { count: recommendationsCount } = await db
      .from('customer_recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', id)
      .eq('tenant_id', user.tenantId);

    return NextResponse.json({
      customer,
      discovery_answers: answers || [],
      recommendations_count: recommendationsCount || 0,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/customers/[id]
 * Update a customer profile.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const g = await requirePermission(req, 'Sales', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const body = await req.json();
    const db = createServerClient();

    const allowed = [
      'email', 'name', 'phone', 'city', 'state', 'zip_code', 'country',
      'latitude', 'longitude', 'climate_zone', 'avg_summer_high',
      'avg_winter_low', 'annual_snowfall_in', 'annual_rainfall_in',
      'avg_humidity_pct', 'utility_cost_kwh', 'utility_cost_gas',
      'sun_hours_year', 'wind_zone', 'seismic_zone', 'flood_zone',
      'source', 'status', 'score', 'assigned_gc_id',
    ];
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    const { data, error } = await db
      .from('customer_profiles')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ customer: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/customers/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const g = await requirePermission(req, 'Sales', 'Full');
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    const { error } = await db
      .from('customer_profiles')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
