import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trade = searchParams.get('trade') || '';
  const state = searchParams.get('state') || '';
  const q = searchParams.get('q') || '';
  try {
    const user = await getUser(req);
    const db = createServerClient();
    let query = db.from('subcontractors').select('*').order('name').limit(50);
    if (user?.id) query = query.eq('tenant_id', user.id);
    if (trade) query = query.ilike('trade', `%${trade}%`);
    if (state) query = query.eq('state', state);
    if (q) query = query.ilike('name', `%${q}%`);
    const { data } = await query;
    return NextResponse.json({ subs: data || [] });
  } catch (err: any) {
    return NextResponse.json({ subs: [], error: err.message });
  }
}
