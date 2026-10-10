import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { groupJobSubs, parseAmount, companyUpdates, type JobLinkRow } from '@/lib/job-subs';

/**
 * One company on one job.
 *   PATCH  — edit the company's details and/or its contract amount on this job
 *   DELETE — take the company OFF THIS JOB. The company stays in the directory
 *            with its insurance, W-9 and history.
 *
 * The page's trash button used to call DELETE /api/subs/:id, which deleted the
 * company itself — and the database cascades that to every job it was on, its
 * compliance documents, insurance records and scorecards — from a button on
 * one job's page that said "Remove".
 */

type Ctx = { params: Promise<{ projectId: string; subId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['active', 'prequalified', 'invited', 'suspended', 'inactive'];
const SELECT = 'id, subcontractor_id, contract_amount, status, bid_package_id, created_at, subcontractors(*)';

async function linksFor(db: ReturnType<typeof createServerClient>, tenantId: string, projectId: string, subId: string) {
  const { data, error } = await db.from('project_subcontractors').select(SELECT)
    .eq('tenant_id', tenantId).eq('project_id', projectId).eq('subcontractor_id', subId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as JobLinkRow[];
}

async function paidFor(db: ReturnType<typeof createServerClient>, tenantId: string, projectId: string, subId: string) {
  const { data, error } = await db.from('portal_sub_pay_apps').select('sub_id, amount, net_amount')
    .eq('tenant_id', tenantId).eq('project_id', projectId).eq('sub_id', subId).eq('status', 'paid');
  if (error) throw error;
  return (data || []) as { sub_id: string | null; amount: number | null; net_amount: number | null }[];
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    if (!UUID.test(subId)) return NextResponse.json({ error: 'That company is not on this job.' }, { status: 404 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the changes as JSON.' }, { status: 400 });
    const db = createServerClient();
    const links = await linksFor(db, user.tenantId, projectId, subId);
    if (!links.length || !links[0].subcontractors) return NextResponse.json({ error: 'That company is not on this job.' }, { status: 404 });
    const current = links[0].subcontractors;

    const updates: Record<string, unknown> = companyUpdates(body, current, true);
    if ('company_name' in body && !String(body.company_name ?? '').trim()) {
      return NextResponse.json({ error: 'company_name: a company needs a name.', field: 'company_name' }, { status: 400 });
    }
    const email = updates.contact_email;
    if (typeof email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "contact_email: that doesn't look like an email address.", field: 'contact_email' }, { status: 400 });
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(String(body.status))) return NextResponse.json({ error: `status: one of ${STATUSES.join(', ')}.`, field: 'status' }, { status: 400 });
      if (body.status !== current.status) updates.status = body.status;
    }
    let amount: number | null | undefined;
    if (body.contract_amount !== undefined) {
      const a = parseAmount(body.contract_amount);
      if (a === 'invalid') return NextResponse.json({ error: 'contract_amount: enter a dollar amount (0 or more), or leave it blank.', field: 'contract_amount' }, { status: 400 });
      amount = a;
      const total = links.reduce((s, l) => s + (Number(l.contract_amount) || 0), 0);
      if (links.length > 1 && (a ?? 0) !== total) {
        return NextResponse.json({ error: `This company holds ${links.length} contracts on this job (from bid-package awards). Change the amount on the package it was awarded on.` }, { status: 409 });
      }
    }

    if (Object.keys(updates).length) {
      const { error } = await db.from('subcontractors').update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', subId).eq('tenant_id', user.tenantId);
      if (error) throw error;
    }
    if (amount !== undefined && links.length === 1) {
      const { error } = await db.from('project_subcontractors').update({ contract_amount: amount } as never)
        .eq('id', links[0].id).eq('tenant_id', user.tenantId).eq('project_id', projectId);
      if (error) throw error;
    }
    const [after, paid] = await Promise.all([linksFor(db, user.tenantId, projectId, subId), paidFor(db, user.tenantId, projectId, subId)]);
    return NextResponse.json({ sub: groupJobSubs(after, paid)[0] ?? null });
  } catch (e) {
    return apiError('projects/projectId/subs/subId PATCH', e, "Couldn't save the subcontractor. Please try again.");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    if (!UUID.test(subId)) return NextResponse.json({ error: 'That company is not on this job.' }, { status: 404 });
    const db = createServerClient();
    const links = await linksFor(db, user.tenantId, projectId, subId);
    if (!links.length) return NextResponse.json({ error: 'That company is not on this job.' }, { status: 404 });
    const awarded = links.filter((l) => l.bid_package_id);
    if (awarded.length) {
      const { data: pkgs, error: pErr } = await db.from('bid_packages').select('name')
        .in('id', awarded.map((l) => l.bid_package_id as string)).eq('tenant_id', user.tenantId);
      if (pErr) throw pErr;
      const names = ((pkgs || []) as { name: string | null }[]).map((p) => p.name).filter(Boolean);
      return NextResponse.json({
        error: `This company is on the job through ${names.length ? `the award of ${names.map((n) => `"${n}"`).join(', ')}` : 'a bid-package award'}. Change that award to take them off the job.`,
      }, { status: 409 });
    }
    const { data, error } = await db.from('project_subcontractors').delete()
      .eq('tenant_id', user.tenantId).eq('project_id', projectId).eq('subcontractor_id', subId)
      .select('id');
    if (error) throw error;
    if (!data || !data.length) return NextResponse.json({ error: 'That company is not on this job.' }, { status: 404 });
    return NextResponse.json({ success: true, removed: data.length });
  } catch (e) {
    return apiError('projects/projectId/subs/subId DELETE', e, "Couldn't take the subcontractor off this job. Please try again.");
  }
}
