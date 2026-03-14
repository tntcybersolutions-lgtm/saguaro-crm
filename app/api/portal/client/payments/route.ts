import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — list payment history */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const { data: payments, error } = await db
      .from('portal_payments')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate totals
    const all = payments || [];
    const summary = {
      total_paid: all
        .filter((p: any) => p.status === 'completed')
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
      total_pending: all
        .filter((p: any) => p.status === 'pending')
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
      total_count: all.length,
    };

    return NextResponse.json({ payments: all, summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load payments' }, { status: 500 });
  }
}

/** POST — initiate a payment */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { amount, payment_method, invoice_id, description } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'A valid amount is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: payment, error } = await db
      .from('portal_payments')
      .insert({
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        amount,
        payment_method: payment_method || null,
        invoice_id: invoice_id || null,
        description: description || null,
        status: 'pending',
        initiated_by: session.client_name || session.client_email,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ payment });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to initiate payment' }, { status: 500 });
  }
}
