import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;

  try {
    const db = createServerClient();

    // Try project_messages first
    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      return NextResponse.json({ messages: data });
    }

    // Fallback to messages table
    const { data: data2, error: error2 } = await db
      .from('messages')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error2) throw error2;
    return NextResponse.json({ messages: data2 || [] });
  } catch (err: unknown) {
    return apiError('projects/[projectId]/messages GET', err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { projectId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const row = {
    tenant_id: user.tenantId,
    project_id: projectId,
    sender_name: body.sender_name || body.senderName || user.email || 'Field User',
    content: body.content || body.message || '',
    is_system: false,
    metadata: body.metadata || null,
  };

  try {
    const db = createServerClient();

    // Try project_messages first
    const { data, error } = await db
      .from('messages')
      .insert(row as unknown as Database['public']['Tables']['messages']['Insert'])
      .select()
      .single();

    if (!error) {
      return NextResponse.json({ success: true, message: data });
    }

    // Fallback to messages table
    const { data: data2, error: error2 } = await db
      .from('messages')
      .insert(row as unknown as Database['public']['Tables']['messages']['Insert'])
      .select()
      .single();

    if (error2) throw error2;
    return NextResponse.json({ success: true, message: data2 });
  } catch (err: unknown) {
    return apiError('projects/[projectId]/messages POST', err);
  }
}
