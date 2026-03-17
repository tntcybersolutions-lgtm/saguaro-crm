import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/** POST — Link a photo to an entity */
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { photo_id, entity_type, entity_id, entity_title, photo_url } = body;
    if (!photo_id || !entity_type || !entity_id) {
      return NextResponse.json({ error: 'photo_id, entity_type, and entity_id are required' }, { status: 400 });
    }
    const supabase = createServerClient();
    const record = {
      project_id: params.projectId,
      photo_id,
      photo_url: photo_url || null,
      entity_type,
      entity_id,
      entity_title: entity_title || null,
      linked_by: user.email,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('photo_entity_links')
      .upsert(record, { onConflict: 'photo_id,entity_type,entity_id' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ link: data });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[photos/link POST]', msg);
    return NextResponse.json({ error: `Failed to link photo: ${msg}` }, { status: 500 });
  }
}

/** GET — Get links by photo_id OR by entity_type+entity_id */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const photo_id = searchParams.get('photo_id');
    const entity_type = searchParams.get('entity_type');
    const entity_id = searchParams.get('entity_id');

    const supabase = createServerClient();
    let query = supabase
      .from('photo_entity_links')
      .select('*')
      .eq('project_id', params.projectId);

    if (photo_id) {
      query = query.eq('photo_id', photo_id);
    } else if (entity_type && entity_id) {
      query = query.eq('entity_type', entity_type).eq('entity_id', entity_id);
    } else if (entity_type) {
      query = query.eq('entity_type', entity_type);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ links: data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[photos/link GET]', msg);
    return NextResponse.json({ links: [] });
  }
}

/** DELETE — Unlink a photo from an entity */
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const link_id = searchParams.get('id');
    const photo_id = searchParams.get('photo_id');
    const entity_type = searchParams.get('entity_type');
    const entity_id = searchParams.get('entity_id');

    const supabase = createServerClient();

    if (link_id) {
      const { error } = await supabase
        .from('photo_entity_links')
        .delete()
        .eq('id', link_id)
        .eq('project_id', params.projectId);
      if (error) throw error;
    } else if (photo_id && entity_type && entity_id) {
      const { error } = await supabase
        .from('photo_entity_links')
        .delete()
        .eq('project_id', params.projectId)
        .eq('photo_id', photo_id)
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Provide id or photo_id+entity_type+entity_id' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[photos/link DELETE]', msg);
    return NextResponse.json({ error: `Failed to unlink: ${msg}` }, { status: 500 });
  }
}
