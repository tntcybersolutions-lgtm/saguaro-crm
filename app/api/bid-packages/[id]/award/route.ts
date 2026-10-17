import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { onBidAwarded } from '@/lib/triggers';
import { requirePermission, requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { logActivity, money } from '@/lib/activity';
import { bidAmount } from '@/lib/bid-amount';
import { coiStatus, type CoiCertRow } from '@/lib/coi-coverage';
import { dayIn, requestTimeZone } from '@/lib/time-zone';
import { orValue } from '@/lib/pg-filter';

/**
 * POST /api/bid-packages/[id]/award — award one bid.
 *
 * Body: { submissionId, overrideCompliance?: boolean }
 *
 * The compliance gate (no award to a sub with no W-9 or lapsed insurance)
 * used to FAIL OPEN: if its own check errored, it logged and awarded anyway —
 * the one moment the gate exists for, it stepped aside. It now refuses and
 * says so; the GC can retry, or award with the override, knowingly.
 *
 * An insurance certificate's expiry_date is a DATE. `new Date(expiry_date)` is
 * midnight UTC — the evening before in every US zone — so a certificate good
 * through today read as expired since last night. It is compared as a day:
 * today where the GC is (their device), else the company's zone.
 *
 * Also checked now: the submission belongs to THIS package (an id from another
 * package awarded it here), and a package already awarded is not awarded again
 * (a second award drafted a second PO and re-sent every notice).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Full');
  if (!g.ok) return g.res;
  // Awarding picks a bid by its amount. Bid and proposal dollars: Sales or Budget (PROPOSAL_MONEY, lib/permissions).
  const bidMoney = await requireAnyPermission(req, PROPOSAL_MONEY, 'Edit', { db: g.db });
  if (!bidMoney.ok) return bidMoney.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = String(body.submissionId || '').trim();
    if (!submissionId) return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    const db = createServerClient();

    const { data: pkg, error: pkgErr } = await db
      .from('bid_packages')
      .select('id, tenant_id, project_id, name, trade, csi_division, status, awarded_to')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (pkgErr) throw pkgErr;
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    if (String(pkg.status || '').toLowerCase() === 'awarded') {
      return NextResponse.json(
        { error: `This package is already awarded${pkg.awarded_to ? ` to ${pkg.awarded_to}` : ''}.` },
        { status: 409 },
      );
    }

    const { data: sub, error: subErr } = await db
      .from('bid_submissions')
      .select('id, sub_id, sub_name, sub_email, company_name, contact_name, contact_email, amount, base_amount, base_bid')
      .eq('id', submissionId)
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) return NextResponse.json({ error: 'That bid is not on this package.' }, { status: 404 });
    const s = sub as Record<string, any>;
    const vendor = s.company_name || s.sub_name || s.contact_name || 'Awarded subcontractor';

    // ── COMPLIANCE GATE: no award to a sub with no W-9 or lapsed insurance.
    //    body.overrideCompliance = true proceeds knowingly (it is recorded). ──
    if (!body.overrideCompliance) {
      let issues: string[];
      try {
        const tz = await requestTimeZone(req.headers, db, user.tenantId);
        if (tz.source === 'utc') console.error(`[bid-packages/award] no device or company time zone for tenant ${user.tenantId} — COI expiry judged in UTC`);
        issues = await complianceIssues(db, user.tenantId, s, dayIn(tz.zone));
      } catch (e) {
        console.error('[bid-packages/award] compliance check failed — award refused', e);
        return NextResponse.json({
          error: `Compliance hold — we could not check ${vendor}'s W-9 and insurance just now, so the award was not made. Try again, or award anyway with override.`,
          complianceBlock: true,
          complianceUnchecked: true,
          issues: ['Compliance check unavailable'],
        }, { status: 503 });
      }
      if (issues.length > 0) {
        return NextResponse.json({
          error: `Compliance hold — ${issues.join(', ')}. Award anyway with override, or request the documents first.`,
          complianceBlock: true,
          issues,
        }, { status: 409 });
      }
    }

    const nowIso = new Date().toISOString();
    const amount = bidAmount(s);

    /* must(), both: an award the database refused used to report success
       (tryWrite on the bid, and a catch that set the status and carried on). */
    await must(
      db.from('bid_submissions')
        .update({ status: 'awarded', is_awarded: true, awarded_at: nowIso, awarded_by: user.id } as never)
        .eq('id', submissionId)
        .eq('tenant_id', user.tenantId),
      'bid_submissions award',
    );
    await must(
      db.from('bid_packages').update({
        status: 'awarded', awarded_amount: amount, awarded_to: vendor, awarded_to_id: s.sub_id ?? null,
        awarded_at: nowIso, awarded_by: user.id,
      } as never).eq('id', id).eq('tenant_id', user.tenantId),
      'bid_packages award',
    );

    void logActivity({
      tenantId: user.tenantId,
      projectId: pkg.project_id ?? null,
      userId: user.id,
      userName: user.email,
      action: 'awarded',
      entityType: 'bid_package',
      entityId: id,
      description: `Awarded ${pkg.name || pkg.trade || 'a bid package'} to ${vendor} — ${money(amount)}`,
      metadata: { amount, vendor, trade: pkg.trade ?? null, overrideCompliance: !!body.overrideCompliance },
    });

    /* A DRAFT subcontract PO = the committed cost (the GC reviews it before
       issuing). The award stands if this fails — but the GC is told, instead
       of finding the commitment missing from the budget later. */
    let poId: string | null = null;
    const warnings: string[] = [];
    if (amount > 0) {
      const { data: po, error: poErr } = await db.from('purchase_orders').insert({
        tenant_id: user.tenantId, project_id: pkg.project_id,
        vendor_name: vendor, vendor_email: s.contact_email || s.sub_email || null,
        description: `${pkg.name || 'Bid package'} — awarded subcontract`,
        subtotal: amount, total: amount, status: 'draft',
        cost_code: pkg.csi_division || pkg.trade || null,
        notes: `Auto-generated on bid award (package ${id}). Committed cost.`, created_by: user.id,
      } as never).select('id').single();
      if (poErr) {
        console.error('[bid-packages/award] draft PO not created', poErr);
        warnings.push('The draft purchase order could not be created — add it from Purchase Orders.');
      }
      poId = (po as { id?: string } | null)?.id ?? null;
    } else {
      warnings.push('This bid has no amount, so no purchase order was drafted.');
    }

    /* Awaited: the award notices and the award chain (subcontract, budget,
       onboarding) run here, and a serverless function is frozen once it has
       responded. What happened to each notice comes back to the GC. */
    const notices = await onBidAwarded(submissionId);
    if (notices.error) warnings.push(notices.error);

    return NextResponse.json({ success: true, purchaseOrderId: poId, amount, awardedTo: vendor, notices, warnings });
  } catch (e) {
    return apiError('bid-packages/award', e, 'The award could not be recorded. Try again.');
  }
}

