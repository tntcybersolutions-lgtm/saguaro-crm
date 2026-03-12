import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onProjectCreated } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    const db = createServerClient();

    const { data: project, error } = await db.from('projects').insert({
      tenant_id: user.tenantId,
      name: body.name,
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
      project_number: body.projectNumber,
      project_type: body.projectType || 'commercial',
      status: 'active',
      contract_amount: body.contractAmount || 0,
      original_contract: body.contractAmount || 0,
      start_date: body.startDate,
      end_date: body.endDate,
      description: body.description,
      owner_entity: body.ownerEntity || {},
      architect_entity: body.architectEntity || {},
      gc_license: body.gcLicense,
      is_public_project: body.isPublicProject || false,
      prevailing_wage: body.prevailingWage || false,
      created_by: user?.id,
    }).select().single();

    if (error) throw error;

    // Trigger async (non-blocking)
    onProjectCreated((project as any).id).catch(console.error);

    return NextResponse.json({ project, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
