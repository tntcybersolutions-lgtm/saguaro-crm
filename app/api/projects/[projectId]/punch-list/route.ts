import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId } = await params;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from('punch_list_items')
      .select('*')
      .eq('project_id', projectId)
      .neq('trade', 'delivery')   // exclude delivery logs stored in same table
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ items: data || [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
