import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { apiError } from '@/lib/api-error';

/** GET — list payment history */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.VIEW_FINANCIALS);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
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
  } catch (e) {
    return apiError('portal/client/payments GET', e);
  }
}

/* No POST: an owner "submitting a payment" here moved no money and filed a
   pending row the builder never asked for. Owners pay an invoice through
   /api/portal/client/pay (Stripe, when the builder takes payments online). */
