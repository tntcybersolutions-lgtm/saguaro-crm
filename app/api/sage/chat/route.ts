import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import {
  loadFullIntelligence,
  saveMessageWithIntelligence,
  buildSuggestionChips,
} from '@/lib/sage-intelligence-v6';
import { buildSageSystemPromptV6 } from '@/lib/sage-prompts-v6';
import type { ProjectContextData } from '@/lib/sage-prompts-v6';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  sessionId: string;
  messageIndex: number;
  pageContext?: string;
  projectId?: string;
  projectName?: string;
  projectContext?: ProjectContextData | null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body: ChatRequestBody = await req.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response('messages array is required', { status: 400 });
    }
    if (!body.sessionId) {
      return new Response('sessionId is required', { status: 400 });
    }

    const intelligence = await loadFullIntelligence(user.id, user.tenantId);

    const systemPrompt = buildSageSystemPromptV6({
      intelligence,
      projectContext: body.projectContext ?? null,
    });

    const lastMessage = body.messages[body.messages.length - 1];
    await saveMessageWithIntelligence(
      user.id,
      user.tenantId,
      body.sessionId,
      body.messageIndex,
      'user',
      lastMessage.content,
      {
        pageContext: body.pageContext,
        projectId: body.projectId,
        projectName: body.projectName,
      }
    );

    const client = new Anthropic();
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: body.messages,
    });

    const readable = new ReadableStream({
      async start(controller) {
        let fullText = '';

        stream.on('text', (text) => {
          fullText += text;
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)
          );
        });

        stream.on('finalMessage', async () => {
          try {
            await saveMessageWithIntelligence(
              user.id,
              user.tenantId,
              body.sessionId,
              body.messageIndex + 1,
              'assistant',
              fullText,
              {
                pageContext: body.pageContext,
                projectId: body.projectId,
                projectName: body.projectName,
              }
            );
            const chips = buildSuggestionChips(intelligence, body.pageContext ?? 'default');
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ done: true, chips })}\n\n`
              )
            );
          } catch {
            // best-effort save
          } finally {
            controller.close();
          }
        });

        stream.on('error', (err) => {
          controller.error(err);
        });
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}
