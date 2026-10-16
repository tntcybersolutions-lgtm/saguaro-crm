import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { buildSagePublicPromptV6 } from '@/lib/sage-prompts-v6';
import { publicAiLimiter } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';

interface PublicMessage {
  role: string;
  content: string;
}

interface PublicRequestBody {
  messages: PublicMessage[];
}

export async function POST(req: NextRequest) {
  const limited = publicAiLimiter.check(req);
  if (limited) return limited;

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

    // Honest fallback — never a silent failure or a fake canned answer.
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        response:
          "Sage's reasoning engine isn't configured yet on this server (missing ANTHROPIC_API_KEY). An administrator needs to add the key before Sage can respond.",
      });
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
  } catch (e) {
    return apiError('sage/public POST', e);
  }
}
