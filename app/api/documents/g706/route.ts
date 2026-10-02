import { NextRequest, NextResponse } from 'next/server';
import { generateG706, saveDocument } from '@/lib/pdf-engine';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { contractSum, closeoutParties } from '@/lib/closeout-doc-data';
import { unsignedWaiverCounts } from '@/lib/project-lifecycle';

/**
 * G706 — Contractor's Affidavit of Payment of Debts and Claims.
 *
 * Every field is read from where the data lives (lib/closeout-doc-data):
 * the revised contract sum (original + approved COs, falling back to the
 * accepted proposal), the owner, this tenant as the contractor, and the
 * recorded completion date. A value nobody has recorded prints as a blank
 * to fill in — it used to print $0.00, an empty owner, "he or she is the
 * (the Contractor)", and TODAY as the completion date of an unfinished job.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const tenantId = g.user.tenantId;
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || '');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const db = createServerClient();

    // body.projectId is caller-supplied and this client is the service role key,
    // so without the tenant filter this fetched ANY project by id — and its
    // name, address, owner entity and contract amount were then rendered into
    // the returned G706. That handed another tenant's contract value to anyone
    // who knew a project id.
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (projErr) throw projErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as Record<string, unknown>;

    const [contract, parties, waivers] = await Promise.all([
      contractSum(db, tenantId, projectId, p),
      closeoutParties(db, tenantId, p),
      // Same count the closeout gate uses: "[Award pending]" placeholder
      // waivers have no claimant and are not outstanding debts.
      unsignedWaiverCounts(db, tenantId, projectId),
    ]);
    if (waivers.error) throw waivers.error;
    const allWaiversReceived = waivers.real === 0;

    // An explicit amount/date from the caller wins (a GC correcting the
    // form); otherwise the record. Never today's date as a default.
    const finalAmount = Number(body.finalAmount) > 0 ? Number(body.finalAmount) : contract.revised;
    const bodyDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.completionDate || '')) ? String(body.completionDate) : '';
    const completionDate = bodyDate || parties.finalCompletionDate || parties.substantialCompletionDate;

    const pdfBytes = await generateG706({
      projectName: String(p.name || ''),
      projectAddress: String(p.address || ''),
      ownerName: parties.ownerName,
      gcName: parties.contractorName,
      gcAddress: parties.contractorAddress,
      finalAmount,
      completionDate,
      allWaiversReceived,
      outstandingWaivers: waivers.real,
    });

    const pdfUrl = await saveDocument(projectId, 'g706', pdfBytes, body, tenantId);
    return NextResponse.json({
      pdfUrl,
      allWaiversReceived,
      outstandingWaivers: waivers.real,
      placeholderWaivers: waivers.placeholders,
      contractSum: contract,
      success: true,
    });
  } catch (e) {
    return apiError('documents/g706', e, 'Could not generate the G706');
  }
}
