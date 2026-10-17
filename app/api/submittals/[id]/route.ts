import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { SUBMITTAL_REVIEW_STATUSES } from '@/lib/submittal-workflow';
import { runInBackground } from '@/lib/background';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Role check, not just sign-in: Submittals: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Submittals', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('submittals')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ submittal: data });
  } catch (e) {
    return apiError('submittals/[id] GET', e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Submittals', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    // Map incoming aliases to real `submittals` columns; drop fields with no column.
    const fieldMap: Record<string, string> = {
      title: 'title',
      submittal_number: 'submittal_number',
      spec_section: 'spec_section',
      description: 'description',
      submitted_by: 'submitted_by',
      submitted_to: 'submitted_to',
      subcontractor: 'subcontractor',
      trade: 'trade',
      status: 'status',
      priority: 'priority',
      due_date: 'due_date',
      notes: 'notes',
      ball_in_court: 'ball_in_court',
      submitted_date: 'submitted_at',
      submitted_at: 'submitted_at',
      required_date: 'due_date',
      revision: 'revision_number',
      revision_number: 'revision_number',
    };
    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(fieldMap)) {
      if (body[k] !== undefined) fields[fieldMap[k]] = body[k];
    }
    // The status before this save, so moving it into review emails the reviewer once.
    let before: string | null = null;
    if (typeof fields.status === 'string' && SUBMITTAL_REVIEW_STATUSES.has(fields.status)) {
      const { data: prev, error: prevErr } = await db.from('submittals').select('status').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
      if (prevErr) throw prevErr;
      before = ((prev as { status?: string | null } | null)?.status ?? '') || '';
    }
    const { data, error } = await db
      .from('submittals')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (before !== null) runInBackground(async () => (await import('@/lib/triggers')).onSubmittalSentForReview(id, before), 'onSubmittalSentForReview');
    return NextResponse.json({ success: true, submittal: data });
  } catch (e) {
    return apiError('submittals/[id] PATCH', e);
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return PATCH(req, context);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Submittals', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('submittals')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('submittals/[id] DELETE', e);
  }
}
