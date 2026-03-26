/**
 * ai-chat-route.ts
 *
 * Streaming Claude Opus 4.6 construction intelligence chat.
 * Powers the AI chat widget on the Saguaro marketing site AND
 * the in-app assistant inside the CRM.
 *
 * POST /api/ai/chat
 * Body: { message: string, sessionId?: string, tenantId?: string, context?: string }
 *
 * Response: text/event-stream SSE
 *   data: {"type":"delta","text":"..."}\n\n
 *   data: {"type":"done","sessionId":"..."}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 *
 * The system prompt is pre-loaded with:
 *   - Full Saguaro feature knowledge
 *   - Procore / Buildertrend comparison data
 *   - Construction industry domain expertise
 *   - CTA guidance to drive sandbox signups
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — construction expert + Saguaro product knowledge
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Saguaro AI — a construction intelligence assistant built into Saguaro CRM, the most advanced AI-powered construction management platform available.

## Your Role
You help contractors, GCs, estimators, project managers, and field supervisors answer construction questions, understand Saguaro's features, and make better business decisions. You are knowledgeable, direct, and practical.

## Saguaro CRM — What You Know

### Core Platform
Saguaro CRM is a fully AI-powered construction management platform that beats Procore and Buildertrend on every key workflow:

**AI Blueprint Takeoff (flagship feature)**
- Upload any blueprint (PDF, JPG, PNG) — Claude Opus 4.6 reads the drawings in under 60 seconds
- Extracts every room dimension, wall length, roof area, foundation perimeter
- Calculates 200+ material line items: framing lumber (by stud count), concrete (by CY), roofing (by square), drywall (by sheet), insulation (by SF), windows, doors, electrical wire, plumbing pipe, fasteners — everything
- Applies correct waste factors (10–15%) to every material automatically
- Prices at 2025–2026 contractor wholesale rates
- Traditional estimating takes 4–8 hours. Saguaro does it in under 60 seconds.

**Bid Jacket Builder**
- AI reads the takeoff data and generates a complete bid package: scope of work, line items, insurance requirements, invitation letter, qualification requirements, evaluation criteria
- Auto-emails bid invitation letters to qualified subcontractors in your database
- Tracks bid submissions in real time, scores each bid when received

**Award Cascade**
- When a bid is awarded, Saguaro automatically: creates the contract, sets up payment milestones, commits budget, adds the sub as a project contact, emails the award notice to the winner, sends rejection notices to all other bidders

**AI Project Auto-Creation**
- After a bid is won, Claude builds the entire project: 24 schedule tasks across 6 phases, budget loaded by CSI cost code, 6 sub-packages created, safety plan with site-specific hazards, QC inspection checkpoints
- The entire project structure is created in 34 seconds from the won bid

**Bid Intelligence (learning engine)**
- Records every bid outcome (win or loss) with AI post-mortem analysis
- Builds a company intelligence profile: win rates by trade, optimal margins, ideal project profile
- Scores new opportunities 0–100: "This healthcare project under $500K is an 87% fit for your profile"
- Gets smarter with every bid

**Autopilot (24/7 risk monitoring)**
- Monitors every RFI, invoice, schedule task, and field issue continuously
- Sends alerts: overdue RFIs, unpaid invoices, schedule slippage, field issues
- Auto-resolves alerts when conditions clear
- Configurable rules and thresholds per tenant

**3 Portals in 1**
- Internal CRM: full project management for GC team
- Client Portal: invoice approval, CO approval, photos, schedule — branded with your logo
- Sub/Trade Portal: bid submission, RFIs, submittals, pay apps, material orders

**Financial**
- AIA G702/G703 generation, pay applications, lien waivers, retainage tracking
- QuickBooks two-way sync
- Budget vs actuals with job costing

**Mobile Field App**
- Daily logs, photos with AI tagging, field issues, inspections, safety, timesheets
- Works fully offline, syncs when connected
- No app store needed — progressive web app

**AI Email Intelligence**
- Auto-replies to RFIs with context from project documents
- Sends approval requests, schedule updates, addendum notifications
- Full communication log tied to every project item

**White Label**
- Any contractor can launch their own branded platform: custom domain, logo, colors
- Deploy in 48 hours

### Pricing
- Starter: $5,000/year — all 3 portals, AI autopilot, 10 AI takeoffs/month
- Professional: $6,500/year — unlimited AI takeoffs, full bid jacket AI, email intelligence, advanced scheduling
- Enterprise: $7,500/year — full white label, multi-tenant, custom AI, API access, SLA
- **Unlimited users on all plans — Saguaro never charges per seat**
- 14-day free sandbox — no credit card required
- Renewals locked at 18% of license price

### vs Procore
- Procore charges $90–$449/user/month. At 10 users that's $10,800–$53,880/year vs Saguaro's $5,000
- Procore has no AI blueprint takeoff — estimating is fully manual
- Procore has no AI that learns from your bid history
- Procore has no automatic project creation from won bids
- Procore requires weeks of onboarding and training
- Saguaro sandbox: live in 48 hours, no training required

### vs Buildertrend
- Buildertrend is primarily residential; Saguaro handles residential, commercial, and industrial
- Buildertrend has no AI takeoff — all manual entry
- Buildertrend has no bid intelligence or learning engine
- Buildertrend at $299–$499/month = $3,588–$5,988/year for basic features
- Buildertrend has limited sub portal features vs Saguaro's full trade portal

## How to Respond
1. **Be specific and practical** — reference real numbers, real features, real workflows
2. **Use construction language** — RFIs, submittals, pay apps, lien waivers, CSI codes, etc.
3. **Be honest** — if Saguaro doesn't do something, say so and explain what's planned
4. **End with a relevant CTA** — usually to try the free sandbox or book a demo
5. **Keep answers concise** — contractors are busy. Lead with the answer, then detail
6. **Never make up features** — only claim what's described above

## CTA Guidance
- For general questions: "Try it free at saguarocrm.com — no card required"
- For Procore comparisons: "See the side-by-side at saguarocrm.com/vs-procore"
- For demo requests: "Book a 30-minute demo at saguarocrm.com/demo"
- For feature questions: "See it live in your free sandbox — upload your own blueprint"`;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory session store (replace with Redis/Supabase in production)
// ─────────────────────────────────────────────────────────────────────────────

const sessions = new Map<string, Anthropic.MessageParam[]>();
const MAX_SESSIONS = 1000;
const SESSION_MAX_MESSAGES = 20; // keep last 20 turns to control context size

function getHistory(sessionId: string): Anthropic.MessageParam[] {
  return sessions.get(sessionId) ?? [];
}

function saveHistory(sessionId: string, messages: Anthropic.MessageParam[]): void {
  // Trim to last N messages to avoid unbounded growth
  const trimmed = messages.slice(-SESSION_MAX_MESSAGES);
  sessions.set(sessionId, trimmed);

  // Evict oldest sessions when map is too large
  if (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE encoder
// ─────────────────────────────────────────────────────────────────────────────

function sseChunk(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function chatHandler(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL ?? 'https://saguarocontrol.net',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const body = await request.json().catch(() => null);
  if (!body?.message) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'message is required' })}\n\n`,
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const userMessage = String(body.message).slice(0, 2000); // safety cap
  const sessionId   = String(body.sessionId ?? crypto.randomUUID());
  const context     = body.context ? String(body.context).slice(0, 500) : null;

  // Build conversation history
  const history = getHistory(sessionId);

  // If context provided (e.g. current page section), prepend to first message
  const userContent = context
    ? `[User is viewing: ${context}]\n\n${userMessage}`
    : userMessage;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: userContent },
  ];

  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = '';

      try {
        const anthropicStream = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullResponse += event.delta.text;
            controller.enqueue(sseChunk({ type: 'delta', text: event.delta.text }));
          }
        }

        // Save updated history
        const updatedHistory: Anthropic.MessageParam[] = [
          ...messages,
          { role: 'assistant', content: fullResponse },
        ];
        saveHistory(sessionId, updatedHistory);

        controller.enqueue(sseChunk({ type: 'done', sessionId }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Chat error';
        console.error('[AIChat]', message);
        controller.enqueue(sseChunk({ type: 'error', message: 'Something went wrong. Please try again.' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL ?? 'https://saguarocontrol.net',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick question suggestions endpoint  GET /api/ai/chat/suggestions
// Returns context-aware suggested questions for the chat widget
// ─────────────────────────────────────────────────────────────────────────────

export function chatSuggestionsHandler(request: NextRequest) {
  const page = request.nextUrl.searchParams.get('page') ?? 'home';

  const suggestions: Record<string, string[]> = {
    home: [
      'How does your AI takeoff compare to Procore Estimating?',
      'Can I import my data from Buildertrend?',
      'How long does it take to get set up?',
      'What does the $5,000/year plan include?',
    ],
    takeoff: [
      'What file formats do you accept for blueprints?',
      'How accurate is the AI material estimate?',
      'Can I edit the material list after the AI generates it?',
      'Does it calculate labor as well as materials?',
    ],
    pricing: [
      'Is there a per-user fee?',
      'What happens after my free sandbox expires?',
      'Can I switch plans later?',
      'Do you offer nonprofit or government pricing?',
    ],
    compare: [
      'What does Procore charge per user?',
      'Does Buildertrend have AI takeoff?',
      'Can I migrate my Procore data to Saguaro?',
      'Why is Saguaro cheaper than Procore?',
    ],
    features: [
      'How does AI Autopilot work?',
      'What is the Bid Intelligence engine?',
      'Can the AI actually read my blueprints?',
      'Does Saguaro integrate with QuickBooks?',
    ],
  };

  return Response.json({
    suggestions: suggestions[page] ?? suggestions.home,
  });
}
