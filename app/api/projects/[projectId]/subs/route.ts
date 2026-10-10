import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { onSubAddedToProject } from '@/lib/triggers';
import { groupJobSubs, cleanText, parseAmount, COMPANY_FIELDS, companyUpdates, type JobLinkRow } from '@/lib/job-subs';

/**
 * The subcontractors on ONE job.
 *
 *   GET  — who is on this job: the company (from the tenant directory) plus
 *          what they are contracted for here and what has been paid to them
 *          here (their invoices marked Paid in the sub portal).
 *   POST — put a company on this job: one already in the directory
 *          ({ subcontractorId }), or a new one (company fields), with the
 *          contract amount for this job.
 *
 * The job's subs page used to list the whole directory and "add" by creating
 * a new directory company every time — picking ABC Electric from the list and
 * pressing Add made a second ABC Electric — and it never put anyone on the job:
 * no project_subcontractors row, so "Subs on Job" never moved and the contract
 * amount typed into the form was thrown away. A company is on a job when a
 * project_subcontractors row says so; that is what this route reads and writes.
 */

type Ctx = { params: Promise<{ projectId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** This tenant's project, or null. */
async function ownProject(db: ReturnType<typeof createServerClient>, projectId: string, tenantId: string) {
  if (!UUID.test(projectId)) return null;
  const { data, error } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    if (!(await ownProject(db, projectId, user.tenantId))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const { data: links, error } = await db
      .from('project_subcontractors')
      .select('id, subcontractor_id, contract_amount, status, bid_package_id, created_at, subcontractors(*)')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = (links || []) as unknown as JobLinkRow[];
    const subIds = [...new Set(rows.map((r) => r.subcontractor_id).filter(Boolean))];
    let paid: { sub_id: string | null; amount: number | null; net_amount: number | null }[] = [];
    if (subIds.length) {
      const { data: pays, error: pErr } = await db
        .from('portal_sub_pay_apps')
        .select('sub_id, amount, net_amount')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', projectId)
        .eq('status', 'paid')
        .in('sub_id', subIds);
      if (pErr) throw pErr;
      paid = (pays || []) as typeof paid;
    }
    return NextResponse.json({ subs: groupJobSubs(rows, paid) });
  } catch (e) {
    return apiError('projects/projectId/subs GET', e, "Couldn't load this job's subcontractors. Please try again.");
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  // projectId is checked against this tenant inside the guard (404 otherwise).
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the subcontractor as JSON.' }, { status: 400 });
    }
    const amount = parseAmount(body.contract_amount);
    if (amount === 'invalid') {
      return NextResponse.json({ error: 'contract_amount: enter a dollar amount (0 or more), or leave it blank.', field: 'contract_amount' }, { status: 400 });
    }
    const email = cleanText(body.contact_email ?? body.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "contact_email: that doesn't look like an email address.", field: 'contact_email' }, { status: 400 });
    }
    const db = createServerClient();

    let sub: Record<string, unknown> | null = null;
    const pickedId = cleanText(body.subcontractorId);
    if (pickedId) {
      // A company already in the directory: put IT on the job, never a copy.
      if (!UUID.test(pickedId)) return NextResponse.json({ error: 'That company is not in your directory.' }, { status: 404 });
      const { data, error } = await db.from('subcontractors').select('*').eq('id', pickedId).eq('tenant_id', user.tenantId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'That company is not in your directory.' }, { status: 404 });
      sub = data as Record<string, unknown>;
      // Details typed over the pre-filled ones are saved to the company too.
      const updates = companyUpdates(body, sub);
      if (Object.keys(updates).length) {
        const { data: upd, error: uErr } = await db.from('subcontractors')
          .update({ ...updates, updated_at: new Date().toISOString() } as never)
          .eq('id', pickedId).eq('tenant_id', user.tenantId).select().maybeSingle();
        if (uErr) throw uErr;
        if (upd) sub = upd as Record<string, unknown>;
      }
    } else {
      const name = cleanText(body.name ?? body.company_name);
      if (!name) return NextResponse.json({ error: 'name: enter the company name.', field: 'name' }, { status: 400 });
      // The same company typed again is the one already on file — say so, with it.
      const { data: same, error: sErr } = await db.from('subcontractors').select('id, company_name, trade')
        .eq('tenant_id', user.tenantId).ilike('company_name', name.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(1);
      if (sErr) throw sErr;
      if (same && same.length) {
        return NextResponse.json({ error: `${(same[0] as { company_name: string }).company_name} is already in your directory — pick it from the list instead.`, existing: same[0] }, { status: 409 });
      }
      const record: Record<string, unknown> = { tenant_id: user.tenantId, company_name: name, status: 'active' };
      for (const k of COMPANY_FIELDS) {
        if (k === 'company_name') continue;
        const v = cleanText(body[k]);
        if (v) record[k] = v;
      }
      // Older columns some screens still read: email/phone mirror the contact's.
      if (record.contact_email) record.email = record.contact_email;
      if (record.contact_phone) record.phone = record.contact_phone;
      const { data, error } = await db.from('subcontractors').insert(record as never).select().single();
      if (error) throw error;
      sub = data as Record<string, unknown>;
    }

    const subId = String(sub.id);
    const { data: already, error: aErr } = await db.from('project_subcontractors').select('id')
      .eq('tenant_id', user.tenantId).eq('project_id', projectId).eq('subcontractor_id', subId).limit(1);
    if (aErr) throw aErr;
    if (already && already.length) {
      return NextResponse.json({ error: `${String(sub.company_name || 'That company')} is already on this job.`, sub }, { status: 409 });
    }
    const { data: link, error: lErr } = await db.from('project_subcontractors').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      subcontractor_id: subId,
      contract_amount: amount,
      status: 'assigned',
    } as never).select().single();
    if (lErr) throw lErr;

    // W-9 request and preliminary-notice reminder (lib/triggers), as before.
    onSubAddedToProject(projectId, subId).catch((err) => console.error('[projects/subs POST] onSubAddedToProject', err));

    return NextResponse.json({ sub, assignment: link }, { status: 201 });
  } catch (e) {
    return apiError('projects/projectId/subs POST', e, "Couldn't add the subcontractor to this job. Please try again.");
  }
}
