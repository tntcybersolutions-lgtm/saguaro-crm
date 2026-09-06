import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* Project safety incidents — list and create.
 *
 * Both handlers targeted a table called `incidents`, which does not exist in
 * the database, so every request failed. The real table is `safety_incidents`.
 * Four of the columns the POST wrote do not exist there either:
 *   title              -> no column; the field is description
 *   treatment          -> treatment_type
 *   recordable         -> osha_recordable
 *   gps_lat / gps_lng  -> these do exist and are kept
 * The GET also swallowed every error as an empty list.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;

  try {
    const supabase = createServerClient();
    const { data: project } = await supabase
      .from('projects').select('id')
      .eq('id', projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');

    let q = supabase
      .from('safety_incidents')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId);
    if (status) q = q.eq('status', status);
    if (type) q = q.eq('incident_type', type);

    const { data, error } = await q.order('incident_date', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ incidents: data ?? [] });
  } catch (e: unknown) {
    // Was `catch { return { incidents: [] } }` — a failure was indistinguishable
    // from a project with no incidents.
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[incidents GET] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;

  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { data: project } = await supabase
      .from('projects').select('id')
      .eq('id', projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { count } = await supabase
      .from('safety_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId);
    const num = (count || 0) + 1;

    const { data, error } = await supabase.from('safety_incidents').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      incident_number: `INC-${String(num).padStart(4, '0')}`,
      incident_type: body.incident_type || 'injury',
      incident_date: body.incident_date,
      incident_time: body.incident_time || null,
      location: body.location || null,
      // `title` has no column on safety_incidents; fall back to it for the
      // description so a caller sending only a title still records something.
      description: body.description || body.title || null,
      severity: body.severity || 'minor',
      injured_person: body.injured_person || null,
      injured_company: body.injured_company || null,
      injury_type: body.injury_type || null,
      body_part: body.body_part || null,
      treatment_type: body.treatment_type || body.treatment || 'none',
      days_away: body.days_away || 0,
      days_restricted: body.days_restricted || 0,
      osha_recordable: body.osha_recordable ?? body.recordable ?? false,
      osha_reportable: body.osha_reportable || false,
      witnesses: body.witnesses || [],
      root_cause: body.root_cause || null,
      corrective_actions: body.corrective_actions || [],
      preventive_measures: body.preventive_measures || null,
      photos: body.photos || [],
      status: body.status || 'open',
      reported_by: body.reported_by || null,
      reported_to: body.reported_to || null,
      supervisor_name: body.supervisor_name || null,
      gps_lat: body.gps_lat || null,
      gps_lng: body.gps_lng || null,
      created_by: user.id,
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ incident: data }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[incidents POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
