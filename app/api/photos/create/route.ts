import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signUrl } from '@/lib/storage-signing';
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    if (!body.projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('photos').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      title: body.title || '',
      description: body.description || '',
      album: body.album || 'General',
      taken_at: body.taken_at || new Date().toISOString(),
      url: body.url || '',
      tags: body.tags || [],
      taken_by: body.taken_by || '',
      // `location` is collected by the web Add-Photo form; persist it (column
      // added via add_photos_location_column) instead of silently dropping it.
      location: body.location || null,
    }).select().single();
    if (error) throw error;
    // sign the URL for immediate display (project-files bucket is private)
    if (data?.url) (data as any).url = await signUrl((data as any).url);
    return NextResponse.json({ success: true, photo: data });
  } catch (e) {
    /* This swallowed the reason silently, which is why "photos are not saving"
       had no server-side trail to follow. The client still gets a generic
       message; the log gets the truth. */
    console.error('[photos/create]', e);
    return NextResponse.json({ error: 'The photo could not be saved. Please try again.' }, { status: 500 });
  }
}
