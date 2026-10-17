import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/safety/incidents?projectId=  -> { incidents: [...] }
export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Safety: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Safety', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  try {
    const db = createServerClient();
    let q = db.from('safety_incidents').select('*').eq('tenant_id', user.tenantId).order('incident_date', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ incidents: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/incidents', e);
  }
}

// POST /api/safety/incidents  -> report an incident
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = createServerClient();

    // Pull a value accepting BOTH camelCase and snake_case (and a few aliases).
    const pick = (...keys: string[]): unknown => {
      for (const k of keys) {
        if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
      }
      return undefined;
    };

    // Real columns on `safety_incidents`. Only these get inserted.
    const REAL_COLUMNS = new Set([
      'project_id', 'description', 'severity', 'injury_type', 'location', 'reported_to',
      'incident_date', 'reported_by', 'status', 'time_of_incident', 'weather_conditions', 'witnesses',
      'root_cause', 'corrective_actions', 'preventive_measures', 'photos', 'supervisor_name', 'gps_lat',
      'gps_lng', 'created_by', 'osha_reportable', 'injury_description', 'body_part', 'treatment_type',
      'hospital_name', 'work_restrictions', 'days_away', 'incident_type', 'near_miss', 'osha_recordable',
      'type', 'injury_nature', 'days_restricted', 'employee_name', 'employee_id', 'reported_to_osha',
      'osha_case_number', 'first_aid_only', 'medical_treatment', 'injured_party', 'witness_names',
      'immediate_actions', 'reviewed_by', 'reviewed_at', 'incident_number', 'incident_time',
      'injured_person', 'injured_company',
    ]);

    // Map every listed field, accepting camelCase + snake_case from the body.
    const mapped: Record<string, unknown> = {
      project_id: pick('project_id', 'projectId'),
      description: pick('description'),
      severity: pick('severity'),
      incident_type: pick('incident_type', 'incidentType'),
      injured_person: pick('injured_person', 'injuredPerson', 'injured_party'),
      body_part: pick('body_part', 'bodyPart'),
      injury_type: pick('injury_type', 'injuryType'),
      location: pick('location'),
      incident_date: pick('incident_date', 'incidentDate'),
      incident_time: pick('incident_time', 'incidentTime', 'time_of_incident'),
      witnesses: pick('witnesses', 'witness_names'),
      root_cause: pick('root_cause', 'rootCause'),
      corrective_actions: pick('corrective_actions', 'correctiveActions'),
      near_miss: pick('near_miss', 'nearMiss'),
      osha_recordable: pick('osha_recordable', 'oshaRecordable'),
      first_aid_only: pick('first_aid_only', 'firstAidOnly'),
      // Carry-through for any extra fields the older form/clients still send.
      osha_reportable: pick('osha_reportable', 'oshaReportable'),
      immediate_actions: pick('immediate_actions', 'immediateActions'),
      status: pick('status'),
    };

    const insertRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (!REAL_COLUMNS.has(k)) continue;
      if (v === undefined) continue;
      insertRow[k] = v;
    }
    // Default required-ish optionals to null so the row is well-formed.
    if (insertRow.severity === undefined) insertRow.severity = null;
    if (insertRow.incident_type === undefined) insertRow.incident_type = null;
    if (insertRow.incident_date === undefined) insertRow.incident_date = new Date().toISOString();
    // Booleans default to false rather than null.
    insertRow.near_miss = mapped.near_miss === undefined ? false : !!mapped.near_miss;
    insertRow.osha_recordable = mapped.osha_recordable === undefined ? false : !!mapped.osha_recordable;
    insertRow.first_aid_only = mapped.first_aid_only === undefined ? false : !!mapped.first_aid_only;
    if (mapped.osha_reportable !== undefined) insertRow.osha_reportable = !!mapped.osha_reportable;
    insertRow.created_by = user.id;

    const { data, error } = await db
      .from('safety_incidents')
      // Row is built dynamically from an allow-list of real columns; cast to
      // satisfy the generated typed-insert signature.
      .insert({ ...insertRow, tenant_id: user.tenantId } as never)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, incident: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/incidents', e);
  }
}
