import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { processBlueprint } from '@/lib/blueprint-processor';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Compact JSON schema — short keys let Claude pack items into output tokens.
// Keys: n=projectName, t=buildingType, sf=sqFt, fl=floors, c=confidence(0-100),
//       s=summary, i=items[], mc=materialCost, lc=laborCost, pc=totalProjectCost,
//       ct=contingency%, rec=recommendations[]
// Item keys: cd=csiCode, nm=csiName, d=description+measurement, q=quantity,
//            u=unit, r=unitRate, tot=totalCost, h=laborHours

const TAKEOFF_SYSTEM = `You are a senior construction estimator. You ONLY output raw JSON. Never use markdown, code fences, or explanatory text. Your entire response must be a single JSON object starting with { and ending with }. No exceptions.`;

const TAKEOFF_PROMPT = `Analyze this blueprint and produce a material takeoff with 15-20 of the HIGHEST-VALUE line items across all major CSI divisions visible in the drawings.

WHAT TO EXTRACT:
- Read all dimension callouts (lengths, widths, heights, areas, depths)
- Calculate quantities from those dimensions: SF, LF, CY, SY, EA, LB, TON, etc.
- Count all components: doors, windows, fixtures, equipment, structural members
- Identify the most significant trades: sitework, concrete, masonry, steel, framing, roofing, insulation, drywall, flooring, painting, MEP, specialties
- Use the drawing scale if shown; otherwise estimate proportionally
- Focus on the 15-20 items that represent the largest cost impact

Return ONLY raw JSON — no markdown, no code fences, no explanation. Start with {

If you cannot output valid JSON, respond precisely with:
{"error":"<brief reason>"}

Example output:
{
  "n": "project name or Unknown",
  "t": "commercial|residential|industrial|medical|etc",
  "sf": 5000,
  "fl": 2,
  "c": 85,
  "s": "2-sentence description of what you see in the blueprint",
  "i": [
    {"cd":"03 30 00","nm":"Cast-in-Place Concrete","d":"Slab on grade 5in thick 3000psi 14200 SF","q":420,"u":"CY","r":165,"tot":69300,"h":84},
    {"cd":"03 21 00","nm":"Reinforcing Steel","d":"#4 rebar 18in OC each way slab","q":12600,"u":"LB","r":0.85,"tot":10710,"h":126}
  ],
  "mc": 450000,
  "lc": 180000,
  "pc": 693000,
  "ct": 10,
  "rec": ["key risk or estimating note", "second note", "third note"]
}

Key: cd=CSI code, nm=CSI name, d=description with actual measurements from drawing, q=quantity, u=unit, r=unit rate $, tot=total cost $, h=labor hours

Return exactly 15-20 line items covering the highest-cost items across all visible CSI divisions.
Put actual dimensions in the description field.`;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CompactItem {
  cd?: string; nm?: string; d?: string;
  q?: number; u?: string; r?: number; tot?: number; h?: number;
}

interface CompactResponse {
  n?: string; t?: string; sf?: number; fl?: number;
  c?: number; s?: string; i?: CompactItem[];
  mc?: number; lc?: number; pc?: number; ct?: number; rec?: string[];
}

interface ExpandedItem {
  csiCode: string; csiName: string; description: string;
  quantity: number; unit: string; unitCost: number;
  totalCost: number; laborHours: number; sortOrder: number;
}

function expandItem(item: CompactItem, idx: number): ExpandedItem {
  return {
    csiCode:     item.cd  || '',
    csiName:     item.nm  || '',
    description: item.d   || '',
    quantity:    Number(item.q)   || 0,
    unit:        item.u   || 'LS',
    unitCost:    Number(item.r)   || 0,
    totalCost:   Number(item.tot) || 0,
    laborHours:  Number(item.h)   || 0,
    sortOrder:   idx,
  };
}

