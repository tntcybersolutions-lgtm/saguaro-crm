import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { metaFor, pickAmount, itemLabel, moduleLabel, type EntityMeta } from '@/lib/approvals';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { applyChangeOrderMoney } from '@/lib/change-order-cascade';
import { onChangeOrderApproved, onPayAppApproved } from '@/lib/triggers';
import { runInBackground } from '@/lib/background';

export const dynamic = 'force-dynamic';

interface Body {
  entityType?: string;
  entityId?: string;
  decision?: 'approved' | 'rejected';
  note?: string;
}

/**
 * POST /api/approvals/decision
 * Records a real approve/reject decision against a real entity.
 *
 * Multi-step aware: if an active workflow exists for the module, the
 * request advances one step per approval and only flips the underlying
 * entity to 'approved' on the FINAL step. Reject is terminal immediately.
 *
 * Always executes the real side effect (the entity status change). The
 * approval_decisions audit row and approval_requests progress row are
 * written best-effort so the route still works if the migration that
 * adds them / their columns has not yet been applied.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Body;
    const meta = metaFor(body.entityType);
    if (!meta || !body.entityId || (body.decision !== 'approved' && body.decision !== 'rejected')) {
      return NextResponse.json({ error: 'entityType, entityId and decision are required' }, { status: 400 });
    }
    const decision = body.decision;
    const note = (body.note || '').trim();
    const db = createServerClient();

    // Load the real entity (tenant-scoped — prevents cross-tenant action).
    const { data: entity, error: entErr } = await db
      .from(meta.table)
      .select(meta.selectCols.join(','))
      .eq('id', body.entityId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (entErr || !entity) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    const row = entity as unknown as Record<string, unknown>;
    const amount = pickAmount(meta, row);

    // How many approval steps actually apply to this amount?
    let totalSteps = 1;
    let workflowId: string | null = null;
    let workflowName: string | null = null;
    try {
      const { data: wf } = await db
        .from('approval_workflows')
        .select('id, name, steps')
        .eq('tenant_id', user.tenantId)
        .eq('module', meta.entityType)
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (wf) {
        workflowId = String((wf as Record<string, unknown>).id);
        workflowName = String((wf as Record<string, unknown>).name);
        const steps = Array.isArray((wf as Record<string, unknown>).steps)
          ? ((wf as Record<string, unknown>).steps as Array<Record<string, unknown>>) : [];
        const applicable = steps.filter((s) => {
          const min = s.conditionalMinAmount;
          return min === null || min === undefined || amount >= Number(min);
        });
        totalSteps = Math.max(1, applicable.length);
      }
    } catch { /* workflow optional */ }

    // Best-effort: read any existing tracked request row for this entity.
    let prevStep = 0;
    let requestId: string | null = null;
    let trackable = true;
    try {
      const { data: existing } = await db
        .from('approval_requests')
        .select('id, current_step, total_steps, status')
        .eq('tenant_id', user.tenantId)
        .eq('entity_type', meta.entityType)
        .eq('entity_id', body.entityId)
        .maybeSingle();
      if (existing) {
        requestId = String((existing as Record<string, unknown>).id);
        prevStep = Number((existing as Record<string, unknown>).current_step ?? 0);
        const ts = Number((existing as Record<string, unknown>).total_steps ?? 0);
        if (ts > 0) totalSteps = ts;
      }
    } catch {
      // entity_type/entity_id columns not present yet → can't track multi-step.
      trackable = false;
    }

    const newStep = prevStep + 1;
    // Final when rejecting, when we can't persist progress, or when we've
    // reached the last applicable step.
    const isFinal = decision === 'rejected' || !trackable || newStep >= totalSteps;

    // ---- REAL side effect: update the underlying entity status ----
    let entityUpdated = false;
    if (isFinal) {
      const patch: Record<string, unknown> = { status: decision };
      const nowIso = new Date().toISOString();
      if (decision === 'approved') {
        patch.approved_at = nowIso;
      } else if (decision === 'rejected' && meta.hasRejectedAt) {
        patch.rejected_at = nowIso;
      }
      /* A decision here is the same decision as the module's own Approve /
         Reject, so it carries the same consequences. It used to flip the
         status and stop: an approved change order never reached the contract
         or the budget, and an approved pay application filed no lien waivers. */
      let coBefore: Record<string, unknown> | null = null;
      if (meta.table === 'change_orders') {
        const { data: full, error: fErr } = await db.from('change_orders').select('*')
          .eq('id', body.entityId).eq('tenant_id', user.tenantId).maybeSingle();
        if (fErr) throw fErr;
        coBefore = (full as Record<string, unknown> | null) ?? null;
      }
      const { data: updatedRow, error: upErr } = await db
        .from(meta.table)
        .update(patch)
        .eq('id', body.entityId)
        .eq('tenant_id', user.tenantId)
        .select('*')
        .maybeSingle();
      if (upErr) {
        return NextResponse.json({ error: 'Failed to update item status' }, { status: 500 });
      }
      entityUpdated = true;
      const wasApproved = String(row.status || '').toLowerCase() === 'approved';
      if (meta.table === 'change_orders' && coBefore && updatedRow) {
        await applyChangeOrderMoney(db, user.tenantId, coBefore as never, updatedRow as never);
        if (decision === 'approved' && !wasApproved) {
          runInBackground(onChangeOrderApproved(body.entityId, { money: false }), 'onChangeOrderApproved');
        }
      }
      if (meta.table === 'pay_applications' && decision === 'approved' && !wasApproved) {
        runInBackground(onPayAppApproved(body.entityId), 'onPayAppApproved');
      }
    }

    // ---- Audit row (best-effort) ----
    let decisionRecorded = false;
    try {
      const { error: decErr } = await db.from('approval_decisions').insert({
        tenant_id: user.tenantId,
        request_id: requestId,
        entity_type: meta.entityType,
        entity_id: body.entityId,
        step: newStep,
        decision,
        decided_by: user.email || user.id,
        note: note || null,
      } as never);
      if (!decErr) decisionRecorded = true;
    } catch { /* approval_decisions table optional pre-migration */ }

    // ---- Progress row (best-effort) ----
    if (trackable) {
      try {
        const historyEntry = {
          step: newStep, decision, by: user.email || user.id,
          note: note || null, at: new Date().toISOString(),
        };
        const reqStatus = isFinal ? decision : 'pending';
        if (requestId) {
          await must(db.from('approval_requests')
            .update({ current_step: newStep, status: reqStatus } as never)
            .eq('id', requestId)
            .eq('tenant_id', user.tenantId), 'approval_requests write');
        } else {
          await must(db.from('approval_requests').insert({
            tenant_id: user.tenantId,
            workflow_id: workflowId,
            workflow_name: workflowName,
            module: meta.entityType,
            entity_type: meta.entityType,
            entity_id: body.entityId,
            project_id: (row.project_id as string | null) ?? null,
            item_name: itemLabel(meta, row),
            item_amount: amount,
            requested_by: meta.requesterCol ? ((row[meta.requesterCol] as string | null) ?? null) : null,
            current_step: newStep,
            total_steps: totalSteps,
            status: reqStatus,
            history: [historyEntry],
          } as never), 'approval_requests insert');
        }
      } catch { /* progress tracking optional */ }
    }

    return NextResponse.json({
      success: true,
      decision,
      module: moduleLabel(meta.entityType),
      entityType: meta.entityType,
      entityId: body.entityId,
      step: newStep,
      totalSteps,
      final: isFinal,
      entityUpdated,
      decisionRecorded,
    });
  } catch (e) {
    return apiError('approvals/decision POST', e);
  }
}
