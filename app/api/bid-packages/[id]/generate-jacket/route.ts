import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generateBidJacket, saveDocument } from '@/lib/pdf-engine';
import { generateBidJacketContent } from '@/lib/construction-intelligence';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { resolveTenantCompany } from '@/lib/tenant-company';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    const [{ data: pkg }, { data: items }] = await Promise.all([
      db.from('bid_packages').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).single(),
      db.from('bid_package_items').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId)
        .order('sort_order').order('created_at').order('id'), // the bid form's order, same as the live jacket
    ]);
    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const p = pkg as any;
    const project = p.projects;
    const itemsList = (items || []) as any[];
    // The GC on the cover is the tenant's company (project gc_name → company
    // settings → tenant name), and its address is the office, never the job.
    const gc = await resolveTenantCompany(db, user.tenantId, project);

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
      gcName: gc.name,
      gcAddress: gc.address,
      gcLicense: gc.license || project?.gc_license,
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

    /* Twenty-eight jackets on one project listed as twenty-eight identical
       rows. The trade is what tells them apart; the package id is what lets the
       library open the live jacket instead of this flattened PDF. */
    const pdfUrl = await saveDocument(
      project?.id || id, 'bid-jacket', pdfBytes, { bidPackageId: id }, p.tenant_id,
      {
        /* The package name is what the estimator typed and what distinguishes
           one jacket from the next; the trade only stands in when there is no
           name. Joining both gave "Low Voltage & Networking — Housing Unit C —
           Low Voltage", since a package name usually names its own trade. */
        title: p.name || p.trade || 'Bid Jacket',
        sourceType: 'bid_package',
        sourceId: id,
      },
    );

    // Update bid package with jacket URL (tenant-scoped — service-role bypasses RLS)
    await must(db.from('bid_packages').update({ jacket_pdf_url: pdfUrl }).eq('id', id).eq('tenant_id', user.tenantId), 'bid_packages update');

    return NextResponse.json({ pdfUrl, success: true });
  } catch (e) {
    return apiError('bid-packages/generate-jacket', e, "Couldn't build the bid jacket. Please try again.");
  }
}
