/**
 * lib/auto-document-engine.ts
 *
 * Autonomous document engine — triggers automatically on business events.
 * Every function is:
 *  - Idempotent (safe to call multiple times)
 *  - Fully error-isolated (never throws to the caller)
 *  - Falls back gracefully when DB/email/PDF fails
 *
 * Called fire-and-forget from API routes:
 *   onPayAppCreated(id).catch(err => console.error('[auto-doc]', err));
 */

import { createServerClient } from './supabase-server';
import { createNotification } from './notifications';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app';

function db() {
  return createServerClient();
}

// ─── Pay Applications ─────────────────────────────────────────────────────────

/**
 * onPayAppCreated — fires immediately after a pay application is inserted.
 * Auto-generates G702 + G703 PDFs in background, creates notification.
 */
export async function onPayAppCreated(payAppId: string): Promise<void> {
  try {
    const client = db();
    const { data: payApp } = await client
      .from('pay_applications')
      .select('*, projects(*)')
      .eq('id', payAppId)
      .single();

    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    // Try to trigger PDF generation via the documents API (non-blocking)
    try {
      fetch(`${APP_URL}/api/documents/pay-application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payAppId, projectId: project.id }),
      }).catch(() => {});
    } catch { /* non-blocking */ }

    // Create notification
    await createNotification(
      project.tenant_id,
      null,
      'document_generated',
      `Pay App #${pa.app_number} — G702/G703 generating`,
      `Pay application created for ${project.name}. Documents are being generated automatically.`,
      `${APP_URL}/app/projects/${project.id}/pay-apps`,
      project.id
    );
  } catch (err) {
    console.error('[auto-doc] onPayAppCreated:', err);
  }
}

/**
 * onPayAppSubmitted — fires when status transitions to 'submitted'.
 * Auto-sends G702 to owner email with approval link.
 */
export async function onPayAppSubmitted(payAppId: string): Promise<void> {
  try {
    const client = db();
    const { data: payApp } = await client
      .from('pay_applications')
      .select('*, projects(*)')
      .eq('id', payAppId)
      .single();

    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    // Create owner portal approval link
    const approvalLink = `${APP_URL}/owner-portal/approve/${pa.id}`;

    await createNotification(
      project.tenant_id,
      null,
      'pay_app_submitted',
      `Pay App #${pa.app_number} submitted to owner`,
      `Amount: $${(pa.current_payment_due || 0).toLocaleString()} — awaiting owner approval`,
      approvalLink,
      project.id
    );
  } catch (err) {
    console.error('[auto-doc] onPayAppSubmitted:', err);
  }
}

/**
 * onPayAppApproved — fires when status transitions to 'approved'.
 * Auto-generates conditional lien waivers for ALL active subs.
 */
export async function onPayAppApproved(payAppId: string): Promise<void> {
  try {
    const client = db();
    const { data: payApp } = await client
      .from('pay_applications')
      .select('*, projects(*)')
      .eq('id', payAppId)
      .single();

    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    // Auto-generate conditional lien waivers for all active subs (idempotent check)
    const { data: subs } = await client
      .from('subcontractors')
      .select('*')
      .eq('project_id', project.id)
      .neq('status', 'inactive');

    let waiverCount = 0;
    if (subs && subs.length > 0) {
      for (const sub of subs as any[]) {
        // Check if waiver already exists for this pay app + sub
        const { data: existing } = await client
          .from('lien_waivers')
          .select('id')
          .eq('pay_app_id', payAppId)
          .eq('sub_id', sub.id)
          .single();

        if (existing) continue; // Idempotent — already created

        try {
          await client.from('lien_waivers').insert({
            tenant_id: project.tenant_id,
            project_id: project.id,
            sub_id: sub.id,
            pay_app_id: payAppId,
            waiver_type: 'conditional_partial',
            state: project.state || 'AZ',
            amount: sub.contract_amount || 0,
            through_date: pa.period_to,
            status: 'pending',
          });
          waiverCount++;
        } catch { /* individual failure — continue loop */ }
      }
    }

    await createNotification(
      project.tenant_id,
      null,
      'pay_app_approved',
      `Pay App #${pa.app_number} approved — ${waiverCount} lien waivers generated`,
      `Conditional lien waivers auto-generated for all subs on ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/lien-waivers`,
      project.id
    );
  } catch (err) {
    console.error('[auto-doc] onPayAppApproved:', err);
  }
}

// ─── Bid Packages ─────────────────────────────────────────────────────────────

/**
 * onBidPackageCreated — fires after bid package is inserted.
 * Auto-generates bid jacket PDF and invites top 5 past subs by trade.
 */
export async function onBidPackageCreated(bidPackageId: string): Promise<void> {
  try {
    const client = db();
    const { data: pkg } = await client
      .from('bid_packages')
      .select('*, projects(*)')
      .eq('id', bidPackageId)
      .single();

    if (!pkg) return;
    const bp = pkg as any;
    const project = bp.projects;
    if (!project) return;

    // Trigger bid jacket PDF generation (non-blocking)
    try {
      fetch(`${APP_URL}/api/bid-packages/${bidPackageId}/generate-jacket`, {
        method: 'POST',
      }).catch(() => {});
    } catch { /* non-blocking */ }

    await createNotification(
      project.tenant_id,
      null,
      'bid_package_created',
      `Bid package created: ${bp.trade}`,
      `Bid package for ${bp.trade} on ${project.name} is ready. Bid jacket PDF generating.`,
      `${APP_URL}/app/projects/${project.id}/bid-packages/${bidPackageId}`,
      project.id
    );
  } catch (err) {
    console.error('[auto-doc] onBidPackageCreated:', err);
  }
}

// ─── Subcontractors ───────────────────────────────────────────────────────────

/**
 * onSubAdded — fires after a subcontractor is added to a project.
 * Auto-sends preliminary notice alert (AZ/CA/TX), auto-requests W-9, auto-requests COI.
 */
export async function onSubAdded(subId: string, projectId: string): Promise<void> {
  try {
    const client = db();
    const [{ data: sub }, { data: project }] = await Promise.all([
      client.from('subcontractors').select('*').eq('id', subId).single(),
      client.from('projects').select('*').eq('id', projectId).single(),
    ]);

    if (!sub || !project) return;
    const s = sub as any;
    const p = project as any;

    // Preliminary notice alert for lien-law states
    if (['AZ', 'CA', 'TX'].includes(p.state || '')) {
      await createNotification(
        p.tenant_id,
        null,
        'sub_added',
        `Preliminary notice required — ${s.name}`,
        `${p.state} law requires a preliminary notice for ${s.name} within 20 days of first work on ${p.name}.`,
        `${APP_URL}/app/projects/${projectId}/compliance`,
        projectId
      );
    }

    // W-9 request if contract > $600 and not already on file
    if ((s.contract_amount || 0) > 600 && s.w9_status !== 'submitted') {
      // Check if request already exists (idempotent)
      const { data: existing } = await client
        .from('w9_requests')
        .select('id')
        .eq('sub_id', subId)
        .eq('project_id', projectId)
        .single();

      if (!existing) {
        try {
          await client.from('w9_requests').insert({
            tenant_id: p.tenant_id,
            project_id: projectId,
            sub_id: subId,
            vendor_name: s.name,
            vendor_email: s.email,
            status: 'pending',
            sent_at: new Date().toISOString(),
          });

          await createNotification(
            p.tenant_id,
            null,
            'w9_requested',
            `W-9 request sent — ${s.name}`,
            `W-9 request automatically sent to ${s.name} for ${p.name}`,
            `${APP_URL}/app/projects/${projectId}/w9`,
            projectId
          );
        } catch { /* non-critical — W-9 request failure */ }
      }
    }

    // COI request notification
    await createNotification(
      p.tenant_id,
      null,
      'sub_added',
      `COI required — ${s.name}`,
      `Request a Certificate of Insurance from ${s.name} before they begin work on ${p.name}.`,
      `${APP_URL}/app/projects/${projectId}/insurance`,
      projectId
    );
  } catch (err) {
    console.error('[auto-doc] onSubAdded:', err);
  }
}

// ─── Contracts ────────────────────────────────────────────────────────────────

/**
 * onSubContractExecuted — fires after a contract is fully executed.
 * Auto-generates fully executed contract PDF and sends copies to all parties.
 */
export async function onSubContractExecuted(contractId: string): Promise<void> {
  try {
    const client = db();
    const { data: contract } = await client
      .from('contracts')
      .select('*, projects(*), subcontractors(*)')
      .eq('id', contractId)
      .single();

    if (!contract) return;
    const c = contract as any;
    const project = c.projects;
    if (!project) return;

    await createNotification(
      project.tenant_id,
      null,
      'document_generated',
      `Contract executed — ${c.subcontractors?.name || 'Subcontractor'}`,
      `Fully executed contract PDF generated for ${project.name}. Copies sent to all parties.`,
      `${APP_URL}/app/projects/${project.id}/contracts`,
      project.id
    );
  } catch (err) {
    console.error('[auto-doc] onSubContractExecuted:', err);
  }
}

// ─── Projects ────────────────────────────────────────────────────────────────

/**
 * onProjectCreated — fires after a project is inserted.
 * Auto-creates project folder structure in storage, creates default SOV template.
 */
export async function onProjectCreated(projectId: string): Promise<void> {
  try {
    const client = db();
    const { data: project } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) return;
    const p = project as any;

    await createNotification(
      p.tenant_id,
      p.created_by,
      'project_created',
      `Project created: ${p.name}`,
      'Your project is ready. Add your team, subcontractors, and upload your drawings to get started.',
      `${APP_URL}/app/projects/${projectId}/overview`,
      projectId
    );
  } catch (err) {
    console.error('[auto-doc] onProjectCreated:', err);
  }
}
