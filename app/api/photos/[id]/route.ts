import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    const fields: Record<string, any> = {};
    // Pass through the plain allow-listed columns (web sends these directly).
    // `url` and `location` were previously omitted, so editing the Photo URL or
    // Location on the web detail panel returned success but persisted nothing.
    const allowed = ['title','description','album','taken_at','tags','taken_by','url','location'];
    for (const k of allowed) { if (body[k] !== undefined) fields[k] = body[k]; }
    // Caption: mobile maps caption -> {description} but the photos grid/lightbox
    // READS `caption` first (list does `caption ?? description`). Accept either
    // key and write to the `caption` column so the edit actually shows up.
    const captionVal = body.caption ?? body.description;
    if (captionVal !== undefined) fields.caption = captionVal;
    // file_name -> real `filename` column (mobile maps file_name -> title above,
    // but also accept the underlying column name).
    const filenameVal = body.filename ?? body.file_name;
    if (filenameVal !== undefined) fields.filename = filenameVal;
    const { error } = await db.from('photos').update(fields).eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('photos/[id] PUT', e);
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db.from('photos').delete().eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('photos/[id] DELETE', e);
  }
}
