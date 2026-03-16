import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('project_photos').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      title: body.title || '',
      description: body.description || '',
      album: body.album || 'General',
      location: body.location || '',
      taken_at: body.taken_at || new Date().toISOString(),
      url: body.url || '',
      tags: body.tags || [],
      taken_by: body.taken_by || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, photo: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
