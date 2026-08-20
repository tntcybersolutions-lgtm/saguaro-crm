import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    // Load awarded subcontractors for this project
    const { data: projSubs } = await db
      .from('project_subcontractors')
      .select('subcontractor_id, subcontractors(id, company_name, contact_name, contact_email, contact_phone)')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId);

    // Load existing contacts to avoid duplicates
    const { data: existing } = await db
      .from('project_contacts')
      .select('subcontractor_id')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('role', 'subcontractor');

    const existingSubIds = new Set((existing || []).map((c: any) => c.subcontractor_id).filter(Boolean));

    let createdCount = 0;
    for (const ps of projSubs || []) {
      const sub = (ps as any).subcontractors;
      if (!sub || existingSubIds.has(sub.id)) continue;

      await db.from('project_contacts').insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        role: 'subcontractor',
        company: sub.company_name || '',
        name: sub.contact_name || sub.company_name || 'Unknown',
        email: sub.contact_email || null,
        phone: sub.contact_phone || null,
        phone_mobile: sub.contact_phone || null,
        subcontractor_id: sub.id,
      });
      createdCount++;
    }

    // Also seed owner/architect from project if not already exists
    const { data: project } = await db
      .from('projects')
      .select('owner_name, owner_email, architect_name')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (project?.owner_name) {
      const { data: ownerExists } = await db
        .from('project_contacts')
        .select('id')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .eq('role', 'owner')
        .maybeSingle();

      if (!ownerExists) {
        await db.from('project_contacts').insert({
          project_id: projectId,
          tenant_id: user.tenantId,
          role: 'owner',
          name: project.owner_name,
          email: project.owner_email || null,
        });
        createdCount++;
      }
    }

    if (project?.architect_name) {
      const { data: archExists } = await db
        .from('project_contacts')
        .select('id')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .eq('role', 'architect')
        .maybeSingle();

      if (!archExists) {
        await db.from('project_contacts').insert({
          project_id: projectId,
          tenant_id: user.tenantId,
          role: 'architect',
          name: project.architect_name,
        });
        createdCount++;
      }
    }

    return NextResponse.json({ created_count: createdCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
