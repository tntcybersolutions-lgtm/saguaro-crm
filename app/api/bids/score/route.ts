import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { scoreBidOpportunity, buildBidHistoryContext } from '@/lib/construction-intelligence';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();

    // Support both old format {projectName, estValue, trade, location, targetMargin}
    // and new format {projectName, projectType, location, estimatedValue}
    const normalized = {
      projectName: body.projectName || 'Untitled Project',
      projectType: body.projectType || body.trade || 'commercial',
      location: body.location || 'Phoenix, AZ',
      estimatedValue: body.estimatedValue || body.estValue || 0,
      trade: body.trade,
      dueDate: body.dueDate,
      ownerName: body.ownerName,
    };

    const historyContext = await buildBidHistoryContext(db, user.tenantId, normalized.projectType);
    const result = await scoreBidOpportunity(normalized, historyContext);

    // Calculate suggested margin from score (higher score = higher suggested margin)
    const suggestedMargin = body.targetMargin
      ? parseFloat(body.targetMargin) + (result.score > 70 ? 1.5 : result.score < 40 ? -2 : 0)
      : Math.round((result.score / 100) * 15 + 5);

    // Return both flattened (for dashboard modal) and nested (for bids page)
    return NextResponse.json({
      ...result,
      suggestedMargin: Math.round(suggestedMargin * 10) / 10,
      result: {
        ...result,
        suggestedMargin: Math.round(suggestedMargin * 10) / 10,
      },
    });
  } catch (err: any) {
    const fallback = {
      score: 55,
      reasoning: 'Unable to reach AI scoring engine. This is a neutral score — evaluate the bid on its own merits.',
      recommendation: 'BID_WITH_CAUTION',
      risks: ['Verify all project details before bidding', 'Confirm owner references'],
      suggestedMargin: 8.5,
    };
    return NextResponse.json({ ...fallback, result: fallback });
  }
}
