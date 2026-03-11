import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { chatSuggestionsHandler } from '../../../../ai-chat-route';
import { AutoPopulator } from '../../../../auto-populator';

const CONSTRUCTION_SYSTEM_PROMPT = `You are Saguaro Intelligence, an expert AI assistant built into the Saguaro Construction CRM. You are a senior construction professional with deep expertise in:

- CSI MasterFormat (all 49 divisions)
- AIA contract documents (A101, A201, B101, G702, G703, G704, G706, A310, A312)
- Lien law: Arizona (A.R.S. §33-1008), California (Civil Code §8100-8848), Texas (Property Code §53)
- Davis-Bacon Act, prevailing wage, certified payroll (WH-347)
- OSHA construction standards (29 CFR 1926)
- Estimating, quantity takeoff, unit costs, labor productivity
- Change order management, claims, dispute resolution
- Pay application process: schedule of values, stored materials, retainage
- Construction finance: cash flow, retainage management, job costing

You are direct, confident, practical, and proactive. You always respond with real answers. You never refuse to help. If unsure, ask one specific clarifying question. Keep responses focused and actionable.`;

async function robustChatHandler(req: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  const send = (controller: ReadableStreamDefaultController, data: object) => {
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch {
          send(controller, { type: 'delta', text: "I had trouble reading your message. Could you try again?" });
          send(controller, { type: 'done', sessionId: 'error' });
          controller.close();
          return;
        }

        // Support both old format {message, sessionId} and new format {messages: [{role, content}]}
        let formattedMessages: Array<{role: 'user'|'assistant', content: string}> = [];

        if (body.messages && Array.isArray(body.messages)) {
          // New format
          formattedMessages = (body.messages as Array<{role?: string, content?: unknown}>)
            .map((m) => ({
              role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user'|'assistant',
              content: String(m.content || '').trim(),
            }))
            .filter((m) => m.content);
        } else if (body.message) {
          // Old format - single message
          formattedMessages = [{ role: 'user', content: String(body.message) }];
        }

        if (!formattedMessages.length) {
          send(controller, { type: 'delta', text: "Hello! I'm Saguaro Intelligence. Ask me anything about your construction project." });
          send(controller, { type: 'done', sessionId: 'empty' });
          controller.close();
          return;
        }

        if (!process.env.ANTHROPIC_API_KEY) {
          const lastMsg = formattedMessages[formattedMessages.length - 1]?.content || '';
          send(controller, { type: 'delta', text: `I'm Saguaro Intelligence operating in offline mode (API key not configured). For your question: "${lastMsg}" — please contact your project manager or check Saguaro documentation. I'll have full AI capabilities once the API is configured.` });
          send(controller, { type: 'done', sessionId: 'offline' });
          controller.close();
          return;
        }

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        try {
          const anthropicStream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: CONSTRUCTION_SYSTEM_PROMPT,
            messages: formattedMessages,
          });

          for await (const chunk of anthropicStream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              send(controller, { type: 'delta', text: chunk.delta.text });
            }
          }

          send(controller, { type: 'done', sessionId: typeof body.sessionId === 'string' ? body.sessionId : 'new' });

        } catch (apiErr: unknown) {
          console.error('Anthropic API error:', apiErr instanceof Error ? apiErr.message : apiErr);
          const status = (apiErr as { status?: number })?.status;
          const msg = status === 529
            ? "I'm experiencing high demand. Please try again in a moment."
            : status === 401
            ? "There's a configuration issue with the AI service. Please contact support."
            : "I encountered a temporary issue. Please try again.";
          send(controller, { type: 'delta', text: msg });
          send(controller, { type: 'done', sessionId: 'error' });
        }

      } catch (outerErr: unknown) {
        console.error('Chat route error:', outerErr);
        try {
          send(controller, { type: 'delta', text: "I had a brief hiccup — could you repeat your question?" });
          send(controller, { type: 'done', sessionId: 'error' });
        } catch {}
      } finally {
        try { controller.close(); } catch {}
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment, subAction] = path;

  if (segment === 'chat' && subAction === 'suggestions') return chatSuggestionsHandler(req);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [segment] = path;

  if (segment === 'chat') return robustChatHandler(req);

  if (segment === 'prefill') {
    const body = await req.json().catch(() => null);
    if (!body?.formType || !body?.tenantId || !body?.projectId) {
      return NextResponse.json({ error: 'formType, tenantId, and projectId are required' }, { status: 400 });
    }
    try {
      const result = await AutoPopulator.prefillForm({
        tenantId:  String(body.tenantId),
        projectId: String(body.projectId),
        formType:  String(body.formType) as Parameters<typeof AutoPopulator.prefillForm>[0]['formType'],
        context:   body.context ?? {},
        entityId:  body.entityId ? String(body.entityId) : undefined,
      });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Auto-fill failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }});
}
