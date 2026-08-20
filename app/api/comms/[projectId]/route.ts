import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') || 'all';

  try {
    let query = db
      .from('sub_communications')
      .select('*, sub_messages(count)')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false });

    if (filter === 'awaiting') query = query.eq('status', 'awaiting_response');
    else if (filter === 'closed') query = query.eq('status', 'closed');

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const body = await req.json();

  if (!body.subject) return NextResponse.json({ error: 'Missing required field: subject' }, { status: 400 });

  try {
    const { data, error } = await db
      .from('sub_communications')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        subject: body.subject,
        thread_type: body.thread_type || 'general',
        sub_company: body.sub_company || '',
        sub_contact: body.sub_contact || '',
        priority: body.priority || 'normal',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
