import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    const itemType = searchParams.get('item_type');
    const itemId = searchParams.get('item_id');

    const db = createServerClient();
    let query = db
      .from('voice_memos')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (itemType) query = query.eq('item_type', itemType);
    if (itemId) query = query.eq('item_id', itemId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to list voice memos', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ memos: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
