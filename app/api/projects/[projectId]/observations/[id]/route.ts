import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Single observation.
 *
 * Caller: app/field/observations/page.tsx
 *   updateCAStatus() → PATCH /api/projects/{projectId}/observations/{id}
 *     with { corrective_action: {...}, status }
 *
 * observations real columns: title, description, observation_type, severity,
 * location, photo_urls (jsonb), assigned_to, status, due_date, resolved_at,
 * corrective_action (jsonb), metadata (jsonb).
 * The field page sends `corrective_action` (a sub-object) which is now persisted
 * into its own jsonb column; rich/structured fields fold into metadata.
 */

const validColumns = new Set([
  'title', 'description', 'observation_type', 'severity', 'location',
  'photo_urls', 'assigned_to', 'status', 'due_date', 'resolved_at',
  'corrective_action', 'metadata',
]);

export async function GET(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  // Role check, not just sign-in: Safety: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Safety', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ observation: data });
  } catch (e) {
    return apiError('projects/[projectId]/observations/[id] GET', e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (validColumns.has(k)) updates[k] = v;
    }
    // Auto-stamp resolved_at when an observation is closed/resolved.
    if (
      (updates.status === 'closed' || updates.status === 'resolved') &&
      updates.resolved_at === undefined
    ) {
      updates.resolved_at = new Date().toISOString();
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('observations')
      .update(updates)
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ observation: data });
  } catch (e) {
    return apiError('projects/[projectId]/observations/[id] PATCH', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Safety', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('observations')
      .delete()
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('projects/[projectId]/observations/[id] DELETE', e);
  }
}
