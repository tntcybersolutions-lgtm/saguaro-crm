import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';

import { apiError } from '@/lib/api-error';
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
    if (error) {
      console.error('[projects/[projectId]/favorites] read failed:', error.message);
      return NextResponse.json({ error: 'Failed to load favorites', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ favorites: data || [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/favorites] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return NextResponse.json({ error: 'Failed to load favorites', detail }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('favorites')
      .insert({
        tenant_id: user.tenantId, // NOT NULL — without this every insert failed and the
                                  // swallow below returned a fake `fav-…` id (never persisted).
        project_id: params.projectId,
        user_id: user.id,
        item_id: body.item_id,
        item_type: body.item_type,
        item_title: body.item_title,
        created_at: new Date().toISOString(),
      } as Database['public']['Tables']['favorites']['Insert'])
      .select()
      .single();
    if (error) {
      console.error('[favorites/POST]', error);
      return apiError('projects/projectId/favorites', error, "Failed to add favorite", 500);
    }
    return NextResponse.json({ favorite: data });
  } catch {
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
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
