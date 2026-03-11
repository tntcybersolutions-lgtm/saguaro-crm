/**
 * lib/triggers.ts
 * All auto-trigger hooks — wired to API routes
 * Each trigger runs async work: generate PDFs, send emails, create notifications
 */
import { createServerClient } from './supabase-server';
import { createNotification } from './notifications';
import {
  sendPayAppSubmitted, sendPayAppApproved, sendPayAppCertified,
  sendLienWaiverRequest, sendLienWaiverSigned,
  sendBidPackageCreated, sendSubInvitedToBid, sendBidSubmitted,
  sendBidAwarded, sendBidNotAwarded,
  sendRFISubmitted, sendRFIAnswered,
  sendChangeOrderApproved,
  sendInsuranceExpiring,
  sendW9Request,
} from './email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app';

function adminClient() { return createServerClient(); }

// ─── Project ──────────────────────────────────────────────────────────────────
export async function onProjectCreated(projectId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: project } = await db.from('projects').select('*').eq('id', projectId).single();
    if (!project) return;
    const p = project as any;
    await createNotification(
      p.tenant_id, p.created_by, 'project_created',
      `Project created: ${p.name}`,
      'Your project has been set up. Add your team, subcontractors, and upload drawings.',
      `${APP_URL}/app/projects/${projectId}/overview`, projectId
    );
  } catch (err) {
    console.error('[onProjectCreated]', err);
  }
}

// ─── Pay Applications ─────────────────────────────────────────────────────────
export async function onPayAppCreated(payAppId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: payApp } = await db.from('pay_applications').select('*, projects(*)').eq('id', payAppId).single();
    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    // Create notification for team
    await createNotification(
      project.tenant_id, null, 'pay_app_submitted',
      `Pay App #${pa.app_number} created`,
      `Draft pay application created for ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/pay-apps/${payAppId}`, project.id
    );

    // Generate PDFs in background
    try {
      await fetch(`${APP_URL}/api/documents/pay-application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payAppId, projectId: project.id }),
      });
    } catch { /* non-blocking */ }
  } catch (err) {
    console.error('[onPayAppCreated]', err);
  }
}

export async function onPayAppSubmitted(payAppId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: payApp } = await db.from('pay_applications').select('*, projects(*)').eq('id', payAppId).single();
    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    const ownerEmail = project.owner_entity?.email;
    if (ownerEmail) {
      await sendPayAppSubmitted(
        ownerEmail,
        project.owner_entity?.name || 'Owner',
        project.name,
        pa.app_number,
        pa.current_payment_due || 0,
        `${APP_URL}/app/projects/${project.id}/pay-apps/${payAppId}`
      );
    }

    await createNotification(
      project.tenant_id, null, 'pay_app_submitted',
      `Pay App #${pa.app_number} submitted to owner`,
      `Application for ${project.name} submitted. Amount: $${(pa.current_payment_due || 0).toLocaleString()}`,
      `${APP_URL}/app/projects/${project.id}/pay-apps/${payAppId}`, project.id
    );
  } catch (err) {
    console.error('[onPayAppSubmitted]', err);
  }
}

export async function onPayAppApproved(payAppId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: payApp } = await db.from('pay_applications').select('*, projects(*)').eq('id', payAppId).single();
    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    // Email GC
    const gcEmail = project.gc_email;
    if (gcEmail) {
      await sendPayAppApproved(gcEmail, project.gc_name || 'Contractor', project.name, pa.app_number, pa.current_payment_due || 0);
    }

    // Auto-generate conditional lien waivers for all subs
    const { data: subs } = await db.from('subcontractors').select('*').eq('project_id', project.id).neq('status', 'inactive');
    if (subs && subs.length > 0) {
      for (const sub of subs as any[]) {
        if (!sub.email) continue;
        // Generate lien waiver
        const { data: waiver } = await db.from('lien_waivers').insert({
          tenant_id: project.tenant_id,
          project_id: project.id,
          sub_id: sub.id,
          pay_app_id: payAppId,
          waiver_type: 'conditional_partial',
          state: project.state || 'AZ',
          amount: sub.contract_amount || 0,
          through_date: pa.period_to,
          status: 'pending',
        }).select().single();
        if (waiver) {
          const w = waiver as any;
          await sendLienWaiverRequest(
            sub.email, sub.name, project.name, sub.contract_amount || 0,
            `${APP_URL}/portals/lien-waiver/${w.token}`
          );
        }
      }
    }

    await createNotification(
      project.tenant_id, null, 'pay_app_approved',
      `Pay App #${pa.app_number} approved`,
      `Lien waivers auto-generated for all subs on ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/lien-waivers`, project.id
    );
  } catch (err) {
    console.error('[onPayAppApproved]', err);
  }
}

