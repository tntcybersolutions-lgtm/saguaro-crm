import { createNotification } from '../notifications';
import {
  sendDocumentReady,
  sendPayAppNotification,
  sendLienWaiverRequest,
  sendEmail,
  lienWaiverRequestEmail,
} from '../email/send';
import { trackDocumentGenerated, trackPayAppSubmitted } from '../analytics';
import { supabaseAdmin } from '../../supabase/admin';
import { generateLienWaiver } from '../document-templates/lien-waiver-generator';

// ─── onDocumentGenerated ──────────────────────────────────────────────────────

export interface OnDocumentGeneratedParams {
  projectId: string;
  tenantId: string;
  docType: string;
  pdfUrl: string;
  userId?: string;
  recipientEmail?: string;
  projectName?: string;
}

export async function onDocumentGenerated(params: OnDocumentGeneratedParams): Promise<void> {
  try {
    const { projectId, tenantId, docType, pdfUrl, userId, recipientEmail, projectName } = params;

    await createNotification({
      tenantId,
      userId,
      projectId,
      type: 'document_ready',
      title: `${docType} ready`,
      body: `Your ${docType} has been generated`,
      link: pdfUrl,
    });

    if (recipientEmail) {
      await sendDocumentReady(recipientEmail, projectName ?? 'Project', docType, pdfUrl);
    }

    trackDocumentGenerated(projectId, docType, userId);
  } catch (err) {
    console.error('[onDocumentGenerated] Error in document trigger:', err);
  }
}

// ─── onPayAppSubmitted ────────────────────────────────────────────────────────

export interface OnPayAppSubmittedParams {
  projectId: string;
  tenantId: string;
  appNumber: number;
  amount: number;
  pdfUrl: string;
  ownerEmail?: string;
  projectName?: string;
}

export async function onPayAppSubmitted(params: OnPayAppSubmittedParams): Promise<void> {
  try {
    const { projectId, tenantId, appNumber, amount, pdfUrl, ownerEmail, projectName } = params;

    const name = projectName ?? 'Project';

    await createNotification({
      tenantId,
      projectId,
      type: 'pay_app_submitted',
      title: `Pay Application #${appNumber} submitted`,
      body: `Pay Application #${appNumber} for ${name} has been submitted for review`,
      link: pdfUrl,
    });

    if (ownerEmail) {
      await sendPayAppNotification(ownerEmail, name, appNumber, amount, pdfUrl);
    }

    trackPayAppSubmitted(projectId, appNumber, amount);
  } catch (err) {
    console.error('[onPayAppSubmitted] Error in pay app trigger:', err);
  }
}

// ─── onLienWaiverRequested ────────────────────────────────────────────────────

export interface OnLienWaiverRequestedParams {
  projectId: string;
  tenantId: string;
  subName: string;
  subEmail: string;
  projectName: string;
  amount: number;
  throughDate: string;
  portalUrl: string;
}

export async function onLienWaiverRequested(params: OnLienWaiverRequestedParams): Promise<void> {
  try {
    const { projectId, tenantId, subName, subEmail, projectName, amount, throughDate, portalUrl } =
      params;

    await createNotification({
      tenantId,
      projectId,
      type: 'lien_waiver_requested',
      title: `Lien waiver requested — ${subName}`,
      body: `A lien waiver has been sent to ${subName} for ${projectName}`,
      link: portalUrl,
    });

    await sendLienWaiverRequest(subEmail, subName, projectName, amount, throughDate, portalUrl);
  } catch (err) {
    console.error('[onLienWaiverRequested] Error in lien waiver trigger:', err);
  }
}

// ─── onPayAppApproved ────────────────────────────────────────────────────────

