import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const db = createServerClient();

    const { data, error } = await db
      .from('warranty_items')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('warranty_end_date', { ascending: true });

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    const items = (data || []).map((w: Record<string, unknown>) => {
      const endDate = w.warranty_end_date as string;
      const daysRemaining = endDate
        ? Math.floor((new Date(endDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
        : null;
      return { ...w, days_remaining: daysRemaining };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const body = await req.json();
    if (!body.equipment_name) return NextResponse.json({ error: 'Missing required field: equipment_name' }, { status: 400 });
    if (!body.warranty_duration_months) return NextResponse.json({ error: 'Missing required field: warranty_duration_months' }, { status: 400 });
    if (!body.warranty_start_date) return NextResponse.json({ error: 'Missing required field: warranty_start_date' }, { status: 400 });

    const db = createServerClient();

    // Calculate end date
    const start = new Date(body.warranty_start_date + 'T00:00:00');
    const months = parseInt(body.warranty_duration_months);
    start.setMonth(start.getMonth() + months);
    const endDate = start.toISOString().split('T')[0];

    const today = new Date().toISOString().split('T')[0];
    const daysRemaining = Math.floor((new Date(endDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
    let status = 'active';
    if (daysRemaining < 0) status = 'expired';
    else if (daysRemaining <= 30) status = 'expiring_soon';

    const { data, error } = await db
      .from('warranty_items')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        equipment_name: body.equipment_name,
        manufacturer: body.manufacturer || null,
        model_number: body.model_number || null,
        serial_number: body.serial_number || null,
        location: body.location || null,
        warranty_type: body.warranty_type || 'manufacturer',
        warranty_duration_months: months,
        warranty_start_date: body.warranty_start_date,
        warranty_end_date: endDate,
        days_remaining: daysRemaining,
        coverage_description: body.coverage_description || null,
        warranty_provider: body.warranty_provider || null,
        contact_name: body.contact_name || null,
        contact_phone: body.contact_phone || null,
        contact_email: body.contact_email || null,
        csi_division: body.csi_division || null,
        status,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
