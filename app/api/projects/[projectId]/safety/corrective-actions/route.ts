import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { requestDay } from '@/lib/time-zone';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  // Role check, not just sign-in: Safety: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Safety', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const supabase = createServerClient();

    // Try dedicated table first, fall back to safety_incidents with type discriminator
    let data: unknown[] | null = null;
    let error: unknown = null;

    const result = await supabase
      .from('safety_corrective_actions')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (result.error) {
      // Table doesn't exist, try safety_incidents with type='corrective_action'
      const fallback = await supabase
        .from('safety_incidents')
        .select('*')
        .eq('project_id', params.projectId)
        .eq('tenant_id', user.tenantId)
        .eq('type', 'corrective_action')
        .order('created_at', { ascending: false });

      if (fallback.error) {
        // Neither table works, return empty
        return NextResponse.json({ actions: [] });
      }
      data = fallback.data;
    } else {
      data = result.data;
      error = result.error;
    }

    return NextResponse.json({ actions: data || [] });
  } catch (err: unknown) {
    // An empty list here reads as "no outstanding corrective actions" — a safety
    // all-clear. A failed read must surface as an error the UI can retry.
    return apiError('projects/[projectId]/safety/corrective-actions GET', err, 'Failed to load corrective actions');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json();
    const { description, assigned_to, due_date, incident_id } = body;

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // safety_corrective_actions has no incident_id/created_by columns; the source
    // reference column is inspection_id, and there is no created_by column.
    const record = {
      project_id: params.projectId,
      tenant_id: user.tenantId,
      description,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
      status: 'open',
      inspection_id: incident_id || null,
      created_at: new Date().toISOString(),
    };

    // Try dedicated table first
    const { data, error } = await supabase
      .from('safety_corrective_actions')
      .insert(record)
      .select()
      .single();

    if (error) {
      // Fall back to safety_incidents with type discriminator
      // safety_incidents uses corrective_actions (plural) and incident_date; it has
      // no assigned_to/due_date columns, so those are omitted from the fallback.
      const fallbackRecord = {
        project_id: params.projectId,
        tenant_id: user.tenantId,
        type: 'corrective_action',
        description,
        corrective_actions: description,
        severity: 'N/A',
        incident_date: due_date || (await requestDay(req.headers, supabase, user.tenantId, 'safety/corrective-actions')).today,
        status: 'open',
        created_at: new Date().toISOString(),
      };

      const fallback = await supabase
        .from('safety_incidents')
        .insert(fallbackRecord)
        .select()
        .single();

      if (fallback.error) {
        // Both inserts failed — surface a real error instead of returning a
        // fake local-only record (which the client would show as "saved" while
        // nothing persisted, then vanish on reload).
        return NextResponse.json(
          { error: `Failed to create corrective action: ${error.message}` },
          { status: 500 },
        );
      }

      return NextResponse.json({ action: fallback.data });
    }

    return NextResponse.json({ action: data });
  } catch (err: unknown) {
    return apiError('projects/[projectId]/safety/corrective-actions POST', err);
  }
}
