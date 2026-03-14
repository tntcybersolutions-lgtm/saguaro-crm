import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — list AI summaries for project */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const { data: summaries, error } = await db
      .from('portal_summaries')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ summaries: summaries || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load summaries' }, { status: 500 });
  }
}

/** POST — generate a new summary from daily logs */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { period_start, period_end } = body;

    const db = createServerClient();
    const projectId = session.project_id;
    const tenantId = session.tenant_id;

    // Collect daily log data for the period
    let logsQuery = db
      .from('daily_logs')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('log_date', { ascending: true });

    if (period_start) {
      logsQuery = logsQuery.gte('log_date', period_start);
    }
    if (period_end) {
      logsQuery = logsQuery.lte('log_date', period_end);
    }

    const { data: logs, error: logsError } = await logsQuery;
    if (logsError) throw logsError;

    // Build structured summary from collected data
    const logEntries = logs || [];
    const totalLogs = logEntries.length;
    const weatherDays = logEntries.filter((l: any) => l.weather_delay).length;
    const workforceTotal = logEntries.reduce(
      (sum: number, l: any) => sum + (l.workforce_count || 0),
      0
    );

    const structuredSummary = {
      period: {
        start: period_start || (logEntries[0]?.log_date ?? null),
        end: period_end || (logEntries[logEntries.length - 1]?.log_date ?? null),
      },
      stats: {
        total_log_days: totalLogs,
        weather_delay_days: weatherDays,
        avg_workforce: totalLogs > 0 ? Math.round(workforceTotal / totalLogs) : 0,
      },
      activities: logEntries.map((l: any) => ({
        date: l.log_date,
        description: l.work_description || l.notes || '',
        workforce: l.workforce_count || 0,
        weather: l.weather || '',
      })),
      highlights: logEntries
        .filter((l: any) => l.milestones || l.highlights)
        .map((l: any) => ({
          date: l.log_date,
          note: l.milestones || l.highlights,
        })),
    };

    // Store the generated summary
    const { data: saved, error: saveError } = await db
      .from('portal_summaries')
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        period_start: structuredSummary.period.start,
        period_end: structuredSummary.period.end,
        summary_data: structuredSummary,
        generated_by: 'system',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return NextResponse.json({ summary: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate summary' }, { status: 500 });
  }
}
