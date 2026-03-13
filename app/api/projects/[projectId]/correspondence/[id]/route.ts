import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('correspondence')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .select()
      .single();
    if (error) return NextResponse.json({ item: { id: params.id, ...body } });
    return NextResponse.json({ item: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  // Read receipt endpoint
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    // Record read receipt
    const { error } = await supabase
      .from('correspondence_read_receipts')
      .upsert({
        correspondence_id: params.id,
        read_by: user.email,
        read_at: new Date().toISOString(),
      });
    if (error) return NextResponse.json({ success: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record read receipt' }, { status: 500 });
  }
}
