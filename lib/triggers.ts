/**
 * lib/triggers.ts
 * All auto-trigger hooks — wired to API routes
 * Each trigger runs async work: generate PDFs, send emails, create notifications
 */
import { createServerClient } from './supabase-server';
import { createNotification } from './notifications';
import { dispatchWebhookEvent } from './webhook-dispatch';
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
import { must } from '@/lib/db-write';
import { INSURANCE_ALERT_SELECT, insuranceAlertParties } from '@/lib/insurance-alert';
import { withComm } from '@/lib/comm-log';
import { bidAmount } from '@/lib/bid-amount';
import { bidDueDay } from '@/lib/bid-deadline';
import { orValue } from '@/lib/pg-filter';

/* Fallback is the live domain. It used to be a Vercel preview URL that no
   longer resolves, so any email sent without NEXT_PUBLIC_APP_URL set carried
   links into a dead deployment. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

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
    await dispatchWebhookEvent(p.tenant_id, 'project.created', {
      id: projectId,
      name: p.name,
      project_number: p.project_number ?? null,
      status: p.status ?? null,
      address: p.address ?? null,
      contract_amount: p.contract_amount ?? p.contract_value ?? null,
    });
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

    await dispatchWebhookEvent(project.tenant_id, 'pay_app.created', {
      id: payAppId,
      project_id: project.id,
      project_name: project.name,
      app_number: pa.app_number,
      status: pa.status ?? 'draft',
    });
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
    await dispatchWebhookEvent(project.tenant_id, 'pay_app.submitted', {
      id: payAppId,
      project_id: project.id,
      project_name: project.name,
      app_number: pa.app_number,
      amount_due: pa.current_payment_due ?? 0,
    });
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

    // Auto-generate conditional lien waivers for the project's subs.
    // LIVE schema: membership lives in project_subcontractors (which carries the
    // real per-sub contract_amount); the waiver FK is pay_application_id; and the
    // type CHECK allows conditional_progress/unconditional_progress/(final).
    // A conditional PROGRESS waiver is for THIS PERIOD'S payment — never the full
    // contract value.
    const { data: memberships, error: memErr } = await db
      .from('project_subcontractors')
      .select('subcontractor_id, contract_amount, status, subcontractors(company_name, email, contact_email)')
      .eq('project_id', project.id)
      .eq('tenant_id', project.tenant_id)
      .neq('status', 'inactive');
    if (memErr) console.error('[onPayAppApproved] membership query failed', memErr);
    const activeSubs = ((memberships as any[]) || [])
      .map((m) => ({
        subId: m.subcontractor_id,
        contractAmount: Number(m.contract_amount) || 0,
        company: m.subcontractors?.company_name || 'Subcontractor',
        email: m.subcontractors?.email || m.subcontractors?.contact_email || null,
      }))
      .filter((s) => s.email);
    // Count what ACTUALLY happened — the approval notification below reports these
    // numbers verbatim. It never claims "waivers generated for all subs" on faith.
    const allMembers = ((memberships as any[]) || []).length;
    const noEmail = allMembers - activeSubs.length;
    let waiversCreated = 0;
    let waiversFailed = 0;
    if (activeSubs.length > 0) {
      // Period amount: current payment due split by each sub's share of total
      // contract value (falls back to an even split when amounts are zero).
      const periodTotal = Number(pa.current_payment_due) || 0;
      const contractTotal = activeSubs.reduce((s, x) => s + x.contractAmount, 0);
      for (const sub of activeSubs) {
        const share = contractTotal > 0 ? sub.contractAmount / contractTotal : 1 / activeSubs.length;
        const waiverAmount = Math.round(periodTotal * share * 100) / 100;
        const { data: waiver, error: wErr } = await db.from('lien_waivers').insert({
          tenant_id: project.tenant_id,
          project_id: project.id,
          sub_id: sub.subId,
          subcontractor_id: sub.subId,
          pay_application_id: payAppId,
          waiver_type: 'conditional_progress',
          state: project.state || 'AZ',
          amount: waiverAmount,
          company_name: sub.company,
          claimant_name: sub.company,
          through_date: pa.period_to,
          status: 'pending',
        } as never).select().single();
        if (wErr || !waiver) { console.error('[onPayAppApproved] waiver insert failed', wErr); waiversFailed++; continue; }
        waiversCreated++;
        const w = waiver as any;
        await sendLienWaiverRequest(
          sub.email, sub.company, project.name, waiverAmount,
          `${APP_URL}/portals/lien-waiver/${w.token}`
        );
      }
    }

    // Report the real outcome. A silent partial failure (or a project with no
    // subs on file) must NOT read as "waivers generated for all subs".
    const waiverLine = (() => {
      const parts: string[] = [];
      if (waiversCreated > 0) parts.push(`${waiversCreated} conditional lien waiver${waiversCreated === 1 ? '' : 's'} generated`);
      if (waiversFailed > 0) parts.push(`${waiversFailed} failed to generate — generate ${waiversFailed === 1 ? 'it' : 'them'} manually`);
      if (noEmail > 0) parts.push(`${noEmail} sub${noEmail === 1 ? '' : 's'} skipped (no email on file)`);
      if (memErr) parts.push('subcontractor list could not be read — no waivers were generated');
      if (!parts.length) parts.push(allMembers === 0 ? 'no subcontractors on this project — no waivers generated' : 'no waivers generated');
      return parts.join('; ');
    })();
    await createNotification(
      project.tenant_id, null, 'pay_app_approved',
      `Pay App #${pa.app_number} approved`,
      `${project.name} — ${waiverLine}.`,
      `${APP_URL}/app/projects/${project.id}/lien-waivers`, project.id
    );
    await dispatchWebhookEvent(project.tenant_id, 'pay_app.approved', {
      id: payAppId,
      project_id: project.id,
      project_name: project.name,
      app_number: pa.app_number,
      amount_due: pa.current_payment_due ?? 0,
    });
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
    await dispatchWebhookEvent(project.tenant_id, 'pay_app.certified', {
      id: payAppId,
      project_id: project.id,
      project_name: project.name,
      app_number: pa.app_number,
      amount_certified: pa.current_payment_due ?? 0,
    });
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
    await dispatchWebhookEvent(project.tenant_id, 'bid_package.created', {
      id: bidPackageId,
      project_id: project.id,
      project_name: project.name,
      trade: bp.trade,
      due_date: bp.due_date ?? null,
    });
  } catch (err) {
    console.error('[onBidPackageCreated]', err);
  }
}

/**
 * Email one bidder their jacket link, and say whether it really went.
 *
 * This used to return nothing and catch everything, so /issue recorded
 * `sent: true` for every invitee — including the ones whose mail bounced or
 * was never sent because email is not configured. The GC read "issued to 6 of
 * 6" when nobody had been reached. It now reports the truth for this one
 * invitee, and stamps invited_at ONLY when the mail left: that stamp is what
 * lib/bid-issue reads to decide who already holds the issued jacket, so a
 * failed send is retried by the next send instead of being skipped for good.
 */
