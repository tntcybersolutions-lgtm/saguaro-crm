import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    // Verify ownership
    const { data: payApp } = await db
      .from('pay_applications')
      .select('id, status, project_id, app_number, current_payment_due, pdf_url')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!payApp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const pa = payApp as Record<string, unknown>;

    if (pa.status === 'submitted' || pa.status === 'approved') {
      return NextResponse.json({ error: `Already ${pa.status}` }, { status: 409 });
    }

    // Update status
    const { error } = await db
      .from('pay_applications')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    // Create notification
    try {
      const { data: project } = await db
        .from('projects')
        .select('name, pm_name')
        .eq('id', pa.project_id as string)
        .single();

      const proj = (project || {}) as Record<string, unknown>;
      await db.from('notifications').insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        type: 'pay_app_submitted',
        title: `Pay App #${pa.app_number} Submitted`,
        body: `Application #${pa.app_number} for ${proj.name || 'project'} submitted for $${Math.round(Number(pa.current_payment_due || 0)).toLocaleString()}`,
        link: `/app/projects/${pa.project_id}/pay-apps`,
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true, status: 'submitted' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
