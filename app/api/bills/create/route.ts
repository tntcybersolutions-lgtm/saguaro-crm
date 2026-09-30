import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

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

    const { data, error } = await db
      .from('bills')
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        project_id: projectId,
        vendor_name: body.vendor_name,
        bill_number: body.bill_number || null,
        vendor_email: body.vendor_email || null,
        description: body.description || null,
        category: body.category || null,
        cost_code: body.cost_code || null,
        amount: body.amount || null,
        tax: body.tax || null,
        total: body.total || null,
        due_date: body.due_date || null,
        status: body.status || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // ── A bill is ACTUAL COST — roll it into the matching budget line so the
    //    budget's actual column tracks reality without manual reconciliation. ──
    const total = Number(body.total) || Number(body.amount) || 0;
    if (total > 0 && body.cost_code) {
      const div = String(body.cost_code).slice(0, 2);
      const { data: bLine } = await db
        .from('budget_lines')
        .select('id, actual')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .or(`cost_code.eq.${body.cost_code},division.eq.${div}`)
        .limit(1)
        .maybeSingle();
      if (bLine) {
        await must(db.from('budget_lines')
          .update({ actual: ((bLine as { actual: number | null }).actual || 0) + total })
          .eq('id', (bLine as { id: string }).id), 'budget_lines write');
      }
    }

    return NextResponse.json({ bill: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
