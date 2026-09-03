import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/safety/inspections/create
 * Records a safety inspection for the caller's tenant.
 *
 * Writes go through the service-role client (from requirePermission). The
 * previous bare anon client matched no RLS policy on safety_inspections — every
 * policy targets `authenticated` or `service_role` — so every insert was
 * rejected with 42501 and this endpoint returned 500 every time.
 */

/** Body keys the caller may set. tenant_id is deliberately NOT in this list. */
const ALLOWED_INSPECTION_COLUMNS = [
  'project_id', 'inspection_type', 'inspector_name', 'inspection_date',
  'score', 'findings', 'corrective_actions', 'status', 'pdf_url', 'notes',
] as const;

export async function POST(req: NextRequest) {
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const projectId = (body.project_id || body.projectId || null) as string | null;

  const g = await requirePermission(req, 'Safety', 'Edit', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  const insertRow: Record<string, unknown> = {};
  for (const k of ALLOWED_INSPECTION_COLUMNS) {
    if (body[k] !== undefined) insertRow[k] = body[k];
  }
  // Always stamp the session's tenant. Previously tenant_id was accepted from the
  // request body, which let a caller write rows into another tenant.
  insertRow.tenant_id = user.tenantId;

  const { data, error } = await db
    .from('safety_inspections')
    .insert(insertRow as Database['public']['Tables']['safety_inspections']['Insert'])
    .select()
    .single();

  if (error) {
    console.error('[safety/inspections/create] insert failed:', error.message);
    return apiError('safety/inspections/create', error, 'Failed to create safety inspection');
  }

  return NextResponse.json({ success: true, inspection: data });
}
