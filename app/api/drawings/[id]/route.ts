import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { revisionDateValue } from '@/lib/drawing-register';
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Accept BOTH camelCase and snake_case from every client (mobile sends
    // sheet_number/title/discipline; web may send drawing_number/sheetNumber)
    // and write to the REAL `drawings` columns the list/detail screens read:
    //   name <- title, url, sheet_number, discipline, version <- revision.
    const pick = (...keys: string[]) => {
      for (const k of keys) { if (body[k] !== undefined) return body[k]; }
      return undefined;
    };
    const candidates: Record<string, any> = {
      name: pick('name', 'title'),
      url: pick('url', 'file_url', 'fileUrl'),
      sheet_number: pick('sheet_number', 'sheetNumber', 'sheet_no', 'drawing_number', 'drawingNumber'),
      discipline: pick('discipline'),
      version: pick('version', 'revision'),
      revision_date: pick('revision_date', 'revisionDate'),
      status: pick('status'),
      notes: pick('notes'),
    };
    // A bad or blank date clears the field instead of 500ing the whole save.
    if (candidates.revision_date !== undefined) candidates.revision_date = revisionDateValue(candidates.revision_date);
    const fields: Record<string, any> = {};
    for (const [col, val] of Object.entries(candidates)) { if (val !== undefined) fields[col] = val; }
    const { error } = await db.from('drawings').update(fields).eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiError('drawings/update', e, 'The drawing could not be updated. Please try again.');
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    // Kept, not erased: a removed sheet leaves the register but its pins,
    // markups and history stay recoverable.
    const { error } = await db.from('drawings').update({ deleted_at: new Date().toISOString() } as never).eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiError('drawings/delete', e, 'The drawing could not be deleted. Please try again.');
  }
}
