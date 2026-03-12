import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { recentMessages, existingNotes, messageCount, identity } = await req.json();

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
        content: `Recent conversation (${messageCount} total messages):
${(recentMessages as Array<{ role: string; content: string }>).map(m => `${m.role}: ${m.content}`).join('\n')}

Existing notes: ${JSON.stringify(existingNotes)}
Known identity: ${JSON.stringify(identity)}

Generate updated notes about this user.`,
      }
    ],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const notes = JSON.parse(text);
    return Response.json({ notes });
  } catch {
    return Response.json({ notes: existingNotes });
  }
}
