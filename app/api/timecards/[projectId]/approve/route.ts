import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();

  if (!body.entry_ids || !Array.isArray(body.entry_ids) || body.entry_ids.length === 0) {
    return NextResponse.json({ error: 'Missing required field: entry_ids' }, { status: 400 });
  }

  const db = createServerClient();
  const newStatus = body.approved === false ? 'rejected' : 'approved';

  try {
    let approvedCount = 0;
    for (const entryId of body.entry_ids) {
      const { error } = await db
        .from('time_entries')
        .update({
          status: newStatus,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entryId)
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .eq('status', 'pending');

      if (!error) approvedCount++;
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      approved_count: approvedCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
