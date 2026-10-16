import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { summarizeContract, toCents, toDollars, type ChangeOrder } from '@/lib/calc';
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

    if (!projectId || !body.title || !body.party_name) {
      return NextResponse.json({ error: 'Missing required fields: project_id, title, party_name' }, { status: 400 });
    }

    const db = createServerClient();

    // Contract money is computed by the exact-cents engine. The contract amount
    // is the original contract plus only APPROVED change orders (pending/rejected
    // are excluded). DB stores dollars, so convert to cents for math and back to
    // dollars to store.
    let amount: number | null = null;
    if (body.amount !== undefined && body.amount !== null) {
      const originalCents = toCents(body.amount as number | string);
      if (Array.isArray(body.change_orders)) {
        const changeOrders: ChangeOrder[] = body.change_orders.map(
          (c: { id?: string; description?: string; amount: number | string; status: ChangeOrder['status'] }) => ({
            id: String(c.id ?? ''),
            description: String(c.description ?? ''),
            amount: toCents(c.amount),
            status: c.status,
          })
        );
        amount = toDollars(summarizeContract(originalCents, changeOrders).revisedContract);
      } else {
        amount = toDollars(originalCents);
      }
    }

    const { data, error } = await db.from('contracts').insert({
      tenant_id: user.tenantId,
      created_by: user.id,
      project_id: projectId,
      title: body.title,
      party_name: body.party_name,
      contract_number: body.contract_number || null,
      contract_type: body.contract_type || null,
      party_email: body.party_email || null,
      party_phone: body.party_phone || null,
      party_company: body.party_company || null,
      trade: body.trade || null,
      scope_of_work: body.scope_of_work || null,
      amount,
      retainage_pct: body.retainage_pct || null,
      status: body.status || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      insurance_required: body.insurance_required ?? null,
      bond_required: body.bond_required ?? null,
      notes: body.notes || null,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ contract: data });
  } catch (e) {
    return apiError('contracts/create POST', e);
  }
}
