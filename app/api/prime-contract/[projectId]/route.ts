import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const { data: contract } = await db
      .from('prime_contracts')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!contract) {
      return NextResponse.json({
        contract: null, sov: [], pay_apps: [],
        summary: {
          contract_value: 0, total_billed: 0, total_paid: 0,
          total_retainage_held: 0, balance_remaining: 0,
          pct_billed: 0, pct_paid: 0,
        },
      });
    }

    const { data: sov } = await db
      .from('prime_contract_sov')
      .select('*')
      .eq('prime_contract_id', contract.id)
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const { data: pay_apps } = await db
      .from('owner_pay_applications')
      .select('*')
      .eq('prime_contract_id', contract.id)
      .eq('tenant_id', user.tenantId)
      .order('application_number', { ascending: false });

    const cv = Number(contract.current_contract_value) || 0;
    const tb = Number(contract.total_billed) || 0;
    const tp = Number(contract.total_paid) || 0;
    const tr = Number(contract.total_retainage_held) || 0;

    return NextResponse.json({
      contract,
      sov: sov || [],
      pay_apps: pay_apps || [],
      summary: {
        contract_value: cv,
        total_billed: tb,
        total_paid: tp,
        total_retainage_held: tr,
        balance_remaining: cv - tb,
        pct_billed: cv > 0 ? Math.round((tb / cv) * 100) : 0,
        pct_paid: cv > 0 ? Math.round((tp / cv) * 100) : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();

  if (!body.owner_name) {
    return NextResponse.json({ error: 'Missing required field: owner_name' }, { status: 400 });
  }
  if (!body.original_contract_value && body.original_contract_value !== 0) {
    return NextResponse.json({ error: 'Missing required field: original_contract_value' }, { status: 400 });
  }

  const db = createServerClient();

  try {
    const { data: existing } = await db
      .from('prime_contracts')
      .select('id')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Prime contract already exists for this project', existing_id: existing.id },
        { status: 409 }
      );
    }

    const { data: contract, error } = await db
      .from('prime_contracts')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        owner_name: body.owner_name,
        owner_company: body.owner_company || null,
        owner_email: body.owner_email || null,
        owner_phone: body.owner_phone || null,
        owner_rep_name: body.owner_rep_name || null,
        original_contract_value: Number(body.original_contract_value) || 0,
        retainage_pct: Number(body.retainage_pct) || 10,
        contract_type: body.contract_type || 'lump_sum',
        contract_number: body.contract_number || null,
        contract_date: body.contract_date || null,
        notice_to_proceed_date: body.notice_to_proceed_date || null,
        substantial_completion_date: body.substantial_completion_date || null,
        billing_period: body.billing_period || 'monthly',
        payment_terms_days: body.payment_terms_days || 30,
        gc_company_name: body.gc_company_name || null,
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    let seeded = 0;
    if (body.seed_from_budget) {
      const { data: seedResult } = await db.rpc('seed_prime_sov_from_budget', {
        p_prime_contract_id: contract.id,
        p_project_id: projectId,
        p_tenant_id: user.tenantId,
      });
      seeded = seedResult || 0;
    }

    return NextResponse.json({ contract, seeded_sov_lines: seeded }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();
  const db = createServerClient();

  try {
    const allowed = [
      'owner_name', 'owner_company', 'owner_email', 'owner_phone',
      'owner_rep_name', 'owner_address', 'owner_city', 'owner_state', 'owner_zip',
      'gc_company_name', 'gc_license_number', 'gc_address',
      'original_contract_value', 'retainage_pct', 'retainage_released',
      'contract_type', 'contract_number', 'contract_date',
      'notice_to_proceed_date', 'substantial_completion_date',
      'final_completion_date', 'actual_substantial_completion', 'actual_final_completion',
      'billing_period', 'billing_cutoff_day', 'payment_terms_days',
      'status', 'notes',
    ];

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await db
      .from('prime_contracts')
      .update(updates)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Prime contract not found' }, { status: 404 });

    return NextResponse.json({ contract: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