export async function onPayAppCertified(payAppId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: payApp } = await db.from('pay_applications').select('*, projects(*)').eq('id', payAppId).single();
    if (!payApp) return;
    const pa = payApp as any;
    const project = pa.projects;
    if (!project) return;

    const gcEmail = project.gc_email;
    if (gcEmail) {
      await sendPayAppCertified(gcEmail, project.gc_name || 'Contractor', project.name, pa.current_payment_due || 0, new Date().toLocaleDateString());
    }
    await createNotification(
      project.tenant_id, null, 'pay_app_certified',
      `Payment certified — App #${pa.app_number}`,
      `Payment of $${(pa.current_payment_due || 0).toLocaleString()} certified for ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/pay-apps`, project.id
    );
  } catch (err) {
    console.error('[onPayAppCertified]', err);
  }
}

// ─── Bid Packages ─────────────────────────────────────────────────────────────
export async function onBidPackageCreated(bidPackageId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: pkg } = await db.from('bid_packages').select('*, projects(*)').eq('id', bidPackageId).single();
    if (!pkg) return;
    const bp = pkg as any;
    const project = bp.projects;
    if (!project) return;

    // Generate bid jacket PDF
    try {
      await fetch(`${APP_URL}/api/bid-packages/${bidPackageId}/generate-jacket`, { method: 'POST' });
    } catch { /* non-blocking */ }

    await createNotification(
      project.tenant_id, null, 'bid_package_created',
      `Bid package created: ${bp.trade}`,
      `Bid package for ${bp.trade} on ${project.name} created. Invitations are being sent.`,
      `${APP_URL}/app/projects/${project.id}/bid-packages/${bidPackageId}`, project.id
    );
  } catch (err) {
    console.error('[onBidPackageCreated]', err);
  }
}

export async function onSubInvitedToBid(bidPackageId: string, inviteId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: invite } = await db
      .from('bid_package_invites')
      .select('*, bid_packages(*, projects(*))')
      .eq('id', inviteId)
      .single();
    if (!invite) return;
    const inv = invite as any;
    const pkg = inv.bid_packages;
    const project = pkg?.projects;
    if (!project || !inv.sub_email) return;

    await sendSubInvitedToBid(
      inv.sub_email, inv.sub_name, project.name, pkg.trade,
      pkg.due_date || '', pkg.scope_summary || '',
      `${APP_URL}/portals/sub/${inv.token}`
    );

    await db.from('bid_package_invites').update({ invited_at: new Date().toISOString() }).eq('id', inviteId);
  } catch (err) {
    console.error('[onSubInvitedToBid]', err);
  }
}

export async function onBidSubmitted(bidSubmissionId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: sub } = await db
      .from('bid_submissions')
      .select('*, bid_packages(*, projects(*))')
      .eq('id', bidSubmissionId)
      .single();
    if (!sub) return;
    const s = sub as any;
    const pkg = s.bid_packages;
    const project = pkg?.projects;
    if (!project) return;

    const gcEmail = project.gc_email;
    if (gcEmail) {
      await sendBidSubmitted(gcEmail, project.gc_name || 'GC', s.sub_name, project.name, s.bid_amount || 0);
    }

    await createNotification(
      project.tenant_id, null, 'bid_submitted',
      `New bid received from ${s.sub_name}`,
      `${s.sub_name} submitted a bid of $${(s.bid_amount || 0).toLocaleString()} for ${pkg.trade} on ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/bid-packages/${pkg.id}`, project.id
    );
  } catch (err) {
    console.error('[onBidSubmitted]', err);
  }
}

