import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { extractJson, messageText } from '@/lib/ai-json';
import { LOCAL_DAY_HEADER, plausibleToday } from '@/lib/calendar-day';
import { requestTimeZone } from '@/lib/time-zone';
import { isOwnerUpdate, normalizeUpdate, ownerUpdatePrompt, type OwnerUpdateData } from '@/lib/owner-update';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * /api/projects/[projectId]/owner-updates — homeowner progress updates
 * (lib/owner-update). GET lists drafts and sent updates; POST writes a new
 * DRAFT from the last `days` (default 7) of daily logs. Nothing is sent from
 * here — the PM edits and approves at /owner-updates/[id].
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;
  try {
    const { data, error } = await g.db
      .from('portal_summaries')
      .select('id, summary_data, created_at, last_updated')
      .eq('project_id', projectId)
      .eq('tenant_id', g.user.tenantId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    const updates = (data || []).filter((r) => isOwnerUpdate(r.summary_data)).map((r) => ({ id: r.id, created_at: r.created_at, ...(r.summary_data as OwnerUpdateData) }));
    return NextResponse.json({ updates });
  } catch (e) {
    return apiError('owner-updates', e, 'Could not load the updates.');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const { db, user } = g;
  const body = await req.json().catch(() => ({}));
  const days = Math.min(31, Math.max(1, Number(body.days) || 7));
  try {
    const { data: project, error: pErr } = await db
      .from('projects').select('id, name, owner_name, percent_complete')
      .eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const tz = await requestTimeZone(req.headers, db, user.tenantId);
    const end = plausibleToday(req.headers.get(LOCAL_DAY_HEADER) ?? body.today, tz.zone);
    const start = new Date(new Date(`${end}T12:00:00Z`).getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const ahead = new Date(new Date(`${end}T12:00:00Z`).getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

    const [{ data: logs, error: lErr }, { data: tasks, error: tErr }, { data: tenant }] = await Promise.all([
      db.from('daily_logs')
        .select('log_date, work_performed, activities, phase_of_work, crew_count, manpower_count, weather, delays, work_stopped, work_stopped_reason, materials_delivered, inspections, photos_count')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).is('deleted_at', null)
        .gte('log_date', start).lte('log_date', end).order('log_date', { ascending: true }),
      db.from('schedule_tasks').select('name, start_date')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId)
        .gt('start_date', end).lte('start_date', ahead).order('start_date', { ascending: true }).limit(12),
      db.from('tenants').select('name').eq('id', user.tenantId).maybeSingle(),
    ]);
    if (lErr) throw lErr;
    if (tErr) throw tErr;
    if (!logs?.length) {
      return NextResponse.json({ error: `No daily logs from ${start} to ${end} to write from. Log the work first, or widen the range.` }, { status: 400 });
    }

    let reply = '';
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 900,
        messages: [{ role: 'user', content: ownerUpdatePrompt({
          projectName: String(project.name || 'your project'),
          ownerName: (project.owner_name as string | null) || null,
          companyName: String(tenant?.name || 'Your builder'),
          percentComplete: Number(project.percent_complete) || null,
          logs: logs as Array<Record<string, unknown>>,
          upcoming: (tasks || []) as Array<{ name: string; start_date: string | null }>,
          start, end,
        }) }],
      });
      reply = messageText(resp);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      console.error('[owner-updates] model call failed', e?.status, e?.message);
      return NextResponse.json({ error: e?.status === 429 ? 'The writer is busy — try again in a moment.' : 'The update could not be written right now. Try again, or write it yourself.' }, { status: 502 });
    }
    const draft = normalizeUpdate(extractJson(reply), `Progress update — ${end}`);
    if (!draft) return NextResponse.json({ error: 'The update could not be written right now. Try again, or write it yourself.' }, { status: 502 });

    const now = new Date().toISOString();
    const data: OwnerUpdateData = {
      kind: 'owner_update', status: 'draft', title: draft.title, body: draft.body,
      period: { start, end }, generated_by: 'ai', drafted_by: user.email || null, drafted_at: now,
    };
    const { data: row, error: iErr } = await db
      .from('portal_summaries')
      .insert({ tenant_id: user.tenantId, project_id: projectId, summary_data: data, generated_by: 'ai', last_updated: now })
      .select('id, created_at')
      .single();
    if (iErr) throw iErr;
    return NextResponse.json({ update: { id: row.id, created_at: row.created_at, ...data }, logDays: logs.length });
  } catch (e) {
    return apiError('owner-updates', e, 'Could not write the update. Please try again.');
  }
}
