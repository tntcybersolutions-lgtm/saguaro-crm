import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { sendEmail } from '@/lib/email';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  return isNaN(d.getTime())
    ? esc(v)
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { projectId } = params;

  try {
    const body = await req.json().catch(() => ({} as { log_ids?: string[]; ids?: string[]; to?: string | string[] }));
    const ids = Array.isArray(body.log_ids) ? body.log_ids : Array.isArray(body.ids) ? body.ids : [];

    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let query = supabase
      .from('daily_logs')
      .select('id, log_date, superintendent, weather, crew_count, work_performed, delays, materials_delivered, safety_notes, visitors, status')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('log_date', { ascending: false });
    if (ids.length > 0) query = query.in('id', ids);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const projectName = (project as { name?: string }).name || 'Project';

    const to = body.to || user.email;
    if (!to) return NextResponse.json({ error: 'No recipient' }, { status: 400 });

    const blocks = rows
      .map((r) => {
        const detail = (label: string, value: unknown) =>
          value
            ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:150px;vertical-align:top;">${label}</td><td style="padding:4px 0;font-size:13px;color:#111827;">${esc(value)}</td></tr>`
            : '';
        return `
          <div style="margin:0 0 20px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
            <h3 style="margin:0 0 10px;color:#0D1116;font-size:16px;">${fmtDate(r.log_date)}</h3>
            <table cellpadding="0" cellspacing="0" style="width:100%;">
              ${detail('Superintendent', r.superintendent)}
              ${detail('Weather', r.weather)}
              ${detail('Crew Count', r.crew_count)}
              ${detail('Work Performed', r.work_performed)}
              ${detail('Delays', r.delays)}
              ${detail('Materials Delivered', r.materials_delivered)}
              ${detail('Safety Notes', r.safety_notes)}
              ${detail('Visitors', r.visitors)}
              ${detail('Status', r.status)}
            </table>
          </div>`;
      })
      .join('');

    const html = `
      <h2 style="margin:0 0 16px;color:#0D1116;font-size:20px;">Daily Log Summary — ${esc(projectName)}</h2>
      <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${rows.length} daily log${rows.length !== 1 ? 's' : ''} from <strong>${esc(projectName)}</strong>.</p>
      ${blocks || '<p style="color:#6b7280;font-size:14px;">No logs found for the selection.</p>'}
    `;

    const sent = await sendEmail({
      to,
      subject: `Daily Log Summary — ${projectName}`,
      html,
    });
    if (!sent) {
      return NextResponse.json({ error: "The email didn't go out. Please try again in a minute." }, { status: 502 });
    }

    return NextResponse.json({ success: true, sent: rows.length, to });
  } catch (e) {
    return apiError('projects/[projectId]/daily-logs/email POST', e, 'Failed to email daily logs');
  }
}
