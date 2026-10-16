import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import {
  loadFullIntelligence,
  saveMessageWithIntelligence,
  buildSuggestionChips,
} from '@/lib/sage-intelligence-v6';
import { buildSageSystemPromptV6 } from '@/lib/sage-prompts-v6';
import { hasLiveStock } from '@/app/api/catalog/stock';
import type { ProjectContextData } from '@/lib/sage-prompts-v6';
import {
  buildSageBrainSections,
  isSageEngineConfigured,
  SAGE_ENGINE_UNCONFIGURED_MESSAGE,
} from '@/lib/sage-brain';

/** Honest SSE fallback when no API key is configured — never a silent failure
 *  or a canned answer pretending to be live. */
function unconfiguredStream(): Response {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ text: SAGE_ENGINE_UNCONFIGURED_MESSAGE })}\n\n`)
      );
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, chips: [] })}\n\n`));
      controller.close();
    },
  });
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

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

// ── R19 tools: real platform reach for the primary Sage chat ────────────────
const SAGE_CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'fetch_project_context',
    description: 'Fetch the live project intelligence snapshot for one project: contract money (original + approved COs = revised), billed/paid to date, budget rollups, sub roster, bid packages, vendors, cost codes, open RFI/submittal counts, schedule outlook, and next document numbers. Use whenever the user asks about a specific project\'s numbers or status — never guess a figure this snapshot has.',
    input_schema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'UUID of the project to load. Use the active project id from the conversation context unless the user names a different project.' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'search_catalog',
    description: 'Search the in-platform Saguaro Materials Catalog by item name or SKU. Returns matching items with their best REFERENCE price (seeded snapshot with a capture date — NOT a live quote) and a Verify search URL the user can click to check today\'s price with the vendor. Use for parts/material/price lookups instead of guessing; always label results as reference pricing and share the Verify link.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Item name, keyword, or SKU to search for (e.g. "2x4 stud", "12-2 romex", "PVC 3/4")' },
      },
      required: ['query'],
    },
  },
];

