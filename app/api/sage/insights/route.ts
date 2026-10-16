import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

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

    // sage_proactive_insights has no user_id/delivered/dismissed/priority columns:
    // the owning user and numeric priority live in metadata, and pending vs dismissed
    // is tracked via status. Scope by tenant + metadata user, surface pending insights.
    const supabase = createServerClient();
    const { data } = await supabase
      .from('sage_proactive_insights')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('metadata->>user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({ insights: data ?? [] });
  } catch (e) {
    return apiError('sage/insights GET', e);
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

    // No dismissed/user_id columns: collapse dismissal into status + dismissed_at,
    // and scope ownership via tenant + metadata user.
    const supabase = createServerClient();
    await must(supabase
      .from('sage_proactive_insights')
      .update({
        status: body.dismissed ? 'dismissed' : 'pending',
        dismissed_at: body.dismissed ? new Date().toISOString() : null,
      })
      .eq('id', body.insightId)
      .eq('tenant_id', user.tenantId)
      .eq('metadata->>user_id', user.id), 'sage_proactive_insights write');

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('sage/insights POST', e);
  }
}
