import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { generateDailyReport } from '@/lib/document-templates/daily-report-generator';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const projectId = body.projectId ?? body.project_id ?? null;
  const dailyLogId = body.dailyLogId ?? body.daily_log_id ?? null;

  /* Both of these used to go straight into .single() lookups inside the try.
     A missing dailyLogId meant `.eq('id', undefined)`, which throws, which the
     catch turned into "Document generation failed" — the same eight words a
     real generator crash produces. Printing a daily report without naming the
     day is a user error, and the user should be told which field is missing
     rather than being handed a failure that reads like the product is broken. */
  const missing = [!projectId && 'projectId', !dailyLogId && 'dailyLogId'].filter(Boolean);
  if (missing.length) {
    return NextResponse.json(
      { error: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required` },
      { status: 400 },
    );
  }

  try {
    const db = createServerClient();

    /* These two reads are the tenant guard, and they are the only one there
       is: generateDailyReport takes bare ids and does not scope them itself.
       They were being fetched into variables that nothing read, with .single()
       — so another tenant's id produced a 500 rather than a 404, and a reader
       could reasonably have deleted them as dead code and removed the only
       thing keeping this route isolated. maybeSingle + an explicit 404 says
       what they are for. */
    const { data: project, error: pErr } = await db
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', g.user.tenantId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const { data: dailyLog, error: lErr } = await db
      .from('daily_logs')
      .select('id')
      .eq('id', dailyLogId)
      .eq('project_id', projectId)
      .eq('tenant_id', g.user.tenantId)
      .maybeSingle();
    if (lErr) throw lErr;
    if (!dailyLog) {
      return NextResponse.json({ error: 'That daily log is not on this project' }, { status: 404 });
    }

    const result = await generateDailyReport({ projectId, dailyLogId });
    return NextResponse.json({ pdfUrl: result.pdfUrl, success: true });
  } catch (err: unknown) {
    /* Was a hand-rolled 500 with a fixed string and no correlation id, so a
       real generator failure left support nothing to trace. */
    return apiError('documents/daily-report', err, 'Could not generate the daily report');
  }
}
