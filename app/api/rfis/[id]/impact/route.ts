import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      schedule_impact_days,
      cost_impact,
      cost_impact_direction,
      impact_description,
      create_change_order,
      co_amount,
    } = body;

    if (cost_impact > 0 && !impact_description) {
      return NextResponse.json({ error: 'impact_description is required when cost_impact > 0' }, { status: 400 });
    }

    const db = createServerClient();

    // Verify RFI belongs to tenant
    const { data: rfi, error: rfiErr } = await db
      .from('rfis')
      .select('id, project_id, rfi_number, subject')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (rfiErr || !rfi) {
      return NextResponse.json({ error: 'RFI not found' }, { status: 404 });
    }

    // Update RFI with impact data
    const { data: updatedRfi, error: updateErr } = await db.from('rfis').update({
      schedule_impact_days: schedule_impact_days ?? 0,
      cost_impact: cost_impact ?? 0,
      cost_impact_direction: cost_impact_direction || 'none',
      impact_description: impact_description || null,
      last_activity_at: new Date().toISOString(),
      last_activity_type: 'impact_updated',
    })
    .eq('id', id)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();

    if (updateErr) throw updateErr;

    let changeOrder = null;

    if (create_change_order) {
      // Get next CO number
      const { data: maxCo } = await db
        .from('change_orders')
        .select('co_number')
        .eq('project_id', rfi.project_id)
        .eq('tenant_id', user.tenantId)
        .order('co_number', { ascending: false })
        .limit(1);

      const nextCoNumber = ((maxCo?.[0]?.co_number as number) || 0) + 1;
      const coAmt = co_amount ?? cost_impact ?? 0;

      const { data: newCo, error: coErr } = await db.from('change_orders').insert({
        project_id: rfi.project_id,
        tenant_id: user.tenantId,
        co_number: nextCoNumber,
        title: `RFI #${rfi.rfi_number || ''} — ${rfi.subject}`,
        description: impact_description || rfi.subject,
        amount: coAmt,
        status: 'draft',
        reason: 'rfi_directive',
        related_rfi_id: id,
        schedule_impact_days: schedule_impact_days ?? 0,
        change_type: coAmt > 0 ? 'additive' : coAmt < 0 ? 'deductive' : 'no_cost',
        submitted_by: user.id,
        notes: 'Auto-generated from RFI impact analysis',
      }).select().single();

      if (coErr) throw coErr;
      changeOrder = newCo;

      // Link CO back to RFI
      await db.from('rfis').update({ linked_co_id: newCo.id })
        .eq('id', id)
        .eq('tenant_id', user.tenantId);

      // Create notification
      await db.from('notifications').insert({
        tenant_id: user.tenantId,
        type: 'rfi_co_created',
        title: `Change Order #${nextCoNumber} created from RFI #${rfi.rfi_number || ''}`,
        body: `${rfi.subject} — $${coAmt.toLocaleString()}`,
        link: `/app/projects/${rfi.project_id}/change-orders`,
        project_id: rfi.project_id,
        metadata: { rfi_id: id, co_id: newCo.id },
        priority: 'high',
      });
    }

    return NextResponse.json({ rfi: updatedRfi, change_order: changeOrder });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
