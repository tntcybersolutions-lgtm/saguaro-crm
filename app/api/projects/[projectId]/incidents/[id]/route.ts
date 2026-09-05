import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/* Project safety incidents.
 *
 * This route wrote to a table called `incidents`, which does not exist in the
 * database — every PATCH failed at runtime. The real table is `safety_incidents`.
 * Its column names also differ from what this route accepted, so the two legacy
 * names are mapped rather than silently dropped.
 */

// Column names as they exist on public.safety_incidents.
const COLUMNS = [
  'incident_type', 'incident_date', 'incident_time', 'location', 'description',
  'severity', 'injured_person', 'injured_company', 'injury_type', 'body_part',
  'treatment_type', 'days_away', 'days_restricted', 'osha_recordable',
  'osha_reportable', 'witnesses', 'root_cause', 'corrective_actions',
  'preventive_measures', 'photos', 'status', 'reported_by', 'reported_to',
  'supervisor_name', 'near_miss', 'immediate_actions', 'work_restrictions',
  'injury_description', 'employee_name', 'incident_number',
] as const;

// Names this route used to accept, and the column they actually belong to.
const RENAMED: Record<string, string> = {
  treatment: 'treatment_type',
  recordable: 'osha_recordable',
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, id } = await params;

  try {
    const supabase = createServerClient();
    const body = await req.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const ignored: string[] = [];

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value === undefined) continue;
      const col = RENAMED[key] ?? key;
      if ((COLUMNS as readonly string[]).includes(col)) updates[col] = value;
      else ignored.push(key);
    }

    const { data, error } = await supabase
      .from('safety_incidents')
      .update(updates)
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

    // Report anything the caller sent that has no column, rather than dropping
    // it silently and returning 200 as though it had been saved.
    return NextResponse.json(ignored.length ? { incident: data, ignored } : { incident: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[incidents PATCH] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
