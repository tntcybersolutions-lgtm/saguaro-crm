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
  const body = await req.json();

  if (!body.period_from) return NextResponse.json({ error: 'Missing required field: period_from' }, { status: 400 });
  if (!body.period_to) return NextResponse.json({ error: 'Missing required field: period_to' }, { status: 400 });

  const db = createServerClient();

  try {
    // 1. Load prime contract
    const { data: contract, error: pcErr } = await db
      .from('prime_contracts')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (pcErr || !contract) {
      return NextResponse.json({ error: 'Prime contract not found' }, { status: 404 });
    }

    // 2. Load SOV line items
    const { data: sovLines } = await db
      .from('prime_contract_sov')
      .select('*')
      .eq('prime_contract_id', contract.id)
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true)
      .order('sort_order');

    if (!sovLines || sovLines.length === 0) {
      return NextResponse.json({ error: 'No SOV line items found. Set up SOV before creating pay apps.' }, { status: 400 });
    }

    // 3. Load previous certified pay apps to get previous_applications per SOV line
    const { data: priorApps } = await db
      .from('owner_pay_applications')
      .select('id')
      .eq('prime_contract_id', contract.id)
      .eq('tenant_id', user.tenantId)
      .in('status', ['certified', 'paid']);

    const priorAppIds = (priorApps || []).map((a: any) => a.id);

    // Get sum of prior work per SOV line
    const priorBySov: Record<string, number> = {};
    if (priorAppIds.length > 0) {
      const { data: priorLines } = await db
        .from('owner_pay_app_line_items')
        .select('prime_contract_sov_id, work_this_period, materials_stored')
        .eq('tenant_id', user.tenantId)
        .in('owner_pay_app_id', priorAppIds);

      for (const pl of priorLines || []) {
        const key = pl.prime_contract_sov_id || 'none';
        priorBySov[key] = (priorBySov[key] || 0) +
          Number(pl.work_this_period || 0) + Number(pl.materials_stored || 0);
      }
    }

    // 4. Calculate previous certificates total
    const { data: priorCertified } = await db
      .from('owner_pay_applications')
      .select('current_payment_due')
      .eq('prime_contract_id', contract.id)
      .eq('tenant_id', user.tenantId)
      .in('status', ['certified', 'paid']);

    const lessPreviousCerts = (priorCertified || []).reduce(
      (sum: number, a: any) => sum + Number(a.current_payment_due || 0), 0
    );

    // 5. Create the pay application
    const { data: payApp, error: paErr } = await db
      .from('owner_pay_applications')
      .insert({
        prime_contract_id: contract.id,
        project_id: projectId,
        tenant_id: user.tenantId,
        application_number: 0, // trigger sets this
        period_from: body.period_from,
        period_to: body.period_to,
        original_contract_sum: Number(contract.original_contract_value) || 0,
        net_change_by_change_orders: Number(contract.approved_change_orders) || 0,
        contract_sum_to_date: Number(contract.current_contract_value) || 0,
        retainage_pct: Number(contract.retainage_pct) || 10,
        less_previous_certificates: lessPreviousCerts,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (paErr) throw paErr;

    // 6. Create line items from SOV
    const lineItems = sovLines.map((sov: any) => ({
      owner_pay_app_id: payApp.id,
      prime_contract_sov_id: sov.id,
      project_id: projectId,
      tenant_id: user.tenantId,
      item_number: sov.item_number,
      description: sov.description,
      csi_division: sov.csi_division,
      scheduled_value: Number(sov.scheduled_value) || 0,
      previous_applications: priorBySov[sov.id] || 0,
      work_this_period: 0,
      materials_stored: 0,
      retainage: 0,
    }));

    const { data: insertedLines, error: liErr } = await db
      .from('owner_pay_app_line_items')
      .insert(lineItems)
      .select();

    if (liErr) throw liErr;

    return NextResponse.json({ pay_app: payApp, line_items: insertedLines }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
