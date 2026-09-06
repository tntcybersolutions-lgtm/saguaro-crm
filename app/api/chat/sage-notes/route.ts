import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';

const client = new Anthropic();

/* Generates personalisation notes from a user's own chat history.
 *
 * This is an in-app feature, not a marketing endpoint, but it had no auth
 * guard: anyone could POST arbitrary text and have it billed to the account's
 * Anthropic key. It also destructured the request body without validating it,
 * so a missing recentMessages array threw before the try block and returned a
 * 500 with a stack rather than a 400.
 */

const MAX_MESSAGES = 50;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    recentMessages?: Array<{ role: string; content: string }>;
    existingNotes?: unknown;
    messageCount?: number;
    identity?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  const recentMessages = body.recentMessages;
  if (!Array.isArray(recentMessages) || recentMessages.length === 0) {
    return NextResponse.json({ error: 'recentMessages must be a non-empty array' }, { status: 400 });
  }

  const existingNotes = body.existingNotes ?? [];
  // Cap the transcript so one caller cannot drive an unbounded prompt.
  const transcript = recentMessages.slice(-MAX_MESSAGES);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are analyzing a user's chat patterns to generate brief notes
that will help personalize future AI responses.
Generate 3-5 concise notes (one sentence each) about:
- How they prefer to communicate
- What they're trying to accomplish
- Pain points they've expressed
- What NOT to explain again (they already know it)
- Anything that would help an AI assistant serve them better

Respond ONLY with a JSON array of strings. No other text.
Example: ["User prefers very short answers", "Works mainly in Arizona", "Already understands lien waivers — skip basics"]`,
      messages: [
        {
          role: 'user',
          content: `Recent conversation (${body.messageCount ?? transcript.length} total messages):
${transcript.map((m) => `${m.role}: ${m.content}`).join('\n')}

Existing notes: ${JSON.stringify(existingNotes)}
Known identity: ${JSON.stringify(body.identity ?? {})}

Generate updated notes about this user.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const notes = JSON.parse(text);
    return NextResponse.json({ notes });
  } catch (e: unknown) {
    // A malformed model response is recoverable — keep the notes the caller
    // already had. Anything else is a real failure and should say so.
    if (e instanceof SyntaxError) return NextResponse.json({ notes: existingNotes });
    const message = e instanceof Error ? e.message : 'Internal server error';
    console.error('[chat/sage-notes] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