// Repair truncated JSON — closes unclosed strings, arrays, and objects when
// Claude hits max_tokens mid-response.
function repairTruncatedJson(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const c of s) {
    if (esc)             { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"')       { inStr = !inStr; continue; }
    if (inStr)           continue;
    if (c === '{')       stack.push('}');
    else if (c === '[')  stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let result = s;
  if (inStr) result += '"';
  result = result.replace(/,\s*$/, '');
  while (stack.length) result += stack.pop()!;
  return result;
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const encoder = new TextEncoder();
  const supabase = createServerClient();
  const { id: takeoffId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`)
          );
        } catch {
          // controller may already be closed
        }
      };

      const done = () => {
        send('done', {});
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // 1. Load takeoff record
        send('progress', { step: 1, message: 'Loading blueprint...', pct: 5 });

        const { data: takeoff, error: takeoffErr } = await supabase
          .from('takeoffs')
          .select('*')
          .eq('id', takeoffId)
          .single();

        if (takeoffErr || !takeoff) {
          send('error', { message: 'Takeoff not found' });
          return done();
        }

        if (!takeoff.storage_path && !takeoff.file_url) {
          send('error', { message: 'No blueprint uploaded. Please upload a file first.' });
          return done();
        }

        // 2. Mark as analyzing
        await supabase.from('takeoffs').update({ status: 'analyzing' }).eq('id', takeoffId);
        send('progress', { step: 2, message: 'Sending blueprint to AI...', pct: 15 });

        // 3. Fetch the file
        const rawMime: string = takeoff.storage_path
          ? takeoff.file_type || 'application/pdf'
          : 'application/pdf';

        let fileBuffer: ArrayBuffer;

        if (takeoff.storage_path) {
          const { data: blob, error: dlErr } = await supabase.storage
            .from('blueprints')
            .download(takeoff.storage_path);
          if (dlErr || !blob) {
            send('error', { message: 'Could not load blueprint from storage.' });
            return done();
          }
          fileBuffer = await blob.arrayBuffer();
        } else if (takeoff.file_url) {
          const fileResponse = await fetch(takeoff.file_url);
          if (!fileResponse.ok) {
            send('error', { message: 'Could not load blueprint file.' });
            return done();
          }
          fileBuffer = await fileResponse.arrayBuffer();
        } else {
          send('error', { message: 'No blueprint file found for this takeoff.' });
          return done();
        }

        const MB = 1024 * 1024;
        if (fileBuffer.byteLength > 50 * MB) {
          send('error', { message: `Blueprint file is too large (${Math.round(fileBuffer.byteLength / MB)}MB). Maximum is 50MB.` });
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
          return done();
        }

        const { base64, mimeType } = await processBlueprint(fileBuffer, rawMime);

        send('progress', { step: 3, message: 'AI is reading your blueprint...', pct: 25 });

        // 4. Anthropic key check
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        send('progress', { step: 4, message: 'Analyzing dimensions and materials...', pct: 40 });

        // 5. Build message content
        type ContentBlock =
          | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
          | { type: 'image';    source: { type: 'base64'; media_type: string; data: string } }
          | { type: 'text';     text: string };

        let messageContent: ContentBlock[];

        if (mimeType === 'application/pdf') {
          messageContent = [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: TAKEOFF_PROMPT },
          ];
        } else {
          const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          const imageMime = validImageTypes.includes(mimeType) ? mimeType : 'image/jpeg';
          messageContent = [
            { type: 'image', source: { type: 'base64', media_type: imageMime, data: base64 } },
            { type: 'text', text: TAKEOFF_PROMPT },
          ];
        }

        send('progress', { step: 5, message: 'Calculating all quantities and costs...', pct: 55 });

        // 6. Call Claude — opus-4-6 for best blueprint vision accuracy
        const response = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8000,
          system: TAKEOFF_SYSTEM,
          messages: [{
            role: 'user',
            content: messageContent as Parameters<typeof client.messages.create>[0]['messages'][0]['content'],
          }],
        });

        send('progress', { step: 6, message: 'Processing results...', pct: 75 });

        // 7. Parse response — strip markdown fences if present
        const rawText = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join('');

        const cleaned = rawText
          .replace(/^```json\s*/im, '')
          .replace(/^```\s*/im, '')
          .replace(/\s*```\s*$/im, '')
          .trim();

        const extractFirstJsonObject = (text: string): string | null => {
          const start = text.indexOf('{');
          if (start < 0) return null;

          let inStr = false;
          let esc = false;
          const stack: string[] = [];
          let end = -1;

          for (let i = start; i < text.length; i += 1) {
            const c = text[i];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;

            if (c === '{') stack.push('}');
            else if (c === '[') stack.push(']');
            else if ((c === '}' || c === ']') && stack.length) {
              stack.pop();
              if (stack.length === 0) {
                end = i;
                break;
              }
            }
          }

          return end >= 0 ? text.slice(start, end + 1) : null;
        };

        const normalizeJson = (json: string): string => {
          // Remove trailing commas before closing braces/brackets
          return json.replace(/,\s*(?=[}\]])/g, '');
        };

        let parsed: CompactResponse;

        const parseCandidate = (candidate: string): CompactResponse => {
          const normalized = normalizeJson(candidate);
          try {
            return JSON.parse(normalized);
          } catch (e) {
            // Try repairing truncated JSON (e.g. token cutoff)
            const repaired = repairTruncatedJson(normalized);
            return JSON.parse(repaired);
          }
        };

        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const candidate = extractFirstJsonObject(cleaned);
          if (!candidate) {
            console.error('[takeoff/analyze] No JSON in response. Raw:', rawText.substring(0, 1200));
            send('error', { message: 'AI could not parse blueprint. Please try a clearer image or PDF.' });
            await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
            return done();
          }

          try {
            parsed = parseCandidate(candidate);
          } catch (e2) {
            console.error('[takeoff/analyze] JSON parse failed:', e2, '\nCandidate:', candidate.substring(0, 1200));
            send('error', { message: 'AI returned an unexpected format. Please try again.' });
            await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
            return done();
          }
        }

        if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as any).error === 'string') {
          send('error', { message: (parsed as any).error });
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
          return done();
        }

        send('progress', { step: 7, message: 'Saving results...', pct: 85 });

        // 8. Expand compact items → full field names
        const expandedItems: ExpandedItem[] = (parsed.i || []).map(expandItem);

        // 9. Save materials (delete old first, then insert with sort_order)
        if (expandedItems.length > 0) {
          await supabase.from('takeoff_materials').delete().eq('takeoff_id', takeoffId);

          const rows = expandedItems.map((item) => ({
            takeoff_id:  takeoffId,
            csi_code:    item.csiCode,
            csi_name:    item.csiName,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit,
            unit_cost:   item.unitCost,
            total_cost:  item.totalCost,
            labor_hours: item.laborHours,
            notes:       '',
            sort_order:  item.sortOrder,
          }));

          const { error: insertErr } = await supabase.from('takeoff_materials').insert(rows);
          if (insertErr) console.error('[takeoff/analyze] insert materials error:', insertErr);
        }

        // 10. Update takeoff summary
        const { error: updateErr } = await supabase
          .from('takeoffs')
          .update({
            status:                'complete',
            building_area:         parsed.sf  || 0,
            floor_count:           parsed.fl  || 1,
            total_cost:            parsed.pc  || 0,
            confidence:            parsed.c   || 0,
            project_name_detected: parsed.n   || '',
            building_type:         parsed.t   || '',
            summary:               parsed.s   || '',
            recommendations:       parsed.rec || [],
            material_cost:         parsed.mc  || 0,
            labor_cost:            parsed.lc  || 0,
            contingency_pct:       parsed.ct  || 10,
            analyzed_at:           new Date().toISOString(),
          })
          .eq('id', takeoffId);

        if (updateErr) console.error('[takeoff/analyze] update takeoff error:', updateErr);

        send('progress', { step: 8, message: 'Complete!', pct: 100 });

        send('result', {
          takeoffId,
          projectName:       parsed.n,
          buildingType:      parsed.t,
          estimatedSF:       parsed.sf,
          confidence:        parsed.c,
          summary:           parsed.s,
          items:             expandedItems,
          totalMaterialCost: parsed.mc,
          totalLaborCost:    parsed.lc,
          totalProjectCost:  parsed.pc,
          contingency:       parsed.ct,
          recommendations:   parsed.rec,
          itemCount:         expandedItems.length,
        });

        done();

      } catch (err: unknown) {
        let message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        if (message.toLowerCase().includes('prompt is too long') || message.toLowerCase().includes('context length')) {
          message = 'Blueprint is too large for AI analysis. Try a smaller file, fewer PDF pages, or a lower-resolution image.';
        }
        console.error('[takeoff/analyze]', err);
        send('error', { message });
        try { await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId); } catch { /* non-fatal */ }
        done();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
