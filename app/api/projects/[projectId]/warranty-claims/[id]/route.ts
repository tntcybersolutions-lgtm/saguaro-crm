import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { toUi, toDbPatch, PATCH_COLUMN, type WarrantyRow } from '@/lib/warranty-claims-shape';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const patch = toDbPatch(body);
    // Refuse an edit we cannot persist rather than 200-ing on a no-op. A client
    // that sends a field with no column deserves to hear about it.
    const unknownKeys = Object.keys(body).filter((k) => !(k in PATCH_COLUMN));
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: unknownKeys.length ? `No savable fields in this update (${unknownKeys.join(', ')}).` : 'Nothing to update.' },
        { status: 400 },
      );
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('warranty_claims')
      .update(patch as never)
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    // maybeSingle() returns null when the row matched nothing — that is a failed
    // write, not a success, so say so instead of letting the page flash "saved".
    if (!data) return NextResponse.json({ error: 'Warranty claim not found.' }, { status: 404 });
    return NextResponse.json({ claim: toUi(data as WarrantyRow) });
  } catch (e: unknown) {
    return apiError('projects/[projectId]/warranty-claims/[id] PATCH', e, "Failed to update the warranty claim.");
  }
}
