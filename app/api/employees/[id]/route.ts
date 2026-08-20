import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = createServerClient();

  try {
    const { data, error } = await db
      .from('employees')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    return NextResponse.json({ employee: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = createServerClient();

  try {
    const allowed = [
      'first_name', 'last_name', 'title', 'trade', 'email', 'phone',
      'employee_number', 'emergency_contact_name', 'emergency_contact_phone',
      'hire_date', 'termination_date', 'employment_type',
      'regular_rate', 'overtime_rate', 'doubletime_rate',
      'osha_10_certified', 'osha_30_certified', 'forklift_certified', 'osha_cert_date',
      'is_active', 'default_csi_division',
    ];

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await db
      .from('employees')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    return NextResponse.json({ employee: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = createServerClient();

  try {
    const { error } = await db
      .from('employees')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
