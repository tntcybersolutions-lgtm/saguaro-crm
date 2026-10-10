import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Map legacy/client field names to real subcontractors columns and drop
// non-existent ones so writes don't error on schema-divergent payloads.
const columnMap: Record<string, string> = {
  name: 'company_name',
  licenseNumber: 'license_number',
  licenseState: 'license_state',
};
const dropKeys = new Set(['project_id', 'projectId', 'contract_amount', 'contractAmount', 'w9_status']);
const validColumns = new Set([
  'company_name', 'contact_name', 'email', 'contact_email', 'phone', 'contact_phone',
  'address', 'city', 'state', 'zip', 'trade', 'trades', 'license_number', 'license_state',
  'license_expiry', 'license_expiration', 'license_type', 'insurance_expiry', 'w9_on_file',
  'ein', 'status', 'rating', 'notes', 'tags', 'dba_name', 'bonding_capacity',
]);

function buildUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (dropKeys.has(k)) continue;
    const mapped = columnMap[k] || k;
    if (validColumns.has(mapped)) updates[mapped] = v;
  }
  return updates;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('subcontractors')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
    return NextResponse.json({ sub: data });
  } catch (e) {
    // Was a silent `catch { 'Internal server error' }`. A failed read must not
    // read as a generic 500 with no server trace — apiError logs it (§0/§3).
    return apiError('subs/id', e, 'Could not load the subcontractor');
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the changes as JSON.' }, { status: 400 });
    const db = createServerClient();
    const updates = buildUpdates(body as Record<string, unknown>);
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update — none of the fields sent are subcontractor fields.' }, { status: 400 });
    }
    const { data, error } = await db
      .from('subcontractors')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
    return NextResponse.json({ sub: data });
  } catch (e) {
    // Compliance edits (insurance_expiry, w9_on_file, license_expiry) land here.
    // A silently-swallowed failure was indistinguishable from "saved" (§0/§3).
    return apiError('subs/id', e, 'Could not save the subcontractor');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the changes as JSON.' }, { status: 400 });
    const db = createServerClient();
    const updates = buildUpdates(body as Record<string, unknown>);
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update — none of the fields sent are subcontractor fields.' }, { status: 400 });
    }
    const { data, error } = await db
      .from('subcontractors')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
    return NextResponse.json({ sub: data });
  } catch (e) {
    // Same compliance-update path as PUT; honest surface + correlation id.
    return apiError('subs/id', e, 'Could not save the subcontractor');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  /* Deleting a company cascades to every job it is on and to its compliance
     documents, insurance and scorecards — Full, not Edit. Taking a company
     off one job is DELETE /api/projects/[projectId]/subs/[subId]. */
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('subcontractors')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) {
      if ((error as { code?: string }).code === '23503') {
        return NextResponse.json({ error: 'This company has contracts, lien waivers or prequalification on file, so it stays. Set its status to Inactive instead.' }, { status: 409 });
      }
      throw error;
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    // A failed delete (an FK from a project/compliance row still pointing here)
    // must surface, not vanish behind a flat 500 (§0/§3).
    return apiError('subs/id', e, 'Could not delete the subcontractor');
  }
}
