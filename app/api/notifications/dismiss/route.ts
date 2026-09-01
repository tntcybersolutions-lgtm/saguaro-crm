import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createServerClient();
  const { error } = await db
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('tenant_id', user.tenantId);

  if (error) return apiError('notifications/dismiss', error, undefined, 500);
  return NextResponse.json({ ok: true });
}
