import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
    let q = supabase.from('incidents').select('*').eq('project_id', params.projectId);
    if (status) q = q.eq('status', status);
    if (type) q = q.eq('incident_type', type);
    const { data, error } = await q.order('incident_date', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ incidents: data ?? [] });
  } catch { return NextResponse.json({ incidents: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const count = await supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('project_id', params.projectId);
    const num = (count.count || 0) + 1;
    const { data, error } = await supabase.from('incidents').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      incident_number: `INC-${String(num).padStart(4, '0')}`,
      title: body.title, incident_type: body.incident_type || 'injury',
      incident_date: body.incident_date, incident_time: body.incident_time || null,
      location: body.location || null, description: body.description,
      severity: body.severity || 'minor', injured_person: body.injured_person || null,
      injured_company: body.injured_company || null, injury_type: body.injury_type || null,
      body_part: body.body_part || null, treatment: body.treatment || 'none',
      days_away: body.days_away || 0, days_restricted: body.days_restricted || 0,
      recordable: body.recordable || false, osha_reportable: body.osha_reportable || false,
      witnesses: body.witnesses || [], root_cause: body.root_cause || null,
      corrective_actions: body.corrective_actions || [], preventive_measures: body.preventive_measures || null,
      photos: body.photos || [], status: body.status || 'open',
      reported_by: body.reported_by || null, reported_to: body.reported_to || null,
      supervisor_name: body.supervisor_name || null,
      gps_lat: body.gps_lat || null, gps_lng: body.gps_lng || null,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ incident: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
