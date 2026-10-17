import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { apiError } from '@/lib/api-error';
import { writeChangeOrder, coWriteFailure } from '@/lib/change-order-status';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = g.user;
    const body = await req.json().catch(() => ({}));
    const db = g.db;

    const { data: before, error: bErr } = await db.from('change_orders').select('*')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (bErr) throw bErr;
    if (!before) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

    /* Rejecting a CO that was approved takes it back off the contract and the
       budget — the one shared step (lib/change-order-status). */
    // change_orders has two identical FKs to projects; name the *_fkey one (see lib/db-embeds).
    const w = await writeChangeOrder(db, user.tenantId, id, { status: 'rejected', rejection_reason: body.reason || null },
      { actorId: user.id, before: before as Record<string, unknown>, select: '*, projects!change_orders_project_id_fkey(*)' });
    if (!w.ok) { const f = coWriteFailure(w); return NextResponse.json(f.body, { status: f.status }); }
    const co = w.after;

    const c = co as Record<string, unknown>;
    const project = c?.projects as Record<string, unknown> | undefined;

    if (project) {
      await createNotification(
        String(project.tenant_id ?? ''),
        null,
        'change_order_approved',
        `Change Order #${c.co_number} rejected`,
        body.reason ? `Reason: ${body.reason}` : `CO #${c.co_number} was rejected on ${String(project.name ?? '')}`,
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'}/app/projects/${String(project.id ?? '')}/change-orders`,
        String(project.id ?? '')
      );
    }

    return NextResponse.json({ success: true, changeOrder: co });
  } catch (err: unknown) {
    return apiError('change-orders/[id]/reject PUT', err);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return PUT(req, context);
}
