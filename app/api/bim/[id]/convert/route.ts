import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { must, tryWrite } from '@/lib/db-write';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const BIM_SYSTEM = `You are an expert BIM/IFC analyst. You are given the ACTUAL text content of a building model file (IFC / STEP / ISO-10303-21).
Parse the entity data in the file and identify the building elements that are ACTUALLY PRESENT — read their entity types, names, materials, quantities, levels, and property sets directly from the text.
Do NOT invent, guess, or hallucinate elements that are not supported by the file content. If the file was truncated, report only what you can see and treat counts as observed minimums.
Return ONLY raw JSON — no markdown, no backticks.`;

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

// Text-based model formats whose contents Claude can actually parse. IFC is a
// STEP (ISO-10303-21) text file; IFCXML is XML. Everything else the uploader
// accepts (glb/gltf/obj/rvt) is binary or raw geometry with no element semantics.
const TEXT_ANALYZABLE_EXTS = new Set(['ifc', 'ifcxml', 'step', 'stp', 'p21']);

// Character budget for the model text we send to Claude. IFC/STEP files can be
// hundreds of MB; cap the payload to a safe size (~130k input tokens).
const MAX_MODEL_CHARS = 500_000;

// Entity keywords worth keeping when we must truncate a large IFC/STEP model:
// semantic building elements, spatial structure, materials, quantities, prop sets.
const IFC_SEMANTIC_RE = /(IFCWALL|IFCDOOR|IFCWINDOW|IFCSLAB|IFCROOF|IFCBEAM|IFCCOLUMN|IFCSTAIR|IFCRAMP|IFCRAILING|IFCCURTAINWALL|IFCFOOTING|IFCPILE|IFCPLATE|IFCMEMBER|IFCBUILDINGELEMENTPROXY|IFCFURNISHINGELEMENT|IFCFURNITURE|IFCSPACE|IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY|IFCFLOWSEGMENT|IFCFLOWFITTING|IFCFLOWTERMINAL|IFCFLOWCONTROLLER|IFCDUCTSEGMENT|IFCPIPESEGMENT|IFCCABLECARRIERSEGMENT|IFCSANITARYTERMINAL|IFCMATERIAL|IFCMATERIALLAYER|IFCPROPERTYSINGLEVALUE|IFCPROPERTYSET|IFCELEMENTQUANTITY|IFCQUANTITYLENGTH|IFCQUANTITYAREA|IFCQUANTITYVOLUME|IFCRELDEFINESBYPROPERTIES|IFCRELASSOCIATESMATERIAL|IFCRELCONTAINEDINSPATIALSTRUCTURE|IFCRELAGGREGATES|IFCUNITASSIGNMENT|IFCPROJECT)/i;

const PREVIEW_ONLY_MESSAGE =
  'Automated element analysis is available for IFC / STEP files. This format supports 3D preview only.';

// Detect binary content: any NUL byte in the first 8KB means it is not a text
// model (catches GLB, RVT, IFCZIP, or a binary file masquerading as .ifc).
function looksBinary(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.length, 8192);
  for (let i = 0; i < sample; i++) if (bytes[i] === 0) return true;
  return false;
}

function decodeSlice(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start, end));
}

