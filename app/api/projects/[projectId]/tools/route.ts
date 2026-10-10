/**
 * GET /api/projects/[projectId]/tools — the count or state beside every tool
 * on the job page, plus the job's header, in one round trip.
 *
 *   { project: { id, name, status, phase, address, city, state, start_date, end_date },
 *     today: 'YYYY-MM-DD',          // the caller's day: device → company → UTC
 *     tools: JobTools }             // lib/job-tools — null per tool whose count failed
 *
 * Order of business: signed in, allowed to view jobs, and the job is THIS
 * company's (404 otherwise — another company's job is indistinguishable from
 * one that does not exist). Only then are the counts run, every one of them
 * filtered by tenant and project. A count that fails is null for that tool and
 * logged; it never fails the page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { dayIn, requestDay } from '@/lib/time-zone';
import { countJobTools, type JobHead, type JobToolsResponse } from '@/lib/job-tools';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  /* Not a job id at all: the same answer as someone else's job. */
  if (!UUID_RE.test(String(projectId || ''))) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const { data: project, error } = await db
      .from('projects')
      .select('id, name, status, phase, address, city, state, start_date, end_date')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!project) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    /* The company-zone lookup failing must not cost the GC their tool list:
       the UTC day stands in, and that is logged. */
    const today = await requestDay(req.headers, db as never, user.tenantId, 'projects/tools')
      .then((d) => d.today)
      .catch((e) => {
        console.error('[projects/tools] time zone lookup failed — using the UTC day', e);
        return dayIn('UTC');
      });
    const tools = await countJobTools(db as never, user.tenantId, projectId, today);

    const body: JobToolsResponse = { project: project as JobHead, today, tools };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return apiError('projects/tools', e, "Couldn't load this job's tools. Try again.");
  }
}
