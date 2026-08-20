import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/portal/sage/chat
 * AI assistant for portal users (subs + clients).
 * Streams responses. Requires portal token for context.
 */
export async function POST(req: NextRequest) {
  try {
    const { messages, token, portalType, projectContext } = await req.json();

    if (!token || !messages?.length) {
      return NextResponse.json({ error: 'Missing token or messages' }, { status: 400 });
    }

    // Build context based on portal type
    let contextInfo = '';
    let systemPrompt = '';

    if (portalType === 'sub') {
      systemPrompt = `You are Sage, the AI construction assistant for Saguaro CRM's Subcontractor Portal.

You are speaking with a subcontractor who is working on a construction project. Be helpful, professional, and concise.

You can help them with:
- Understanding their compliance requirements (insurance, W-9, bonds, licenses)
- Explaining pay application processes and status
- Drafting daily log entries from notes
- Understanding RFI procedures
- Explaining lien waiver requirements by state
- General construction questions about AIA documents, billing, scheduling
- Helping draft professional messages to the GC

IMPORTANT RULES:
- Be friendly but professional — this is a business tool
- Give specific, actionable answers
- When discussing compliance, always mention deadlines
- When discussing pay apps, explain retainage calculations
- If you don't know specifics about their project, ask
- Never reveal internal GC scoring or bidding data
- Format responses with markdown for readability`;
    } else {
      systemPrompt = `You are Sage, the AI construction assistant for Saguaro CRM's Client/Owner Portal.

You are speaking with a project owner or client who hired a general contractor. Be helpful, professional, and reassuring.

You can help them with:
- Understanding project progress and milestones
- Explaining budget and change order impacts
- Understanding pay application approval process
- Reviewing document types (AIA contracts, lien waivers, bonds)
- Explaining construction terminology in plain language
- Helping draft approval/rejection notes for change orders
- Understanding warranty claim procedures
- General questions about construction timelines and processes

IMPORTANT RULES:
- Use plain language — avoid jargon unless they use it first
- Be reassuring about normal construction processes
- Explain costs and timelines clearly
- If asked about delays, be honest but professional
- Help them make informed decisions about approvals
- Never reveal subcontractor pricing or internal GC data
- Format responses with markdown for readability`;
    }

    // Add project context if available
    if (projectContext) {
      contextInfo = `\n\nPROJECT CONTEXT:\n${JSON.stringify(projectContext, null, 2)}`;
    }

    // Stream the response
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt + contextInfo,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Create SSE stream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && 'delta' in event) {
              const delta = event.delta as any;
              if (delta.type === 'text_delta' && delta.text) {
                controller.enqueue(
                  encoder.encode(`data:${JSON.stringify({ type: 'delta', text: delta.text })}\n\n`)
                );
              }
            }
          }
          controller.enqueue(encoder.encode(`data:${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data:${JSON.stringify({ type: 'error', text: 'AI service temporarily unavailable' })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 },
    );
  }
}
