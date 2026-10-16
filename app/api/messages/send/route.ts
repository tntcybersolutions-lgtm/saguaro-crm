import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const row = {
    tenant_id: user.tenantId,
    project_id: (body.project_id || body.projectId) as string | undefined,
    sender_name: (body.sender_name || body.senderName || user.email || 'Field User') as string,
    content: (body.content || body.message || '') as string,
    message_type: (body.message_type as string) || 'message',
  } satisfies Database['public']['Tables']['messages']['Insert'];

  try {
    const db = createServerClient();

    // Try project_messages first
    const { data, error } = await db
      .from('messages')
      .insert(row)
      .select()
      .single();

    if (!error) {
      return NextResponse.json({ success: true, message: data });
    }

    // Fallback to messages table
    const { data: data2, error: error2 } = await db
      .from('messages')
      .insert(row)
      .select()
      .single();

    if (error2) throw error2;
    return NextResponse.json({ success: true, message: data2 });
  } catch (err: unknown) {
    return apiError('messages/send POST', err);
  }
}
