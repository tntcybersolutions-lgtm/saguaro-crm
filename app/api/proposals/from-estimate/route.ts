import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { buildProposal, exclusionsText, type EstimateSource, type Granularity, type UpliftMode } from '@/lib/proposal-build';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/proposals/from-estimate
 *
 * Body: {
 *   projectId,          takeoffId?,        preview?: boolean,
 *   granularity?: 'line'|'division',       upliftMode?: 'markup'|'margin',
 *   upliftPct?: number, optionalDivisions?: string[],
 *   title?, proposalNumber?, clientName?, clientEmail?, validUntil?,
 *   introduction?, paymentTerms?
 * }
 *
 * Turns an estimate into a real client document: a `proposals` header plus the
 * `proposal_lines` breakdown underneath it.
 *
 * `proposal_lines` had rows in it and was read by no code anywhere in the
 * platform, which is why a proposal could state $2,850,000 and be unable to show
 * a single line of what that bought. This is the writer; /api/proposals/[id]/lines
 * is the reader.
 *
 * `preview: true` builds and returns the document without writing anything, so
 * the UI can show the client exactly what it is about to create. Generating a
 * document a user has not seen is how wrong numbers reach a client.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  const preview = body.preview === true;
  const g = await requirePermission(req, 'Documents', preview ? 'View' : 'Edit', { projectId });
  if (!g.ok) return g.res;
  const { db, user } = g;

  /* ── source lines ─────────────────────────────────────────────────────── */

  let takeoffId = typeof body.takeoffId === 'string' ? body.takeoffId : '';
  if (takeoffId) {
    /* A takeoff id from the body is scoped before it is used — otherwise a
       caller could name a takeoff from another tenant and have its costs
       priced into a proposal on this one. */
    const { data: t, error: tErr } = await db
      .from('takeoffs').select('id')
      .eq('id', takeoffId).eq('tenant_id', user.tenantId).eq('project_id', projectId)
      .maybeSingle();
    if (tErr) return apiError('proposals/from-estimate', tErr, 'Failed to verify takeoff');
    if (!t) return NextResponse.json({ error: 'Takeoff not found on this project' }, { status: 404 });
  } else {
    /* No takeoff named: use the project's most recent one that actually has
       lines. Picking the newest regardless would hand back an empty proposal
       whenever someone had created a blank takeoff more recently. */
    const { data: ts, error: tsErr } = await db
      .from('takeoffs').select('id, created_at')
      .eq('tenant_id', user.tenantId).eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(25);
    if (tsErr) return apiError('proposals/from-estimate', tsErr, 'Failed to load takeoffs');
    for (const t of ts ?? []) {
      const { count } = await db
        .from('takeoff_line_items').select('id', { count: 'exact', head: true })
        .eq('takeoff_id', t.id).eq('tenant_id', user.tenantId);
      if ((count ?? 0) > 0) { takeoffId = t.id; break; }
    }
    if (!takeoffId) {
      return NextResponse.json({ error: 'No estimate with line items was found on this project.' }, { status: 404 });
    }
  }

  const { data: rows, error: liErr } = await db
    .from('takeoff_line_items')
    .select('csi_division, csi_code, description, quantity, unit, waste_factor_pct, unit_material_cost, unit_labor_cost, unit_equipment_cost, unit_sub_cost, is_allowance, is_excluded, notes, sort_order')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', user.tenantId)
    .order('sort_order', { ascending: true });
  if (liErr) return apiError('proposals/from-estimate', liErr, 'Failed to load estimate lines');

  /* ── build ────────────────────────────────────────────────────────────── */

  let built;
  try {
    built = buildProposal((rows ?? []) as EstimateSource[], {
      granularity: (body.granularity === 'line' ? 'line' : 'division') as Granularity,
      upliftMode: (body.upliftMode === 'margin' ? 'margin' : 'markup') as UpliftMode,
      upliftPct: Number(body.upliftPct) || 0,
      optionalDivisions: Array.isArray(body.optionalDivisions) ? (body.optionalDivisions as string[]) : [],
    });
  } catch (e) {
    /* buildProposal refuses a margin of 100% or more rather than returning an
       unbounded price. That is a bad request, not a server fault. */
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the proposal' }, { status: 400 });
  }

  if (built.lines.length === 0) {
    return NextResponse.json({
      error: 'That estimate has no priced lines to put on a proposal.',
      omitted: built.omitted, exclusions: built.exclusions,
    }, { status: 422 });
  }

  if (preview) {
    return NextResponse.json({ preview: true, takeoffId, ...built, exclusionsText: exclusionsText(built.exclusions) });
  }

  /* ── persist ──────────────────────────────────────────────────────────── */

  /* The proposal page displays proposal_number as the version. Continue its
     v1.0 / v2.0 sequence so a generated proposal lands in the same history the
     hand-made ones are in, rather than starting a parallel numbering scheme. */
  const { count: existing } = await db
    .from('proposals').select('id', { count: 'exact', head: true })
    .eq('project_id', projectId).eq('tenant_id', user.tenantId);
  const proposalNumber = typeof body.proposalNumber === 'string' && body.proposalNumber
    ? body.proposalNumber
    : `v${(existing ?? 0) + 1}.0`;

  const header: Record<string, unknown> = {
    tenant_id: user.tenantId,
    project_id: projectId,
    created_by: user.id,
    status: 'Draft',
    title: (typeof body.title === 'string' && body.title.trim()) || 'Proposal',
    proposal_number: proposalNumber,
    /* Both money columns: the page reads `amount`, the schema's canonical total
       is `total_amount`, and letting them drift is how the header and the
       document disagree. Optional scope is excluded from both — it is quoted
       beside the price, not inside it. */
    amount: built.sellTotal,
    total_amount: built.sellTotal,
  };
  if (built.exclusions.length) header.exclusions = exclusionsText(built.exclusions);
  if (typeof body.introduction === 'string' && body.introduction) header.introduction = body.introduction;
  if (typeof body.paymentTerms === 'string' && body.paymentTerms) header.payment_terms = body.paymentTerms;
  if (typeof body.validUntil === 'string' && body.validUntil) header.valid_until = body.validUntil;
  if (typeof body.clientName === 'string' && body.clientName) header.client_name = body.clientName;
  if (typeof body.clientEmail === 'string' && body.clientEmail) header.client_email = body.clientEmail;
  if (typeof body.description === 'string' && body.description) header.description = body.description;

  const { data: proposal, error: pErr } = await db
    .from('proposals')
    .insert(header as Database['public']['Tables']['proposals']['Insert'])
    .select().single();
  if (pErr) return apiError('proposals/from-estimate', pErr, 'Failed to create the proposal');

  const lineRows = built.lines.map((l) => ({ ...l, proposal_id: proposal.id }));
  const { data: lines, error: lErr } = await db
    .from('proposal_lines')
    .insert(lineRows as Database['public']['Tables']['proposal_lines']['Insert'][])
    .select();

  if (lErr) {
    /* A header with no lines is the exact failure this endpoint exists to end.
       Roll it back rather than leaving another proposal that cannot show its
       own breakdown. */
    await db.from('proposals').delete().eq('id', proposal.id).eq('tenant_id', user.tenantId);
    return apiError('proposals/from-estimate', lErr, 'Failed to write the proposal lines');
  }

  return NextResponse.json({
    success: true,
    proposal,
    lines: lines ?? [],
    takeoffId,
    summary: {
      costTotal: built.costTotal, sellTotal: built.sellTotal, optionalTotal: built.optionalTotal,
      marginPct: built.marginPct, exclusions: built.exclusions, allowances: built.allowances,
      omitted: built.omitted,
    },
  });
}
