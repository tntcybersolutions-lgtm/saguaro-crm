import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const projectId = body.project_id || body.projectId;
    const name = body.name;
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const db = createServerClient();
    const { data: pkg, error } = await db.from('bid_packages').insert({
      tenant_id: user.tenantId,
      created_by: user.id,
      project_id: projectId,
      name,
      trade: body.trade || null,
      description: body.description || null,
      scope_of_work: body.scope_of_work || body.scopeOfWork || null,
      scope_summary: body.scope_summary || body.scopeSummary || null,
      scope_narrative: body.scope_narrative || body.scopeNarrative || null,
      due_date: body.due_date || body.dueDate || null,
      pre_bid_date: body.pre_bid_date || body.preBidDate || null,
      status: body.status || 'open',
      budget_estimate: body.budget_estimate || body.budgetEstimate || null,
      notes: body.notes || null,
      bid_instructions: body.bid_instructions || body.bidInstructions || null,
      csi_codes: body.csi_codes || body.csiCodes || [],
      is_public_project: body.is_public_project || body.isPublicProject || false,
      requires_bond: body.requires_bond || body.requiresBond || false,
      insurance_requirements: body.insurance_requirements || body.insuranceRequirements || null,
    }).select().single();
    if (error) throw error;

    if (body.lineItems && Array.isArray(body.lineItems) && body.lineItems.length > 0) {
      await must(db.from('bid_package_items').insert(
        body.lineItems.map((item: Record<string, unknown>) => ({
          tenant_id: user.tenantId,
          bid_package_id: (pkg as Record<string, unknown>).id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice || item.unit_price,
          total_amount: item.totalAmount || item.total_amount,
          csi_code: item.csiCode || item.csi_code,
          notes: item.notes,
        }))
      ), 'bid_package_items insert');
    }

    // ── BUDGET SEEDING: a package generated from a takeoff carries the trade's
    //    estimated value — seed a budget line for its division so the project
    //    budget builds itself instead of being typed by hand. Idempotent: skips
    //    when a line for that division/cost-code already exists. ──
    try {
      const estimate = Number(body.budget_estimate ?? body.budgetEstimate) ||
        (Array.isArray(body.lineItems) ? body.lineItems.reduce((s: number, it: Record<string, unknown>) => s + (Number(it.totalAmount ?? it.total_amount) || 0), 0) : 0);
      const csi = (body.csi_codes || body.csiCodes || [])[0] as string | undefined;
      if (estimate > 0 && csi) {
        const div = String(csi).slice(0, 2);
        const { data: existing } = await db
          .from('budget_lines')
          .select('id')
          .eq('project_id', projectId)
          .eq('tenant_id', user.tenantId)
          .or(`cost_code.eq.${csi},division.eq.${div}`)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          await must(db.from('budget_lines').insert({
            tenant_id: user.tenantId,
            project_id: projectId,
            division: div,
            cost_code: csi,
            description: body.trade || name,
            category: 'subcontract',
            original_budget: estimate,
            committed: 0,
            actual: 0,
            notes: 'Seeded from bid package (takeoff estimate).',
          } as never), 'budget_lines insert');
        }
      }
    } catch (e) { console.error('budget seed skipped:', e); }

    return NextResponse.json({ success: true, bidPackage: pkg });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
