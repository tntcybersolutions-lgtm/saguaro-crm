import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onBidPackageCreated } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const { data: project } = await db.from('projects').select('tenant_id').eq('id', body.projectId).single();
    const tenantId = user?.id || (project as any)?.tenant_id || 'demo';

    const { data: pkg, error } = await db.from('bid_packages').insert({
      tenant_id: tenantId,
      project_id: body.projectId,
      name: body.name,
      trade: body.trade,
      scope_summary: body.scopeSummary,
      scope_narrative: body.scopeNarrative,
      csi_codes: body.csiCodes || [],
      due_date: body.dueDate,
      bid_instructions: body.bidInstructions,
      status: 'open',
      is_public_project: body.isPublicProject || false,
      requires_bond: body.requiresBond || false,
      insurance_requirements: body.insuranceRequirements || {},
    }).select().single();

    if (error) throw error;

    // Insert line items
    if (body.lineItems && body.lineItems.length > 0) {
      await db.from('bid_package_items').insert(
        body.lineItems.map((item: any) => ({
          tenant_id: tenantId,
          bid_package_id: (pkg as any).id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice,
          total_amount: item.totalAmount,
          csi_code: item.csiCode,
          notes: item.notes,
        }))
      );
    }

    onBidPackageCreated((pkg as any).id).catch(console.error);
    return NextResponse.json({ bidPackage: pkg, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