export async function onSubInvitedToBid(bidPackageId: string, inviteId: string): Promise<{ sent: boolean; error?: string }> {
  let inv: any;
  let pkg: any;
  let project: any;
  try {
    const db = adminClient();
    const { data: invite, error } = await db
      .from('bid_package_invites')
      .select('*, bid_packages(*, projects(*))')
      .eq('id', inviteId)
      .maybeSingle();
    if (error) throw error;
    if (!invite) return { sent: false, error: 'This invitation no longer exists.' };
    inv = invite;
    pkg = inv.bid_packages;
    project = pkg?.projects;
  } catch (err) {
    console.error('[onSubInvitedToBid] invite read failed', inviteId, err);
    return { sent: false, error: 'The invitation could not be read.' };
  }
  if (!pkg || pkg.id !== bidPackageId) return { sent: false, error: 'This invitation belongs to a different bid package.' };
  if (!project) return { sent: false, error: 'This bid package is not on a project.' };
  if (!inv.sub_email) return { sent: false, error: 'No email address on file.' };
  if (!inv.token) return { sent: false, error: 'This invitation has no bid link.' };

  /* /portals/bid/<invite token> — the bidder's own jacket, keyed by the token
     on THIS invite. It used to point at /portals/sub/<token>, which has no
     page at all (404) and whose auth route validates portal_sub_sessions.token
     — a different token type entirely. Every bid invitation ever sent carried
     a link that could not resolve. */
  let mail: { sent: boolean; error?: string };
  try {
    mail = await withComm(
      { tenantId: project.tenant_id, projectId: project.id, bidPackageId: pkg.id, subId: inv.sub_id ?? null,
        relatedType: 'bid_invite', relatedId: inviteId, toName: inv.company_name || inv.sub_name || null },
      () => sendSubInvitedToBid(
        inv.sub_email, inv.company_name || inv.sub_name || 'there', project.name, pkg.trade || pkg.name || 'Bid package',
        bidDueDay(pkg) || '', pkg.scope_summary || pkg.scope_narrative || pkg.scope_of_work || '',
        `${APP_URL}/portals/bid/${inv.token}`
      ),
    );
  } catch (err) {
    console.error('[onSubInvitedToBid] send threw', inv.sub_email, err);
    return { sent: false, error: 'The invitation could not be sent.' };
  }
  if (!mail.sent) {
    console.error('[onSubInvitedToBid] invitation not delivered to', inv.sub_email, '-', mail.error);
    return { sent: false, error: mail.error || 'The invitation was not delivered.' };
  }

  /* The mail has left. A failure from here on is logged, never reported as
     "not sent" — that would invite the GC to send it twice. */
  try {
    const now = new Date().toISOString();
    await must(
      adminClient().from('bid_package_invites')
        .update({ invited_at: now, invitation_sent_at: inv.invitation_sent_at || now } as never)
        .eq('id', inviteId)
        .eq('tenant_id', inv.tenant_id),
      'bid_package_invites sent stamp',
    );
  } catch (err) {
    console.error('[onSubInvitedToBid] delivered but not stamped', inviteId, err);
  }
  try {
    await dispatchWebhookEvent(project.tenant_id, 'bid.invited', {
      invite_id: inviteId,
      bid_package_id: pkg.id,
      project_id: project.id,
      project_name: project.name,
      trade: pkg.trade,
      sub_name: inv.sub_name,
      sub_email: inv.sub_email,
    });
  } catch (err) {
    console.error('[onSubInvitedToBid] webhook', err);
  }
  return { sent: true };
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

    /* bid_submissions has no bid_amount column — it is base_amount / amount /
       base_bid. Reading a column that does not exist yielded undefined, so the
       GC's "new bid received" email and in-app alert both reported $0 for every
       bid that arrived. lib/bid-amount takes the first positive figure. */
    const amountBid = bidAmount(s);
    const bidder = s.company_name || s.sub_name || s.contact_email || 'A subcontractor';

    const gcEmail = project.gc_email;
    if (gcEmail) {
      await withComm(
        { tenantId: project.tenant_id, projectId: project.id, bidPackageId: pkg.id, subId: s.sub_id ?? null,
          relatedType: 'bid_received', relatedId: bidSubmissionId, toName: project.gc_name || null },
        () => sendBidSubmitted(gcEmail, project.gc_name || 'GC', bidder, project.name, amountBid),
      );
    }

    await createNotification(
      project.tenant_id, null, 'bid_submitted',
      `New bid received from ${bidder}`,
      `${bidder} submitted a bid of $${amountBid.toLocaleString()} for ${pkg.trade || pkg.name} on ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/bid-packages/${pkg.id}`, project.id
    );
    await dispatchWebhookEvent(project.tenant_id, 'bid.submitted', {
      id: bidSubmissionId,
      bid_package_id: pkg.id,
      project_id: project.id,
      project_name: project.name,
      trade: pkg.trade,
      sub_name: s.sub_name,
      bid_amount: amountBid,
    });
  } catch (err) {
    console.error('[onBidSubmitted]', err);
  }
}

