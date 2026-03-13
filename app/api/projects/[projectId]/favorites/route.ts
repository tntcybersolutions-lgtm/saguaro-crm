import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ favorites: [] });
    return NextResponse.json({ favorites: data || [] });
  } catch {
    return NextResponse.json({ favorites: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('favorites')
      .insert({
        project_id: params.projectId,
        user_id: user.id,
        item_id: body.item_id,
        item_type: body.item_type,
        item_title: body.item_title,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ favorite: { id: `fav-${Date.now()}`, ...body } });
    return NextResponse.json({ favorite: data });
  } catch {
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const itemId = url.searchParams.get('item_id');
    if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
    const supabase = createServerClient();
    await supabase
      .from('favorites')
      .delete()
      .eq('project_id', params.projectId)
      .eq('user_id', user.id)
      .eq('item_id', itemId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
