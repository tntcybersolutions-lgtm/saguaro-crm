import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Real columns on `safety_incidents`. Only these get updated.
const REAL_COLUMNS = new Set([
  'project_id', 'description', 'severity', 'injury_type', 'location', 'reported_to',
  'incident_date', 'reported_by', 'status', 'time_of_incident', 'weather_conditions', 'witnesses',
  'root_cause', 'corrective_actions', 'preventive_measures', 'photos', 'supervisor_name', 'gps_lat',
  'gps_lng', 'osha_reportable', 'injury_description', 'body_part', 'treatment_type',
  'hospital_name', 'work_restrictions', 'days_away', 'incident_type', 'near_miss', 'osha_recordable',
  'type', 'injury_nature', 'days_restricted', 'employee_name', 'employee_id', 'reported_to_osha',
  'osha_case_number', 'first_aid_only', 'medical_treatment', 'injured_party', 'witness_names',
  'immediate_actions', 'reviewed_by', 'reviewed_at', 'incident_number', 'incident_time',
  'injured_person', 'injured_company',
]);

// PATCH /api/safety/incidents/[id] -> update one incident (tenant-scoped)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = createServerClient();

    // Pull a value accepting BOTH camelCase and snake_case (and a few aliases).
    const pick = (...keys: string[]): unknown => {
      for (const k of keys) {
        if (body[k] !== undefined) return body[k];
      }
      return undefined;
    };

    // Map the same fields safety_incidents/create accepts, camel+snake tolerant.
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
      preventive_measures: pick('preventive_measures', 'preventiveMeasures'),
      near_miss: pick('near_miss', 'nearMiss'),
      osha_recordable: pick('osha_recordable', 'oshaRecordable'),
      osha_reportable: pick('osha_reportable', 'oshaReportable'),
      first_aid_only: pick('first_aid_only', 'firstAidOnly'),
      immediate_actions: pick('immediate_actions', 'immediateActions'),
      reviewed_by: pick('reviewed_by', 'reviewedBy'),
      reviewed_at: pick('reviewed_at', 'reviewedAt'),
      status: pick('status'),
    };

    const updateRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (!REAL_COLUMNS.has(k)) continue;
      if (v === undefined) continue;
      updateRow[k] = v;
    }
    // Coerce booleans only when explicitly provided.
    if (mapped.near_miss !== undefined) updateRow.near_miss = !!mapped.near_miss;
    if (mapped.osha_recordable !== undefined) updateRow.osha_recordable = !!mapped.osha_recordable;
    if (mapped.osha_reportable !== undefined) updateRow.osha_reportable = !!mapped.osha_reportable;
    if (mapped.first_aid_only !== undefined) updateRow.first_aid_only = !!mapped.first_aid_only;

    const { data, error } = await db
      .from('safety_incidents')
      // Row is built dynamically from an allow-list of real columns; cast to
      // satisfy the generated typed-update signature.
      .update(updateRow as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, incident: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/incidents/id', e);
  }
}

// DELETE /api/safety/incidents/[id] -> delete one incident (tenant-scoped)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Safety', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('safety_incidents')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/incidents/id', e);
  }
}
