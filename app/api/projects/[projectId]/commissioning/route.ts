import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    let q = supabase.from('commissioning').select('*').eq('project_id', params.projectId);
    if (status) q = q.eq('status', status);
    if (type) q = q.eq('system_type', type);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/commissioning] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/commissioning', e, 'Failed to load items');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('commissioning').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      system_name: body.system_name, system_type: body.system_type || 'mechanical',
      location: body.location || null, phase: body.phase || 'pre_functional',
      status: body.status || 'not_started', assigned_to: body.assigned_to || null,
      scheduled_date: body.scheduled_date || null, checklist: body.checklist || [],
      test_results: body.test_results || [], issues: body.issues || [],
      equipment_tag: body.equipment_tag || null, manufacturer: body.manufacturer || null,
      model_number: body.model_number || null, serial_number: body.serial_number || null,
      warranty_start: body.warranty_start || null, warranty_end: body.warranty_end || null,
      notes: body.notes || null, photos: body.photos || [], created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/commissioning]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
