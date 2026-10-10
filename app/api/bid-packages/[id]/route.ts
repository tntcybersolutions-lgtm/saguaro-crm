import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiFail } from '@/lib/api-error';
import { packageUpdate } from '@/lib/bid-package-update';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const [pkgRes, itemsRes, invitesRes, subsRes] = await Promise.all([
      db.from('bid_packages').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle(),
      /* The bid form's order — the same order the jacket and the bidder see.
         Legacy rows all carry sort_order 0, so created_at and id keep it stable. */
      db.from('bid_package_items').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId)
        .order('sort_order').order('created_at').order('id'),
      db.from('bid_package_invites').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('bid_submissions').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('base_amount'),
    ]);
    for (const r of [pkgRes, itemsRes, invitesRes, subsRes]) if (r.error) throw r.error;
    if (!pkgRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ bidPackage: pkgRes.data, items: itemsRes.data || [], invites: invitesRes.data || [], submissions: subsRes.data || [] });
  } catch (e) {
    return apiError('bid-packages/get', e, "Couldn't load this bid package. Please try again.");
  }
}

/* ── PATCH — the package's details ──────────────────────────────────────────
 *
 * What the "Edit Package Details" form on the package page saves, and what the
 * jacket's empty dividers send a GC to: instructions to bidders, scope, the due
 * date, insurance limits, bond and prevailing wage. Until that form existed
 * nothing called this route, so a package created without instructions could
 * never be given any.
 *
 * Each field is checked for its column's type before it is written; a wrong
 * one is a 400 that names the field, not a 500.
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiFail('Send the fields to change as JSON.', 400);
    const parsed = packageUpdate(body as Record<string, unknown>);
    if ('bad' in parsed) return apiFail(`${parsed.bad.field} ${parsed.bad.why}.`, 400);
    const { fields } = parsed;
    if (Object.keys(fields).length === 0) return apiFail('Nothing to change.', 400);

    /* A GC has now touched this package. Sage's rebuild uses this to tell a
       draft it may replace from one somebody has worked on. */
    fields.jacket_edits = { edited_at: new Date().toISOString(), edited_by: user.id };

    const db = createServerClient();
    const { data, error } = await db
      .from('bid_packages')
      .update(fields as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('Bid package not found', 404);
    return NextResponse.json({ success: true, bidPackage: data });
  } catch (e) {
    return apiError('bid-packages/patch', e, "Couldn't save the package details. Please try again.");
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return PATCH(req, context);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('bid_packages')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('bid-packages/delete', e, "Couldn't delete the bid package. Please try again.");
  }
}
