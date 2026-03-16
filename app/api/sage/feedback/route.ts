import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { learnFromFeedback } from '@/lib/sage-intelligence-v6';

interface FeedbackBody {
  messageId: string;
  thumbsUp: boolean;
  note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: FeedbackBody = await req.json();

    if (!body.messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    await learnFromFeedback(
      body.messageId,
      body.thumbsUp,
      body.note ?? null,
      user.id
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
