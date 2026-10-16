import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { sendEmail } from '@/lib/email';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nl2br(v: unknown): string {
  return esc(v).replace(/\n/g, '<br/>');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; id: string } },
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { projectId, id } = params;

  try {
    // Body is optional (the field page POSTs with no body).
    const body = await req.json().catch(() => ({} as { to?: string | string[] }));

    const supabase = createServerClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, title, meeting_type, meeting_date, location, start_time, end_time, facilitator_name, agenda, notes, minutes_text, status, distributed_at')
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (meetingError || !meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    const m = meeting as Record<string, unknown>;
    const projectName = (project as { name?: string }).name || 'Project';
    const to = body.to || user.email;
    if (!to) return NextResponse.json({ error: 'No recipient' }, { status: 400 });

    const minutes = m.minutes_text || m.notes || '';
    const html = `
      <h2 style="margin:0 0 16px;color:#0D1116;font-size:20px;">Meeting Minutes — ${esc(m.title) || 'Meeting'}</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
        <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:160px;">Project</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${esc(projectName)}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Date</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${esc(m.meeting_date)}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Type</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${esc(m.meeting_type)}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Location</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${esc(m.location)}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Time</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${esc(m.start_time)}${m.end_time ? ' - ' + esc(m.end_time) : ''}</td></tr>
        <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Facilitator</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${esc(m.facilitator_name)}</td></tr>
      </table>
      ${m.agenda ? `<h3 style="margin:20px 0 8px;color:#0D1116;font-size:16px;">Agenda</h3><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${nl2br(m.agenda)}</p>` : ''}
      ${minutes ? `<h3 style="margin:20px 0 8px;color:#0D1116;font-size:16px;">Minutes</h3><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${nl2br(minutes)}</p>` : ''}
    `;

    const sent = await sendEmail({
      to,
      subject: `Meeting Minutes — ${(m.title as string) || projectName}`,
      html,
    });
    if (!sent) {
      return NextResponse.json({ error: "The email didn't go out. Please try again in a minute." }, { status: 502 });
    }

    // Best-effort distribution timestamp (ignore failure)
    await must(supabase
      .from('meetings')
      .update({ distributed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('project_id', projectId), 'meetings write');

    return NextResponse.json({ success: true, message: 'Meeting minutes sent', to });
  } catch (e) {
    return apiError('projects/[projectId]/meetings/[id]/email POST', e, 'Failed to send minutes');
  }
}
