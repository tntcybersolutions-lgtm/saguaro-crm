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
    const type = url.searchParams.get('type');
    const method = url.searchParams.get('method');
    let q = supabase.from('waste_tracking').select('*').eq('project_id', params.projectId);
    if (type) q = q.eq('waste_type', type);
    if (method) q = q.eq('disposal_method', method);
    const { data, error } = await q.order('waste_date', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ records: data ?? [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/waste-tracking] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/waste-tracking', e, 'Failed to load records');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('waste_tracking').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      ticket_number: body.ticket_number || null, waste_date: body.waste_date,
      material_type: body.waste_type, waste_type: body.waste_type, disposal_method: body.disposal_method || 'landfill',
      weight: body.quantity, unit: body.unit || 'tons',
      hauler_name: body.hauler_name || null, hauler_ticket: body.hauler_ticket || null,
      destination_facility: body.destination_facility || null, cost: body.cost || 0,
      manifest_number: body.manifest_number || null, notes: body.notes || null,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ record: data }, { status: 201 });
  } catch (e: unknown) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/waste-tracking]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
