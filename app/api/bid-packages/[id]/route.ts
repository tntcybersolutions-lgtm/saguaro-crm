import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/**
 * One bid package — what the GC's package page reads and edits.
 *
 * Every read is tenant-scoped and every failure is said out loud. The handlers
 * here ended in `catch {}` returning a bare 500 with nothing in the log, and
 * the GET ignored the error on each of its four reads — a failed invite read
 * came back as "no subs invited yet", which is the one thing a GC chasing bids
 * must never be told wrongly.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const [pkgRes, itemsRes, invitesRes, subsRes] = await Promise.all([
      db.from('bid_packages').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle(),
      /* sort_order is what the jacket and the bid form order by; it is 0 on
         rows written before writers set it, so created_at breaks the tie. */
      db.from('bid_package_items').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      db.from('bid_package_invites').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false }),
      db.from('bid_submissions').select('*').eq('bid_package_id', id).eq('tenant_id', user.tenantId)
        .order('base_amount', { ascending: true }),
    ]);
    for (const r of [pkgRes, itemsRes, invitesRes, subsRes]) if (r.error) throw r.error;
    if (!pkgRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    /* The last invitation email to each invitee, from the communications
       record — so the page can say "not delivered: <reason>" for a send that
       failed, not just "not emailed". The record is a convenience on top of
       the invite's own sent stamp: if it cannot be read, the page still loads
       (and the read is logged), it just cannot give the reason. */
    const invites = (invitesRes.data || []) as Array<Record<string, any>>;
    const lastEmail: Record<string, { status: string; error: string | null; created_at: string }> = {};
    if (invites.length) {
      const { data: log, error: logErr } = await db
        .from('communication_log')
        .select('related_id, status, error, created_at')
        .eq('tenant_id', user.tenantId)
        .eq('bid_package_id', id)
        .eq('related_type', 'bid_invite')
        .order('created_at', { ascending: false })
        .limit(500);
      if (logErr) console.error('[bid-packages/[id]] invite email record not read', logErr);
      for (const row of (log || []) as Array<Record<string, any>>) {
        if (row.related_id && !lastEmail[row.related_id]) {
          lastEmail[row.related_id] = { status: row.status, error: row.error ?? null, created_at: row.created_at };
        }
      }
    }

    return NextResponse.json({
      bidPackage: pkgRes.data,
      items: itemsRes.data || [],
      invites: invites.map((iv) => ({ ...iv, last_email: lastEmail[iv.id] ?? null })),
      submissions: subsRes.data || [],
    });
  } catch (e) {
    return apiError('bid-packages/[id] GET', e, 'This bid package could not be loaded. Try again.');
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
    return apiError('bid-packages/[id] PATCH', e, 'The bid package could not be saved. Try again.');
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
    return apiError('bid-packages/[id] DELETE', e, 'The bid package could not be deleted. Try again.');
  }
}
