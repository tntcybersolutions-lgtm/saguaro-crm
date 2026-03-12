import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServerClient();
  const { data: profile } = await db
    .from('user_profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single();

  const fullName = (profile as any)?.full_name;
  const name = fullName || user.email.split('@')[0];

  return NextResponse.json({ id: user.id, email: user.email, name });
}
