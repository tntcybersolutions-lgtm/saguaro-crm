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
      state_jurisdiction: body.stateJurisdiction || 'AZ',
      project_type: body.projectType || 'commercial',
      status: 'active',
      contract_amount: body.contractAmount || 0,
      original_contract: body.contractAmount || 0,
      original_contract_amount: body.contractAmount || 0,
      description: body.description || '',
      // Dates
      start_date: body.startDate || null,
      ntp_date: body.noticeToProceedDate || null,
      substantial_date: body.substantialCompletionDate || null,
      final_completion_date: body.finalCompletionDate || null,
      // Owner
      owner_name: body.ownerName || '',
      owner_email: body.ownerEmail || '',
      owner_entity: body.ownerName ? { name: body.ownerName, email: body.ownerEmail } : {},
      // Architect
      architect_name: body.architectName || '',
      architect_email: body.architectEmail || '',
      architect_entity: body.architectName ? { name: body.architectName, email: body.architectEmail } : {},
      // Contract settings
      retainage_pct: body.retainagePct || 10,
      is_public_project: body.publicProject || false,
      prevailing_wage: body.prevailingWage || false,
      // Extras stored in metadata
      metadata: {
        awardDate: body.awardDate || null,
        contractType: body.contractType || 'Lump Sum GMP',
      },
      created_by: user.id,
    }).select().single();

    if (error) throw error;

    const projectId = (project as any).id;

    // Trigger async scaffolding (non-blocking)
    onProjectCreated(projectId).catch(console.error);

    return NextResponse.json({ projectId, project, success: true });
  } catch (err: any) {
    console.error('[projects/create]', err);
    const msg = err.message || String(err);
    // PostgREST schema cache miss — surface a clear message
    const userMsg = msg.includes('schema cache') || msg.includes('column') || msg.includes('schema')
      ? `Database schema error — try again in a moment. If this persists, contact support. (${msg})`
      : msg;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
