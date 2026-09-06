import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { getLienLaw } from '@/lib/lien-law/states';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const body = await req.json();
    const projectId = body.projectId;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    // 1. Load project for contract values
    const { data: project } = await db
      .from('projects')
      .select('id, name, contract_value, contract_amount, retainage_pct')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as Record<string, unknown>;

    // 2. Get next app_number
    const { data: lastApp } = await db
      .from('pay_applications')
      .select('app_number')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('app_number', { ascending: false })
      .limit(1)
      .single();

    const appNumber = ((lastApp as Record<string, unknown> | null)?.app_number as number || 0) + 1;

    // 3. Get previous certificates total
    const { data: prevApps } = await db
      .from('pay_applications')
      .select('current_payment_due')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .in('status', ['approved', 'paid', 'submitted']);

    const lessPreviousCerts = (prevApps || []).reduce(
      (sum, a) => sum + (Number((a as Record<string, unknown>).current_payment_due) || 0), 0
    );

    // 4. Load SOV source: takeoff CSI breakdown OR bid packages
    type SovSource = { item_no: string; description: string; scheduled_value: number; bid_package_id?: string; csi_division?: string };
    const sovItems: SovSource[] = [];
    const takeoffId = body.takeoffId as string | undefined;

    if (takeoffId) {
      // From takeoff csi_breakdown
      const { data: takeoff } = await db
        .from('takeoffs')
        .select('csi_breakdown')
        .eq('id', takeoffId)
        .eq('tenant_id', user.tenantId)
        .single();

      const breakdown = (takeoff as Record<string, unknown> | null)?.csi_breakdown as Record<string, { division_name: string; subtotal: number }> | null;
      if (breakdown) {
        const sorted = Object.entries(breakdown).sort(([a], [b]) => a.localeCompare(b));
        sorted.forEach(([div, info], idx) => {
          sovItems.push({
            item_no: String(idx + 1),
            description: `${div} — ${info.division_name}`,
            scheduled_value: info.subtotal || 0,
            csi_division: div,
          });
        });
      }
    }

    if (sovItems.length === 0) {
      // Fallback: from bid packages for this project
      const { data: pkgs } = await db
        .from('bid_packages')
        .select('id, name, trade, estimated_value, budget_estimate, csi_division')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('created_at');

      (pkgs || []).forEach((pkg, idx) => {
        const bp = pkg as Record<string, unknown>;
        sovItems.push({
          item_no: String(idx + 1),
          description: String(bp.name || bp.trade || `Item ${idx + 1}`),
          scheduled_value: Number(bp.estimated_value || bp.budget_estimate || 0),
          bid_package_id: String(bp.id),
          csi_division: bp.csi_division as string || undefined,
        });
      });
    }

    // 5. Calculate contract sum
    const originalContractSum = sovItems.reduce((s, i) => s + i.scheduled_value, 0) ||
      Number(p.contract_value || p.contract_amount || 0);
    const retainagePct = Number(p.retainage_pct || 10);

    // 5b. Load approved change orders to calculate net_change_by_co
    const { data: approvedCOs } = await db
      .from('change_orders')
      .select('amount')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'approved');

    const netChangeByCO = approvedCOs?.reduce(
      (sum, co) => sum + Number((co as Record<string, unknown>).amount || 0), 0
    ) || 0;

    const contractSumToDate = originalContractSum + netChangeByCO;

    // 6. Insert pay_application
    const { data: payApp, error: paErr } = await db.from('pay_applications').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      app_number: appNumber,
      application_date: new Date().toISOString().split('T')[0],
      period_from: body.periodFrom || null,
      period_to: body.periodTo || null,
      status: 'draft',
      original_contract_sum: originalContractSum,
      net_change_by_change_orders: netChangeByCO,
      contract_sum_to_date: contractSumToDate,
      completed_to_date: 0,
      stored_materials: 0,
      total_completed_stored: 0,
      retainage_percent: retainagePct,
      retainage_held: 0,
      total_earned_less_retainage: 0,
      less_previous_certificates: lessPreviousCerts,
      current_payment_due: 0,
      balance_to_finish: contractSumToDate,
      takeoff_id: takeoffId || null,
    }).select('id, app_number').single();

    if (paErr) throw paErr;
    const pa = payApp as Record<string, unknown>;

    // 7. Insert sov_line_items
    if (sovItems.length > 0) {
      const rows = sovItems.map((item, idx) => ({
        pay_application_id: pa.id as string,
        project_id: projectId,
        tenant_id: user.tenantId,
        item_no: item.item_no,
        description: item.description,
        scheduled_value: item.scheduled_value,
        work_from_previous: 0,
        work_this_period: 0,
        materials_presently_stored: 0,
        total_completed_stored: 0,
        pct_complete: 0,
        balance_to_finish: item.scheduled_value,
        retainage: 0,
        bid_package_id: item.bid_package_id || null,
        csi_division: item.csi_division || null,
        sort_order: idx,
      }));

      const { error: sovErr } = await db.from('sov_line_items').insert(rows.map((row) => ({ ...row, tenant_id: user.tenantId })));
      if (sovErr) console.error('[pay-applications/create] sov insert:', sovErr.message);
    }

    // 8. Auto-create conditional_partial lien waivers for all awarded subs on this pay app
    try {
      const [{ data: awardedSubs }, { data: projFull }, { data: gc }] = await Promise.all([
        db.from('bid_submissions')
          .select('id, company_name, sub_name, base_bid, amount, sub_id, contact_email, sub_email, contact_name, bid_package_id')
          .eq('project_id', projectId).eq('tenant_id', user.tenantId).eq('is_awarded', true),
        db.from('projects')
          .select('state, end_date, address, city, owner_name')
          .eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle(),
        db.from('tenant_settings')
          .select('company_name, default_retainage_pct')
          .eq('tenant_id', user.tenantId).maybeSingle(),
      ]);

      const subs = (awardedSubs as Array<Record<string, unknown>> | null) || [];
      if (subs.length > 0) {
        const projectState = ((projFull as Record<string, unknown> | null)?.state as string) || null;
        const law = getLienLaw(projectState || 'XX');
        const projAddr = (projFull as Record<string, unknown> | null) || {};
        const retainagePct = Number((gc as Record<string, unknown> | null)?.default_retainage_pct) || 10;
        const today = new Date().toISOString().split('T')[0];

        const waiverRows = subs.map((sub) => {
          const firstFurnished = new Date();
          const prelimDeadline = law.preliminaryNoticeRequired && law.preliminaryNoticeDays
            ? new Date(firstFurnished.setDate(firstFurnished.getDate() + law.preliminaryNoticeDays)).toISOString().split('T')[0]
            : null;

          const projectEndDate = (projFull as { end_date?: string } | null)?.end_date
            ? new Date((projFull as { end_date: string }).end_date)
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          const mechanicsLienDeadline = new Date(projectEndDate);
          mechanicsLienDeadline.setDate(mechanicsLienDeadline.getDate() + law.lienFilingDays);

          const bondClaimDate = law.bondClaimDays ? new Date(projectEndDate) : null;
          if (bondClaimDate && law.bondClaimDays) bondClaimDate.setDate(bondClaimDate.getDate() + law.bondClaimDays);

          const ntoDate = law.noticeToOwnerRequired && law.noticeToOwnerDays
            ? (() => { const d = new Date(); d.setDate(d.getDate() + (law.noticeToOwnerDays as number)); return d.toISOString().split('T')[0]; })()
            : null;

          const baseBidNum = Number((sub.base_bid as number) || (sub.amount as number) || 0);

          return {
            tenant_id: user.tenantId,
            project_id: projectId,
            pay_application_id: pa.id as string,
            bid_package_id: sub.bid_package_id || null,
            bid_submission_id: sub.id,
            subcontractor_id: sub.sub_id || null,
            waiver_type: 'conditional_partial',
            status: 'draft',
            claimant_name: sub.company_name || sub.sub_name || 'Subcontractor',
            company_name: sub.company_name || sub.sub_name || '',
            claimant_email: sub.contact_email || sub.sub_email || '',
            sent_to_email: sub.contact_email || sub.sub_email || '',
            contact_name: sub.contact_name || '',
            amount: baseBidNum,
            through_date: today,
            state: projectState,
            state_statute: law.lienStatute,
            gc_company_name: (gc as { company_name?: string } | null)?.company_name || 'General Contractor',
            owner_name: (projAddr.owner_name as string) || 'Owner',
            project_address: [projAddr.address as string, projAddr.city ? `${projAddr.city as string}, ${projectState || ''}` : ''].filter(Boolean).join(', '),
            token: crypto.randomUUID(),
            is_payment_gate: true,
            retainage_amount: baseBidNum * (retainagePct / 100),
            notice_required: law.preliminaryNoticeRequired,
            notarization_required: law.notarizationRequired,
            statutory_form_required: law.statutoryFormRequired,
            preliminary_notice_required: law.preliminaryNoticeRequired,
            preliminary_notice_deadline: prelimDeadline,
            mechanics_lien_deadline: mechanicsLienDeadline.toISOString().split('T')[0],
            bond_claim_deadline: bondClaimDate ? bondClaimDate.toISOString().split('T')[0] : null,
            notice_to_owner_deadline: ntoDate,
            monthly_notice_required: law.monthlyNoticeRequired,
            lien_agent_required: law.lienAgentRequired,
          };
        });

        const { error: batchErr } = await db.from('lien_waivers').insert(waiverRows.map((row) => ({ ...row, tenant_id: user.tenantId })));
        if (batchErr) console.error('[PAY-APP] Waiver batch insert failed:', batchErr.message);
        else console.log('[PAY-APP] Auto-created', waiverRows.length, 'conditional_partial waivers for pay app', pa.id);
      }
    } catch (waiverErr) {
      console.error('[PAY-APP] Waiver batch exception:', waiverErr instanceof Error ? waiverErr.message : waiverErr);
    }

    return NextResponse.json({
      data: {
        payAppId: pa.id,
        appNumber: pa.app_number,
        lineItemCount: sovItems.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
