import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signFields } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';

/** GET — List project photos with optional filters */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const entity_type = searchParams.get('entity_type');
    const entity_id = searchParams.get('entity_id');
    const tag = searchParams.get('tag');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const uploader = searchParams.get('uploader');
    const sort = searchParams.get('sort') || 'newest';

    const supabase = createServerClient();

    // If filtering by entity, get photo_ids from links first
    let linkedPhotoIds: string[] | null = null;
    if (entity_type || entity_id) {
      let linkQuery = supabase
        .from('photo_entity_links')
        .select('photo_id')
        .eq('tenant_id', user.tenantId);
      if (entity_type) linkQuery = linkQuery.eq('entity_type', entity_type);
      if (entity_id) linkQuery = linkQuery.eq('entity_id', entity_id);
      const { data: linkData } = await linkQuery;
      linkedPhotoIds = (linkData || []).map((l: { photo_id: string }) => l.photo_id);
      if (linkedPhotoIds.length === 0) {
        return NextResponse.json({ photos: [] });
      }
    }

    // If filtering by tag, get photo_ids from tags
    let taggedPhotoIds: string[] | null = null;
    if (tag) {
      const { data: tagData } = await supabase
        .from('photo_tags')
        .select('photo_id')
        .eq('tenant_id', user.tenantId)
        .eq('tag', tag);
      taggedPhotoIds = (tagData || []).map((t: { photo_id: string }) => t.photo_id);
      if (taggedPhotoIds.length === 0) {
        return NextResponse.json({ photos: [] });
      }
    }

    // Intersect photo IDs if both filters active
    let filterIds: string[] | null = null;
    if (linkedPhotoIds && taggedPhotoIds) {
      const tagSet = new Set(taggedPhotoIds);
      filterIds = linkedPhotoIds.filter(id => tagSet.has(id));
      if (filterIds.length === 0) return NextResponse.json({ photos: [] });
    } else if (linkedPhotoIds) {
      filterIds = linkedPhotoIds;
    } else if (taggedPhotoIds) {
      filterIds = taggedPhotoIds;
    }

    // Build main photos query. Tenant-scoped: service-role bypasses RLS and
    // project_id from the URL is attacker-controlled, so pin to the caller's tenant.
    let query = supabase
      .from('photos')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);

    if (filterIds) {
      query = query.in('id', filterIds);
    }
    if (date_from) {
      query = query.gte('created_at', date_from);
    }
    if (date_to) {
      query = query.lte('created_at', date_to + 'T23:59:59Z');
    }
    if (uploader) {
      query = query.eq('taken_by', uploader);
    }

    // Sort
    if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    let photos = data || [];

    // For 'most_linked' sort, fetch link counts and re-sort
    if (sort === 'most_linked' && photos.length > 0) {
      const photoIds = photos.map((p: { id: string }) => String(p.id));
      const { data: linkCounts } = await supabase
        .from('photo_entity_links')
        .select('photo_id')
        .eq('tenant_id', user.tenantId)
        .in('photo_id', photoIds);
      const countMap: Record<string, number> = {};
      (linkCounts || []).forEach((l: { photo_id: string }) => {
        countMap[l.photo_id] = (countMap[l.photo_id] || 0) + 1;
      });
      photos.sort((a: { id: string }, b: { id: string }) => (countMap[String(b.id)] || 0) - (countMap[String(a.id)] || 0));
    }

    // 'project-files' bucket is private — sign photo URLs on read.
    return NextResponse.json({ photos: await signFields(photos, ['url', 'thumbnail_url', 'markup_url']) });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[projects/photos GET]', msg);
    return NextResponse.json({ error: `Failed to fetch photos: ${msg}` }, { status: 500 });
  }
}

/** POST — Upload a photo with metadata */
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const caption = String(formData.get('caption') || '');
    const category = String(formData.get('category') || 'Progress');
    const tags = String(formData.get('tags') || '');
    const gps_lat = formData.get('gps_lat') || formData.get('latitude');
    const gps_lng = formData.get('gps_lng') || formData.get('longitude');
    const entity_type = String(formData.get('entity_type') || '');
    const entity_id = String(formData.get('entity_id') || '');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const supabase = createServerClient();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `projects/${params.projectId}/photos/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, buffer, { contentType: file.type, upsert: true });

    let url = '';
    let thumbnailUrl = '';
    if (uploadError) {
      console.error('[photos upload] storage error:', uploadError.message);
      // Fallback: store record without storage URL
    } else {
      const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(storagePath);
      url = urlData?.publicUrl || '';
      // Generate thumbnail URL via Supabase transform
      const { data: thumbData } = supabase.storage.from('project-files').getPublicUrl(storagePath, {
        transform: { width: 300, height: 300, resize: 'cover' },
      });
      thumbnailUrl = thumbData?.publicUrl || url;
    }

    // Insert photo record
    const record = {
      project_id: params.projectId,
      tenant_id: user.tenantId,
      url,
      thumbnail_url: thumbnailUrl,
      filename: file.name,
      category,
      caption,
      latitude: gps_lat ? Number(gps_lat) : null,
      longitude: gps_lng ? Number(gps_lng) : null,
      taken_by: user.email,
      file_size: file.size,
      mime_type: file.type,
      created_at: new Date().toISOString(),
    };

    const { data: photoData, error: insertError } = await supabase
      .from('photos')
      .insert(record)
      .select()
      .single();

    if (insertError) throw insertError;

    const photoId = String(photoData?.id || `photo-${timestamp}`);

    // Save tags if provided. photo_tags columns are (id, photo_id, tag, created_at) —
    // no project_id column and no unique index for upsert, so de-dupe then insert.
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        const { data: existingTags } = await supabase
          .from('photo_tags')
          .select('tag')
          .eq('photo_id', photoId)
          .eq('tenant_id', user.tenantId);
        const have = new Set((existingTags || []).map((t: { tag: string }) => t.tag));
        const tagRecords = tagList
          .filter(tag => !have.has(tag))
          .map(tag => ({
            tenant_id: user.tenantId,
            photo_id: photoId,
            tag,
            created_at: new Date().toISOString(),
          }));
        if (tagRecords.length > 0) {
          await must(supabase.from('photo_tags').insert(tagRecords), 'photo_tags insert');
        }
      }
    }

    // Auto-link to entity if provided. photo_entity_links columns are
    // (id, photo_id, entity_type, entity_id, created_at) — no project_id/photo_url/
    // linked_by columns and no unique index for upsert, so de-dupe then insert.
    if (entity_type && entity_id) {
      const { data: existingLink } = await supabase
        .from('photo_entity_links')
        .select('id')
        .eq('photo_id', photoId)
        .eq('tenant_id', user.tenantId)
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .maybeSingle();
      if (!existingLink) {
        await must(supabase.from('photo_entity_links').insert({
          tenant_id: user.tenantId,
          photo_id: photoId,
          entity_type,
          entity_id,
          created_at: new Date().toISOString(),
        }), 'photo_entity_links insert');
      }
    }

    return NextResponse.json({
      photo: {
        ...photoData,
        url,
        thumbnail_url: thumbnailUrl,
      },
    });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[projects/photos POST]', msg);
    return NextResponse.json({ error: `Failed to upload photo: ${msg}` }, { status: 500 });
  }
}
