import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Sales or Budget: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requireAnyPermission(req, PROPOSAL_MONEY, 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('bids')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ bids: data });
  } catch (err) {
    return apiError('bids/list GET', err, 'Failed to list bids');
  }
}
