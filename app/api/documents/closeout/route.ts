import { NextRequest, NextResponse } from 'next/server';
import { generateCloseoutPackage, saveDocument } from '@/lib/pdf-engine';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).eq('tenant_id', g.user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as any;

    const checklist = body.checklist || [
      { category: 'Financial', item: 'Final Pay Application (G702)', status: 'pending' },
      { category: 'Financial', item: 'Contractor\'s Affidavit (G706)', status: 'pending' },
      { category: 'Financial', item: 'All Lien Waivers — Final Unconditional', status: 'pending' },
      { category: 'Legal', item: 'Certificate of Substantial Completion (G704)', status: 'pending' },
      { category: 'Legal', item: 'Performance Bond Rider', status: 'na' },
      { category: 'Compliance', item: 'All W-9 Forms on File', status: 'pending' },
      { category: 'Compliance', item: 'Certified Payroll — Final Week', status: 'pending' },
      { category: 'Documents', item: 'As-Built Drawings', status: 'pending' },
      { category: 'Documents', item: 'Equipment Warranties', status: 'pending' },
      { category: 'Documents', item: 'O&M Manuals', status: 'pending' },
      { category: 'Inspections', item: 'Final Building Inspection', status: 'pending' },
      { category: 'Inspections', item: 'Certificate of Occupancy', status: 'pending' },
    ];

    const pdfBytes = await generateCloseoutPackage({
      projectName: p?.name || body.projectName,
      projectAddress: p?.address || '',
      ownerName: p?.owner_entity?.name || '',
      gcName: body.gcName || '',
      completionDate: body.completionDate || new Date().toISOString().split('T')[0],
      contractAmount: p?.contract_amount || 0,
      finalAmount: body.finalAmount || p?.contract_amount || 0,
      checklist,
    });

    // The last argument is the TENANT. It was `user?.id || p?.tenant_id`, so every
    // closeout package was filed under the user's id: saved, but invisible in the
    // tenant's document library. Every other generator passes the tenant id.
    const pdfUrl = await saveDocument(body.projectId, 'closeout-package', pdfBytes, body, g.user.tenantId);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (e) {
    return apiError('documents/closeout', e, "Couldn't build the closeout package");
  }
}