// Called when a pay application is approved.
// Auto-generates conditional_progress lien waivers for all subs and emails them.
export async function onPayAppApproved(payAppId: string): Promise<void> {
  try {
    const { data: payApp } = await supabaseAdmin
      .from('pay_applications')
      .select('*')
      .eq('id', payAppId)
      .single();
    if (!payApp) return;

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', (payApp as any).project_id)
      .single();

    const { data: subs } = await supabaseAdmin
      .from('subcontractors')
      .select('*')
      .eq('project_id', (payApp as any).project_id);

    for (const sub of (subs as any[]) || []) {
      const waiverInput = {
        projectId: (payApp as any).project_id,
        waiverType: 'conditional_progress' as const,
        claimantName: sub.name,
        claimantAddress: sub.address || '',
        ownerName: (project as any)?.owner_entity?.name || 'Owner',
        projectName: (project as any)?.name || 'Project',
        projectAddress: (project as any)?.address || '',
        amount: sub.contract_amount || 0,
        throughDate: (payApp as any).period_to,
        stateJurisdiction: (project as any)?.state_jurisdiction,
      };

      const { pdfUrl } = await generateLienWaiver(waiverInput);

      if (sub.primary_email) {
        await sendEmail({
          to: sub.primary_email,
          subject: `Lien Waiver Request \u2014 ${(project as any)?.name} \u2014 Pay App #${(payApp as any).app_number}`,
          html: lienWaiverRequestEmail({
            subName: sub.name,
            projectName: (project as any)?.name || 'Project',
            waiverType: 'conditional_progress',
            amount: sub.contract_amount || 0,
            portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portals/sub/${sub.id}/lien-waiver`,
          }),
        });
      }
    }
    console.log(
      `[Trigger] onPayAppApproved: Generated ${(subs as any[])?.length || 0} conditional lien waivers`
    );
  } catch (err) {
    console.error('[Trigger] onPayAppApproved failed:', err);
  }
}

// ─── onSubOnboarded ──────────────────────────────────────────────────────────

// Called when a sub is onboarded to a project.
// Sends preliminary notice alerts and W-9 requests as needed.
export async function onSubOnboarded(
  projectId: string,
  subId: string
): Promise<void> {
  try {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    const { data: sub } = await supabaseAdmin
      .from('subcontractors')
      .select('*')
      .eq('id', subId)
      .single();
    if (!project || !sub) return;

    const state = (project as any).state_jurisdiction;

    // Preliminary notice for AZ, CA, TX
    if (['AZ', 'CA', 'TX'].includes(state || '')) {
      await createNotification({
        tenantId: (project as any).tenant_id || '',
        userId: (project as any).created_by || undefined,
        type: 'sub_added',
        title: `Preliminary Notice Required \u2014 ${(sub as any).name}`,
        body: `${state} requires a preliminary notice for ${(sub as any).name} within 20 days of first work. Generate now.`,
        link: `/app/projects/${projectId}/compliance`,
        projectId,
      });
    }

    // W-9 request if sub payments likely > $600
    if (((sub as any).contract_amount || 0) > 600) {
      const token = crypto.randomUUID();
      await supabaseAdmin.from('w9_requests').insert({
        sub_id: subId,
        project_id: projectId,
        token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if ((sub as any).primary_email) {
        await sendEmail({
          to: (sub as any).primary_email,
          subject: `W-9 Request \u2014 ${(project as any).name}`,
          html: `<p>Please complete your W-9 for ${(project as any).name}: <a href="${process.env.NEXT_PUBLIC_APP_URL}/w9/${token}">Complete W-9</a></p>`,
        });
      }
    }
  } catch (err) {
    console.error('[Trigger] onSubOnboarded failed:', err);
  }
}

// ─── onProjectPublic ─────────────────────────────────────────────────────────

// Called when a project is marked as a public project.
// Alerts about required public project documents.
export async function onProjectPublic(
  projectId: string,
  userId?: string
): Promise<void> {
  try {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('tenant_id, created_by')
      .eq('id', projectId)
      .single();

    await createNotification({
      tenantId: (project as any)?.tenant_id || '',
      userId: userId || (project as any)?.created_by || undefined,
      type: 'autopilot_alert',
      title: 'Public Project \u2014 Required Documents',
      body: 'Non-Collusion Affidavit and Subcontractor List are required for public project submissions.',
      link: `/app/projects/${projectId}/documents`,
      projectId,
    });
  } catch (err) {
    console.error('[Trigger] onProjectPublic failed:', err);
  }
}
