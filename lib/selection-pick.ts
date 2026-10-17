/**
 * lib/selection-pick.ts — the client chooses a finish in the client portal.
 *
 * A selection (public.selections) is one decision on the job — "Kitchen
 * faucet", allowance $450. The GC offers options for it (public.
 * selection_options, selection_id = the selection): a name, a price, a photo.
 * The client picks one in the portal, or approves the item as the GC specified
 * it when there are no options.
 *
 * Picking records the choice on the selection (price, product, photo, who and
 * when, owner approved). When the price is over the allowance, the difference
 * becomes a change order, approved by the client in the act of choosing (they
 * are shown the amount before they confirm), and the change order cascade runs
 * (lib/triggers onChangeOrderApproved: contract sum, prime contract, budget).
 * The GC's team is notified either way.
 *
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 */
import { recordHref } from '@/lib/record-links';
import { nextCoNumber } from '@/lib/change-order-number';
import { onChangeOrderApproved } from '@/lib/triggers';
import { createNotification } from '@/lib/notifications';
import { optionPrice, overAllowance, type OptionRow } from '@/lib/selection-math';

export type PickResult =
  | { ok: true; selection: Record<string, unknown>; price: number; overage: number; changeOrder: { id: string; co_number: number; amount: number } | null }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Record the client's choice. `optionId` null = approve the item as specified
 * (its current selected_amount). `pickedBy` is the client's name or email.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickSelection(db: any, args: {
  tenantId: string; projectId: string; selectionId: string; optionId: string | null; pickedBy: string; notes?: string | null;
}): Promise<PickResult> {
  const { tenantId, projectId, selectionId, optionId, pickedBy } = args;
  const { data: sel, error: sErr } = await db
    .from('selections')
    .select('*')
    .eq('id', selectionId)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!sel) return { ok: false, status: 404, error: 'Selection not found' };
  if (String(sel.status || 'pending').toLowerCase() !== 'pending') {
    return { ok: false, status: 409, error: 'This choice has already been made. Ask your contractor to reopen it.' };
  }

  let option: OptionRow | null = null;
  if (optionId) {
    const { data: opt, error: oErr } = await db
      .from('selection_options')
      .select('*')
      .eq('id', optionId)
      .eq('selection_id', selectionId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!opt) return { ok: false, status: 404, error: 'That option is no longer offered' };
    option = opt as OptionRow;
  }

  const price = option ? optionPrice(option) : Number(sel.selected_amount) || 0;
  const overage = overAllowance(sel.allowance, price);
  const now = new Date().toISOString();
  const note = [option ? `Chosen: ${option.name}` : 'Approved as specified', args.notes?.trim() || null].filter(Boolean).join(' — ');

  const patch: Record<string, unknown> = {
    status: 'selected',
    owner_approved: true,
    selected_by: pickedBy,
    selected_at: now,
    selected_amount: price,
    variance: Math.round(((Number(sel.allowance) || 0) - price) * 100) / 100,
    notes: [sel.notes, note].filter(Boolean).join('\n'),
    updated_at: now,
  };
  if (option) {
    Object.assign(patch, {
      manufacturer: option.manufacturer || sel.manufacturer || null,
      model: option.model_number || sel.model || null,
      color: option.color || sel.color || null,
      finish: option.finish || sel.finish || null,
      photo_url: option.image_url || sel.photo_url || null,
      link: option.spec_url || sel.link || null,
    });
  }
  // Only the pending row we read — two taps (or two people) can't both win.
  let write = db.from('selections').update(patch).eq('id', selectionId).eq('tenant_id', tenantId);
  write = sel.status == null ? write.is('status', null) : write.eq('status', sel.status);
  const { data: updated, error: uErr } = await write.select().maybeSingle();
  if (uErr) throw uErr;
  if (!updated) return { ok: false, status: 409, error: 'This choice has already been made. Ask your contractor to reopen it.' };

  const itemName = String(sel.item_name || 'Selection');
  const choice = option ? option.name : 'as specified';
  let changeOrder: { id: string; co_number: number; amount: number } | null = null;
  if (overage > 0) {
    const coNumber = await nextCoNumber(db, tenantId, projectId);
    const { data: co, error: coErr } = await db
      .from('change_orders')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        co_number: coNumber,
        title: `Selection upgrade — ${itemName}: ${choice}`,
        description: `${pickedBy} chose ${choice} for ${itemName} in the client portal at ${fmtMoney(price)}, ${fmtMoney(overage)} over the ${fmtMoney(Number(sel.allowance) || 0)} allowance.`,
        reason: 'Owner selection over allowance',
        change_type: 'selection',
        initiated_by: 'owner',
        status: 'approved',
        amount: overage,
        cost_impact: overage,
        approved_by: pickedBy,
        approved_at: now,
        owner_signed_at: now,
        owner_actioned_at: now,
        submitted_at: now,
        owner_approval_notes: `Approved in the client portal when choosing ${choice}.`,
      })
      .select('id, co_number')
      .single();
    if (coErr) throw coErr;
    changeOrder = { id: String(co.id), co_number: Number(co.co_number), amount: overage };
    // Contract sum, prime contract and budget move the way every approved CO moves them.
    await onChangeOrderApproved(changeOrder.id);
  }

  await createNotification(
    tenantId,
    null,
    'selection_chosen',
    `${pickedBy} chose ${choice} for ${itemName}`,
    changeOrder
      ? `${fmtMoney(price)} — ${fmtMoney(overage)} over the allowance. Change order #${changeOrder.co_number} for ${fmtMoney(overage)} was added, approved by the client.`
      : `${fmtMoney(price)}${Number(sel.allowance) > 0 ? ` — ${fmtMoney(-overage)} under the allowance` : ''}.`,
    changeOrder ? recordHref('change_orders', projectId, changeOrder.id) : `/app/projects/${projectId}/selections`,
    projectId,
  );

  return { ok: true, selection: updated as Record<string, unknown>, price, overage, changeOrder };
}

function fmtMoney(n: number): string {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
