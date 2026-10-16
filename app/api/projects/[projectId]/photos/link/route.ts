import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

/** POST — Link a photo to an entity */
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const { photo_id, entity_type, entity_id, entity_title, photo_url } = body;
    if (!photo_id || !entity_type || !entity_id) {
      return NextResponse.json({ error: 'photo_id, entity_type, and entity_id are required' }, { status: 400 });
    }
    const supabase = createServerClient();
    // photo_entity_links has no tenant_id column, so tenant isolation is enforced
    // via the parent photo: the photo being linked must belong to the caller's
    // tenant (service-role bypasses RLS).
    const { data: ownedPhoto } = await supabase
      .from('photos')
      .select('id')
      .eq('id', photo_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!ownedPhoto) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }
    // photo_entity_links columns are (id, photo_id, entity_type, entity_id,
    // created_at). project_id/photo_url/entity_title/linked_by are not columns, and
    // there is no unique index for upsert, so de-dupe by the natural key then insert.
    const { data: existing } = await supabase
      .from('photo_entity_links')
      .select('*')
      .eq('photo_id', photo_id)
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ link: existing });
    }
    const record = {
      tenant_id: user.tenantId,
      photo_id,
      entity_type,
      entity_id,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('photo_entity_links')
      .insert(record)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ link: data });
  } catch (err: unknown) {
    return apiError('photos/link POST', err, "Couldn't link the photo");
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
      .eq('tenant_id', user.tenantId);

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
    // A failed read must not render as "no linked photos" — surface it so the
    // UI can show an error state with a retry.
    return apiError('projects/[projectId]/photos/link GET', err, 'Failed to load photo links');
  }
}

/** DELETE — Unlink a photo from an entity */
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { searchParams } = new URL(req.url);
    const link_id = searchParams.get('id');
    const photo_id = searchParams.get('photo_id');
    const entity_type = searchParams.get('entity_type');
    const entity_id = searchParams.get('entity_id');

    const supabase = createServerClient();

    // photo_entity_links has no tenant_id/project_id column, so verify tenant
    // ownership through the parent photo before deleting (service-role bypasses RLS).
    const ownsPhoto = async (pid: string): Promise<boolean> => {
      const { data } = await supabase
        .from('photos')
        .select('id')
        .eq('id', pid)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      return !!data;
    };

    if (link_id) {
      // Resolve the link's photo, confirm it belongs to this tenant, then delete.
      const { data: link } = await supabase
        .from('photo_entity_links')
        .select('id, photo_id')
        .eq('id', link_id)
        .maybeSingle();
      if (!link || !(await ownsPhoto(link.photo_id as string))) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const { error } = await supabase
        .from('photo_entity_links')
        .delete()
        .eq('id', link_id);
      if (error) throw error;
    } else if (photo_id && entity_type && entity_id) {
      if (!(await ownsPhoto(photo_id))) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const { error } = await supabase
        .from('photo_entity_links')
        .delete()
        .eq('photo_id', photo_id)
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Provide id or photo_id+entity_type+entity_id' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('projects/[projectId]/photos/link DELETE', err);
  }
}
