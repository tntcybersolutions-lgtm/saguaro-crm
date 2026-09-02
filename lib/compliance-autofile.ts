/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/compliance-autofile.ts
 *
 * Auto-file compliance documents into the bid-jacket flow.
 *
 * After Sage creates the bid_packages for a takeoff, this routine generates and
 * FILES the compliance paperwork every awarded/invited scope needs — tenant
 * scoped, persisted, and idempotent:
 *
 *   (a) lien_waivers      — one conditional-progress waiver per real sub tied to
 *                           a package (by award or trade), else a clearly-labeled
 *                           package-level placeholder.
 *   (b) w9_requests       — a pending W-9 request for each real vendor that
 *                           lacks a W-9 on file (skips placeholders / no email).
 *   (c) insurance_certs   — a COI request record per sub/placeholder, PLUS a real
 *                           COI request PDF filed to the project's Documents /
 *                           Compliance area (generated_documents).
 *   (d) onBidPackageCreated — fires the downstream package hook (notification +
 *                           webhook + jacket) for each package.
 *
 * Idempotency: the routine first removes its OWN prior un-acted-upon auto-filed
 * rows for the project (tagged, still pending, no signed/uploaded artifact) so a
 * re-run (Sage deletes + recreates packages each time) never duplicates. It
 * never touches anything a human has signed, uploaded, or edited.
 *
 * The caller MUST have already resolved and verified the tenant (getUser +
 * takeoff/project ownership). Every query here is tenant-scoped; no tenant value
 * is ever derived from a client-supplied or project-row field.
 */

import { createServerClient } from './supabase-server';
import { generateCOIRequest, saveDocument, resolveBranding } from './pdf-engine';
import { onBidPackageCreated } from './triggers';
import { must } from '@/lib/db-write';

type DbClient = ReturnType<typeof createServerClient>;

// Stable tag written into notes so re-runs can find & clean up prior auto-filed,
// un-acted-upon rows without ever matching human-created records.
export const AUTOFILE_TAG = 'Auto-filed from bid jacket by Sage';
const W9_SOURCE = 'bid-jacket-autofile';

export interface AutoFilePackage {
  id: string;
  name: string;
  trade: string;   // division / trade name
  div: string;     // CSI 2-digit division
  total: number;   // package scheduled value
  requiresBond?: boolean;
  insGl?: number;
  insAuto?: number;
  insWork?: number;
}

export interface ComplianceAutofileResult {
  lienWaivers: number;
  w9Requests: number;
  coiRequests: number;
  coiDocsFiled: number;
  placeholders: number;
  triggersFired: number;
}

interface RealSub {
  id: string;
  company: string;
  contact: string;
  email: string;
  trade: string;
  w9: boolean;
  amount: number;
  awardedPkg?: string;
}

// ── Trade / CSI matching ────────────────────────────────────────────────────
const STOP = new Set(['and', 'the', 'of', 'for', 'work', 'services', 'systems', 'general', 'division', 'trade', 'contractor', 'sub', 'subcontractor', '&']);
function tokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP.has(t));
}
function tradeScore(subTrade: string, pkg: AutoFilePackage): number {
  const a = new Set(tokens(subTrade));
  if (a.size === 0) return 0;
  const b = tokens(`${pkg.trade} ${pkg.name}`);
  let score = 0;
  for (const t of b) if (a.has(t)) score++;
  // A CSI division number appearing in the sub's trade text is a strong signal.
  if (pkg.div && new RegExp(`\\b${pkg.div}\\b`).test(subTrade)) score += 2;
  return score;
}

function requiredLimits(pkg: AutoFilePackage, contractAmount: number) {
  const big = contractAmount >= 1_000_000 || (pkg.total || 0) >= 500_000;
  const gl = pkg.insGl && pkg.insGl > 0 ? pkg.insGl : (big ? 2_000_000 : 1_000_000);
  return {
    glEachOccurrence: gl,
    glAggregate: gl * 2,
    autoCombined: pkg.insAuto && pkg.insAuto > 0 ? pkg.insAuto : 1_000_000,
    wcElEachAccident: pkg.insWork && pkg.insWork > 0 ? pkg.insWork : 500_000,
    umbrella: (pkg.total || 0) >= 1_000_000 ? 5_000_000 : 0,
  };
}

/**
 * Build + file compliance documents for a set of freshly-created bid packages.
 * Never throws — every failure is isolated and logged; returns what was filed.
 */
