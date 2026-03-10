import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const name          = String(body.name          ?? '').trim();
  const address       = String(body.address       ?? '').trim();
  const projectType   = String(body.projectType   ?? 'residential').trim();
  const contractAmount = Number(body.contractAmount ?? body.budget ?? 0);
  const startDate     = body.startDate   ? String(body.startDate)   : null;
  const subDate       = body.subDate     ? String(body.subDate)     : null;
  const ownerName     = body.ownerName   ? String(body.ownerName)   : null;
  const ownerEmail    = body.ownerEmail  ? String(body.ownerEmail)  : null;
  const archName      = body.archName    ? String(body.archName)    : null;
  const archEmail     = body.archEmail   ? String(body.archEmail)   : null;
  const description   = body.description ? String(body.description) : null;
  const retainage     = Number(body.retainage ?? 10);
  const prevailingWage = Boolean(body.prevailingWage ?? false);
  const publicProject  = Boolean(body.publicProject ?? false);
  const contractType  = body.contractType ? String(body.contractType) : 'Lump Sum GMP';
  const state         = body.state ? String(body.state) : 'AZ';

  // Get tenant from auth token
  let tenantId = String(body.tenantId ?? '');
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ') && !tenantId) {
    const token = bearer.slice(7);
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    tenantId = user?.user_metadata?.tenant_id ?? user?.id ?? tenantId;
  }
  if (!tenantId) tenantId = 'demo';

  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  // Generate project number
  const year = new Date().getFullYear();
  const { count } = await supabaseAdmin
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  const seq = String((count ?? 0) + 1).padStart(4, '0');
  const projectNumber = `${year}-${seq}`;

  const now = new Date().toISOString();

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      tenant_id:       tenantId,
      name,
      address:         address || null,
      project_number:  projectNumber,
      project_type:    projectType,
      contract_amount: contractAmount || null,
      start_date:      startDate,
      substantial_completion_date: subDate,
      owner_name:      ownerName,
      owner_email:     ownerEmail,
      architect_name:  archName,
      architect_email: archEmail,
      description,
      retainage_percent: retainage,
      prevailing_wage:   prevailingWage,
      public_project:    publicProject,
      contract_type:     contractType,
      state,
      status:          'active',
      created_at:      now,
      updated_at:      now,
    })
    .select('id, project_number, name')
    .single();

  if (error || !project) {
    console.error('[projects/create]', error?.message);
    // In demo mode (no DB), generate a fake project ID
    const fakeId = 'demo-project-' + Date.now();
    return NextResponse.json({ projectId: fakeId, projectNumber, name });
  }

  return NextResponse.json({
    projectId:     project.id,
    projectNumber: project.project_number,
    name:          project.name,
  });
}
