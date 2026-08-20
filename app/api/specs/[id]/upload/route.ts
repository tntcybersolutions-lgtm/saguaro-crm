import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.file_name || !body.file_url) {
      return NextResponse.json({ error: 'file_name and file_url are required' }, { status: 400 });
    }
    const db = createServerClient();
    const { error } = await db
      .from('specifications')
      .update({
        file_name: body.file_name,
        file_url: body.file_url,
        file_type: body.file_type || '',
        file_size: body.file_size || 0,
        storage_path: body.storage_path || '',
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
