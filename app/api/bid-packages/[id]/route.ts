import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    /* Every read carries the tenant (the child rows used to be read by
       package id alone), and a refused read is an error: it used to come back
       as "Not found" or as a package with no line items, invites or bids. The
       bid form is in the order the jacket shows it (sort_order, then entry
       order), not by uuid. */
    const [pkgRes, itemsRes, invitesRes, subsRes] = await Promise.all([
      db.from('bid_packages').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle(),
      db.from('bid_package_items').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      db.from('bid_package_invites').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('created_at', { ascending: false }),
      db.from('bid_submissions').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('base_amount'),
    ]);
    for (const r of [pkgRes, itemsRes, invitesRes, subsRes]) if (r.error) throw r.error;
    if (!pkgRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ bidPackage: pkgRes.data, items: itemsRes.data || [], invites: invitesRes.data || [], submissions: subsRes.data || [] });
  } catch (e) {
    return apiError('bid-packages/[id] GET', e, "Couldn't load this bid package. Please try again.");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    const allowed = [
      'name', 'trade', 'description', 'scope_of_work', 'scope_summary', 'scope_narrative',
      'due_date', 'pre_bid_date', 'status', 'budget_estimate', 'notes',
      'bid_instructions', 'is_public_project', 'requires_bond', 'insurance_requirements',
      'csi_codes',
    ];
    const fields: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }
    const { data, error } = await db
      .from('bid_packages')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, bidPackage: data });
  } catch (e) {
    return apiError('bid-packages/[id] PATCH', e, "Couldn't save this bid package. Please try again.");
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
    return apiError('bid-packages/[id] DELETE', e, "Couldn't delete this bid package. Please try again.");
  }
}
