import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { assertProjectInTenant } from '@/lib/assert-project';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({}));
    /* Accept either spelling. /api/pay-apps, /api/change-orders,
       /api/daily-logs and /api/cost-codes all take projectId OR
       project_id; these three took project_id alone, so the same
       client object that created a pay application failed here with
       "project_id is required" and no clue the key had changed
       between two steps of one workflow. */
    const projectId = body.project_id ?? body.projectId;

    if (!projectId || !body.vendor_name) {
      return NextResponse.json({ error: 'project_id and vendor_name are required' }, { status: 400 });
    }

    const db = createServerClient();

    /* This project must belong to the caller's tenant. Without the check a

       project id from ANOTHER tenant satisfies the foreign key, and the row

       is written — stamped with the caller's tenant, pointing at a customer's

       job they cannot see. See lib/assert-project. */

    const notOurs = await assertProjectInTenant(db, user.tenantId, projectId);

    if (notOurs) return notOurs;

    const { data, error } = await db
      .from('invoices')
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        project_id: projectId,
        // Both create screens bill the owner. A vendor / sub bill says so explicitly.
        direction: body.direction === 'payable' ? 'payable' : 'receivable',
        vendor_name: body.vendor_name,
        invoice_number: body.invoice_number || null,
        vendor_email: body.vendor_email || null,
        description: body.description || null,
        category: body.category || null,
        cost_code: body.cost_code || null,
        // Server-canonical money: total is ALWAYS amount + tax — a client
        // total can be stale or zero (the $0.00-beside-$67,800 bug class).
        // ?? keeps legitimate zeros; statuses store lowercase.
        amount: body.amount ?? null,
        tax: body.tax ?? 0,
        total: (Number(body.amount) || 0) + (Number(body.tax) || 0),
        due_date: body.due_date || null,
        status: String(body.status || 'draft').toLowerCase(),
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ invoice: data });
  } catch (e) {
    // Was a fully silent `catch { 'Internal server error' }` — no log at all.
    // A failed invoice insert (NOT NULL on vendor_name/project_id, a bad
    // category, RLS) vanished with no server-side trace. apiError logs the real
    // cause and returns a correlation id the GC can read back to support (§0/§3).
    return apiError('invoices/create', e, 'Could not create the invoice');
  }
}
