import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getPublicSagePrompt } from '@/lib/sage-prompts';
import { isSageEngineConfigured, SAGE_ENGINE_UNCONFIGURED_MESSAGE } from '@/lib/sage-brain';
import { marketingChatLimiter } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const limited = marketingChatLimiter.check(req);
  if (limited) return limited;

  try {
    const { messages, memoryContext, styleInstructions } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid messages' }, { status: 400 });
    }

    // Honest fallback — never a silent failure or a fake canned answer.
    if (!isSageEngineConfigured()) {
      const enc = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: SAGE_ENGINE_UNCONFIGURED_MESSAGE })}\n\n`));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      });
    }

    const systemPrompt = [
      getPublicSagePrompt(),
      memoryContext ?? '',
      styleInstructions ?? '',
    ].filter(Boolean).join('\n\n');

    const stream = await client.messages.stream({
      model: 'claude-sonnet-5',
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
    return apiError('chat/marketing POST', error, 'Sage is unavailable right now. Please try again.');
  }
}
