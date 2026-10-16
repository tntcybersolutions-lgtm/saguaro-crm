import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { CONTRACT_FORMS, type ContractKind } from '@/lib/document-templates/contract-fields';
import { coAmount } from '@/lib/change-order-amount';

/**
 * GET /api/contracts/prefill?kind=subcontract&projectId=…&subId=…&bidPackageId=…
 *
 * Everything the system already knows about this contract, keyed the way the
 * form and the generator both name it. The GC edits from here rather than
 * typing a subcontract from nothing.
 *
 * Values come back with a companion `auto` list naming which ones were filled
 * in by the system, so the form can mark them — same AUTO chip the new-project
 * screen uses. A GC who cannot tell what was guessed will not trust any of it.
 *
 * Nothing here writes. Generating is a separate, deliberate step.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const url = new URL(req.url);
  const kind = String(url.searchParams.get('kind') || '') as ContractKind;
  const projectId = url.searchParams.get('projectId') || '';
  const subId = url.searchParams.get('subId') || '';
  const bidPackageId = url.searchParams.get('bidPackageId') || '';

  if (!CONTRACT_FORMS[kind]) {
    return NextResponse.json({ error: `Unknown contract kind "${kind}"` }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const { data: project } = await db
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const p = project as Record<string, any>;
    const values: Record<string, unknown> = {};
    const auto: string[] = [];

    /** Record a value and remember that we, not the GC, put it there. */
    const seed = (key: string, v: unknown) => {
      if (v === null || v === undefined || v === '' ) return;
      values[key] = v;
      auto.push(key);
    };

    // ── the contractor is the tenant, on every document ───────────────────
    const { data: tenant } = await db
      .from('tenants').select('name').eq('id', user.tenantId).maybeSingle();
    seed('contractorName', (tenant as any)?.name);

    // ── project-level, shared by all four ─────────────────────────────────
    seed('retainagePct', String(p.retainage_pct ?? p.retainage_percent ?? 10));
    seed('contractType', p.contract_type);
    seed('startDate', p.start_date);
    seed('completionDate', p.substantial_date ?? p.substantial_completion_date);
    seed('substantialDate', p.substantial_date ?? p.substantial_completion_date);
    seed('awardDate', p.award_date);
    seed('ntpDate', p.ntp_date);
    seed('shipTo', p.address);
    seed('ownerName', p.owner_name);
    seed('ownerAddress', p.address);
    seed('architectName', p.architect_name);
    seed('architectEmail', p.architect_email);
    seed('contractSum', p.contract_value);

    // ── subcontract / change order: the counterparty ──────────────────────
    if (subId) {
      const { data: sub } = await db
        .from('subcontractors')
        .select('*')
        .eq('id', subId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      const s = sub as Record<string, any> | null;
      if (s) {
        seed('subName', s.company_name ?? s.name);
        seed('counterparty', s.company_name ?? s.name);
        seed('vendorName', s.company_name ?? s.name);
        seed('subAddress', s.address);
        seed('vendorAddress', s.address);
        seed('subLicense', s.license_number ?? s.license);
        seed('subTrade', s.trade);
        seed('subAmount', s.contract_amount ?? s.amount);
      }
    }

    // ── the bid package carries the scope that was actually priced ────────
    if (bidPackageId) {
      const { data: pkg } = await db
        .from('bid_packages')
        .select('*')
        .eq('id', bidPackageId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      const b = pkg as Record<string, any> | null;
      if (b) {
        seed('scope', b.scope_of_work ?? b.scope_narrative ?? b.scope_summary ?? b.description);
        seed('subTrade', b.trade);
        // The awarded number beats the sub record — it is what was agreed.
        if (b.awarded_amount) seed('subAmount', b.awarded_amount);
        seed('description', b.description);
      }
    }

    // ── change order: next number in this project's sequence ──────────────
    if (kind === 'change-order') {
      const { data: cos } = await db
        .from('change_orders')
        .select('co_number')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId);
      const next = ((cos ?? []) as Array<{ co_number: unknown }>)
        .reduce((m, c) => Math.max(m, Number(c.co_number) || 0), 0) + 1;
      seed('coNumber', String(next).padStart(3, '0'));

      // Revised sum starts from the contract plus everything already executed.
      const { data: executed } = await db
        .from('change_orders')
        .select('cost_impact, amount, status')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId);
      const priorImpact = ((executed ?? []) as Array<Record<string, any>>)
        .filter((c) => String(c.status || '').toLowerCase() === 'executed')
        .reduce((sum, c) => sum + coAmount(c), 0);
      const base = Number(p.contract_value) || 0;
      if (base) seed('newContractSum', base + priorImpact);
    }

    return NextResponse.json({
      kind,
      title: CONTRACT_FORMS[kind].title,
      blurb: CONTRACT_FORMS[kind].blurb,
      fields: CONTRACT_FORMS[kind].fields,
      values,
      /** Which keys the system filled. Everything here stays editable. */
      auto,
    });
  } catch (e) {
    return apiError('contracts/prefill', e, 'Could not load the contract details. Please try again.');
  }
}
