import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signUrl } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';
import { revisionDateValue } from '@/lib/drawing-register';
import { requestDay } from '@/lib/time-zone';
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.projectId || !body.drawing_number || !body.title) {
      return NextResponse.json({ error: 'projectId, drawing_number, and title are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data, error } = await db.from('drawings').insert({
      tenant_id: user.tenantId,
      project_id: body.projectId,
      sheet_number: body.drawing_number || body.drawingNumber || '',
      name: body.title || '',
      discipline: body.discipline || 'Architectural',
      version: body.revision ?? 0,
      // A new sheet is dated today unless the title block says otherwise.
      revision_date: revisionDateValue(body.revision_date ?? body.revisionDate, { defaultToday: true, timeZone: (await requestDay(req.headers, db, user.tenantId, 'drawings/create')).zone }),
      status: body.status || 'current',
      url: body.url || '',
      notes: body.notes || '',
    }).select().single();
    if (error) throw error;
    if (data?.url) (data as any).url = await signUrl((data as any).url);
    return NextResponse.json({ success: true, drawing: data });
  } catch (e: unknown) {
    return apiError('drawings/create', e, 'The drawing could not be saved. Please try again.');
  }
}