export async function onBidAwarded(bidSubmissionId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: winner } = await db
      .from('bid_submissions')
      .select('*, bid_packages(*, projects(*))')
      .eq('id', bidSubmissionId)
      .single();
    if (!winner) return;
    const w = winner as any;
    const pkg = w.bid_packages;
    const project = pkg?.projects;
    if (!project) return;

    // Email winner
    const { data: winnerInvite } = await db
      .from('bid_package_invites')
      .select('sub_email')
      .eq('id', w.invite_id)
      .single();
    if (winnerInvite) {
      await sendBidAwarded(
        (winnerInvite as any).sub_email, w.sub_name, project.name,
        w.bid_amount || 0, project.start_date || ''
      );
    }

    // Email losers
    const { data: losers } = await db
      .from('bid_submissions')
      .select('*, bid_package_invites(sub_email)')
      .eq('bid_package_id', pkg.id)
      .neq('id', bidSubmissionId);
    if (losers) {
      for (const loser of losers as any[]) {
        const loserEmail = loser.bid_package_invites?.sub_email;
        if (loserEmail) {
          await sendBidNotAwarded(loserEmail, loser.sub_name, project.name);
        }
      }
    }

    await db.from('bid_submissions').update({ status: 'not_awarded' }).eq('bid_package_id', pkg.id).neq('id', bidSubmissionId);
    await createNotification(
      project.tenant_id, null, 'bid_awarded',
      `Bid awarded to ${w.sub_name}`,
      `${w.sub_name} awarded ${pkg.trade} contract for $${(w.bid_amount || 0).toLocaleString()} on ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/bid-packages/${pkg.id}`, project.id
    );
  } catch (err) {
    console.error('[onBidAwarded]', err);
  }
}

// ─── Subcontractors ───────────────────────────────────────────────────────────
export async function onSubAddedToProject(projectId: string, subId: string): Promise<void> {
  try {
    const db = adminClient();
    const [{ data: sub }, { data: project }] = await Promise.all([
      db.from('subcontractors').select('*').eq('id', subId).single(),
      db.from('projects').select('*').eq('id', projectId).single(),
    ]);
    if (!sub || !project) return;
    const s = sub as any;
    const p = project as any;

    // Send W-9 request if contract > $600
    if ((s.contract_amount || 0) > 600 && s.email && s.w9_status !== 'submitted') {
      const { data: w9 } = await db.from('w9_requests').insert({
        tenant_id: p.tenant_id,
        project_id: projectId,
        sub_id: subId,
        vendor_name: s.name,
        vendor_email: s.email,
        status: 'pending',
        sent_at: new Date().toISOString(),
      }).select().single();
      if (w9) {
        await sendW9Request(s.email, s.name, p.name, `${APP_URL}/portals/w9/${(w9 as any).token}`);
      }
    }

    // Preliminary notice for AZ/CA/TX
    if (['AZ', 'CA', 'TX'].includes(p.state || '')) {
      await createNotification(
        p.tenant_id, null, 'sub_added',
        `Preliminary notice required — ${s.name}`,
        `${p.state} requires a preliminary notice for ${s.name} on ${p.name}. Serve within 20 days.`,
        `${APP_URL}/app/projects/${projectId}/compliance`, projectId
      );
    }
  } catch (err) {
    console.error('[onSubAddedToProject]', err);
  }
}

// ─── RFIs ─────────────────────────────────────────────────────────────────────
export async function onRFICreated(rfiId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: rfi } = await db.from('rfis').select('*, projects(*)').eq('id', rfiId).single();
    if (!rfi) return;
    const r = rfi as any;
    const project = r.projects;
    if (!project) return;

    const architectEmail = project.architect_entity?.email;
    if (architectEmail) {
      await sendRFISubmitted(architectEmail, project.name, r.rfi_number, r.subject, r.submitted_by_name || 'GC');
    }

    await createNotification(
      project.tenant_id, null, 'rfi_submitted',
      `RFI #${r.rfi_number} submitted`,
      `"${r.subject}" — due ${r.due_date || 'TBD'}`,
      `${APP_URL}/app/projects/${project.id}/rfis/${rfiId}`, project.id
    );
  } catch (err) {
    console.error('[onRFICreated]', err);
  }
}

export async function onRFIAnswered(rfiId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: rfi } = await db.from('rfis').select('*, projects(*)').eq('id', rfiId).single();
    if (!rfi) return;
    const r = rfi as any;
    const project = r.projects;
    if (!project) return;

    const submitterEmail = project.gc_email;
    if (submitterEmail) {
      await sendRFIAnswered(submitterEmail, 'Project Team', project.name, r.rfi_number, r.answer || '');
    }

    await createNotification(
      project.tenant_id, null, 'rfi_answered',
      `RFI #${r.rfi_number} answered`,
      `"${r.subject}" has been answered`,
      `${APP_URL}/app/projects/${project.id}/rfis/${rfiId}`, project.id
    );
  } catch (err) {
    console.error('[onRFIAnswered]', err);
  }
}

