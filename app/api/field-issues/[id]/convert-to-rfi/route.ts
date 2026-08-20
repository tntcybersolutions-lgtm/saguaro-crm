import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const { data: issue, error: issueError } = await db
      .from('field_issues')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (issueError || !issue) {
      return NextResponse.json({ error: 'Field issue not found' }, { status: 404 });
    }

    const { count } = await db
      .from('rfis')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', issue.project_id)
      .eq('tenant_id', user.tenantId);

    const rfiNumber = `RFI-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data: rfi, error: rfiError } = await db
      .from('rfis')
      .insert({
        tenant_id: user.tenantId,
        project_id: issue.project_id,
        rfi_number: rfiNumber,
        subject: issue.title,
        description: `Converted from Field Issue ${issue.issue_number || id.slice(0, 8)}\n\n${issue.description || ''}`,
        status: 'open',
        priority: issue.priority || 'medium',
        location: issue.location || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (rfiError) return NextResponse.json({ error: rfiError.message }, { status: 500 });

    await db
      .from('field_issues')
      .update({ converted_to_rfi_id: rfi.id, status: 'converted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    return NextResponse.json({ rfi });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
