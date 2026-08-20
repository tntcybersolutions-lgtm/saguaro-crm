import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.project_id) return NextResponse.json({ error: 'Missing required field: project_id' }, { status: 400 });
    if (!body.company_name && !body.claimant_name) return NextResponse.json({ error: 'Missing required field: company_name' }, { status: 400 });

    const db = createServerClient();
    const { data, error } = await db
      .from('lien_waivers')
      .insert({
        tenant_id: user.tenantId,
        project_id: body.project_id,
        waiver_type: body.waiver_type || 'conditional_partial',
        claimant_name: body.company_name || body.claimant_name,
        company_name: body.company_name || body.claimant_name,
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        amount: body.amount || 0,
        through_date: body.through_date || null,
        status: body.status || 'pending',
        bid_package_id: body.bid_package_id || null,
        sub_id: body.sub_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ waiver: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