// Build the REAL text we send to Claude. Full file when it fits the budget;
// otherwise stream-decode in chunks (never materializing the whole up-to-200MB
// file as a string) and keep the STEP header + the semantically relevant entity
// lines up to budget, so the analysis reflects the actual model rather than a
// random front-slice. Early-exits once the budget is filled.
function buildModelExcerpt(bytes: Uint8Array): { text: string; truncated: boolean } {
  // IFC/STEP is ~1 byte per char (ASCII); if the whole file fits, send it all.
  if (bytes.length <= MAX_MODEL_CHARS) {
    return { text: decodeSlice(bytes, 0, bytes.length), truncated: false };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const CHUNK = 1 << 20; // 1 MB
  let carry = '';
  let out = '';
  let inData = false;
  let sawNewline = false;

  outer:
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const piece = decoder.decode(bytes.subarray(off, Math.min(off + CHUNK, bytes.length)), { stream: true });
    const parts = (carry + piece).split(/\r?\n/);
    carry = parts.pop() ?? ''; // last (possibly partial) line carries to next chunk
    for (const line of parts) {
      sawNewline = true;
      if (!inData) {
        // Retain the full STEP header verbatim (schema, units, project meta).
        out += (out ? '\n' : '') + line;
        if (/^\s*DATA\s*;/i.test(line)) inData = true;
        if (out.length >= MAX_MODEL_CHARS) break outer;
        continue;
      }
      if (!IFC_SEMANTIC_RE.test(line)) continue;
      if (out.length + line.length + 1 > MAX_MODEL_CHARS) break outer;
      out += '\n' + line;
    }
    if (out.length >= MAX_MODEL_CHARS) break;
  }

  // Minified single-line IFC (no newlines) or nothing useful matched → raw head slice.
  if (!sawNewline || out.length < 4000) {
    return { text: decodeSlice(bytes, 0, MAX_MODEL_CHARS), truncated: true };
  }
  return { text: out, truncated: true };
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
        await must(supabase
          .from('bim_models')
          .update({ status: 'processing' })
          .eq('id', modelId)
          .eq('tenant_id', user.tenantId), 'bim_models write');

        send('progress', { step: 2, message: 'Downloading model file...', pct: 10 });
        startHeartbeat('Downloading model file...', 10, 2);

        // 3. Download the file from Supabase Storage
        const { data: blob, error: dlErr } = await supabase.storage
          .from('project-files')
          .download(model.storage_path);

        stopHeartbeat();

        if (dlErr || !blob) {
          send('error', { message: 'Could not download model file from storage.' });
          await tryWrite(supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId), 'bim_models update');
          return done();
        }

        const fileBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(fileBuffer);

        const ext = String(model.file_type || model.name?.split('.').pop() || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');

        // Decide whether REAL element analysis is possible. Only text-based
        // IFC/STEP files can be parsed by the model; binary/geometry-only formats
        // (GLB, OBJ, RVT, IFCZIP, binary-IFC) cannot — for those we return an
        // honest preview-only result and NEVER fabricate elements.
        const isTextFormat = TEXT_ANALYZABLE_EXTS.has(ext) && !looksBinary(bytes);

        // Honest preview-only path — no AI call, no fabricated elements.
        const markPreviewOnly = async (message: string) => {
          // Remove any previously-written (possibly fabricated) elements.
          await must(supabase
            .from('bim_elements')
            .delete()
            .eq('bim_model_id', modelId)
            .eq('tenant_id', user.tenantId), 'bim_elements write');

          const patch = {
            element_count: 0,
            error_message: message,
            processed_at: new Date().toISOString(),
          };
          // Preferred honest status; needs the migration that adds 'preview_only'
          // to bim_models_status_check. If that isn't applied yet, fall back to an
          // allowed status (still 0 elements + honest message, never a fake success).
          const { error: e1 } = await supabase
            .from('bim_models')
            .update({ ...patch, status: 'preview_only' })
            .eq('id', modelId)
            .eq('tenant_id', user.tenantId);
          if (e1) {
            await must(supabase
              .from('bim_models')
              .update({ ...patch, status: 'complete' })
              .eq('id', modelId)
              .eq('tenant_id', user.tenantId), 'bim_models write');
          }
        };

        if (!isTextFormat) {
          stopHeartbeat();
          await markPreviewOnly(PREVIEW_ONLY_MESSAGE);
          send('progress', { step: 7, message: '3D preview ready', pct: 100 });
          send('result', {
            modelId,
            previewOnly: true,
            elementCount: 0,
            fileType: ext,
            message: PREVIEW_ONLY_MESSAGE,
          });
          return done();
        }

        // 4. Setup Anthropic (only needed for real text analysis)
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY.' });
          await tryWrite(supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId), 'bim_models update');
          return done();
        }

        // Decode the ACTUAL model text and cap it to a safe token budget.
        const { text: modelText, truncated } = buildModelExcerpt(bytes);
        if (!modelText.trim()) {
          send('error', { message: 'Model file appears to be empty or unreadable.' });
          await tryWrite(supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId), 'bim_models update');
          return done();
        }

        send('progress', { step: 3, message: 'Sending model to AI for analysis...', pct: 20 });

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // 5. Send the REAL file text to Claude
        send('progress', { step: 4, message: 'AI is analyzing building elements...', pct: 25 });
        startHeartbeat('AI is analyzing building elements...', 25, 4);

        const preface = truncated
          ? `Below is the ACTUAL text content of an uploaded ${ext.toUpperCase()} building model. It was TRUNCATED to fit context (the STEP header plus the semantically relevant entity lines were retained). Analyze only elements that actually appear in the text and treat quantities as observed minimums — do NOT invent elements that are not present.`
          : `Below is the ACTUAL, COMPLETE text content of an uploaded ${ext.toUpperCase()} building model. Analyze only elements that actually appear in the text — do NOT invent elements that are not present.`;

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
                text: `${preface}\n\n=== BEGIN MODEL FILE (${ext}) ===\n${modelText}\n=== END MODEL FILE ===`,
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
          await tryWrite(supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId), 'bim_models update');
          return done();
        }

        send('progress', { step: 6, message: 'Saving elements to database...', pct: 85 });

        // 7. Delete existing elements and insert new ones
        await must(supabase
          .from('bim_elements')
          .delete()
          .eq('bim_model_id', modelId)
          .eq('tenant_id', user.tenantId), 'bim_elements write');

        const elements = parsed.elements.map((el: any, idx: number) => ({
          bim_model_id: modelId,
          tenant_id: user.tenantId,
          element_type: String(el.element_type || 'other').toLowerCase(),
          name: String(el.name || 'Unknown Element'),
          material: el.material || null,
          dimensions: el.dimensions || {},
          properties: {
            ...(el.properties && typeof el.properties === 'object' ? el.properties : {}),
            quantity: Math.max(1, Number(el.quantity) || 1),
            level: el.level || null,
            sort_order: idx,
          },
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
            error_message: null,
            processed_at: new Date().toISOString(),
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
        // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[bim/id/convert]', err);
    const message = "Conversion failed.";
        console.error('[bim/convert]', err);
        send('error', { message });
        try {
          await tryWrite(supabase.from('bim_models').update({ status: 'failed' }).eq('id', modelId), 'bim_models update');
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
