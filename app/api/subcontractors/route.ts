import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Canonical subcontractors resource route.
 * This is the endpoint advertised in the public API docs
 * (GET /api/subcontractors, POST /api/subcontractors) and mirrors the
 * response shape used by the existing /api/subs/* routes that the
 * project field pages consume ({ subs } for list, { sub, success } for create).
 *
 * Field/body names are normalized to the real `subcontractors` table columns
 * (company_name / contact_name / contact_email / contact_phone), while still
 * accepting the legacy page body keys (name / email / phone) as fallbacks.
 */

// GET /api/subcontractors  — list tenant subcontractors
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const trade = searchParams.get('trade');
    const status = searchParams.get('status');
    const q = searchParams.get('q');

    const db = createServerClient();
    let query = db
      .from('subcontractors')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('company_name', { ascending: true });

    if (trade) query = query.ilike('trade', `%${trade}%`);
    if (status) query = query.eq('status', status);
    if (q) query = query.ilike('company_name', `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ subs: data || [] });
  } catch (e) {
    /* Was a bare catch answering { subs: [] } with no log: a failed read left
       no trace, and a caller reading only `subs` saw an empty directory. */
    return apiError('subcontractors GET', e, 'Could not load your subs and vendors. Please try again.');
  }
}

// POST /api/subcontractors  — create a subcontractor for the tenant
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    const companyName = body.company_name ?? body.companyName ?? body.name;
    if (!companyName) {
      return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: sub, error } = await db
      .from('subcontractors')
      .insert({
        tenant_id: user.tenantId,
        company_name: companyName,
        contact_name: body.contact_name ?? body.contactName ?? null,
        email: body.email ?? body.contact_email ?? null,
        contact_email: body.contact_email ?? body.email ?? null,
        phone: body.phone ?? body.contact_phone ?? null,
        contact_phone: body.contact_phone ?? body.phone ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        trade: body.trade ?? null,
        license_number: body.license_number ?? body.licenseNumber ?? null,
        license_state: body.license_state ?? body.licenseState ?? null,
        status: body.status ?? 'active',
        notes: body.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ sub, success: true });
  } catch (e) {
    return apiError('subcontractors POST', e, 'Could not add the subcontractor. Please try again.');
  }
}
