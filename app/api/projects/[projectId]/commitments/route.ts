/**
 * GET /api/projects/:projectId/commitments — the job's subcontracts and
 * purchase orders as one list, with original, approved changes, revised,
 * billed, paid and remaining on each (lib/commitments).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { buildCommitments } from '@/lib/commitments';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const db = createServerClient();
  const g = await requirePermission(req, 'Budget', 'View', { projectId: params.projectId, db });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { data: project } = await db.from('projects').select('id, name').eq('id', params.projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [c, p, l, b] = await Promise.all([
      db.from('contracts').select('id, contract_number, contract_type, title, trade, scope_summary, party_name, party_company, vendor_name, counterparty_name, status, amount, contract_amount, original_amount, approved_changes, invoiced_amount, paid_amount, retainage_pct, executed_date, executed_at, bid_package_id').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      db.from('purchase_orders').select('id, po_number, purchase_order, vendor_name, description, cost_code, status, total, subtotal, tax, shipping, line_items, issued_date').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      db.from('commitments').select('id, commitment_number, commitment_type, vendor_name, description, scope_of_work, status, original_amount, approved_changes, invoiced_to_date, retainage_held, contract_date, bid_package_id').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      db.from('bills').select('vendor_name, total, amount, paid_amount, status').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
    ]);
    for (const r of [c, p, l, b]) if (r.error) throw r.error;
    const rows = buildCommitments({
      projectId: params.projectId,
      contracts: (c.data ?? []) as Record<string, unknown>[],
      purchaseOrders: (p.data ?? []) as Record<string, unknown>[],
      legacy: (l.data ?? []) as Record<string, unknown>[],
      bills: (b.data ?? []) as Record<string, unknown>[],
    });
    return NextResponse.json({ commitments: rows, project });
  } catch (e) {
    return apiError('projects/projectId/commitments', e, "Couldn't load commitments");
  }
}
