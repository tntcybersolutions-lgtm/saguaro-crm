import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { sendCorrespondenceEmail } from '@/lib/email';
import type { Database } from '@/lib/database.types';

import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
/** Pull addresses out of the composer's [{ name, email }] recipient rows. */
function emails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => (typeof r === 'string' ? r : (r as { email?: string })?.email))
    .map((e) => String(e || '').trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('correspondence')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[projects/[projectId]/correspondence] read failed:', error.message);
      return apiError('projects/projectId/correspondence', error, 'Failed to load items');
    }
    return NextResponse.json({ items: data || [] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/correspondence] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/correspondence', e, 'Failed to load items');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const supabase = createServerClient();
    // correspondence real columns map: type->correspondence_type, to->to_names(jsonb),
    // cc->cc_names(jsonb). request_read_receipt/reference_links have no column and
    // no appropriate jsonb bucket, so they are dropped to avoid a 500.
    const record: Record<string, unknown> = {
      project_id: params.projectId,
      tenant_id: user.tenantId,
      subject: body.subject ?? null,
      body: body.body ?? null,
      correspondence_type: body.correspondence_type ?? body.type ?? null,
      to_names: body.to_names ?? body.to ?? [],
      cc_names: body.cc_names ?? body.cc ?? [],
      from_email: user.email,
      from_name: body.from_name ?? null,
      priority: body.priority ?? null,
      direction: body.direction ?? 'outbound',
      ...(body.sent_at ? { sent_at: body.sent_at } : {}),
      created_by: user.id,
      status: body.status || 'draft',
      created_at: new Date().toISOString(),
    };
    if (!record.subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    const { data, error } = await supabase.from('correspondence').insert(record as Database['public']['Tables']['correspondence']['Insert']).select().single();
    // Never fabricate a fake `corr-…` id on failure — that reports a save that
    // never happened. Surface the real DB error instead.
    if (error) { console.error('[correspondence/POST]', error); return apiError('projects/projectId/correspondence', error, "Failed to create correspondence", 500); }

    // ── ACTUALLY SEND IT ──
    // A draft is filed, not transmitted. Anything else is outbound mail, and the
    // composer's "Correspondence sent." has to be backed by a real send. The row
    // is already saved either way; `emailed` tells the client which words to use.
    const isDraft = String(record.status).toLowerCase() === 'draft';
    if (isDraft) {
      return NextResponse.json({ item: data, emailed: false, draft: true });
    }

    const { data: project } = await supabase
      .from('projects').select('name').eq('id', params.projectId).eq('tenant_id', user.tenantId).maybeSingle();

    const result = await sendCorrespondenceEmail({
      to: emails(body.to_names ?? body.to),
      cc: emails(body.cc_names ?? body.cc),
      subject: String(record.subject),
      body: String(record.body ?? ''),
      fromName: (body.from_name as string) || user.email,
      replyTo: user.email,
      correspondenceType: (record.correspondence_type as string) || null,
      projectName: (project as { name?: string } | null)?.name ?? null,
      referenceNumber: (body.reference_number as string) || null,
    });

    if (!result.sent) {
      // Mark the row for what it is — logged, not transmitted — so the register
      // never shows a "Sent" letter that no one received.
      await must(supabase
        .from('correspondence')
        .update({ status: 'Logged', sent_at: null } as never)
        .eq('id', (data as { id: string }).id)
        .eq('tenant_id', user.tenantId), 'correspondence write');
      return NextResponse.json({
        item: { ...(data as Record<string, unknown>), status: 'Logged', sent_at: null },
        emailed: false,
        email_error: result.error || 'The correspondence was not emailed.',
      });
    }

    return NextResponse.json({ item: data, emailed: true, recipients: result.recipients });
  } catch (e) {
    return apiError('projects/[projectId]/correspondence POST', e, 'Failed to create correspondence');
  }
}
