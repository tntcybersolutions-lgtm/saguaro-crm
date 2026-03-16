import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import {
  loadFullIntelligence,
  generatePersonalizedGreeting,
  buildSuggestionChips,
} from '@/lib/sage-intelligence-v6';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const pageContext = searchParams.get('pageContext') ?? 'dashboard';

    const intelligence = await loadFullIntelligence(user.id, user.tenantId);

    const greeting = await generatePersonalizedGreeting(
      user.id,
      user.tenantId,
      intelligence
    );

    const chips = buildSuggestionChips(intelligence, pageContext);

    return NextResponse.json({
      greeting,
      chips,
      pendingInsightsCount: intelligence.pendingInsights.length,
      relationshipDepth: intelligence.relationshipDepth,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
