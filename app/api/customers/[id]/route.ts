import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/customers/[id]
 * Full profile with discovery_answers count + recommendations count.
 * Another company's (or a deleted) customer is a 404; a failed read is a 500
 * with a correlation id — never dressed up as "not found".
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();

    const { data: customer, error } = await db
      .from('customer_profiles')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!customer) return apiFail('Customer not found', 404);

    // Fetch discovery answers
    const { data: answers, error: aErr } = await db
      .from('discovery_answers')
      .select('*')
      .eq('customer_id', id)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });
    if (aErr) throw aErr;

    // Count recommendations
    const { count: recommendationsCount, error: cErr } = await db
      .from('customer_recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', id)
      .eq('tenant_id', user.tenantId);
    if (cErr) throw cErr;

    return NextResponse.json({
      customer,
      discovery_answers: answers || [],
      recommendations_count: recommendationsCount || 0,
    });
  } catch (e) {
    return apiError('customers/id GET', e, "Couldn't load this customer. Please try again.");
  }
}

/**
 * PATCH /api/customers/[id]
 * Update a customer profile — the same columns POST /api/customers/profiles
 * accepts (and the page's aliases lead_score → score, utility_rate →
 * utility_cost_kwh), so what the Edit form sends is what a reload brings back.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiFail('Send the customer details as JSON.', 400);

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
    if (fields.score === undefined && body.lead_score !== undefined) fields.score = body.lead_score;
    if (fields.utility_cost_kwh === undefined && body.utility_rate !== undefined) fields.utility_cost_kwh = body.utility_rate;
    if (fields.name !== undefined && !String(fields.name ?? '').trim()) return apiFail('name: a customer needs a name.', 400);
    if (typeof fields.email === 'string' && fields.email.trim() && !EMAIL_RE.test(fields.email.trim())) {
      return apiFail("email: that doesn't look like an email address.", 400);
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('customer_profiles')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return apiFail('Customer not found', 404);
    return NextResponse.json({ customer: data });
  } catch (e) {
    return apiError('customers/id PATCH', e, "Couldn't save the customer. Please try again.");
  }
}

/**
 * DELETE /api/customers/[id]
 * Discovery answers, recommendations and material picks go with the profile
 * (ON DELETE CASCADE); linked projects, leads and contacts are kept and just
 * lose the link (SET NULL). Design sessions block the delete (no cascade on
 * that FK) — said plainly as a 409 rather than a bare 500.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await requirePermission(req, 'Sales', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('customer_profiles')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id');

    if (error) {
      if ((error as { code?: string }).code === '23503') {
        return apiFail('This customer has design sessions on file, so the profile stays. Archive them as Lost instead.', 409);
      }
      throw error;
    }
    if (!data || data.length === 0) return apiFail('Customer not found', 404);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('customers/id DELETE', e, "Couldn't delete the customer. Please try again.");
  }
}
