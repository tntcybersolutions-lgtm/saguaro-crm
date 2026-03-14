import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List sub's pay applications with GC notes and status */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    const { data: payApps, error } = await db
      .from('portal_sub_pay_apps')
      .select(
        `*,
         line_items:portal_sub_pay_app_line_items(*)`
      )
      .eq('sub_id', session.sub_id)
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('period_end', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ pay_apps: payApps || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Submit new pay application with line items tied to SOV */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const {
      period_start,
      period_end,
      application_number,
      line_items,
      notes,
      total_requested,
      retainage_percent,
    } = body;

    if (!period_end || !line_items || !Array.isArray(line_items)) {
      return NextResponse.json(
        { error: 'period_end and line_items array are required' },
        { status: 400 }
      );
    }

    // Calculate totals from line items
    const calcTotal = line_items.reduce(
      (sum: number, item: any) => sum + (item.amount_requested || 0),
      0
    );
    const retPct = retainage_percent || 10;
    const retainageAmount = calcTotal * (retPct / 100);
    const netAmount = calcTotal - retainageAmount;

    // Create the pay app
    const { data: payApp, error: payAppError } = await db
      .from('portal_sub_pay_apps')
      .insert({
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        period_start: period_start || null,
        period_end,
        application_number: application_number || null,
        total_requested: total_requested || calcTotal,
        retainage_percent: retPct,
        retainage_amount: retainageAmount,
        net_amount: netAmount,
        notes: notes || null,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payAppError) throw payAppError;

    // Insert line items tied to SOV
    const lineItemRows = line_items.map((item: any) => ({
      pay_app_id: payApp.id,
      tenant_id: session.tenant_id,
      sov_item_id: item.sov_item_id || null,
      description: item.description,
      scheduled_value: item.scheduled_value || 0,
      previous_completed: item.previous_completed || 0,
      this_period: item.this_period || 0,
      amount_requested: item.amount_requested || 0,
      percent_complete: item.percent_complete || 0,
      gc_notes: null,
      gc_approved_amount: null,
      gc_status: 'pending',
    }));

    const { error: lineError } = await db
      .from('portal_sub_pay_app_line_items')
      .insert(lineItemRows);

    if (lineError) throw lineError;

    return NextResponse.json(
      { pay_app: payApp, message: 'Pay application submitted successfully' },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
