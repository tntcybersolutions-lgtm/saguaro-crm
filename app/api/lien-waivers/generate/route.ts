import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { generateLienWaiver, saveDocument } from '@/lib/pdf-engine';
import { waiverTypes, isCalendarDay, waiverAmount } from '@/lib/lien-waiver-type';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/lien-waivers/generate
 *   { projectId, waiverType, claimantName, amount, throughDate, state?, subId?, payAppId?, checkNumber? }
 *     → files a new pending waiver with its PDF.
 *   { projectId, waiverId }
 *     → builds the PDF for a waiver that already exists and has none
 *       (the Documents list's "Generate PDF"), instead of filing a second waiver.
 *
 * The insert used to write the screen's "conditional_partial" into a column
 * whose CHECK only takes "conditional_progress"; every row was refused, the
 * error was never read, and the screen said it worked (lib/lien-waiver-type).
 */
export async function POST(req: NextRequest) {
  /* There was no auth check here at all. getUser() was called, its null
     case ignored, and the row below written with
       tenant_id: user?.tenantId || p?.tenant_id
     -- falling back to the tenant of the project that was just fetched
     by an id off the request. An unauthenticated caller who knew a
     project id could file a lien waiver, a legal document, into that
     company's account. The fallback is gone: the tenant comes from the
     session or the request does not proceed. */
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Send the waiver details as JSON.' }, { status: 400 });
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    if (!UUID.test(projectId)) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

    const db = createServerClient();
    const { data: project, error: pErr } = await db.from('projects')
      .select('id, name, address, state, gc_name, owner_entity')
      .eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as Record<string, any>;
    const ownerName = (p.owner_entity && typeof p.owner_entity === 'object' ? p.owner_entity.name : '') || '';

    // ── A PDF for a waiver that is already on file ───────────────────────────
    if (body.waiverId !== undefined) {
      const waiverId = typeof body.waiverId === 'string' ? body.waiverId : '';
      if (!UUID.test(waiverId)) return NextResponse.json({ error: 'waiverId is not valid' }, { status: 400 });
      const { data: w, error: wErr } = await db.from('lien_waivers').select('*')
        .eq('id', waiverId).eq('tenant_id', user.tenantId).eq('project_id', projectId).is('deleted_at', null).maybeSingle();
      if (wErr) throw wErr;
      if (!w) return NextResponse.json({ error: 'That lien waiver is not on this job.' }, { status: 404 });
      const row = w as Record<string, any>;
      const existing = row.signed_pdf_url || row.pdf_url;
      if (existing) return NextResponse.json({ pdfUrl: existing, waiver: row, success: true });
      const types = waiverTypes(row.waiver_type);
      if (!types) return NextResponse.json({ error: 'This waiver has no type on file, so its form cannot be built.' }, { status: 422 });
      const pdfBytes = await generateLienWaiver({
        waiverType: types.pdf,
        state: row.state || p.state || 'AZ',
        claimantName: row.claimant_name || row.company_name || '',
        projectName: p.name || '',
        projectAddress: p.address || '',
        ownerName,
        gcName: p.gc_name || '',
        throughDate: row.through_date || '',
        amount: Number(row.amount) || 0,
        checkNumber: row.check_number || undefined,
      });
      const pdfUrl = await saveDocument(projectId, `lien-waiver-${types.db}`, pdfBytes, { waiverId }, user.tenantId,
        { sourceType: 'lien_waiver', sourceId: waiverId });
      if (!pdfUrl || pdfUrl.startsWith('demo://')) throw new Error('lien waiver PDF was not stored');
      const { data: updated, error: uErr } = await db.from('lien_waivers').update({ pdf_url: pdfUrl })
        .eq('id', waiverId).eq('tenant_id', user.tenantId).select().single();
      if (uErr) throw uErr;
      return NextResponse.json({ pdfUrl, waiver: updated, success: true });
    }

    // ── A new waiver ─────────────────────────────────────────────────────────
    const types = waiverTypes(body.waiverType);
    if (!types) {
      return NextResponse.json({ error: 'waiverType must be conditional or unconditional, progress or final.' }, { status: 400 });
    }
    const claimantName = typeof body.claimantName === 'string' ? body.claimantName.trim() : '';
    if (!claimantName) return NextResponse.json({ error: 'claimantName is required' }, { status: 400 });
    if (!isCalendarDay(body.throughDate)) return NextResponse.json({ error: 'throughDate is required (YYYY-MM-DD)' }, { status: 400 });
    const amount = waiverAmount(body.amount);
    if (amount === null) return NextResponse.json({ error: 'amount must be a dollar amount of 0 or more' }, { status: 400 });
    const state = typeof body.state === 'string' && body.state.trim() ? body.state.trim().toUpperCase().slice(0, 2) : (p.state || 'AZ');

    // The sub and the pay application come from the browser: each must be this company's.
    const subId = typeof body.subId === 'string' && body.subId ? body.subId : null;
    const payAppId = typeof body.payAppId === 'string' && body.payAppId ? body.payAppId : null;
    if ((subId && !UUID.test(subId)) || (payAppId && !UUID.test(payAppId))) {
      return NextResponse.json({ error: 'That subcontractor or pay application id is not valid.' }, { status: 400 });
    }
    const [{ data: sub, error: sErr }, { data: payApp, error: aErr }] = await Promise.all([
      subId
        ? db.from('subcontractors').select('id, company_name').eq('id', subId).eq('tenant_id', user.tenantId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      payAppId
        ? db.from('pay_applications').select('id').eq('id', payAppId).eq('tenant_id', user.tenantId).eq('project_id', projectId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (sErr) throw sErr;
    if (aErr) throw aErr;
    if (subId && !sub) return NextResponse.json({ error: 'That subcontractor is not one of this company\'s subs.' }, { status: 404 });
    if (payAppId && !payApp) return NextResponse.json({ error: 'That pay application is not on this job.' }, { status: 404 });

    const pdfBytes = await generateLienWaiver({
      waiverType: types.pdf,
      state,
      claimantName,
      projectName: p.name || '',
      projectAddress: p.address || '',
      ownerName,
      gcName: p.gc_name || '',
      throughDate: body.throughDate,
      amount,
      checkNumber: typeof body.checkNumber === 'string' ? body.checkNumber : undefined,
    });
    const pdfUrl = await saveDocument(projectId, `lien-waiver-${types.db}`, pdfBytes,
      { waiverType: types.db, claimantName, amount, throughDate: body.throughDate, state, subId, payAppId }, user.tenantId);
    if (!pdfUrl || pdfUrl.startsWith('demo://')) throw new Error('lien waiver PDF was not stored');

    const { data: waiver, error: insErr } = await db.from('lien_waivers').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      sub_id: subId,
      subcontractor_id: subId,
      pay_application_id: payAppId,
      waiver_type: types.db,
      state,
      claimant_name: claimantName,
      company_name: (sub as { company_name?: string } | null)?.company_name || claimantName,
      amount,
      through_date: body.throughDate,
      check_number: typeof body.checkNumber === 'string' && body.checkNumber.trim() ? body.checkNumber.trim() : null,
      status: 'pending',
      pdf_url: pdfUrl,
    }).select().single();
    if (insErr) throw insErr;

    return NextResponse.json({ pdfUrl, waiver, success: true }, { status: 201 });
  } catch (e) {
    return apiError('lien-waivers/generate', e, "Couldn't generate the lien waiver. Please try again.");
  }
}