export type AwardNotice = { id?: string; email: string | null; name: string | null; sent: boolean; error?: string };
export type AwardNotices = {
  winner: AwardNotice | null;
  losers: AwardNotice[];
  /** Losing bids moved to 'not_awarded'. */
  losersMarked: number;
  /** Set when the notices could not be worked out at all. */
  error?: string;
};

/**
 * The award notices and the award chain.
 *
 * The notices had never reached anyone. The winner's address was read from
 * `w.invite_id` — bid_submissions has no such column, so the lookup was
 * `id = undefined` and the winner was never told. The losers' addresses came
 * from embedding bid_package_invites inside bid_submissions, and no foreign
 * key links those tables, so PostgREST refused the embed and nobody else was
 * told either. The amount put `amount` ahead of base_amount (amount defaults
 * to 0), which drafted subcontracts at $0.
 *
 * A bid row carries its own address (contact_email / sub_email — both bid
 * portals write them), with the package's invite matched by roster sub as the
 * fallback. Losing bids are marked 'not_awarded' BEFORE any email, so the
 * record is right even when a send fails. What happened to each notice is
 * returned, so the award route can tell the GC.
 */
export async function onBidAwarded(bidSubmissionId: string): Promise<AwardNotices> {
  const out: AwardNotices = { winner: null, losers: [], losersMarked: 0 };
  let w: any;
  let pkg: any;
  let project: any;
  let tenantId: string;
  let awardAmount = 0;
  let winnerEmail: string | null = null;
  const db = adminClient();

  try {
    const { data: winner, error: wErr } = await db
      .from('bid_submissions')
      .select('*, bid_packages(*, projects(*))')
      .eq('id', bidSubmissionId)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!winner) return { ...out, error: 'The awarded bid was not found.' };
    w = winner;
    pkg = w.bid_packages;
    project = pkg?.projects;
    if (!pkg || !project) return { ...out, error: 'The awarded bid is not on a bid package with a project.' };
    tenantId = w.tenant_id || pkg.tenant_id || project.tenant_id;
    awardAmount = bidAmount(w);

    /* The package's invites are only the fallback for a bid row with no
       address of its own, so a failed read here costs that fallback, not the
       award — logged, not thrown. */
    const { data: invRows, error: invErr } = await db
      .from('bid_package_invites')
      .select('id, sub_id, sub_email')
      .eq('bid_package_id', pkg.id)
      .eq('tenant_id', tenantId);
    if (invErr) console.error('[onBidAwarded] invite read (address fallback)', invErr);
    const invites = (invRows || []) as Array<{ sub_id: string | null; sub_email: string | null }>;
    const emailOf = (s: any): string | null => {
      const own = String(s?.contact_email || s?.sub_email || '').trim().toLowerCase();
      if (own) return own;
      const byRoster = s?.sub_id ? invites.find((i) => i.sub_id === s.sub_id && i.sub_email) : null;
      return byRoster?.sub_email ? String(byRoster.sub_email).trim().toLowerCase() : null;
    };
    const nameOf = (s: any): string => s?.company_name || s?.sub_name || s?.contact_name || 'Subcontractor';

    // ── Losers: on the record first ──
    const { data: loserRows, error: lErr } = await db
      .from('bid_submissions')
      .select('*')
      .eq('bid_package_id', pkg.id)
      .eq('tenant_id', tenantId)
      .neq('id', bidSubmissionId);
    if (lErr) throw lErr;
    const losers = (loserRows || []) as any[];
    if (losers.length) {
      await must(
        db.from('bid_submissions')
          .update({ status: 'not_awarded', is_awarded: false } as never)
          .eq('bid_package_id', pkg.id)
          .eq('tenant_id', tenantId)
          .neq('id', bidSubmissionId),
        'bid_submissions not_awarded',
      );
      out.losersMarked = losers.length;
    }

    // ── Winner ──
    winnerEmail = emailOf(w);
    if (winnerEmail) {
      const to = winnerEmail;
      const r = await withComm(
        { tenantId, projectId: project.id, bidPackageId: pkg.id, subId: w.sub_id ?? null,
          relatedType: 'bid_award', relatedId: bidSubmissionId, toName: nameOf(w) },
        () => sendBidAwarded(to, nameOf(w), project.name, awardAmount, project.start_date || ''),
      );
      out.winner = { id: w.id, email: to, name: nameOf(w), sent: r.sent, error: r.sent ? undefined : r.error || 'Not delivered.' };
    } else {
      out.winner = { id: w.id, email: null, name: nameOf(w), sent: false, error: 'No email address on file.' };
    }

    // ── Losers: told ──
    for (const loser of losers) {
      const email = emailOf(loser);
      if (!email) {
        out.losers.push({ id: loser.id, email: null, name: nameOf(loser), sent: false, error: 'No email address on file.' });
        continue;
      }
      const r = await withComm(
        { tenantId, projectId: project.id, bidPackageId: pkg.id, subId: loser.sub_id ?? null,
          relatedType: 'bid_not_awarded', relatedId: loser.id, toName: nameOf(loser) },
        () => sendBidNotAwarded(email, nameOf(loser), project.name),
      );
      out.losers.push({ id: loser.id, email, name: nameOf(loser), sent: r.sent, error: r.sent ? undefined : r.error || 'Not delivered.' });
    }
  } catch (err) {
    console.error('[onBidAwarded] notices', err);
    return { ...out, error: 'The award notices could not be sent.' };
  }

  // ── THE AWARD CHAIN — an award is a MONEY event, not just an email. ──
  // Each link is its own step: one failing must not skip the rest.
  const winnerName = w.company_name || w.sub_name || w.contact_name || 'Subcontractor';

  // (a) Draft subcontract at the awarded amount, linked to the package.
  try {
    const { data: existingContract, error: cErr } = await db
      .from('contracts')
      .select('id')
      .eq('bid_package_id', pkg.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!existingContract) {
      await must(db.from('contracts').insert({
        tenant_id: tenantId,
        project_id: project.id,
        bid_package_id: pkg.id,
        contract_type: 'subcontract',
        status: 'draft',
        title: `${pkg.trade || pkg.name} — ${winnerName}`,
        amount: awardAmount,
        contract_amount: awardAmount,
        original_amount: String(awardAmount), // TEXT column in the live schema
        party_name: winnerName,
        party_company: winnerName,
        party_email: winnerEmail,
        counterparty_name: winnerName,
        counterparty_email: winnerEmail,
        notes: `Auto-created on bid award (package: ${pkg.name}).`,
      } as never), 'contracts award subcontract');
    }
  } catch (e) { console.error('[onBidAwarded] subcontract', e); }

  // (b) Budget commitment — same cost-code/division matching the CO cascade uses.
  try {
    const csi = (pkg.csi_codes && pkg.csi_codes[0]) || pkg.csi_division || null;
    if (csi && awardAmount > 0) {
      const div = String(csi).slice(0, 2);
      const { data: bLine, error: bErr } = await db
        .from('budget_lines')
        .select('id, committed')
        .eq('project_id', project.id)
        .eq('tenant_id', tenantId)
        .or(`cost_code.eq.${orValue(csi)},division.eq.${orValue(div)}`)
        .limit(1)
        .maybeSingle();
      if (bErr) throw bErr;
      if (bLine) {
        await must(db
          .from('budget_lines')
          .update({ committed: (Number((bLine as any).committed) || 0) + awardAmount })
          .eq('id', (bLine as any).id)
          .eq('tenant_id', tenantId), 'budget_lines write');
      }
    }
  } catch (e) { console.error('[onBidAwarded] budget commitment', e); }

  // (c) Kick off the sub's W-9 request via the existing onboarding cascade.
  //     Awaited: a serverless function is frozen once the route responds.
  if (w.sub_id) {
    try { await onSubAddedToProject(project.id, w.sub_id); }
    catch (e) { console.error('[onBidAwarded] sub onboarding', e); }
  }

  // (d) FIRST award on the project → AI Auto-Build: 24 schedule tasks,
  //     CSI-coded budget, draft sub packages, safety plan, QC checkpoints,
  //     and the contact directory. Proven by scripts/proof-autobuild.ts.
  try {
    const { data: awardedPkgs, error: aErr } = await db
      .from('bid_packages')
      .select('id, status, awarded_at')
      .eq('project_id', project.id)
      .eq('tenant_id', tenantId);
    if (aErr) throw aErr;
    const awardedCount = (awardedPkgs || []).filter(
      (bp: any) => bp.awarded_at || bp.status === 'awarded' || bp.status === 'contracted'
    ).length;
    if (awardedCount <= 1) {
      const { runKickoffAutoBuild } = await import('./kickoff');
      const built = await runKickoffAutoBuild(db, {
        tenantId, projectId: project.id, project, pkg,
        subName: winnerName, subId: w.sub_id || null, subEmail: winnerEmail,
      });
      if (built.errors?.length) console.error('[onBidAwarded] auto-build steps failed:', built.errors.join(' | '));
      if (built.ran) {
        const { recordLearning } = await import('./learning');
        recordLearning(db, { tenantId, kind: 'auto_build', projectId: project.id, dollarsSurfaced: 0, meta: { tasks: built.tasks, budgetLines: built.budgetLines, packages: built.packages, qc: built.qcCheckpoints, contacts: built.contacts } });
        await createNotification(
          tenantId, null, 'project_autobuild',
          `Project auto-built on first award`,
          `Saguaro created ${built.tasks} schedule tasks, ${built.budgetLines} budget lines, ${built.packages} sub packages, a safety plan, ${built.qcCheckpoints} QC checkpoints and ${built.contacts} contacts on ${project.name}.`,
          `${APP_URL}/app/projects/${project.id}/schedule`, project.id
        );
      }
    }
  } catch (e) { console.error('[onBidAwarded] kickoff auto-build', e); }

  try {
    await createNotification(
      tenantId, null, 'bid_awarded',
      `Bid awarded to ${winnerName}`,
      `${winnerName} awarded ${pkg.trade || pkg.name} contract for $${awardAmount.toLocaleString()} on ${project.name}`,
      `${APP_URL}/app/projects/${project.id}/bid-packages/${pkg.id}`, project.id
    );
    await dispatchWebhookEvent(tenantId, 'bid.awarded', {
      id: bidSubmissionId,
      bid_package_id: pkg.id,
      project_id: project.id,
      project_name: project.name,
      trade: pkg.trade,
      sub_name: winnerName,
      bid_amount: awardAmount,
    });
  } catch (e) { console.error('[onBidAwarded] notification / webhook', e); }

  return out;
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
        vendor_name: s.name,
        vendor_email: s.email,
        status: 'pending',
        token: crypto.randomUUID(), // NOT NULL, no DB default — must be set; drives the /portals/w9/<token> link
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

    await dispatchWebhookEvent(p.tenant_id, 'subcontractor.added', {
      sub_id: subId,
      project_id: projectId,
      project_name: p.name,
      sub_name: s.name,
      sub_email: s.email ?? null,
    });
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
    await dispatchWebhookEvent(project.tenant_id, 'rfi.submitted', {
      id: rfiId,
      project_id: project.id,
      project_name: project.name,
      rfi_number: r.rfi_number,
      subject: r.subject,
      status: r.status ?? 'open',
      due_date: r.due_date ?? null,
    });
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
    await dispatchWebhookEvent(project.tenant_id, 'rfi.responded', {
      id: rfiId,
      project_id: project.id,
      project_name: project.name,
      rfi_number: r.rfi_number,
      subject: r.subject,
      answer: r.answer ?? null,
    });
  } catch (err) {
    console.error('[onRFIAnswered]', err);
  }
}

