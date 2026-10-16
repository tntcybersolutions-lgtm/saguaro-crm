import { NextRequest, NextResponse } from 'next/server';
import { nextJobColor } from '@/lib/project-colors';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { normaliseStage } from '@/lib/lead-stages';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/leads/[id]/convert — win a lead and open its job.
 *
 * MUST-PASS Path 13. `lead_pipeline` already carries `project_id` and
 * `customer_id`, but nothing wrote them: the PATCH allowlist excluded both and
 * its comment checked `converted_project_id`, a column that does not exist — so
 * a won lead could never be linked to a job. This is the one-button handoff:
 *   1) create (or reuse) the customer from the lead,
 *   2) open the project, carrying name / value / type across,
 *   3) write both ids back onto the lead and mark it Won.
 *
 * Idempotent: a lead already linked to a project returns that project rather
 * than opening a second one. Every write is checked and surfaced — no bare
 * catch, no fake success (the defect class §0 exists to stop).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Sales', 'Edit');
  if (!g.ok) return g.res;
  const db = createServerClient();
  const tenantId = g.user.tenantId;
  const { id } = params;

  try {
    const { data: lead, error: leadErr } = await db
      .from('lead_pipeline')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // Idempotent: already converted. Double-tap / retry returns the same job.
    if ((lead as { project_id?: string }).project_id) {
      return NextResponse.json({
        ok: true,
        alreadyConverted: true,
        projectId: (lead as { project_id?: string }).project_id,
        customerId: (lead as { customer_id?: string }).customer_id ?? null,
        nextUrl: `/app/projects/${(lead as { project_id?: string }).project_id}`,
      });
    }

    const L = lead as Record<string, unknown>;

    // 1) Customer — reuse the lead's customer if one is already attached.
    let customerId = (L.customer_id as string | null) ?? null;
    if (!customerId) {
      const { data: cust, error: custErr } = await db
        .from('customer_profiles')
        .insert({
          tenant_id: tenantId,
          name: (L.company_name as string) || (L.contact_name as string) || 'New Customer',
          email: (L.email as string) ?? null,
          phone: (L.phone as string) ?? null,
          status: 'customer',
        } as never)
        .select('id')
        .single();
      if (custErr || !cust) throw custErr ?? new Error('customer insert returned no row');
      customerId = (cust as { id: string }).id;
    }

    // 2) Project — carry name / value / type across. (projects has no location column.)
    const { count: priorCount } = await db.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { data: project, error: projErr } = await db
      .from('projects')
      .insert({
        tenant_id: tenantId,
        color: nextJobColor(Number(priorCount) || 0),
        name: (L.company_name as string) || `Project — ${(L.contact_name as string) || 'New'}`,
        status: 'active',
        project_type: (L.project_type as string) ?? null,
        contract_value: (L.estimated_value as number) ?? null,
        customer_id: customerId,
      } as never)
      .select('id')
      .single();
    if (projErr || !project) throw projErr ?? new Error('project insert returned no row');
    const projectId = (project as { id: string }).id;

    // 3) Link both ids onto the lead and mark it Won.
    const nowIso = new Date().toISOString();
    const { error: upErr } = await db
      .from('lead_pipeline')
      .update({
        project_id: projectId,
        customer_id: customerId,
        stage: normaliseStage('Won'),
        won_at: nowIso,
        updated_at: nowIso,
      } as never)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (upErr) throw upErr;

    return NextResponse.json(
      { ok: true, projectId, customerId, nextUrl: `/app/projects/${projectId}` },
      { status: 201 },
    );
  } catch (err) {
    return apiError('leads/[id]/convert POST', err, 'Could not convert the lead to a project');
  }
}
