import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { generateBidJacket, saveDocument } from '@/lib/pdf-engine';
import { generateBidJacketContent } from '@/lib/construction-intelligence';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = createServerClient();
    const [{ data: pkg }, { data: items }] = await Promise.all([
      db.from('bid_packages').select('*, projects(*)').eq('id', id).single(),
      db.from('bid_package_items').select('*').eq('bid_package_id', id),
    ]);
    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const p = pkg as any;
    const project = p.projects;
    const itemsList = (items || []) as any[];

    // Generate scope narrative with AI
    const { scopeNarrative, csiSections } = await generateBidJacketContent(
      itemsList.map((i: any) => ({
        description: i.description,
        csiCode: i.csi_code,
        quantity: i.quantity,
        unit: i.unit,
        totalCost: i.total_amount,
      })),
      { projectName: project?.name, projectType: project?.project_type, state: project?.state, trade: p.trade }
    );

    const pdfBytes = await generateBidJacket({
      projectName: project?.name || p.name,
      projectAddress: project?.address || '',
      ownerName: project?.owner_entity?.name || '',
      ownerAddress: project?.owner_entity?.address || '',
      gcName: project?.gc_name || 'General Contractor',
      gcAddress: project?.address || '',
      gcLicense: project?.gc_license,
      tradeName: p.trade,
      dueDate: p.due_date || '',
      scopeNarrative: p.scope_narrative || scopeNarrative,
      csiSections: csiSections,
      lineItems: itemsList.map((i: any) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unit_price,
      })),
      requiresBond: p.requires_bond || false,
      insuranceRequirements: p.insurance_requirements || {},
    });

    const pdfUrl = await saveDocument(project?.id || id, 'bid-jacket', pdfBytes, { bidPackageId: id }, p.tenant_id);

    // Update bid package with jacket URL
    await db.from('bid_packages').update({ jacket_pdf_url: pdfUrl }).eq('id', id);

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
