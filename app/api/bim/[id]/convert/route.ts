import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const BIM_SYSTEM = `You are an expert BIM analyst. You will be shown an IFC/BIM model file or a rendering of a building model.
Identify ALL building elements you can see or infer. Return ONLY raw JSON — no markdown, no backticks.`;

const BIM_PROMPT = `Analyze this building model and identify every building element.
For each element, determine:
- element_type: one of wall, door, window, column, beam, slab, roof, stair, railing, pipe, duct, conduit, fitting, fixture, equipment, furniture, curtain_wall, foundation, footing, other
- name: descriptive name (e.g. "Interior Partition Wall", "3\" PVC Drain Pipe")
- material: primary material if identifiable
- dimensions: any dimensions you can extract (as a JSON object with keys like length_mm, width_mm, height_mm, diameter_mm)
- quantity: count of this element type (group identical elements)
- level: floor/level name if identifiable
- properties: any additional IFC properties you can extract

Return JSON:
{
  "elements": [
    {
      "element_type": "wall",
      "name": "Exterior CMU Wall",
      "material": "Concrete Masonry Unit",
      "dimensions": { "length_mm": 6000, "height_mm": 3000, "thickness_mm": 200 },
      "quantity": 4,
      "level": "Level 1",
      "properties": {}
    }
  ],
  "model_summary": "Brief description of the building model",
  "levels_detected": ["Level 1", "Level 2"],
  "trades_detected": ["structural", "architectural", "mechanical", "plumbing", "electrical"]
}`;

function safeJsonParse(raw: string): any | null {
  const cleaned = raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const normalized = cleaned.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(normalized); } catch { /* continue */ }
  // Extract first JSON object
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const encoder = new TextEncoder();
  const user = await getUser(req);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServerClient();
  const { id: modelId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`),
          );
        } catch { /* controller closed */ }
      };

      const startHeartbeat = (message: string, pct: number, step: number) => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          send('progress', { step, message, pct });
        }, 4000);
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      };

      const done = () => {
        stopHeartbeat();
        send('done', {});
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // 1. Load model record with tenant check
        send('progress', { step: 1, message: 'Loading BIM model...', pct: 5 });

        const { data: model, error: modelErr } = await supabase
          .from('bim_models')
          .select('*')
          .eq('id', modelId)
          .eq('tenant_id', user.tenantId)
          .single();

        if (modelErr || !model) {
          send('error', { message: 'BIM model not found.' });
          return done();
        }

        if (!model.storage_path) {
          send('error', { message: 'No file uploaded for this model.' });
          return done();
        }

        // 2. Set status to processing
        await supabase
          .from('bim_models')
          .update({ status: 'processing' })
          .eq('id', modelId)
          .eq('tenant_id', user.tenantId);

        send('progress', { step: 2, message: 'Downloading model file...', pct: 10 });
        startHeartbeat('Downloading model file...', 10, 2);

        // 3. Download the file from Supabase Storage
        const { data: blob, error: dlErr } = await supabase.storage
          .from('project-files')
          .download(model.storage_path);

        stopHeartbeat();

        if (dlErr || !blob) {
          send('error', { message: 'Could not download model file from storage.' });
          await supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId).eq('tenant_id', user.tenantId);
          return done();
        }

        const fileBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(fileBuffer).toString('base64');

        send('progress', { step: 3, message: 'Sending to AI for analysis...', pct: 20 });

        // 4. Setup Anthropic
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY.' });
          await supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId).eq('tenant_id', user.tenantId);
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // 5. Send to Claude Vision — treat as document
        send('progress', { step: 4, message: 'AI is analyzing building elements...', pct: 25 });
        startHeartbeat('AI is analyzing building elements...', 25, 4);

        let accumulated = '';

        const claudeStream = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: BIM_SYSTEM,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[BIM file data: ${base64.length} chars base64, file type: ${model.file_type || 'ifc'}]\n\nAnalyze this BIM/IFC building model and identify ALL building elements.`,
              } as const,
              { type: 'text', text: BIM_PROMPT },
            ],
          }],
          stream: true,
        });

        let lastHeartbeatMs = Date.now();
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            accumulated += event.delta.text;
            const now = Date.now();
            if (now - lastHeartbeatMs > 4000) {
              const pct = Math.min(72, 25 + Math.floor((accumulated.length / 10000) * 47));
              send('progress', { step: 4, message: `Analyzing elements... (${accumulated.length} chars)`, pct });
              lastHeartbeatMs = now;
            }
          }
        }
        stopHeartbeat();

        send('progress', { step: 5, message: 'Processing results...', pct: 75 });

        // 6. Parse response
        const parsed = safeJsonParse(accumulated);
        if (!parsed || !parsed.elements || !Array.isArray(parsed.elements)) {
          console.error('[bim/convert] parse failed, raw:', accumulated.slice(0, 500));
          send('error', { message: 'AI returned unexpected format. Please try again.' });
          await supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId).eq('tenant_id', user.tenantId);
          return done();
        }

        send('progress', { step: 6, message: 'Saving elements to database...', pct: 85 });

        // 7. Delete existing elements and insert new ones
        await supabase
          .from('bim_elements')
          .delete()
          .eq('model_id', modelId)
          .eq('tenant_id', user.tenantId);

        const elements = parsed.elements.map((el: any, idx: number) => ({
          model_id: modelId,
          tenant_id: user.tenantId,
          project_id: model.project_id,
          element_type: String(el.element_type || 'other').toLowerCase(),
          name: String(el.name || 'Unknown Element'),
          material: el.material || null,
          dimensions: el.dimensions || {},
          quantity: Math.max(1, Number(el.quantity) || 1),
          level: el.level || null,
          properties: el.properties || {},
          sort_order: idx,
        }));

        // Insert in batches of 50
        const BATCH = 50;
        for (let i = 0; i < elements.length; i += BATCH) {
          const batch = elements.slice(i, i + BATCH);
          const { error: insErr } = await supabase.from('bim_elements').insert(batch);
          if (insErr) {
            console.error(`[bim/convert] insert batch ${i} error:`, insErr.message);
          }
        }

        // 8. Update model status
        const { error: updateErr } = await supabase
          .from('bim_models')
          .update({
            status: 'complete',
            element_count: elements.length,
            model_summary: parsed.model_summary || '',
            levels_detected: parsed.levels_detected || [],
            trades_detected: parsed.trades_detected || [],
            analyzed_at: new Date().toISOString(),
          })
          .eq('id', modelId)
          .eq('tenant_id', user.tenantId);

        if (updateErr) console.error('[bim/convert] update error:', updateErr.message);

        send('progress', { step: 7, message: 'Complete!', pct: 100 });
        send('result', {
          modelId,
          elementCount: elements.length,
          summary: parsed.model_summary || '',
          levels: parsed.levels_detected || [],
          trades: parsed.trades_detected || [],
        });

        done();
      } catch (err: unknown) {
        stopHeartbeat();
        const message = err instanceof Error ? err.message : 'Conversion failed.';
        console.error('[bim/convert]', err);
        send('error', { message });
        try {
          await supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId).eq('tenant_id', user.tenantId);
        } catch { /* non-fatal */ }
        done();
      }
    },
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
