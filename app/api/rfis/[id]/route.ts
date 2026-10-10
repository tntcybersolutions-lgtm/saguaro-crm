import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError, apiFail } from '@/lib/api-error';
import { embed } from '@/lib/db-embeds';

const ALLOWED_RFI_COLUMNS = [
  'project_id', 'subject', 'question', 'answer', 'spec_section', 'due_date', 'status',
  'submitted_by', 'rfi_number', 'answered_by', 'answered_date', 'answered_at',
  'drawing_reference', 'days_to_respond', 'is_urgent', 'pdf_url', 'pdf_generated_at',
  'submitted_at', 'closed_at', 'closed_by', 'notes', 'created_by', 'ai_suggested',
  'ai_suggested_from', 'response_days_elapsed', 'is_overdue', 'impact_description',
  'schedule_impact_days', 'cost_impact', 'cost_impact_direction', 'related_submittal_id',
  'related_change_order_id', 'attachments', 'revision_number', 'previous_rfi_id', 'priority',
  'draft_answer', 'answer_drafted_at', 'answer_confidence', 'answer_references', 'sage_analysis',
  'ball_in_court', 'escalated_at', 'escalated_to', 'escalation_reason', 'internal_notes',
  'linked_co_id', 'watchers', 'view_count', 'last_activity_at', 'last_activity_type',
  'ai_draft_question', 'ai_drafted_at', 'html_content', 'assigned_to_name', 'assigned_to_email',
  'assigned_to_company', 'overdue_reminder_sent_at', 'updated_at',
];

function filterRfiBody(body: Record<string, any>): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const k of ALLOWED_RFI_COLUMNS) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  return updates;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const db = createServerClient();
    // maybeSingle: someone else's (or a deleted) RFI is "not found", not a server error.
    // The project is embedded through a named constraint: rfis has two identical
    // FKs to projects, and a bare projects(name) failed every read (lib/db-embeds).
    const { data, error } = await db.from('rfis').select(`*, ${embed('rfis', 'projects')}(name)`).eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('RFI not found', 404);
    return NextResponse.json({ rfi: data });
  } catch (e) {
    return apiError('rfis/id GET', e, "Couldn't load this RFI. Please try again.");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('rfis').update(filterRfiBody(body)).eq('id', id).eq('tenant_id', user.tenantId).select().maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('RFI not found', 404);
    return NextResponse.json({ rfi: data });
  } catch (e) {
    return apiError('rfis/id PUT', e, "Couldn't save this RFI. Please try again.");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('rfis').update(filterRfiBody(body)).eq('id', id).eq('tenant_id', user.tenantId).select().maybeSingle();
    if (error) throw error;
    if (!data) return apiFail('RFI not found', 404);
    return NextResponse.json({ rfi: data });
  } catch (e) {
    return apiError('rfis/id PATCH', e, "Couldn't save this RFI. Please try again.");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(_req, 'RFIs', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    // Verify the RFI belongs to the caller's tenant before touching anything (prevents cross-tenant IDOR)
    const { data: owned } = await db.from('rfis').select('id').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Delete responses first
    await must(db.from('rfi_responses').delete().eq('rfi_id', id), 'rfi_responses delete');
    const { error } = await db.from('rfis').delete().eq('id', id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('rfis/id DELETE', e, "Couldn't delete this RFI. Please try again.");
  }
}
