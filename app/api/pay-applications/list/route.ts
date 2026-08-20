import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    let query = db
      .from('pay_applications')
      .select('id, app_number, status, period_from, period_to, application_date, current_payment_due, total_completed_stored, contract_sum_to_date, percent_complete, retainage_held, less_previous_certificates, total_earned_less_retainage, balance_to_finish, pdf_url, created_at, original_contract_sum, net_change_by_change_orders')
      .eq('tenant_id', user.tenantId)
      .order('app_number', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
