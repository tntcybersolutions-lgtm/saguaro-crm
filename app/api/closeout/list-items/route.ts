import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const category = url.searchParams.get('category');
    const status = url.searchParams.get('status');

    if (!projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });

    const db = createServerClient();
    let query = db
      .from('closeout_items')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('category', { ascending: true })
      .order('item_number', { ascending: true });

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ items: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
