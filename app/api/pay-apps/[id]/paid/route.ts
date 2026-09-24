import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

/** Mark a pay app PAID — with the two links the old route dropped:
 *  1. GATE: unsigned conditional waivers that block payment stop the action
 *     (override with body.overrideWaivers = true, which is returned in the result).
 *  2. CASCADE: payment converts the period's waiver obligation — unconditional
 *     partial waivers are generated for every sub whose conditional was signed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  try {
    const db = g.db;
    const body = await req.json().catch(() => ({} as { overrideWaivers?: boolean }));

    // ── Waiver gate ──
    const { data: waivers } = await db
      .from('lien_waivers')
      .select('id, sub_id, status, amount, blocks_payment, claimant_name, company_name')
      .eq('pay_application_id', id)
      .eq('tenant_id', user.tenantId);
    const blocking = (waivers || []).filter(
      (w: { status: string | null; blocks_payment: boolean | null }) =>
        w.blocks_payment !== false && (w.status === 'pending' || w.status === 'sent'),
    );
    if (blocking.length > 0 && !body.overrideWaivers) {
      return NextResponse.json({
        error: `Payment hold — ${blocking.length} lien waiver${blocking.length === 1 ? '' : 's'} not signed yet.`,
        waiverBlock: true,
        pending: blocking.map((w: { company_name: string | null; claimant_name: string | null; amount: number | null }) => ({
          name: w.company_name || w.claimant_name || 'Sub', amount: w.amount,
        })),
      }, { status: 409 });
    }

    const { data: pa, error } = await db
      .from('pay_applications')
      .update({ status: 'paid', payment_received_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, project_id, app_number, period_to, current_payment_due')
      .single();
    if (error) throw error;

    // ── Payment cascade (1): the prime contract's paid_amount tracks reality ──
    const paDue = Number((pa as { current_payment_due: number | null }).current_payment_due) || 0;
    if (paDue > 0) {
      // paid_amount exists in the LIVE schema (migration 017) — the generated
      // types predate it, hence the unknown casts.
      const { data: prime } = await db
        .from('contracts')
        .select('id, paid_amount, invoiced_amount')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', (pa as { project_id: string }).project_id)
        .eq('contract_type', 'prime')
        .limit(1)
        .maybeSingle();
      if (prime) {
        const p = prime as unknown as { id: string; paid_amount: number | null };
        await must(db.from('contracts')
          .update({ paid_amount: (p.paid_amount || 0) + paDue } as never)
          .eq('tenant_id', user.tenantId)
          .eq('id', p.id), 'contracts write');
      }
    }

    // ── Payment cascade (2): signed conditionals convert to unconditional partials ──
    const signed = (waivers || []).filter((w: { status: string | null }) => w.status === 'signed');
    for (const w of signed as { id: string; sub_id: string | null; amount: number | null }[]) {
      await must(db.from('lien_waivers').insert({
        tenant_id: user.tenantId,
        project_id: (pa as { project_id: string }).project_id,
        sub_id: w.sub_id,
        pay_application_id: id,
        waiver_type: 'unconditional_progress',
        amount: w.amount || 0,
        through_date: (pa as { period_to: string | null }).period_to,
        status: 'pending',
        converted_from_id: w.id,
      } as never), 'lien_waivers insert');
    }

    return NextResponse.json({
      success: true,
      unconditionalWaivers: signed.length,
      overrode: blocking.length > 0 && !!body.overrideWaivers,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
