import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';

interface DismissBody {
  insightId: string;
  dismissed: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data } = await supabase
      .from('sage_proactive_insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('delivered', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .limit(10);

    return NextResponse.json({ insights: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: DismissBody = await req.json();

    if (!body.insightId) {
      return NextResponse.json({ error: 'insightId is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    await supabase
      .from('sage_proactive_insights')
      .update({ dismissed: body.dismissed })
      .eq('id', body.insightId)
      .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
