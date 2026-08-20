import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateCloseoutPackage, saveDocument } from '@/lib/pdf-engine';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });

    const db = createServerClient();

    // Fetch project
    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Fetch closeout items
    const { data: items } = await db
      .from('closeout_items')
      .select('*')
      .eq('project_id', body.projectId)
      .eq('tenant_id', user.tenantId)
      .order('category')
      .order('item_number');

    // Fetch lien waivers
    const { data: waivers } = await db
      .from('lien_waivers')
      .select('*, subcontractors(name)')
      .eq('project_id', body.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at');

    const p = project as any;
    const closeoutItems = items || [];
    const lienWaivers = waivers || [];

    // Build checklist from DB items
    const checklist = closeoutItems.map((item: any) => ({
      category: item.category || 'other',
      item: item.title,
      status: item.status === 'approved' ? 'complete' as const
        : item.status === 'waived' ? 'na' as const
        : 'pending' as const,
    }));

    // Add lien waiver summary rows
    const waiverTypes = ['conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final'];
    const waiverLabels: Record<string, string> = {
      conditional_progress: 'Conditional Progress Lien Waivers',
      unconditional_progress: 'Unconditional Progress Lien Waivers',
      conditional_final: 'Conditional Final Lien Waivers',
      unconditional_final: 'Unconditional Final Lien Waivers',
    };
    // Also support the existing naming convention
    const altLabels: Record<string, string> = {
      conditional_partial: 'Conditional Progress Lien Waivers',
      unconditional_partial: 'Unconditional Progress Lien Waivers',
    };

    for (const wt of [...waiverTypes, 'conditional_partial', 'unconditional_partial']) {
      const matching = lienWaivers.filter((w: any) => w.waiver_type === wt);
      if (matching.length > 0) {
        const received = matching.filter((w: any) => w.status === 'received' || w.status === 'approved' || w.status === 'signed').length;
        checklist.push({
          category: 'lien_waiver',
          item: `${waiverLabels[wt] || altLabels[wt] || wt}: ${received}/${matching.length} received`,
          status: received === matching.length ? 'complete' as const : 'pending' as const,
        });
      }
    }

    const pdfBytes = await generateCloseoutPackage({
      projectName: p.name || 'Untitled Project',
      projectAddress: p.address || '',
      ownerName: p.owner_name || (p.owner_entity as any)?.name || '',
      gcName: p.gc_name || '',
      completionDate: body.completionDate || new Date().toISOString().split('T')[0],
      contractAmount: p.contract_amount || 0,
      finalAmount: body.finalAmount || p.contract_amount || 0,
      checklist,
    });

    const pdfUrl = await saveDocument(body.projectId, 'closeout-package', pdfBytes, { items: closeoutItems.length, waivers: lienWaivers.length }, user.tenantId);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
