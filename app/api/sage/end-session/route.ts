import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import {
  generateSessionSummary,
  updateUserProfile,
  generateProactiveInsights,
} from '@/lib/sage-intelligence-v6';

interface SessionMessage {
  role: string;
  content: string;
}

interface EndSessionBody {
  sessionId: string;
  messages: SessionMessage[];
  sessionStartedAt: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: EndSessionBody = await req.json();

    if (!body.sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    if (body.messages.length < 2) {
      return NextResponse.json({ skipped: true });
    }

    const summary = await generateSessionSummary(
      user.id,
      user.tenantId,
      body.sessionId,
      body.messages
    );

    await updateUserProfile(user.id, summary);

    const supabase = createServerClient();
    const { data: activeProjects } = await supabase
      .from('projects')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .in('status', ['active', 'in_progress'])
      .limit(10);

    await generateProactiveInsights(
      user.id,
      user.tenantId,
      summary,
      activeProjects ?? []
    );

    return NextResponse.json({
      success: true,
      summary: {
        one_line_summary: summary.one_line_summary,
        follow_up_worthy: summary.follow_up_worthy,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
