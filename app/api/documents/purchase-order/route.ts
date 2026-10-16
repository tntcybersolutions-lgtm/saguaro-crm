import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { generatePurchaseOrder } from '@/lib/document-templates/purchase-order-generator';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    if (!body.projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('tenant_id', g.user.tenantId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { pdfUrl } = await generatePurchaseOrder({
      projectId: body.projectId,
      purchaseOrderId: body.purchaseOrderId,
      vendorName: body.vendorName,
      vendorAddress: body.vendorAddress,
      poNumber: body.poNumber,
      poDate: body.poDate,
      requiredDeliveryDate: body.requiredDeliveryDate,
      items: body.items,
      tax: body.tax,
      shipping: body.shipping,
      terms: body.terms,
      deliveryInstructions: body.deliveryInstructions,
      // Collected by the contract form.
      buyerName: body.buyerName,
      shipTo: body.shipTo,
      freightTerms: body.freightTerms,
      taxable: body.taxable,
      description: body.description,
      poAmount: body.poAmount,
    });

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: unknown) {
    return apiError('documents/purchase-order POST', err, 'Document generation failed');
  }
}
