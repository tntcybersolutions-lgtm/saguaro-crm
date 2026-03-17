import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { generatePurchaseOrder } from '@/lib/document-templates/purchase-order-generator';

export async function POST(req: NextRequest) {
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
    });

    return NextResponse.json({ pdfUrl, success: true });
  } catch (err: unknown) {
    const message = 'Document generation failed';
    console.error('[documents/purchase-order]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