export async function buildComplianceForBidPackages(opts: {
  db: DbClient;
  tenantId: string;
  projectId: string;
  project: Record<string, any>;
  packages: AutoFilePackage[];
}): Promise<ComplianceAutofileResult> {
  const { db, tenantId, projectId, project, packages } = opts;
  const result: ComplianceAutofileResult = {
    lienWaivers: 0, w9Requests: 0, coiRequests: 0, coiDocsFiled: 0, placeholders: 0, triggersFired: 0,
  };
  if (!tenantId || !projectId || !packages.length) return result;

  const state = String(project?.state || 'AZ');
  const gcName = String(project?.gc_name || 'General Contractor');
  const gcEmail = project?.gc_email ? String(project.gc_email) : undefined;
  const projAddr = String(project?.address || '');
  // owner_entity is TEXT on the live schema — accept a plain string; tolerate a
  // legacy object shape too.
  const ownerName =
    typeof project?.owner_entity === 'string'
      ? project.owner_entity
      : String(project?.owner_entity?.name || '');
  const projectName = String(project?.name || 'Project');
  const contractAmount = Number(project?.contract_amount ?? project?.contract_value ?? 0);
  const packageIds = packages.map(p => p.id);

  // ── 0. Idempotent cleanup of THIS routine's prior pristine auto-filed rows ──
  //     Guards: our tag/marker + still-pending + no signed/uploaded artifact.
  try {
    await must(db.from('lien_waivers').delete()
      .eq('tenant_id', tenantId).eq('project_id', projectId)
      .ilike('notes', `%${AUTOFILE_TAG}%`)
      .in('status', ['requested', 'pending'])
      .is('signed_at', null).is('signed_pdf_url', null).is('pdf_url', null), 'lien_waivers delete');
  } catch (e) { console.error('[compliance-autofile] cleanup lien_waivers:', e); }
  try {
    await must(db.from('insurance_certificates').delete()
      .eq('tenant_id', tenantId).eq('project_id', projectId)
      .ilike('notes', `%${AUTOFILE_TAG}%`)
      .in('status', ['requested', 'pending'])
      .is('pdf_url', null).is('coi_pdf_url', null), 'insurance_certificates delete');
  } catch (e) { console.error('[compliance-autofile] cleanup insurance_certificates:', e); }
  try {
    await must(db.from('w9_requests').delete()
      .eq('tenant_id', tenantId).eq('project_id', projectId)
      .eq('status', 'pending').is('submitted_at', null)
      .filter('w9_data->>source', 'eq', W9_SOURCE), 'w9_requests delete');
  } catch (e) { console.error('[compliance-autofile] cleanup w9_requests:', e); }
  try {
    await must(db.from('generated_documents').delete()
      .eq('tenant_id', tenantId).eq('project_id', projectId)
      .eq('doc_type', 'coi-request'), 'generated_documents delete');
  } catch (e) { console.error('[compliance-autofile] cleanup generated_documents:', e); }

  // ── 1. Load the project's real subs (tenant scoped, two-step, no FK join) ──
  const realSubs: RealSub[] = [];
  try {
    const { data: psRows } = await db.from('project_subcontractors')
      .select('subcontractor_id, contract_amount, bid_package_id')
      .eq('tenant_id', tenantId).eq('project_id', projectId);
    const ps = (psRows || []) as any[];
    const subIds = [...new Set(ps.map(r => r.subcontractor_id).filter(Boolean))];
    let subsById = new Map<string, any>();
    if (subIds.length) {
      const { data: subRows } = await db.from('subcontractors')
        .select('id, company_name, contact_name, contact_email, email, trade, trades, w9_on_file')
        .eq('tenant_id', tenantId).in('id', subIds);
      subsById = new Map(((subRows || []) as any[]).map(s => [s.id, s]));
    }
    for (const r of ps) {
      if (!r.subcontractor_id) continue;
      const s = subsById.get(r.subcontractor_id) || {};
      const tradeStr = [s.trade, Array.isArray(s.trades) ? s.trades.join(' ') : ''].filter(Boolean).join(' ');
      realSubs.push({
        id: r.subcontractor_id,
        company: String(s.company_name || 'Subcontractor'),
        contact: String(s.contact_name || ''),
        email: String(s.contact_email || s.email || ''),
        trade: tradeStr,
        w9: !!s.w9_on_file,
        amount: Number(r.contract_amount || 0),
        awardedPkg: r.bid_package_id && packageIds.includes(r.bid_package_id) ? r.bid_package_id : undefined,
      });
    }
  } catch (e) {
    console.error('[compliance-autofile] load subs:', e);
  }

  // ── 2. Assign each real sub to a single best package (award > trade match) ──
  const byPkg = new Map<string, RealSub[]>();
  for (const id of packageIds) byPkg.set(id, []);
  for (const rs of realSubs) {
    let target = rs.awardedPkg;
    if (!target) {
      let best = '', bestScore = 0;
      for (const p of packages) {
        const sc = tradeScore(rs.trade, p);
        if (sc > bestScore) { bestScore = sc; best = p.id; }
      }
      if (bestScore > 0) target = best;
    }
    if (target && byPkg.has(target)) byPkg.get(target)!.push(rs);
  }

  const branding = await resolveBranding(tenantId).catch(() => undefined);

  // ── 3. Per package: waivers + W-9 + COI records + filed COI request doc ────
  for (const pkg of packages) {
    const matched = byPkg.get(pkg.id) || [];
    const rl = requiredLimits(pkg, contractAmount);
    const isPlaceholder = matched.length === 0;
    const placeholderLabel = `[Award pending] ${pkg.trade} subcontractor`;
    const noteReal = `${AUTOFILE_TAG} — ${pkg.name}.`;
    const notePlaceholder = `${AUTOFILE_TAG} — ${pkg.name}. No subcontractor awarded yet; attach on award.`;

    const targets: Array<RealSub | null> = isPlaceholder ? [null] : matched;
    if (isPlaceholder) result.placeholders++;

    for (const rs of targets) {
      // (a) Lien waiver
      try {
        const { error } = await db.from('lien_waivers').insert({
          tenant_id: tenantId,
          project_id: projectId,
          bid_package_id: pkg.id,
          subcontractor_id: rs ? rs.id : null,
          sub_id: rs ? rs.id : null,
          claimant_name: rs ? rs.company : placeholderLabel,
          company_name: rs ? rs.company : placeholderLabel,
          claimant_type: 'subcontractor',
          contact_name: rs && rs.contact ? rs.contact : null,
          contact_email: rs && rs.email ? rs.email : null,
          claimant_email: rs && rs.email ? rs.email : null,
          gc_name: gcName,
          gc_company_name: gcName,
          owner_name: ownerName || null,
          project_address: projAddr || null,
          waiver_type: 'conditional_progress',
          state,
          amount: rs ? rs.amount : (pkg.total || 0),
          status: 'pending',
          blocks_payment: true,
          is_payment_gate: true,
          notes: rs ? noteReal : notePlaceholder,
        } as any);
        if (error) console.error('[compliance-autofile] lien_waiver insert:', error.message);
        else result.lienWaivers++;
      } catch (e) { console.error('[compliance-autofile] lien_waiver:', e); }

      // (c) Insurance / COI request record (surfaced in the Insurance module)
      try {
        const { error } = await db.from('insurance_certificates').insert({
          tenant_id: tenantId,
          project_id: projectId,
          sub_id: rs ? rs.id : null,
          sub_name: rs ? rs.company : placeholderLabel,
          policy_type: 'General Liability',
          coverage_amount: rl.glEachOccurrence,
          status: 'pending',
          notes: rs ? noteReal : notePlaceholder,
        } as any);
        if (error) console.error('[compliance-autofile] insurance insert:', error.message);
        else result.coiRequests++;
      } catch (e) { console.error('[compliance-autofile] insurance:', e); }

      // (b) W-9 request — real vendors lacking a W-9 only
      if (rs && rs.email && !rs.w9) {
        try {
          const { data: existing } = await db.from('w9_requests')
            .select('id')
            .eq('tenant_id', tenantId).eq('project_id', projectId)
            .eq('vendor_email', rs.email)
            .not('status', 'eq', 'submitted')
            .limit(1);
          if (!existing || existing.length === 0) {
            const { error } = await db.from('w9_requests').insert({
              tenant_id: tenantId,
              project_id: projectId,
              vendor_name: rs.company,
              vendor_email: rs.email,
              status: 'pending',
              token: crypto.randomUUID(),
              w9_data: { source: W9_SOURCE, bid_package_id: pkg.id },
            } as any);
            if (error) console.error('[compliance-autofile] w9 insert:', error.message);
            else result.w9Requests++;
          }
        } catch (e) { console.error('[compliance-autofile] w9:', e); }
      }
    }

    // (c cont.) File a real COI request PDF to the Documents / Compliance area
    try {
      const pdfBytes = await generateCOIRequest({
        projectName,
        projectAddress: projAddr,
        gcName,
        gcAddress: projAddr,
        gcEmail,
        ownerName,
        tradeName: pkg.trade,
        packageName: pkg.name,
        vendorName: isPlaceholder ? undefined : matched[0]?.company,
        requiredLimits: rl,
        branding,
      });
      await saveDocument(
        projectId,
        'coi-request',
        pdfBytes,
        { bidPackageId: pkg.id, trade: pkg.trade, tag: AUTOFILE_TAG, requiredLimits: rl },
        tenantId,
      );
      result.coiDocsFiled++;
    } catch (e) {
      console.error('[compliance-autofile] coi-request pdf:', e);
      // Non-fatal — the insurance_certificates request records still exist.
    }
  }

  // ── 4. Fire the downstream package hook for each package ───────────────────
  try {
    const settled = await Promise.allSettled(packages.map(p => onBidPackageCreated(p.id)));
    result.triggersFired = settled.filter(s => s.status === 'fulfilled').length;
  } catch (e) {
    console.error('[compliance-autofile] onBidPackageCreated:', e);
  }

  return result;
}
