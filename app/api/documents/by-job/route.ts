import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { CLOSED_PROJECT_STATUSES } from '@/lib/project-lifecycle';
import { liveJobs } from '@/lib/live-jobs';
import { buildJobDocs, type JobRow, type PayAppRow, type WaiverRow, type PayrollRow, type CloseoutRow } from '@/lib/documents-by-job';

export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/documents/by-job[?projectId=]
 *
 * The Documents page's job-first view: one summary per job (billed vs
 * contract, pay apps, lien waivers, certified payroll, closeout, a red /
 * yellow / green tone and why) plus which pay apps have a waiver on file.
 * Every query is tenant-scoped. Active jobs always appear; a closed job only
 * when it still has paperwork; an archived or deleted job never (lib/live-jobs).
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const projectId = req.nextUrl.searchParams.get('projectId');
    const db = createServerClient() as any;
    const t = user.tenantId;
    const scoped = (q: any) => (projectId ? q.eq('project_id', projectId) : q);
    const rows = async (q: any) => {
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    };

    const [projects, payApps, waivers, payroll, closeout] = await Promise.all([
      rows(projectId
        ? db.from('projects').select('*').eq('tenant_id', t).eq('id', projectId)
        : liveJobs(db.from('projects').select('*').eq('tenant_id', t)).limit(500)),
      rows(scoped(db.from('pay_applications')
        .select('id, project_id, app_number, status, current_payment_due, net_payment_due, total_completed_stored, conditional_waiver_signed, unconditional_waiver_signed')
        .eq('tenant_id', t).is('deleted_at', null)).limit(2000)),
      rows(scoped(db.from('lien_waivers').select('id, project_id, pay_application_id, status').eq('tenant_id', t).is('deleted_at', null)).limit(5000)),
      rows(scoped(db.from('certified_payroll').select('project_id, week_ending').eq('tenant_id', t)).limit(5000)),
      rows(scoped(db.from('closeout').select('project_id, status').eq('tenant_id', t)).limit(5000)),
    ]);

    const hasDocs = new Set<string>([...payApps, ...waivers, ...payroll, ...closeout].map((r: any) => r.project_id).filter(Boolean));
    const closed = (s: unknown) => (CLOSED_PROJECT_STATUSES as readonly string[]).includes(String(s || '').toLowerCase());
    const jobs = (projects as JobRow[]).filter((p) => projectId || !closed(p.status) || hasDocs.has(p.id));

    const out = buildJobDocs({
      jobs,
      payApps: payApps as PayAppRow[],
      waivers: waivers as WaiverRow[],
      payroll: payroll as PayrollRow[],
      closeout: closeout as CloseoutRow[],
    });
    return NextResponse.json(out, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return apiError('documents/by-job', e, "Couldn't load documents by job");
  }
}
