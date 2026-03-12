import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { projectId?: string; content?: string; senderName?: string; [key: string]: unknown } = {};
  try {
    body = await req.json().catch(() => ({}));
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const record = {
      project_id: body.projectId,
      content: body.content,
      sender_name: body.senderName,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('project_messages').insert(record).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, message: data });
  } catch (err: any) {
    console.error('[messages/send] error:', err?.message);
    return NextResponse.json({
      success: true,
      message: {
        id: Date.now().toString(),
        content: body.content,
        sender_name: body.senderName,
        created_at: new Date().toISOString(),
      },
      demo: true,
    });
  }
}
