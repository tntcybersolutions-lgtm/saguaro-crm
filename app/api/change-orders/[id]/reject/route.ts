import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const db = createServerClient();

    const { data: co, error } = await db
      .from('change_orders')
      .update({
        status: 'rejected',
        rejected_by: user?.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: body.reason || null,
      })
      .eq('id', id)
      .select('*, projects(*)')
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
    const msg = 'Internal server error';
    console.error('[change-orders/reject]', msg);
    return NextResponse.json({ error: `Failed to reject change order: ${msg}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return PUT(req, context);
}
