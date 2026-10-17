import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'Documents', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.file_name || !body.file_url) {
      return NextResponse.json({ error: 'file_name and file_url are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('file_uploads').insert({
      tenant_id: user.tenantId,
      project_id: body.project_id || null,
      file_name: body.file_name,
      file_url: body.file_url,
      file_type: body.file_type || '',
      file_size: body.file_size || 0,
      storage_path: body.storage_path || '',
      category: body.category || 'general',
      uploaded_by: user.id,
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, upload: data });
  } catch (e) {
    return apiError('uploads POST', e);
  }
}
