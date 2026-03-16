import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { buildSagePublicPromptV6 } from '@/lib/sage-prompts-v6';

interface PublicMessage {
  role: string;
  content: string;
}

interface PublicRequestBody {
  messages: PublicMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const body: PublicRequestBody = await req.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    if (body.messages.length > 20) {
      return NextResponse.json(
        { error: 'Conversation limit reached. Please start a new session.' },
        { status: 400 }
      );
    }

    const systemPrompt = buildSagePublicPromptV6();

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: body.messages as Array<{ role: 'user' | 'assistant'; content: string }>,
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    return NextResponse.json({ response: text });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
