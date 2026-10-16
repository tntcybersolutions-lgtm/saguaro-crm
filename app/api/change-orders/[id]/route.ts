import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError, apiFail } from '@/lib/api-error';
import { applyChangeOrderMoney } from '@/lib/change-order-cascade';

const ALLOWED_CO_COLUMNS = [
  'project_id', 'title', 'description', 'amount', 'status', 'reason', 'submitted_by', 'co_number',
  'schedule_impact', 'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason',
  'submitted_at', 'rejected_reason', 'line_items', 'schedule_impact_days', 'revised_completion_date',
  'scope_of_change', 'work_included', 'work_excluded', 'pay_application_id', 'original_bid_package_id',
  'pdf_url', 'pdf_generated_at', 'pdf_version', 'contractor_signature', 'contractor_signed_at',
  'owner_signature', 'owner_signed_at', 'architect_signature', 'architect_signed_at', 'notes',
  'change_type', 'original_co_amount', 'markup_overhead_pct', 'markup_profit_pct', 'subtrade_amount',
  'subtrade_markup_pct', 'materials_amount', 'labor_amount', 'equipment_amount', 'overhead_amount',
  'profit_amount', 'related_rfi_id', 'related_submittal_id', 'related_bid_package_id', 'billable_to',
  'contract_reference', 'drawing_revision', 'specification_revision', 'owner_approval_required',
  'architect_approval_required', 'ai_generated', 'ai_draft_narrative', 'ai_pricing_source',
  'html_content', 'owner_approval_token', 'owner_approval_notes', 'sent_to_owner_at',
  'owner_actioned_at', 'owner_email', 'qbo_synced_at', 'updated_at',
];

function filterCoBody(body: Record<string, any>): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const k of ALLOWED_CO_COLUMNS) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  return updates;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Authenticate + tenant-scope the read — service-role bypasses RLS, so an
    // id-only read would leak another tenant's change order.
    const g = await requirePermission(_req, 'Change Orders', 'View');
    if (!g.ok) return g.res;
    const user = g.user;
    const db = createServerClient();
    const { data, error } = await db.from('change_orders').select('*').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (error) throw error;
    // Someone else's (or a deleted) change order is "not found"; a real failure is logged, not hidden as a 404.
    if (!data) return apiFail('Change order not found', 404);
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('change-orders/id GET', e, "Couldn't load this change order. Please try again.");
  }
}

/** PUT and PATCH write the same allow-listed columns. A write that changes
 *  the status, or the amount of an approved CO, moves the contract and the
 *  budget (lib/change-order-cascade) — this editor used to set
 *  status: 'approved' with no cascade at all. Deciding a CO (approved /
 *  rejected) takes the same Full permission as /approve and /reject. */
async function writeChangeOrder(req: NextRequest, id: string, scope: string) {
  const g = await requirePermission(req, 'Change Orders', 'Edit');
  if (!g.ok) return g.res;
  try {
    const body = await req.json();
    const db = g.db;
    const updates = filterCoBody(body);
    if (typeof updates.status === 'string') {
      updates.status = String(updates.status).toLowerCase();
      if (updates.status === 'approved' || updates.status === 'rejected') {
        const full = await requirePermission(req, 'Change Orders', 'Full');
        if (!full.ok) return full.res;
      }
    }
    const { data: before, error: bErr } = await db.from('change_orders').select('*')
      .eq('id', id).eq('tenant_id', g.user.tenantId).maybeSingle();
    if (bErr) throw bErr;
    if (!before) return apiFail('Change order not found', 404);
    // Tenant-scope the write — g.db is the service-role client (RLS bypassed).
    const { data, error } = await db.from('change_orders').update(updates).eq('id', id).eq('tenant_id', g.user.tenantId).select().single();
    if (error) throw error;
    await applyChangeOrderMoney(db, g.user.tenantId, before as never, data as never);
    return NextResponse.json({ changeOrder: data });
  } catch (e) {
    return apiError(scope, e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return writeChangeOrder(req, id, 'change-orders/[id] PUT');
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return writeChangeOrder(req, id, 'change-orders/[id] PATCH');
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(_req, 'Change Orders', 'Full');
  if (!g.ok) return g.res;
  const { id } = await params;
  try {
    const db = g.db;
    // Verify tenant ownership before deleting anything (service-role bypasses RLS).
    const { data: owned } = await db.from('change_orders').select('*').eq('id', id).eq('tenant_id', g.user.tenantId).single();
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Delete line items first (tenant-scoped)
    await must(db.from('change_order_line_items').delete().eq('change_order_id', id).eq('tenant_id', g.user.tenantId), 'change_order_line_items delete');
    const { error } = await db.from('change_orders').delete().eq('id', id).eq('tenant_id', g.user.tenantId);
    if (error) throw error;
    // Deleting an approved CO takes it off the contract and the budget.
    await applyChangeOrderMoney(db, g.user.tenantId, owned as never, null);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('change-orders/[id] DELETE', e);
  }
}