/**
 * What stands between this sub and an award: no W-9 on file, or no insurance
 * certificate still good today. Throws when it cannot tell — the caller
 * refuses rather than award blind.
 *
 * The sub is the bid's roster record (sub_id) or, when the bid came in by
 * email with no roster link, the directory record with that address. A bidder
 * with no record at all has nothing on file to check against; that is not a
 * hold here (the bid is still reviewable) — it is what override is for once a
 * record exists.
 */
async function complianceIssues(db: ReturnType<typeof createServerClient>, tenantId: string, s: Record<string, any>, today: string): Promise<string[]> {
  let subId: string | null = s.sub_id ?? null;
  type SubRec = { id: string; w9_on_file: boolean | null; insurance_expiry?: string | null };
  let subRec: SubRec | null = null;
  if (subId) {
    const { data, error } = await db.from('subcontractors').select('id, w9_on_file, insurance_expiry').eq('tenant_id', tenantId).eq('id', subId).maybeSingle();
    if (error) throw error;
    subRec = (data as SubRec | null) ?? null;
  } else {
    const email = orValue(String(s.contact_email || s.sub_email || '').trim().toLowerCase());
    if (email) {
      const { data, error } = await db.from('subcontractors').select('id, w9_on_file, insurance_expiry')
        .eq('tenant_id', tenantId).or(`email.eq.${email},contact_email.eq.${email}`).limit(1).maybeSingle();
      if (error) throw error;
      subRec = (data as SubRec | null) ?? null;
      subId = subRec?.id ?? null;
    }
  }
  if (!subId) return [];

  const issues: string[] = [];
  if (subRec && subRec.w9_on_file !== true) issues.push('W-9 not on file');

  const { data: certs, error: certErr } = await db
    .from('insurance_certificates')
    .select('policy_type, expiry_date, gl_expiry, wc_expiry, auto_expiry, umbrella_expiry, status')
    .eq('tenant_id', tenantId)
    .eq('sub_id', subId);
  if (certErr) throw certErr;
  /* One reading of "insured today", shared with the compliance scorecard
     (lib/coi-coverage). This check used to run only when the sub had at least
     one certificate row — a sub with none sailed through — and it counted a
     row with no expiry date as good, which is exactly what a COI REQUEST is
     (compliance-autofile writes them pending and undated). Asking for a COI,
     or never asking, both cleared the gate. */
  const coi = coiStatus((certs || []) as CoiCertRow[], today, subRec?.insurance_expiry ?? null);
  if (!coi.hasGL) {
    const hadAny = (certs || []).some((c: { expiry_date?: string | null; gl_expiry?: string | null }) => c.expiry_date || c.gl_expiry) || !!subRec?.insurance_expiry;
    issues.push(hadAny ? 'Insurance certificate expired' : 'No insurance certificate on file');
  }
  return issues;
}
