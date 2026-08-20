import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get('active') !== 'false';

  try {
    let query = db
      .from('employees')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('last_name');

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ employees: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.first_name) return NextResponse.json({ error: 'Missing required field: first_name' }, { status: 400 });
  if (!body.last_name) return NextResponse.json({ error: 'Missing required field: last_name' }, { status: 400 });

  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('employees')
      .insert({
        tenant_id: user.tenantId,
        employee_number: body.employee_number || null,
        first_name: body.first_name,
        last_name: body.last_name,
        title: body.title || null,
        trade: body.trade || null,
        email: body.email || null,
        phone: body.phone || null,
        emergency_contact_name: body.emergency_contact_name || null,
        emergency_contact_phone: body.emergency_contact_phone || null,
        hire_date: body.hire_date || null,
        employment_type: body.employment_type || 'hourly',
        regular_rate: Number(body.regular_rate || 0),
        overtime_rate: body.overtime_rate ? Number(body.overtime_rate) : null,
        doubletime_rate: body.doubletime_rate ? Number(body.doubletime_rate) : null,
        osha_10_certified: body.osha_10_certified || false,
        osha_30_certified: body.osha_30_certified || false,
        forklift_certified: body.forklift_certified || false,
        default_csi_division: body.default_csi_division || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ employee: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
