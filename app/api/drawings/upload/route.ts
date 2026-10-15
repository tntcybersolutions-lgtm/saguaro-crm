import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { revisionDateValue } from '@/lib/drawing-register';
import { requestDay } from '@/lib/time-zone';
import { sheetKey, nextRevision } from '@/lib/drawing-revisions';

export const dynamic = 'force-dynamic';

// Uploads a drawing file to storage and inserts a row in the canonical
// `drawings` table (tenant-scoped, real uuid id) so it lists and can receive
// markup/pins immediately.
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = (formData.get('projectId') as string) || (formData.get('project_id') as string) || null;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const filename = file?.name || `drawing-${Date.now()}`;
    const db = createServerClient();
    const { data: project } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

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

    // Read a metadata field accepting both snake_case and camelCase keys.
    const field = (...keys: string[]): string => {
      for (const k of keys) {
        const v = formData.get(k);
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return '';
    };

    // Derive a sheet number from the filename (e.g. "A-101 Floor Plan.pdf" -> "A-101").
    const base = filename.replace(/\.[^.]+$/, '');
    const m = base.match(/^([A-Za-z]{1,3}[-\s]?\d{2,4})/);
    // Client sends sheet_number (api key), drawing_number (column alias), or sheetNumber (camel).
    const sheetNumber =
      field('sheet_number', 'sheetNumber', 'drawing_number', 'drawingNumber') ||
      (m ? m[1].toUpperCase().replace(/\s/, '-') : base.slice(0, 24));

    const title = field('title', 'name') || base;
    const discipline = field('discipline') || 'General';

    const row: Record<string, unknown> = {
      project_id: projectId,
      tenant_id: user.tenantId,
      name: title,
      url,
      sheet_number: sheetNumber,
      discipline,
      status: 'current',
      // Dated today unless the client sends the title-block date.
      revision_date: revisionDateValue(field('revision_date', 'revisionDate'), { defaultToday: true, timeZone: (await requestDay(req.headers, db, user.tenantId, 'drawings/upload')).zone }),
    };

    // Optional metadata if the client supplies it.
    const notes = field('notes');
    if (notes) row.notes = notes;
    // Same sheet number on this job = a new revision of that sheet: it becomes
    // current, earlier ones are superseded, and the revision number counts up.
    const { data: same } = await db.from('drawings').select('id, sheet_number, version, status')
      .eq('tenant_id', user.tenantId).eq('project_id', projectId).is('deleted_at', null);
    const earlier = ((same || []) as { id: string; sheet_number: string | null; version: string | null; status: string | null }[])
      .filter((d) => sheetKey(d.sheet_number) === sheetKey(sheetNumber));
    const version = field('version', 'revision');
    row.version = version || (earlier.length ? nextRevision(earlier.map((d) => d.version)) : '1');

    const { data: dbData, error } = await db.from('drawings').insert(row as never).select().single();
    if (error) throw error;
    const supersede = earlier.filter((d) => d.status !== 'void').map((d) => d.id);
    if (supersede.length) {
      const { error: supErr } = await db.from('drawings').update({ status: 'superseded' } as never).in('id', supersede).eq('tenant_id', user.tenantId);
      if (supErr) throw supErr;
    }
    return NextResponse.json({ success: true, drawing: dbData, url, revisionOf: earlier.length ? sheetNumber : null, superseded: supersede.length });
  } catch (err: unknown) {
    return apiError('drawings/upload', err, 'Failed to upload drawing. Please try again.');
  }
}
