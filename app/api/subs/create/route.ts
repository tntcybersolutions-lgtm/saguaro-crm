import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onSubAddedToProject } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db.from('projects').select('tenant_id').eq('id', body.projectId).single();
    const tenantId = user?.id || (project as any)?.tenant_id || 'demo';

    const { data: sub, error } = await db.from('subcontractors').insert({
      tenant_id: tenantId,
      project_id: body.projectId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
      trade: body.trade,
      license_number: body.licenseNumber,
      license_state: body.licenseState,
      contract_amount: body.contractAmount || 0,
      status: 'active',
      w9_status: 'pending',
      notes: body.notes,
    }).select().single();

    if (error) throw error;

    // Triggers (W9, preliminary notice)
    if (body.projectId) onSubAddedToProject(body.projectId, (sub as any).id).catch(console.error);

    return NextResponse.json({ sub, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
