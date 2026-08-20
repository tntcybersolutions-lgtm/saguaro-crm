import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state') || 'AZ';

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('prevailing_wage_rates')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('state', state.toUpperCase())
      .order('trade');

    if (error) throw error;

    // Get list of all available states
    const { data: states } = await db
      .from('prevailing_wage_rates')
      .select('state')
      .eq('tenant_id', user.tenantId)
      .order('state');

    const uniqueStates = [...new Set((states || []).map((s: any) => s.state))];

    return NextResponse.json({ rates: data || [], states: uniqueStates });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}
