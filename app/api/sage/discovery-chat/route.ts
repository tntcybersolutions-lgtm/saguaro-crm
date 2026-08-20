import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/sage/discovery-chat  (SSE streaming)
 * The emotionally intelligent Sage chat endpoint for the Discovery Engine.
 * Takes: { message, session_id, customer_id?, project_id?, page? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const body = await req.json();
    const { message, session_id, customer_id, project_id, page } = body;

    if (!message || !session_id) {
      return new Response('message and session_id are required', { status: 400 });
    }

    const db = createServerClient();

    // Load or create conversation
    let conversation: Record<string, unknown> | null = null;
    const { data: existingConvo } = await db
      .from('sage_conversations')
      .select('*')
      .eq('session_id', session_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (existingConvo) {
      conversation = existingConvo;
    } else {
      const { data: newConvo, error: createErr } = await db
        .from('sage_conversations')
        .insert({
          tenant_id: user.tenantId,
          user_id: user.id,
          session_id,
          customer_id: customer_id || null,
          current_project_id: project_id || null,
          current_page: page || null,
          title: message.slice(0, 80),
          messages: [],
          messages_count: 0,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      conversation = newConvo;
    }

    // Build conversation history from stored messages
    const storedMessages = (conversation!.messages as ChatMessage[]) || [];
    const conversationMessages: ChatMessage[] = [
      ...storedMessages,
      { role: 'user' as const, content: message },
    ];

    // Load customer context if available
    let customerContext = '';
    const custId = customer_id || conversation!.customer_id;
    if (custId) {
      const { data: customer } = await db
        .from('customer_profiles')
        .select('name, city, state, climate_zone, status, score')
        .eq('id', custId)
        .eq('tenant_id', user.tenantId)
        .single();

      if (customer) {
        customerContext = `\n\nCURRENT CUSTOMER:
- Name: ${customer.name || 'Unknown'}
- Location: ${customer.city || '?'}, ${customer.state || '?'}
- Climate: ${customer.climate_zone || 'Unknown'}
- Status: ${customer.status || 'lead'}
- Score: ${customer.score || 0}/100`;
      }

      // Also load their recommendations
      const { data: recs } = await db
        .from('customer_recommendations')
        .select('title, category, accepted, rejected')
        .eq('customer_id', custId)
        .eq('tenant_id', user.tenantId)
        .limit(20);

      if (recs && recs.length > 0) {
        const accepted = recs.filter((r) => r.accepted).map((r) => r.title);
        const pending = recs.filter((r) => !r.accepted && !r.rejected).map((r) => r.title);
        customerContext += `\n- Accepted upgrades: ${accepted.join(', ') || 'None yet'}`;
        customerContext += `\n- Pending recommendations: ${pending.join(', ') || 'None'}`;
      }
    }

    // Tone history for context
    const toneHistory = (conversation!.tone_history as Array<{ tone: string; at: string }>) || [];
    const recentTones = toneHistory.slice(-5).map((t) => t.tone).join(', ');

    const systemPrompt = `You are Sage, a senior construction advisor with 25 years experience. You're warm, confident, and genuinely helpful. You work for Saguaro, a construction management platform that also offers smart home, energy efficiency, and design services.

TONE DETECTION: Analyze the user's emotional state from their message. If frustrated (caps, short sentences, complaints) then acknowledge their pain, validate their feelings, and solve immediately. If confused then simplify, use analogies, explain step by step. If happy then match their energy, celebrate with them. If urgent then skip pleasantries, give the answer fast. If browsing then be warm and welcoming, show value without pressure.

ALWAYS SELLING (but never pushy): Every interaction should naturally guide toward Saguaro features. When someone mentions a problem, suggest the relevant Saguaro feature that solves it. Be helpful first, sales second. Suggest relevant features only when they solve the user's actual problem.

CONTEXT AWARENESS: You're on the ${page || 'general'} page of the app.${customerContext}

TONE HISTORY: Recent conversation tones: ${recentTones || 'First message'}

RESPONSE FORMAT: After your main response, add a metadata line on its own line:
---SAGE_META---
{"detected_tone":"<one of: frustrated, confused, happy, urgent, browsing, neutral>","suggested_features":["feature1","feature2"],"cta_text":"<optional call-to-action button text>","cta_action":"<optional action key>"}

Be conversational, use contractions, and never sound robotic. Keep responses concise (2-4 paragraphs max unless explaining something complex).`;

    // Stream the response
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          const client = new Anthropic();
          let fullText = '';

          const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: systemPrompt,
            messages: conversationMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          });

          stream.on('text', (text) => {
            fullText += text;
            send({ text });
          });

          stream.on('finalMessage', async () => {
            try {
              // Parse metadata from response
              let responseText = fullText;
              let detectedTone = 'neutral';
              let metadata: Record<string, unknown> = {};

              const metaSplit = fullText.split('---SAGE_META---');
              if (metaSplit.length > 1) {
                responseText = metaSplit[0].trim();
                try {
                  metadata = JSON.parse(metaSplit[1].trim());
                  detectedTone = (metadata.detected_tone as string) || 'neutral';
                } catch {
                  // best-effort metadata parsing
                }
              }

              // Save updated conversation
              const updatedMessages = [
                ...storedMessages,
                { role: 'user' as const, content: message },
                { role: 'assistant' as const, content: responseText },
              ];

              const updatedToneHistory = [
                ...toneHistory,
                { tone: detectedTone, at: new Date().toISOString() },
              ];

              await db.from('sage_conversations').update({
                messages: updatedMessages,
                messages_count: updatedMessages.length,
                last_message_at: new Date().toISOString(),
                detected_tone: detectedTone,
                tone_history: updatedToneHistory,
                current_page: page || conversation!.current_page,
                customer_id: customer_id || conversation!.customer_id,
                current_project_id: project_id || conversation!.current_project_id,
              }).eq('id', conversation!.id);

              send({
                done: true,
                detected_tone: detectedTone,
                suggested_features: metadata.suggested_features || [],
                cta_text: metadata.cta_text || null,
                cta_action: metadata.cta_action || null,
              });
            } catch {
              // best-effort save
            } finally {
              controller.close();
            }
          });

          stream.on('error', (err) => {
            send({ error: err instanceof Error ? err.message : 'Stream error' });
            controller.close();
          });
        } catch (err) {
          send({ error: err instanceof Error ? err.message : 'Internal error' });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return new Response(msg, { status: 500 });
  }
}
