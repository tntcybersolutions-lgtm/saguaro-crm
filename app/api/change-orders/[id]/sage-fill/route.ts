import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 503 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const db = createServerClient();

        send({ stage: 'loading', message: 'Loading change order context...', pct: 5 });

        // Load CO with project and optional linked RFI
        const { data: co, error: coErr } = await db
          .from('change_orders')
          .select('*, projects!inner(name, address, state, project_type)')
          .eq('id', id)
          .eq('tenant_id', user.tenantId)
          .single();

        if (coErr || !co) {
          send({ type: 'error', message: 'Change order not found' });
          controller.close();
          return;
        }

        const project = co.projects as { name: string; address: string | null; state: string | null; project_type: string | null };

        // Load linked RFI if exists
        let rfi: { subject: string; question: string; draft_answer: string | null; spec_section: string | null } | null = null;
        if (co.related_rfi_id) {
          send({ stage: 'rfi', message: 'Reading linked RFI...', pct: 15 });
          const { data: rfiData } = await db
            .from('rfis')
            .select('subject, question, draft_answer, spec_section')
            .eq('id', co.related_rfi_id)
            .eq('tenant_id', user.tenantId)
            .single();
          if (rfiData) {
            rfi = rfiData;
            send({ stage: 'rfi', message: `Reading linked RFI: ${String(rfiData.subject)}`, detail: rfiData.subject, pct: 20 });
          }
        }

        send({ stage: 'writing', message: 'Sage AI is writing the scope of change...', detail: 'Drafting description, work included/excluded, justification', pct: 30 });

        // Build prompt
        const rfiContext = rfi ? `
RELATED RFI: ${rfi.subject}
RFI QUESTION: ${rfi.question}
ARCHITECT RESPONSE: ${rfi.draft_answer || 'Pending'}
SPEC SECTION: ${rfi.spec_section || 'N/A'}` : '';

        const prompt = `You are a construction project manager writing a change order.
Write a professional, specific scope narrative.

PROJECT: ${String(project.name)}, ${String(project.state || 'N/A')}
PROJECT TYPE: ${String(project.project_type || 'Commercial')}
CHANGE ORDER: ${String(co.title)}
REASON: ${String(co.reason || 'Not specified')}
AMOUNT: $${Number(co.amount || 0).toLocaleString()}
MATERIALS: $${Number(co.materials_amount || 0).toLocaleString()}
LABOR: $${Number(co.labor_amount || 0).toLocaleString()}
EQUIPMENT: $${Number(co.equipment_amount || 0).toLocaleString()}
${rfiContext}

Write the change order scope in JSON only:
{
  "title": "Improved CO title (specific, professional)",
  "description": "3-4 sentence scope narrative. What changed, why, and what work is required.",
  "work_included": ["Item 1", "Item 2", "Item 3"],
  "work_excluded": ["Exclusion 1", "Exclusion 2"],
  "justification": "1-2 sentences explaining why this is a legitimate change."
}

Return ONLY valid JSON, no markdown fences.`;

        const anthropic = new Anthropic({ apiKey });
        let fullText = '';

        const aiStream = anthropic.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of aiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            send({ stage: 'preview', text: fullText, pct: 50 });
          }
        }

        // Parse AI response
        let parsed: { title: string; description: string; work_included: string[]; work_excluded: string[]; justification: string };
        try {
          const cleaned = fullText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
          parsed = JSON.parse(cleaned);
        } catch {
          send({ type: 'error', message: 'Failed to parse AI response' });
          controller.close();
          return;
        }

        send({ stage: 'calculating', message: 'Calculating markup breakdown...', detail: 'Labor + material + overhead + profit', pct: 75 });

        // Markup calculation (in route, not AI)
        const materials = Number(co.materials_amount) || 0;
        const labor = Number(co.labor_amount) || 0;
        const equipment = Number(co.equipment_amount) || 0;
        const subtrade = Number(co.subtrade_amount) || 0;
        const overheadPct = Number(co.markup_overhead_pct) || 15;
        const profitPct = Number(co.markup_profit_pct) || 10;
        const subtradePct = Number(co.subtrade_markup_pct) || 5;

        const base = materials + labor + equipment;
        const overhead = base * (overheadPct / 100);
        const profit = (base + overhead) * (profitPct / 100);
        const subMarkup = subtrade * (subtradePct / 100);
        const totalWithMarkup = base + overhead + profit + subtrade + subMarkup;

        send({ stage: 'saving', message: 'Saving to database...', pct: 90 });

        // Save to DB
        const { error: updateErr } = await db
          .from('change_orders')
          .update({
            title: parsed.title,
            description: parsed.description,
            work_included: parsed.work_included,
            work_excluded: parsed.work_excluded,
            scope_of_change: parsed.justification,
            overhead_amount: Math.round(overhead * 100) / 100,
            profit_amount: Math.round(profit * 100) / 100,
            amount: Math.round(totalWithMarkup * 100) / 100,
          })
          .eq('id', id)
          .eq('tenant_id', user.tenantId);

        if (updateErr) throw updateErr;

        send({
          type: 'done',
          pct: 100,
          message: 'Change order scope generated',
          title: parsed.title,
          description: parsed.description,
          work_included: parsed.work_included,
          work_excluded: parsed.work_excluded,
          justification: parsed.justification,
          overhead_amount: Math.round(overhead * 100) / 100,
          profit_amount: Math.round(profit * 100) / 100,
          total_with_markup: Math.round(totalWithMarkup * 100) / 100,
        });

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sage fill failed';
        console.error('[co-sage-fill] error:', message);
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
