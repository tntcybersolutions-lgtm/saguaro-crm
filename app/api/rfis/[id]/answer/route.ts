import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { onRFIAnswered } from '@/lib/triggers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const db = createServerClient();
    const { error } = await db
      .from('rfis')
      .update({
        answer: body.answer || '',
        answered_by: body.answered_by || user.email || '',
        status: 'answered',
        answered_at: new Date().toISOString(),
        answered_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    onRFIAnswered(id).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[rfis/answer] error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
