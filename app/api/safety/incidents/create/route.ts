import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

// Real safety_incidents columns that a caller may set.
const ALLOWED_INCIDENT_COLUMNS = [
  'tenant_id', 'project_id', 'description', 'severity', 'injury_type', 'location', 'reported_to',
  'incident_date', 'reported_by', 'status', 'time_of_incident', 'weather_conditions', 'witnesses',
  'root_cause', 'corrective_actions', 'preventive_measures', 'photos', 'supervisor_name', 'gps_lat',
  'gps_lng', 'created_by', 'osha_reportable', 'injury_description', 'body_part', 'treatment_type',
  'hospital_name', 'work_restrictions', 'days_away', 'incident_type', 'near_miss', 'osha_recordable',
  'type', 'injury_nature', 'days_restricted', 'employee_name', 'employee_id', 'reported_to_osha',
  'osha_case_number', 'first_aid_only', 'medical_treatment', 'injured_party', 'witness_names',
  'immediate_actions', 'reviewed_by', 'reviewed_at',
];

// The web safety form posts camelCase/singular aliases (projectId, date,
// corrective_action) that are NOT real columns. Without this mapping the
// column-pick below silently drops them: the incident inserts with a NULL
// project_id (orphaned — never shows again on reload, which filters by
// project_id) and a NULL incident_date. Map aliases onto their real columns.
const FIELD_ALIASES: Record<string, string> = {
  projectId: 'project_id',
  date: 'incident_date',
  incidentDate: 'incident_date',
  corrective_action: 'corrective_actions',
  correctiveAction: 'corrective_actions',
  injuryType: 'injury_type',
  reportedTo: 'reported_to',
};

export async function POST(req: NextRequest) {
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const projectId = (body.projectId ?? body.project_id) as string | undefined;
  const g = await requirePermission(req, 'Safety', 'Edit', { projectId: projectId ?? null });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    // Fold aliased client field names onto their real columns.
    const normalized: Record<string, unknown> = { ...body };
    for (const [alias, col] of Object.entries(FIELD_ALIASES)) {
      if (normalized[alias] !== undefined && normalized[col] === undefined) {
        normalized[col] = normalized[alias];
      }
      delete normalized[alias];
    }

    const insertRow: Record<string, unknown> = {};
    for (const k of ALLOWED_INCIDENT_COLUMNS) {
      if (normalized[k] !== undefined) insertRow[k] = normalized[k];
    }

    // Server-owned columns — never trust the client for tenant scoping.
    insertRow.tenant_id = user.tenantId;
    if (insertRow.reported_by === undefined) insertRow.reported_by = user.email || 'Field User';

    // Refuse to persist an orphaned incident: project_id is required so the
    // row is actually visible from the project's safety view.
    if (!insertRow.project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const { data, error } = await g.db.from('safety_incidents').insert(insertRow as never).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, incident: data });
  } catch (err: unknown) {
    return apiError('safety/incidents/create POST', err);
  }
}
