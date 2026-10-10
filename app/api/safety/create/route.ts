import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';

/**
 * POST /api/safety/create
 * Logs a safety incident for the caller's tenant.
 *
 * Writes go through the service-role client (from requirePermission). The
 * previous bare anon client matched no RLS policy on safety_incidents — every
 * policy targets `authenticated` or `service_role` — so every insert was
 * rejected with 42501 and this endpoint returned 500 for every field report.
 */
export async function POST(req: NextRequest) {
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const projectId = (body.project_id || body.projectId || null) as string | null;

  const g = await requirePermission(req, 'Safety', 'Edit', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  // Dated the reporter's day (device, else company zone) unless the form sent one.
  let incidentDate = (body.incident_date || body.incidentDate) as string | undefined;
  if (!incidentDate) {
    try {
      incidentDate = (await requestDay(req.headers, db, user.tenantId, 'safety/create')).today;
    } catch (e) {
      return apiError('safety/create', e, 'Failed to log safety incident');
    }
  }

  const row = {
    // tenant_id is taken from the authenticated session, never from the body.
    tenant_id:     user.tenantId,
    project_id:    projectId,
    description:   body.description  || '',
    severity:      body.severity     || 'Minor',
    injury_type:   body.injury_type  || body.injuryType  || 'No Injury',
    location:      body.location     || '',
    reported_to:   body.reported_to  || body.reportedTo  || '',
    incident_date: incidentDate,
    reported_by:   user.email        || 'Field User',
    status:        'open',
  };

  const { data, error } = await db
    .from('safety_incidents')
    .insert(row as Database['public']['Tables']['safety_incidents']['Insert'])
    .select()
    .single();

  if (error) {
    console.error('[safety/create] insert failed:', error.message);
    return apiError('safety/create', error, 'Failed to log safety incident');
  }

  return NextResponse.json({ success: true, incident: data });
}
