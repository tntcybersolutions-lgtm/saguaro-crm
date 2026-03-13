import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .eq('bid_package_id', params.id)
      .order('total_amount');
    if (error) return NextResponse.json({ bids: [] });
    return NextResponse.json({ bids: data || [] });
  } catch {
    return NextResponse.json({ bids: [] });
  }
}
