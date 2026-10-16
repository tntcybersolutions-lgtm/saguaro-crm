import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createNotification } from '@/lib/notifications';
import { apiError } from '@/lib/api-error';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = g.user;
    const body = await req.json().catch(() => ({}));
    const db = g.db;

    const { data: co, error } = await db
      .from('change_orders')
      .update({
        status: 'rejected',
        rejected_by: user?.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: body.reason || null,
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      // change_orders has two identical FKs to projects; name the *_fkey one (see lib/db-embeds).
      .select('*, projects!change_orders_project_id_fkey(*)')
      .single();

    if (error) throw error;

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
