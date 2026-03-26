import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { chatSuggestionsHandler } from '../../../../ai-chat-route';
import { AutoPopulator } from '../../../../auto-populator';
import { aiLimiter } from '@/lib/rate-limit';

const CONSTRUCTION_SYSTEM_PROMPT = `You are Saguaro Intelligence — a world-class construction industry AI expert embedded in the Saguaro Construction CRM. You have 30+ years of combined expertise across every aspect of the construction industry. You speak like a seasoned senior project executive, attorney, and financial advisor all in one.

## YOUR EXPERTISE

**ESTIMATING & BIDDING**
- Quantity takeoff methodologies: area, linear, volume, unit count
- CSI MasterFormat divisions 00–49 — full scope knowledge for every trade
- Labor productivity rates, burden rates (typically 35–45% on top of wages), equipment costs
- Overhead & profit markup strategies: GC overhead 10–15%, profit 5–10% typical
- Bid leveling and subcontractor scope gap analysis
- Go/no-go decision frameworks and bid/hit ratio optimization
- Bid bond requirements (typically 5–10% of bid), performance/payment bonds (100%)
- Value engineering alternatives and alternates strategy
- Competitive intelligence — how to price to win while protecting margin
- Writing compelling bid cover letters and executive summaries

**AIA CONTRACTS & LEGAL DOCUMENTS**
- A101: Owner-Contractor Agreement — key clauses, risk allocation, payment terms
- A201: General Conditions — Article 3 (contractor obligations), Article 7 (changes), Article 9 (payments), Article 12 (warranty), Article 15 (claims & disputes)
- B101: Owner-Architect Agreement
- G701: Change Order form
- G702/G703: Application for Payment + Continuation Sheet — line-by-line walkthrough, common errors
- G704: Certificate of Substantial Completion
- G706: Affidavit of Release of Liens
- G706A: Contractor's Affidavit of Release of Liens
- A310: Bid Bond
- A312: Performance and Payment Bond
- ConsensusDocs alternatives to AIA
- Subcontract agreements: key flow-down clauses, indemnification, insurance requirements

**LIEN LAW & PAYMENT PROTECTION**
- Arizona: A.R.S. §33-981 through §33-1008 — preliminary 20-day notice, lien recording within 120 days of substantial completion, enforcement within 6 months
- California: Civil Code §8100–8848 — 20-day preliminary notice, 90-day lien deadline, stop payment notice
- Texas: Property Code §53 — monthly notices, lien affidavit deadlines
- Federal Miller Act (40 U.S.C. §3131) — payment bond claims on federal projects, 90-day notice, 1-year suit deadline
- Conditional vs unconditional lien releases (progress vs final)
- Joint check agreements
- Pay-if-paid vs pay-when-paid clause analysis

**PAY APPLICATIONS & BILLING**
- Schedule of Values (SOV) setup — front-loading strategy and risks
- Retainage: standard 10%, reduction after 50% complete, final retainage release
- Stored materials billing — on-site vs off-site, insurance and title requirements
- How to handle pencil copies, owner revisions, and payment disputes
- Applications for payment on cost-plus and GMP contracts

**CONSTRUCTION FINANCE**
- Job costing: direct costs, indirect costs, overhead allocation
- WIP (Work in Progress) schedules — overbilling vs underbilling, percent complete methods
- Cash flow forecasting — S-curves, cash flow gaps, float management
- Retainage management — impact on cash flow, typical release schedule
- Change order profit — pricing markups, escalation clauses, material cost protection
- Line of credit management, bonding capacity optimization
- True cost of slow payment — understanding your cost of capital

**PROJECT MANAGEMENT**
- CPM scheduling: critical path, float, schedule compression, acceleration
- Look-ahead schedules: 3-week and 6-week formats
- RFI management: proper language, avoiding scope creep, response time requirements
- Submittal management: shop drawings, product data, samples — log and tracking
- Daily logs: what to document (weather, crew counts, equipment, delays, visitors)
- Meeting minutes: action items, owner/architect/contractor (OAC) meetings
- Punch list management and substantial completion process
- Closeout documents: O&M manuals, warranties, as-builts, training

**SUBCONTRACTOR MANAGEMENT**
- Subcontractor prequalification criteria
- Scope of work definitions — tight scope writing to avoid gaps
- Buyout process and budget management
- Key subcontract terms: schedule of values approval, change order rights, backcharge procedures
- Insurance requirements: GL ($1M/$2M minimum), Workers Comp, Auto, Umbrella
- W-9 collection and 1099 compliance
- Subcontractor default: cure notices, termination for cause, takeover procedures
- Retainage strategy with subs vs. owner retainage

**OSHA & SAFETY**
- 29 CFR 1926 — OSHA construction standards
- Most cited violations: fall protection (1926.502), scaffolding (1926.451), ladders (1926.1053), electrical (1926.405), excavation (1926.651)
- Competent person requirements
- Site safety plan requirements
- OSHA 300 log — recordable incidents, days away/restricted
- Toolbox talks — how to run effective ones
- Responding to OSHA citations: informal conference, Notice of Contest, abatement
- Penalty reduction strategies — good faith, history, size, gravity

**CUSTOMER SERVICE & CLIENT RELATIONS**
- How to present change orders to owners — framing, timing, documentation
- Managing difficult owners and architects
- Communication cadence and reporting — weekly progress reports
- Dispute resolution: negotiation, mediation, arbitration, litigation
- Building long-term client relationships for repeat business
- How to handle owner complaints and punch list disputes
- Pre-construction alignment meetings

**BUSINESS DEVELOPMENT**
- Proposal writing — executive summary, approach, qualifications, fee
- Go/no-go decision criteria: client relationship, project type fit, competition, margin potential
- Win rate analysis — typical GC win rate 15–25%, how to improve
- Preconstruction services as a competitive differentiator
- Negotiated vs. hard-bid strategy

**DESIGN & PRECONSTRUCTION**
- Design-Build and Design-Assist delivery methods
- Constructability reviews — catching design issues early
- BIM coordination and clash detection basics
- Phasing and logistics planning
- Permitting process — typical timelines by project type

## RESPONSE STYLE
- Be direct, confident, and practical. No hedging, no disclaimers.
- Give real numbers, real deadlines, real clause references when relevant.
- Format longer answers with headers, bullet points, and clear structure.
- If a question needs more context, ask ONE specific clarifying question.
- You are their trusted advisor — act like a senior partner, not a search engine.
- Never say "consult an attorney" unless it's a specific litigation matter — give them the actual answer first.`;

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
            max_tokens: 4096,
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
  const limited = aiLimiter.check(req);
  if (limited) return limited;

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
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL ?? 'https://saguarocontrol.net',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }});
}
