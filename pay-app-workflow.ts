/**
 * pay-app-workflow.ts
 *
 * Complete Pay Application Workflow — Sprint 1 Revenue-Critical
 *
 * Full end-to-end automation:
 *   1. createPayApplication()    — creates G702 + G703, conditional lien waivers
 *   2. submitPayApplicationToOwner() — emails package, creates approval record
 *   3. approvePayApplication()   — owner clicks approval link → marks approved
 *   4. recordPayment()           — records payment, generates unconditional waivers
 *
 * This is the primary revenue flow. Every dollar the GC gets paid goes through this.
 *
 * API Routes:
 *   POST /api/pay-apps/create          — createPayApplicationHandler
 *   POST /api/pay-apps/[id]/submit     — submitPayAppHandler
 *   GET  /api/pay-apps/[id]            — getPayAppHandler
 *   GET  /api/pay-apps/owner-approve/:token — ownerApprovePageHandler (no auth)
 *   POST /api/pay-apps/owner-approve/:token — ownerApproveActionHandler (no auth)
 *   POST /api/pay-apps/[id]/record-payment  — recordPaymentHandler
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

import { supabaseAdmin } from './supabase/admin';
import { getProjectContext } from './project-context';
import { PDFGenerator } from './pdf-generator';

const FROM    = process.env.EMAIL_FROM    ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

function resend(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

function curr(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE PAY APPLICATION
// POST /api/pay-apps/create
// ─────────────────────────────────────────────────────────────────────────────

export async function createPayApplicationHandler(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId   = String(body['tenantId']   ?? '');
  const projectId  = String(body['projectId']  ?? '');
  const contractId = String(body['contractId'] ?? '');
  const periodTo   = String(body['periodTo']   ?? new Date().toISOString().split('T')[0]);
  const sovLines   = (body['sovLines'] as Record<string,unknown>[]) ?? [];
  const thisPeriod = Number(body['thisPeriod'] ?? 0);
  const storedMats = Number(body['storedMaterials'] ?? 0);

  if (!tenantId || !projectId) {
    return NextResponse.json({ error: 'tenantId and projectId required' }, { status: 400 });
  }

  try {
    const ctx = await getProjectContext(tenantId, projectId);
    const now = new Date().toISOString();

    // Determine app number
    const appNumber = (ctx.latestPayApp?.app_number ?? 0) + 1;

    // Generate G702 PDF
    const g702 = await PDFGenerator.generateG702PDF({
      tenantId, projectId, ctx, appNumber, periodTo, thisPeriod, storedMaterials: storedMats, isDraft: true,
    });

    // Generate G703 PDF (use provided SOV lines or derive from budget)
    let finalSovLines = sovLines as Array<{
      item_number: string; description: string; scheduled_value: number;
      prev_completed: number; this_period: number; stored_materials?: number; retainage: number;
    }>;

    if (finalSovLines.length === 0) {
      // Auto-generate SOV from budget line items
      const { data: budgetLines } = await supabaseAdmin
        .from('budget_line_items')
        .select('cost_code, description, original_budget, committed_cost, actual_cost')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .order('created_at');

      finalSovLines = (budgetLines ?? []).map((b, idx) => {
        const scheduled = Number(b.original_budget ?? 0);
        const prevComp  = Number(b.actual_cost ?? 0);
        return {
          item_number:     String(idx + 1).padStart(2, '0'),
          description:     String(b.description ?? b.cost_code ?? 'Work Item'),
          scheduled_value: scheduled,
          prev_completed:  prevComp,
          this_period:     0, // user fills this
          stored_materials: 0,
          retainage:       prevComp * (ctx.project.retainage_pct / 100),
        };
      });
    }

    const g703 = await PDFGenerator.generateG703PDF({
      tenantId, projectId, ctx, appNumber, periodTo, sovLines: finalSovLines, isDraft: true,
    });

    // Insert pay application record
    const totalComplete = (ctx.latestPayApp?.total_completed ?? 0) + thisPeriod + storedMats;
    const retainageHeld = totalComplete * (ctx.project.retainage_pct / 100);
    const prevPayments  = ctx.latestPayApp?.prev_payments ?? 0;
    const payDue        = totalComplete - retainageHeld - prevPayments;

    const { data: payApp, error: paErr } = await supabaseAdmin
      .from('pay_applications')
      .insert({
        tenant_id:                 tenantId,
        project_id:                projectId,
        contract_id:               contractId || null,
        application_number:        appNumber,
        period_from:               (ctx.latestPayApp?.period_to ?? ctx.project.award_date ?? periodTo),
        period_to:                 periodTo,
        contract_sum:              ctx.project.contract_amount,
        net_change_orders:         ctx.financials.net_change_orders,
        total_completed_and_stored: totalComplete,
        retainage_pct:             ctx.project.retainage_pct,
        retainage_held:            retainageHeld,
        total_previous_payments:   prevPayments,
        status:                    'draft',
        created_at:                now,
        updated_at:                now,
      })
      .select('id')
      .single();

    if (paErr || !payApp) throw new Error(`Pay app create: ${paErr?.message}`);

    // Generate conditional lien waivers for all subs on this project
    const waiverIds: string[] = [];
    for (const sub of ctx.subs) {
      const { data: waiver } = await supabaseAdmin
        .from('lien_waivers')
        .insert({
          tenant_id:           tenantId,
          project_id:          projectId,
          contract_id:         sub.contract_id ?? null,
          pay_application_id:  payApp.id,
          waiver_type:         'conditional_partial',
          state:               ctx.project.state_jurisdiction ?? 'AZ',
          claimant_name:       sub.name,
          claimant_address:    sub.address ?? null,
          owner_name:          ctx.owner?.name ?? null,
          gc_name:             ctx.gc?.name ?? null,
          project_address:     ctx.project.address ?? null,
          through_date:        periodTo,
          amount:              sub.contract_amount * (thisPeriod / (ctx.project.contract_amount || 1)),
          status:              'draft',
          ai_generated:        true,
          statutory_compliant: true,
          created_at:          now,
          updated_at:          now,
        })
        .select('id')
        .single();

      if (waiver) waiverIds.push(waiver.id as string);
    }

    return NextResponse.json({
      payApplicationId: payApp.id,
      appNumber,
      g702PdfUrl:      g702.pdfUrl,
      g703PdfUrl:      g703.pdfUrl,
      waiverCount:     waiverIds.length,
      totalCompleted:  totalComplete,
      currentPayDue:   payDue,
      status:          'draft',
      nextStep:        'Review PDF, collect sub lien waivers, then submit to owner',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pay app creation failed' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SUBMIT PAY APP TO OWNER
// POST /api/pay-apps/[payAppId]/submit
// ─────────────────────────────────────────────────────────────────────────────

export async function submitPayAppHandler(req: NextRequest, payAppId: string) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId = String(body['tenantId'] ?? '');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const { data: payApp } = await supabaseAdmin
    .from('pay_applications')
    .select('*, projects!inner(name, tenant_id)')
    .eq('id', payAppId)
    .eq('tenant_id', tenantId)
    .single();

  if (!payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });
  if ((payApp.status as string) !== 'draft') {
    return NextResponse.json({ error: `Pay app is already ${payApp.status}` }, { status: 400 });
  }

  const ctx = await getProjectContext(tenantId, payApp.project_id as string);

  // Verify sub lien waivers are collected
  const { data: waivers } = await supabaseAdmin
    .from('lien_waivers')
    .select('claimant_name, status, waiver_type')
    .eq('pay_application_id', payAppId);

  const unsignedWaivers = (waivers ?? [])
    .filter(w => w.waiver_type === 'conditional_partial' && w.status !== 'signed');

  if (unsignedWaivers.length > 0 && body['requireAllWaivers'] !== false) {
    return NextResponse.json({
      error:         'Unsigned lien waivers pending',
      unsignedCount: unsignedWaivers.length,
      unsigned:      unsignedWaivers.map(w => w.claimant_name),
      tip:           'Set requireAllWaivers: false to submit anyway, or collect signatures first',
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  const approvalToken = (await import('node:crypto')).randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const ownerEmail = ctx.owner?.email;
  const appNum = payApp.application_number as number;
  const payDue = payApp.current_payment_due as number ?? 0;

  // Create owner approval record
  const { data: approval } = await supabaseAdmin
    .from('owner_approvals')
    .insert({
      tenant_id:         tenantId,
      project_id:        payApp.project_id,
      pay_application_id: payAppId,
      approval_type:     'pay_application',
      entity_id:         payAppId,
      title:             `Pay Application #${appNum} — ${ctx.project.name}`,
      amount:            payDue,
      description:       `Payment application for work completed through ${payApp.period_to}`,
      owner_email:       ownerEmail ?? String(body['ownerEmail'] ?? ''),
      owner_name:        ctx.owner?.name ?? '',
      token:             approvalToken,
      expires_at:        expiresAt,
      status:            'pending',
      sent_at:           now,
      created_at:        now,
      updated_at:        now,
    })
    .select('id')
    .single();

  // Update pay app status
  await supabaseAdmin
    .from('pay_applications')
    .update({ status: 'submitted', submitted_at: now, updated_at: now })
    .eq('id', payAppId);

  // Email owner
  const approvalUrl = `${APP_URL}/owner-portal/approve/${approvalToken}`;
  const r = resend();
  if (r && ownerEmail) {
    await r.emails.send({
      from:    FROM,
      to:      ownerEmail,
      subject: `Pay Application #${appNum} — ${curr(payDue)} Awaiting Your Approval — ${ctx.project.name}`,
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1b3a5c;padding:20px 28px;border-radius:6px 6px 0 0">
            <h2 style="color:#fff;margin:0">Pay Application #${appNum}</h2>
            <p style="color:#a8c4e0;margin:4px 0 0">${ctx.project.name}</p>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;padding:24px 28px;border-radius:0 0 6px 6px">
            <p>A pay application has been submitted for your review and approval.</p>

            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f7fafc"><td style="padding:8px 12px;font-weight:600;border:1px solid #e2e8f0">Application No.</td><td style="padding:8px 12px;border:1px solid #e2e8f0">#${appNum}</td></tr>
              <tr><td style="padding:8px 12px;font-weight:600;border:1px solid #e2e8f0">Period Through</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${payApp.period_to}</td></tr>
              <tr style="background:#f7fafc"><td style="padding:8px 12px;font-weight:600;border:1px solid #e2e8f0">Contractor</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${ctx.gc?.name ?? 'General Contractor'}</td></tr>
              <tr><td style="padding:8px 12px;font-weight:600;border:1px solid #e2e8f0;font-size:16px">Amount Due</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:16px;font-weight:700;color:#1b3a5c">${curr(payDue)}</td></tr>
            </table>

            <p>Please review the attached G702/G703 and approve or reject below.</p>

            <div style="text-align:center;margin:24px 0">
              <a href="${approvalUrl}" style="display:inline-block;background:#2f9e44;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Review &amp; Approve Pay Application →</a>
            </div>

            <p style="font-size:12px;color:#718096">This approval link expires in 14 days. If you did not expect this email, contact ${ctx.gc?.email ?? 'the general contractor'} immediately.</p>
          </div>
        </div>
      `,
    });
  }

  return NextResponse.json({
    success:       true,
    status:        'submitted',
    approvalId:    approval?.id,
    approvalUrl,
    ownerEmailed:  !!ownerEmail,
    expiresAt,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. OWNER APPROVAL (token-gated, no auth required)
// GET  /api/pay-apps/owner-approve/:token  — show approval page data
// POST /api/pay-apps/owner-approve/:token  — submit decision
// ─────────────────────────────────────────────────────────────────────────────

export async function ownerApproveGetHandler(req: NextRequest, token: string) {
  const { data: approval } = await supabaseAdmin
    .from('owner_approvals')
    .select('*, pay_applications(*), projects!inner(name, tenant_id)')
    .eq('token', token)
    .maybeSingle();

  if (!approval) return NextResponse.json({ error: 'Invalid or expired approval link' }, { status: 404 });
  if (new Date(approval.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired. Contact the contractor for a new link.' }, { status: 410 });
  }
  if (approval.status !== 'pending') {
    return NextResponse.json({
      alreadyDecided: true,
      status:         approval.status,
      decisionAt:     approval.decision_at,
      decisionNotes:  approval.decision_notes,
    });
  }

  // Mark as viewed
  await supabaseAdmin.from('owner_approvals').update({ viewed_at: new Date().toISOString() }).eq('token', token);

  return NextResponse.json({
    approval: {
      title:       approval.title,
      amount:      approval.amount,
      description: approval.description,
      ownerName:   approval.owner_name,
      payApp:      approval.pay_applications,
      project:     (approval.projects as Record<string,unknown>)?.name,
    },
  });
}

export async function ownerApprovePostHandler(req: NextRequest, token: string) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const decision = String(body['decision'] ?? ''); // 'approved' or 'rejected'
  const notes    = String(body['notes']    ?? '');

  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 });
  }

  const { data: approval } = await supabaseAdmin
    .from('owner_approvals')
    .select('*, pay_applications!inner(tenant_id, project_id, application_number, current_payment_due)')
    .eq('token', token)
    .maybeSingle();

  if (!approval) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (approval.status !== 'pending') return NextResponse.json({ error: 'Already decided' }, { status: 400 });

  const now = new Date().toISOString();
  const ip  = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const pa  = approval.pay_applications as Record<string,unknown>;

  // Update approval record
  await supabaseAdmin.from('owner_approvals').update({
    status:         decision,
    decision_at:    now,
    decision_notes: notes,
    decision_ip:    ip,
    updated_at:     now,
  }).eq('token', token);

  // Update pay application
  await supabaseAdmin.from('pay_applications').update({
    status:        decision === 'approved' ? 'approved' : 'rejected',
    certified_at:  decision === 'approved' ? now : null,
    updated_at:    now,
  }).eq('id', approval.pay_application_id);

  // Email the GC the decision
  const ctx = await getProjectContext(pa.tenant_id as string, pa.project_id as string);
  const r   = resend();
  if (r && ctx.gc?.email) {
    const icon = decision === 'approved' ? '✅' : '❌';
    await r.emails.send({
      from:    FROM,
      to:      ctx.gc.email,
      subject: `${icon} Pay Application #${pa.application_number} ${decision === 'approved' ? 'APPROVED' : 'REJECTED'} — ${ctx.project.name}`,
      html: `
        <p>Pay Application #${pa.application_number} for ${ctx.project.name} has been <strong>${decision.toUpperCase()}</strong> by ${approval.owner_name ?? 'the Owner'}.</p>
        ${decision === 'approved'
          ? `<p><strong>Amount Certified: ${curr(pa.current_payment_due as number ?? 0)}</strong></p>
             <p>Proceed with payment processing. Collect unconditional lien waivers upon payment.</p>`
          : `<p>Reason: ${notes || 'No reason provided'}</p><p>Contact the owner to resolve the issue.</p>`
        }
        <p><a href="${APP_URL}/projects/${pa.project_id}/pay-applications/${approval.pay_application_id}">View in Saguaro →</a></p>
      `,
    });
  }

  return NextResponse.json({
    success:  true,
    decision,
    message:  decision === 'approved'
      ? 'Pay application approved. The contractor has been notified.'
      : 'Pay application rejected. The contractor has been notified.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RECORD PAYMENT + GENERATE UNCONDITIONAL WAIVERS
// POST /api/pay-apps/[payAppId]/record-payment
// ─────────────────────────────────────────────────────────────────────────────

export async function recordPaymentHandler(req: NextRequest, payAppId: string) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId   = String(body['tenantId']   ?? '');
  const amountPaid = Number(body['amountPaid'] ?? 0);
  const paidDate   = String(body['paidDate']   ?? new Date().toISOString().split('T')[0]);
  const checkNumber = String(body['checkNumber'] ?? '');

  if (!tenantId || !amountPaid) return NextResponse.json({ error: 'tenantId and amountPaid required' }, { status: 400 });

  const { data: payApp } = await supabaseAdmin
    .from('pay_applications')
    .select('*')
    .eq('id', payAppId)
    .eq('tenant_id', tenantId)
    .single();

  if (!payApp) return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });

  const now = new Date().toISOString();

  // Mark pay app as paid
  await supabaseAdmin.from('pay_applications').update({
    status: 'paid', paid_at: paidDate, updated_at: now,
  }).eq('id', payAppId);

  // Upgrade conditional → unconditional lien waivers for this pay app
  const { data: condWaivers } = await supabaseAdmin
    .from('lien_waivers')
    .select('*')
    .eq('pay_application_id', payAppId)
    .eq('waiver_type', 'conditional_partial');

  const uncondWaiverIds: string[] = [];
  for (const cw of condWaivers ?? []) {
    const { data: uncond } = await supabaseAdmin
      .from('lien_waivers')
      .insert({
        tenant_id:          tenantId,
        project_id:         cw.project_id,
        contract_id:        cw.contract_id,
        pay_application_id: payAppId,
        waiver_type:        'unconditional_partial',
        state:              cw.state,
        claimant_name:      cw.claimant_name,
        claimant_address:   cw.claimant_address,
        owner_name:         cw.owner_name,
        gc_name:            cw.gc_name,
        project_address:    cw.project_address,
        through_date:       cw.through_date,
        amount:             cw.amount,
        status:             'draft',  // still needs sub signature
        ai_generated:       true,
        statutory_compliant: true,
        created_at:         now,
        updated_at:         now,
      })
      .select('id')
      .single();

    if (uncond) uncondWaiverIds.push(uncond.id as string);
  }

  return NextResponse.json({
    success:             true,
    payApplicationId:    payAppId,
    amountPaid,
    paidDate,
    unconditionalWaivers: uncondWaiverIds.length,
    nextStep:            'Send unconditional lien waivers to subs for signature',
  });
}
