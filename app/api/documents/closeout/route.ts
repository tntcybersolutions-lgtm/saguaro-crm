import { NextRequest, NextResponse } from 'next/server';
import { generateCloseoutPackage, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('*').eq('id', body.projectId).single();
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

    const pdfUrl = await saveDocument(body.projectId, 'closeout-package', pdfBytes, body, user?.id || p?.tenant_id);
    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
