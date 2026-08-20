import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const { data: existing, error: fetchErr } = await db
      .from('daily_logs')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Daily log not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft logs can be submitted' }, { status: 400 });
    }

    const { data, error } = await db
      .from('daily_logs')
      .update({
        status: 'submitted',
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;

    // Link any unlinked time entries for this date to this daily log
    if (data?.log_date && data?.project_id) {
      await db
        .from('time_entries')
        .update({ daily_log_id: id })
        .eq('project_id', data.project_id)
        .eq('tenant_id', user.tenantId)
        .eq('work_date', data.log_date)
        .is('daily_log_id', null);
    }

    return NextResponse.json({ success: true, log: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
