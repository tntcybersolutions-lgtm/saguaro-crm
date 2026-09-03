import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[projectId]/punch-list
 * Punch items for one project, scoped to the caller's tenant.
 * Delivery logs share the punch_list table (trade='delivery') and are excluded.
 *
 * Uses the service-role client (from requirePermission): every RLS policy on
 * punch_list targets `authenticated` or `service_role`, so the previous bare
 * anon client matched no policy and the SELECT returned zero rows with no
 * error — a permanently empty punch list that looked like a finished project.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  const { data, error } = await db
    .from('punch_list')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', user.tenantId)
    // Exclude delivery logs stored in this same table. A plain .neq() drops rows
    // where trade IS NULL too, because `NULL <> 'delivery'` is NULL, not true —
    // that silently hid every punch item created without a trade.
    .or('trade.is.null,trade.neq.delivery')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[projects/punch-list] read failed:', error.message);
    return apiError('projects/projectId/punch-list', error, 'Failed to load punch list');
  }

  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST /api/projects/[projectId]/punch-list
 * Creates a punch item under the path-param project. Mirrors /api/punch-list/create
 * (same table, same per-project item_number sequence) for callers that post to the
 * project-scoped path — the field inspection flow does, and previously got a 405.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  // Assign the next per-project item number.
  const { data: last } = await db
    .from('punch_list')
    .select('item_number')
    .eq('tenant_id', user.tenantId)
    .eq('project_id', projectId)
    .order('item_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    project_id:  projectId,
    tenant_id:   user.tenantId,
    item_number: (Number((last as Record<string, unknown> | null)?.item_number) || 0) + 1,
    title:       body.title       || '',
    description: body.description || '',
    location:    body.location    || '',
    trade:       body.trade       || 'General',
    priority:    body.priority    || 'medium',
    status:      body.status      || 'open',
    due_date:    body.dueDate     || body.due_date    || null,
    assigned_to: body.assigned_to ?? body.assignedTo  ?? null,
    notes:       body.notes       || '',
  };

  const { data, error } = await db
    .from('punch_list')
    .insert(row as Database['public']['Tables']['punch_list']['Insert'])
    .select()
    .single();

  if (error) {
    console.error('[projects/punch-list] insert failed:', error.message);
    return apiError('projects/projectId/punch-list', error, 'Failed to create punch item');
  }

  return NextResponse.json({ success: true, item: data });
}