/** Executes one R19 tool. Always returns a JSON string for the tool_result. */
async function executeSageChatTool(
  name: string,
  input: Record<string, unknown>,
  req: NextRequest,
  tenantId: string
): Promise<string> {
  try {
    switch (name) {

      case 'fetch_project_context': {
        const projectId = String(input.projectId ?? '').trim();
        if (!projectId) return JSON.stringify({ error: 'projectId is required' });
        // Server-side call into our own endpoint, forwarding the caller's auth —
        // reuses the exact permission gate, queries, and tolerance of
        // /api/project-context instead of duplicating them.
        const url = new URL(`/api/project-context?projectId=${encodeURIComponent(projectId)}`, req.nextUrl.origin);
        const headers: Record<string, string> = {};
        const cookie = req.headers.get('cookie');
        const auth = req.headers.get('authorization');
        if (cookie) headers.cookie = cookie;
        if (auth) headers.authorization = auth;
        const res = await fetch(url, { headers, cache: 'no-store' });
        const text = await res.text();
        if (!res.ok) {
          return JSON.stringify({
            error: `Project context lookup failed (${res.status}). Tell the user honestly — do not invent project numbers.`,
          });
        }
        return text;
      }

      case 'search_catalog': {
        const raw = String(input.query ?? '').trim();
        if (!raw) return JSON.stringify({ error: 'query is required' });
        /* Catalog tables are newer than the generated Database types — same
           `as any` idiom as /api/catalog. Strip PostgREST or-filter
           metacharacters before interpolating, exactly like that route.

           SCOPED "GLOBAL OR MINE", matching /api/catalog. Every catalog row
           today is shared reference data (tenant_id IS NULL) so this changes
           nothing yet, but the column exists because per-tenant entries are
           coming — and an unscoped search here would let a user ask Sage a
           question and get another contractor's item list and pricing back in
           plain English. A tool the model can call needs the same tenant
           filter as the screen it stands in for. */
        const db = createServerClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const scope = `tenant_id.is.null,tenant_id.eq.${tenantId}`;
        const safe = raw.replace(/[%_,()."\\]/g, ' ').trim();
        if (!safe) return JSON.stringify({ items: [], note: 'Query contained no searchable characters.' });
        const { data: items, error: itemsErr } = await db
          .from('catalog_items')
          .select('id, vertical, category, name, description, unit, sku_hint')
          .or(scope)
          .or(`name.ilike.%${safe}%,description.ilike.%${safe}%,sku_hint.ilike.%${safe}%`)
          .order('name', { ascending: true })
          .limit(8);
        if (itemsErr) throw itemsErr;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemRows = (items as any[]) ?? [];
        if (itemRows.length === 0) {
          return JSON.stringify({
            items: [],
            note: `No catalog items match "${raw}". The catalog covers seeded reference items only — suggest the user check the Catalog page or their vendor directly.`,
          });
        }
        const ids = itemRows.map((it) => it.id);
        const { data: priceRows, error: priceErr } = await db
          .from('catalog_vendor_prices')
          .select('item_id, price, unit, stock_status, source, as_of, catalog_vendors(name)')
          .or(scope)
          .in('item_id', ids);
        if (priceErr) throw priceErr;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byItem = new Map<string, any[]>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of ((priceRows as any[]) ?? [])) {
          const list = byItem.get(r.item_id) ?? [];
          list.push(r);
          byItem.set(r.item_id, list);
        }
        const out = itemRows.map((it) => {
          // Prices can round-trip as strings — Number() first.
          // AVAILABILITY HONESTY (same rule as the Catalog page, shared helper):
          // stock is only real when the row came from a live vendor feed. Every
          // row today is source='reference' — seeded reference data — so no
          // stockStatus is handed to the model at all. Sage must never tell a
          // GC something is in stock because a seed script said so.
          const offers = (byItem.get(it.id) ?? [])
            .map((r) => ({
              vendor: r.catalog_vendors?.name || 'Unknown vendor',
              price: Number(r.price) || 0,
              unit: r.unit || it.unit || null,
              ...(hasLiveStock(r) ? { stockStatus: r.stock_status || null } : {}),
              availability: hasLiveStock(r) ? 'live vendor feed' : 'not tracked — verify with the vendor',
              source: r.source || null,
              asOf: r.as_of || null,
            }))
            .sort((a, b) => a.price - b.price);
          // BEST PRICE = cheapest quote. A stock preference may only break the
          // tie when a real feed backs it; today that never fires.
          const best = offers.find((o) => hasLiveStock({ source: o.source, stock_status: (o as { stockStatus?: string }).stockStatus }) && (o as { stockStatus?: string }).stockStatus === 'in_stock') || offers[0] || null;
          return {
            name: it.name,
            category: it.category,
            vertical: it.vertical,
            unit: it.unit,
            skuHint: it.sku_hint,
            bestReferencePrice: best
              ? {
                  vendor: best.vendor,
                  price: best.price,
                  unit: best.unit,
                  asOf: best.asOf,
                  source: best.source,
                  pricingLabel: 'reference pricing — seeded snapshot, not a live quote',
                  // Same Verify pattern as the Catalog page: a live web search
                  // for the SKU + vendor so the user checks today's price.
                  verifyUrl: `https://www.google.com/search?q=${encodeURIComponent(`${it.sku_hint || it.name} ${best.vendor}`)}`,
                }
              : null,
            offerCount: offers.length,
          };
        });
        return JSON.stringify({
          items: out,
          honesty: 'Every price above is REFERENCE pricing captured on its as-of date — never a live quote. Say so plainly, cite the as-of date, and give the Verify link so the user confirms today\'s price with the vendor before ordering.',
        });
      }

      default:
        return JSON.stringify({ error: 'Unknown tool' });
    }
  } catch {
    return JSON.stringify({ error: `The ${name} lookup failed — tell the user honestly instead of guessing.` });
  }
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

    // Honest fallback when the reasoning engine isn't configured — before any
    // heavy loading, and never a fake canned answer.
    if (!isSageEngineConfigured()) {
      return unconfiguredStream();
    }

    const [intelligence, brain] = await Promise.all([
      loadFullIntelligence(user.id, user.tenantId),
      // SAGE BRAIN (R16-R19): tolerant — degrades to defaults if tables absent.
      buildSageBrainSections(user.id, user.tenantId).catch(() => null),
    ]);

    const systemPrompt = [
      buildSageSystemPromptV6({
        intelligence,
        projectContext: body.projectContext ?? null,
        pageContext: body.pageContext,
        brain,
      }),
      // R19: this route now carries real tools — extend (not contradict) the
      // capability-honesty block with what IS reachable here.
      `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE TOOLS AVAILABLE IN THIS CHAT (R19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• fetch_project_context — the live project snapshot (contract money, billed/
  paid, budget, subs, bid packages, schedule, counts, next doc numbers).
  Use it before quoting any project figure not already in this prompt.${body.projectId ? `
  The user is currently viewing project "${body.projectName ?? 'unnamed'}" (id ${body.projectId}) —
  use that id unless they name a different project.` : ''}
• search_catalog — the in-platform Materials Catalog by name or SKU. Results
  are REFERENCE pricing (seeded snapshots stamped with a capture date), never
  live quotes: quote the price WITH its as-of date, label it reference
  pricing, and give the Verify link so the user checks today's price with the
  vendor. This is the honest answer to parts/material price questions — you
  still have no live web access.
Use a tool whenever it can answer with real data instead of guessing; keep it
to a few tool calls per reply.`.trim(),
    ].join('\n\n');

    const lastMessage = body.messages[body.messages.length - 1];
    // Best-effort: persisting the user message must never block the chat stream.
    // sage_conversations is a session-level jsonb schema, so per-message inserts
    // can throw; swallow the failure here so the Anthropic SSE stream still proceeds.
    try {
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
    } catch (err) {
      console.error('[sage/chat] saveMessageWithIntelligence (user) failed, continuing:', err);
    }

    const client = new Anthropic();
    const encoder = new TextEncoder();

    // ── Bounded agentic loop (≤4 model turns), stream-compatible with the
    //    route's existing SSE shape: {text} deltas, then {done, chips}. ──
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages: Anthropic.MessageParam[] = body.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          let fullText = '';
          let iterations = 0;

          while (iterations < 4) {
            iterations++;
            // Final allowed turn runs without tools so the loop always ends in
            // a spoken answer, never a dangling tool call.
            const allowTools = iterations < 4;
            const stream = client.messages.stream({
              model: 'claude-sonnet-5',
              max_tokens: 2048,
              system: systemPrompt,
              messages: currentMessages,
              ...(allowTools ? { tools: SAGE_CHAT_TOOLS, tool_choice: { type: 'auto' as const } } : {}),
            });

            for await (const chunk of stream) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                fullText += chunk.delta.text;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
                );
              }
            }

            const final = await stream.finalMessage();
            if (final.stop_reason !== 'tool_use') break;

            const toolUses = final.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            );
            if (toolUses.length === 0) break;

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: await executeSageChatTool(tu.name, tu.input as Record<string, unknown>, req, user.tenantId),
              });
            }
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: final.content },
              { role: 'user', content: toolResults },
            ];
          }

          // Best-effort save — same session-level jsonb tolerance as the user
          // message above; a failed save must never eat the done frame.
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
          } catch (err) {
            /* Best-effort, but never silent. The user-message save 20 lines up
               logs; this one swallowed, so a chat history that stopped
               recording Sage's half of the conversation left nothing behind to
               find it by. The stream still finishes — that part was right. */
            console.error('[sage/chat] saveMessageWithIntelligence (assistant) failed, continuing:', err);
          }

          const chips = buildSuggestionChips(intelligence, body.pageContext ?? 'default');
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, chips })}\n\n`)
          );
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
  } catch (e) {
    // A streaming endpoint answers in text; the real error goes to the log.
    console.error('[sage/chat POST]', e);
    return new Response('Something went wrong on our end. Please try again.', { status: 500 });
  }
}
