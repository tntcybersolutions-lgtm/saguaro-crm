import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getPublicSagePrompt } from '@/lib/sage-prompts';

const client = new Anthropic();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: 'Message limit reached. Sign up for a free Saguaro account to keep going — no credit card required.' },
      { status: 429 }
    );
  }

  try {
    const { messages, memoryContext, styleInstructions } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid messages' }, { status: 400 });
    }

    const systemPrompt = [
      getPublicSagePrompt(),
      memoryContext ?? '',
      styleInstructions ?? '',
    ].filter(Boolean).join('\n\n');

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.slice(-20),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Marketing chat error:', error);
    return Response.json({ error: 'Sage is unavailable right now. Please try again.' }, { status: 500 });
  }
}
