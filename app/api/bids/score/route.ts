import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { scoreBidOpportunity, buildBidHistoryContext } from '@/lib/construction-intelligence';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const db = createServerClient();

    const historyContext = await buildBidHistoryContext(db, user?.id || 'demo', body.projectType);
    const result = await scoreBidOpportunity(body, historyContext);

    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json({
      result: { score: 50, reasoning: 'Unable to score at this time.', recommendation: 'BID_WITH_CAUTION', risks: [] }
    });
  }
}
