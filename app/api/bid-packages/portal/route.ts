import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('bid_package_invites')
      .select('*, bid_packages(*, projects(name), bid_package_items(*))')
      .eq('token', token)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
    const invite = data as any;
    const pkg = invite.bid_packages;
    return NextResponse.json({
      package: {
        id: pkg?.id,
        title: pkg?.title,
        trade: pkg?.trade,
        csi_division: pkg?.csi_division,
        description: pkg?.description,
        scope_summary: pkg?.scope_summary,
        due_date: pkg?.due_date,
        estimated_value: pkg?.estimated_value,
        bonding_required: pkg?.bonding_required,
        items: pkg?.bid_package_items || [],
        projectName: pkg?.projects?.name,
        invite: { status: invite.status },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data: invite } = await db
      .from('bid_package_invites')
      .select('*, bid_packages(tenant_id, project_id)')
      .eq('token', token)
      .single();
    if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    const inv = invite as any;

    // Record submission
    await db.from('bid_submissions').insert({
      bid_package_id: inv.bid_package_id,
      sub_id: inv.sub_id,
      tenant_id: inv.bid_packages?.tenant_id,
      project_id: inv.bid_packages?.project_id,
      company_name: body.companyName,
      contact_name: body.contactName,
      contact_email: body.email,
      contact_phone: body.phone,
      license_number: body.licenseNumber,
      bonding_capacity: body.bondingCapacity,
      base_amount: parseFloat(body.baseAmount) || 0,
      alternates: body.alternates,
      exclusions: body.exclusions,
      inclusions: body.inclusions,
      proposed_schedule: body.schedule,
      notes: body.notes,
      bond_available: body.bondAvailable,
      insurance_meets: body.insuranceMeets,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    });

    // Update invite status
    await db.from('bid_package_invites').update({ status: 'submitted' }).eq('token', token);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
