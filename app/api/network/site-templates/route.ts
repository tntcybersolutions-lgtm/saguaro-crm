import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    // network_site_templates is a shared catalogue — no tenant_id column.
    const { data, error } = await db.from('network_site_templates').select('*').order('estimated_cost_low');
    if (error) throw error;
    return NextResponse.json({ templates: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}