// ─── Change Orders ────────────────────────────────────────────────────────────
export async function onChangeOrderApproved(changeOrderId: string): Promise<void> {
  try {
    const db = adminClient();
    // Plain fetch + separate project lookup — the projects(*) embed silently
    // returns null when the FK constraint is absent live, killing the cascade.
    const { data: co, error: coFetchErr } = await db.from('change_orders').select('*').eq('id', changeOrderId).single();
    if (coFetchErr) console.error('[onChangeOrderApproved] CO fetch failed', coFetchErr);
    if (!co) return;
    const c = co as any;
    const { data: projectRow, error: projErr } = await db.from('projects').select('*').eq('id', c.project_id).single();
    if (projErr) console.error('[onChangeOrderApproved] project fetch failed', projErr);
    const project = projectRow as any;
    if (!project) return;

    // Update project contract sum
    const { data: currentProject } = await db.from('projects').select('contract_amount').eq('id', project.id).single();
    if (currentProject) {
      // Number() both sides — contract_amount round-trips as a STRING from the
      // live column, and `"100000" + 5000` CONCATENATES ("1000005000"), silently
      // corrupting the project's contract value on every CO approval.
      const newSum = (Number((currentProject as any).contract_amount) || 0) + (Number(c.cost_impact) || 0);
      await must(db.from('projects').update({ contract_amount: newSum }).eq('id', project.id), 'projects update');
    }

    // Contracts module: revised_amount is GENERATED from original + approved_changes,
    // so the prime contract's approved_changes MUST move on CO approval or the
    // module shows a stale contract value forever.
    const { data: prime } = await db
      .from('contracts')
      .select('id, approved_changes')
      .eq('project_id', project.id)
      .eq('contract_type', 'prime')
      .limit(1)
      .maybeSingle();
    if (prime) {
      await must(db
        .from('contracts')
        .update({ approved_changes: ((prime as any).approved_changes || 0) + (c.cost_impact || 0) } as never)
        .eq('id', (prime as any).id), 'contracts write');
    }

    // Sync budget line committed cost. LIVE change_orders has NO cost_code column
    // (the old c.cost_code check was permanently undefined = silently dead) —
    // resolve the CSI through the CO's related bid package instead.
    let coCode: string | null = null;
    if (c.related_bid_package_id) {
      const { data: coPkg } = await db
        .from('bid_packages')
        .select('csi_codes, csi_division')
        .eq('id', c.related_bid_package_id)
        .maybeSingle();
      coCode = ((coPkg as any)?.csi_codes?.[0]) || (coPkg as any)?.csi_division || null;
    }
    if (coCode) {
      const div = String(coCode).slice(0, 2);
      const { data: budgetLine } = await db
        .from('budget_lines')
        .select('id, committed')
        .eq('project_id', project.id)
        .or(`cost_code.eq.${coCode},division.eq.${div}`)
        .limit(1)
        .maybeSingle();
      if (budgetLine) {
        const bl = budgetLine as any;
        await must(db
          .from('budget_lines')
          .update({ committed: (bl.committed || 0) + (c.cost_impact || 0) })
          .eq('id', bl.id), 'budget_lines write');
      }
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
    await dispatchWebhookEvent(project.tenant_id, 'change_order.approved', {
      id: changeOrderId,
      project_id: project.id,
      project_name: project.name,
      co_number: c.co_number,
      cost_impact: c.cost_impact ?? 0,
    });
  } catch (err) {
    console.error('[onChangeOrderApproved]', err);
  }
}

// ─── Insurance ────────────────────────────────────────────────────────────────
/* This embedded subcontractors(name, email). There is no `name` column (it is
   company_name), so PostgREST rejected the select, the error was never read,
   `cert` came back null and the function returned quietly — the COI-expiring
   email never went out. The select and the recipient rules now live in
   lib/insurance-alert, and a failed read is thrown into the catch, which logs it. */
export async function onInsuranceExpiring(certId: string, daysLeft: number): Promise<void> {
  try {
    const db = adminClient();
    const { data: cert, error: certErr } = await db
      .from('insurance_certificates')
      .select(INSURANCE_ALERT_SELECT)
      .eq('id', certId)
      .maybeSingle();
    if (certErr) throw certErr;
    if (!cert) {
      console.warn('[onInsuranceExpiring] certificate not found', certId);
      return;
    }
    const c = cert as any;
    const parties = insuranceAlertParties(c);
    if (!parties) {
      console.warn('[onInsuranceExpiring] certificate has no project — no alert sent', certId);
      return;
    }
    const projectName = parties.projectName || 'your project';

    if (parties.subEmail) {
      await sendInsuranceExpiring(parties.subEmail, parties.subName, projectName, c.policy_type, c.expiry_date, daysLeft);
    }
    if (parties.gcEmail) {
      await sendInsuranceExpiring(parties.gcEmail, parties.subName, projectName, c.policy_type, c.expiry_date, daysLeft);
    }

    await must(db.from('insurance_certificates').update({ last_checked_at: new Date().toISOString() }).eq('id', certId), 'insurance_certificates update');
    if (parties.tenantId) {
      await createNotification(
        parties.tenantId, null, 'insurance_expiring',
        `Insurance expiring in ${daysLeft} days — ${parties.subName}`,
        `${c.policy_type} expires on ${c.expiry_date}`,
        `${APP_URL}/app/projects/${c.project_id}/insurance`, c.project_id
      );
      await dispatchWebhookEvent(parties.tenantId, 'insurance.expiring', {
        cert_id: certId,
        project_id: c.project_id,
        project_name: parties.projectName,
        sub_name: parties.subName,
        policy_type: c.policy_type,
        expiry_date: c.expiry_date,
        days_left: daysLeft,
      });
    }
  } catch (err) {
    console.error('[onInsuranceExpiring] cert', certId, err);
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
    await dispatchWebhookEvent(p.tenant_id, 'project.substantial_completion', {
      id: projectId,
      name: p.name,
    });
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
    await dispatchWebhookEvent(p.tenant_id, 'project.closed', {
      id: projectId,
      name: p.name,
    });
  } catch (err) {
    console.error('[onProjectClosed]', err);
  }
}