// ─── Change Orders ────────────────────────────────────────────────────────────
export async function onChangeOrderApproved(changeOrderId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: co } = await db.from('change_orders').select('*, projects(*)').eq('id', changeOrderId).single();
    if (!co) return;
    const c = co as any;
    const project = c.projects;
    if (!project) return;

    // Update project contract sum
    const { data: currentProject } = await db.from('projects').select('contract_amount').eq('id', project.id).single();
    if (currentProject) {
      const newSum = ((currentProject as any).contract_amount || 0) + (c.cost_impact || 0);
      await db.from('projects').update({ contract_amount: newSum }).eq('id', project.id);
    }

    const ownerEmail = project.owner_entity?.email;
    if (ownerEmail) {
      await sendChangeOrderApproved(ownerEmail, project.name, c.co_number, c.cost_impact || 0);
    }

    await createNotification(
      project.tenant_id, null, 'change_order_approved',
      `Change Order #${c.co_number} approved`,
      `CO #${c.co_number} approved — $${(c.cost_impact || 0).toLocaleString()} added to contract`,
      `${APP_URL}/app/projects/${project.id}/change-orders`, project.id
    );
  } catch (err) {
    console.error('[onChangeOrderApproved]', err);
  }
}

// ─── Insurance ────────────────────────────────────────────────────────────────
export async function onInsuranceExpiring(certId: string, daysLeft: number): Promise<void> {
  try {
    const db = adminClient();
    const { data: cert } = await db
      .from('insurance_certificates')
      .select('*, subcontractors(name, email), projects(name, gc_email, tenant_id)')
      .eq('id', certId)
      .single();
    if (!cert) return;
    const c = cert as any;
    const sub = c.subcontractors;
    const project = c.projects;
    if (!project) return;

    const subEmail = sub?.email;
    if (subEmail) {
      await sendInsuranceExpiring(subEmail, sub.name, project.name, c.policy_type, c.expiry_date, daysLeft);
    }
    const gcEmail = project.gc_email;
    if (gcEmail) {
      await sendInsuranceExpiring(gcEmail, sub?.name || 'Subcontractor', project.name, c.policy_type, c.expiry_date, daysLeft);
    }

    await db.from('insurance_certificates').update({ reminder_sent: true, last_reminder: new Date().toISOString() }).eq('id', certId);
    await createNotification(
      project.tenant_id, null, 'insurance_expiring',
      `Insurance expiring in ${daysLeft} days — ${sub?.name || 'Subcontractor'}`,
      `${c.policy_type} expires on ${c.expiry_date}`,
      `${APP_URL}/app/projects/${c.project_id}/insurance`, c.project_id
    );
  } catch (err) {
    console.error('[onInsuranceExpiring]', err);
  }
}

// ─── Substantial Completion ───────────────────────────────────────────────────
export async function onSubstantialCompletion(projectId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: project } = await db.from('projects').select('*').eq('id', projectId).single();
    if (!project) return;
    const p = project as any;

    // Auto-generate G704
    try {
      await fetch(`${APP_URL}/api/documents/g704`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
    } catch { /* non-blocking */ }

    await createNotification(
      p.tenant_id, null, 'document_generated',
      `G704 Substantial Completion Certificate generated`,
      `Project ${p.name} marked substantially complete. G704 auto-generated.`,
      `${APP_URL}/app/projects/${projectId}/documents`, projectId
    );
  } catch (err) {
    console.error('[onSubstantialCompletion]', err);
  }
}

// ─── Project Close ────────────────────────────────────────────────────────────
export async function onProjectClosed(projectId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: project } = await db.from('projects').select('*').eq('id', projectId).single();
    if (!project) return;
    const p = project as any;

    await createNotification(
      p.tenant_id, null, 'project_created',
      `Project ${p.name} closed — closeout checklist started`,
      'Review your closeout package checklist and generate final documents.',
      `${APP_URL}/app/projects/${projectId}/closeout`, projectId
    );
  } catch (err) {
    console.error('[onProjectClosed]', err);
  }
}
