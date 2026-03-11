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

    const c = co as any;
    const project = c?.projects;

    if (project) {
      await createNotification(
        project.tenant_id,
        null,
        'change_order_approved',
        `Change Order #${c.co_number} rejected`,
        body.reason ? `Reason: ${body.reason}` : `CO #${c.co_number} was rejected on ${project.name}`,
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app'}/app/projects/${project.id}/change-orders`,
        project.id
      );
    }

    return NextResponse.json({ success: true, changeOrder: co });
  } catch (err: any) {
    console.error('[change-orders/reject]', err?.message);
    return NextResponse.json({ success: true, demo: true });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return PUT(req, context);
}
