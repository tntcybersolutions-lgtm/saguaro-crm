import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Uploads a drawing file to storage and inserts a row in the canonical
// `drawings` table (tenant-scoped, real uuid id) so it lists and can receive
// markup/pins immediately.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = (formData.get('projectId') as string) || (formData.get('project_id') as string) || null;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const filename = file?.name || `drawing-${Date.now()}`;
    const db = createServerClient();

    let url = '';
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = `projects/${projectId}/drawings/${Date.now()}-${filename}`;
      const { data: uploadData, error: uploadError } = await db.storage
        .from('project-files')
        .upload(path, buffer, { contentType: file.type || 'application/octet-stream' });
      if (!uploadError && uploadData) {
        const { data: urlData } = db.storage.from('project-files').getPublicUrl(path);
        url = urlData?.publicUrl || '';
      }
    }

    // Derive a sheet number from the filename (e.g. "A-101 Floor Plan.pdf" -> "A-101").
    const base = filename.replace(/\.[^.]+$/, '');
    const m = base.match(/^([A-Za-z]{1,3}[-\s]?\d{2,4})/);
    const sheetNumber =
      (formData.get('sheet_number') as string) ||
      (m ? m[1].toUpperCase().replace(/\s/, '-') : base.slice(0, 24));

    const row: Record<string, unknown> = {
      project_id: projectId,
      tenant_id: user.tenantId,
      name: (formData.get('title') as string) || base,
      url,
      sheet_number: sheetNumber,
      discipline: (formData.get('discipline') as string) || 'General',
      status: 'current',
    };

    const { data: dbData, error } = await db.from('drawings').insert(row).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, drawing: dbData, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[drawings/upload] error:', msg);
    return NextResponse.json({ error: `Failed to upload drawing: ${msg}` }, { status: 500 });
  }
}
