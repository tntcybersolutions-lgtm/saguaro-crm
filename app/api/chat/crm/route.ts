import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { BASE_CONSTRUCTION_KNOWLEDGE } from '@/lib/sage-prompts';

const client = new Anthropic();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 100) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return Response.json(
      { error: 'You\'ve hit 100 messages this hour. Limit resets in 60 minutes.' },
      { status: 429 }
    );
  }

  try {
    const { messages, memoryContext, styleInstructions, currentPage } = await req.json();

    const db = createServerClient();
    const { data: projects } = await db
      .from('projects')
      .select('id, name, status, contract_amount, start_date, address')
      .eq('tenant_id', user.tenantId)
      .limit(15);

    const CRM_SYSTEM_PROMPT = `
You are Sage — this user's personal AI project assistant inside Saguaro CRM.
You have live access to their actual projects and full conversation history.

${BASE_CONSTRUCTION_KNOWLEDGE}

LIVE PROJECT DATA:
${JSON.stringify(projects ?? [], null, 2)}

CURRENT PAGE: ${currentPage ?? 'unknown'}

CRM CAPABILITIES:
- Navigate user to any feature with exact paths
- Reference their actual project names and data
- Calculate: retainage amounts, net pay due, days until lien deadlines
- Draft RFI text, change order justifications, daily log entries
- Explain any document type or workflow in Saguaro
- Proactively surface: what's due this week, expiring COIs, pending items
- Troubleshoot if something isn't working

NAVIGATION PATHS (use these exact routes):
  takeoff → /app/projects/{id}/takeoff
  pay applications → /app/projects/{id}/pay-apps
  lien waivers → /app/projects/{id}/lien-waivers
  change orders → /app/projects/{id}/change-orders
  daily log → /app/projects/{id}/daily-log
  submittals → /app/projects/{id}/submittals
  rfis → /app/projects/{id}/rfis
  bid packages → /app/bid-packages
  autopilot → /app/autopilot
  reports → /app/reports
  settings → /app/settings
  all projects → /app/projects

CRM RESPONSE RULES:
- Reference their actual project names (not "your project")
- Give specific navigation: "Go to Projects → [Project Name] → Pay Applications → New"
- Be proactive: if they ask about pay apps and have 3 active projects, mention all
- Offer next logical step after answering

${memoryContext ?? ''}

${styleInstructions ?? ''}
    `;

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: CRM_SYSTEM_PROMPT,
      messages: (messages as Array<{ role: 'user' | 'assistant'; content: string }>).slice(-30),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
              );
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
    console.error('CRM chat error:', error);
    return Response.json({ error: 'Chat service unavailable' }, { status: 500 });
  }
}
