import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { processBlueprint } from '@/lib/blueprint-processor';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM =
  'Return ONLY raw JSON. No markdown. No backticks. No explanation. Start with { end with }.';

// ─── Takeoff prompt — compact schema ─────────────────────────────────────────
// Short keys pack 50+ items within 6000 output tokens.
// cd=CSI code, nm=CSI name, d=description+measurements, q=qty, u=unit
// r=unit rate $, tot=total cost $, h=labor hours
const TAKEOFF_PROMPT = `You are a senior construction estimator with 25+ years of field experience.
Analyze this blueprint and produce a COMPLETE material takeoff — every item visible in the drawings.

WHAT TO EXTRACT:
- Read all dimension callouts (lengths, widths, heights, areas, depths)
- Calculate quantities from those dimensions: SF, LF, CY, SY, EA, LB, TON, etc.
- Count all components: doors, windows, fixtures, equipment, structural members
- Identify ALL trades: sitework, concrete, masonry, steel, framing, roofing, insulation, drywall, flooring, painting, MEP, specialties
- Use the drawing scale if shown; otherwise estimate proportionally
- Include every material needed to build this job from ground to finish
- Put actual dimensions from the drawings in the description field

Return ONLY raw JSON. Start with { — no markdown, no code fences.

{
  "n": "project name or Unknown",
  "t": "commercial|residential|industrial|medical|educational|mixed-use",
  "sf": 5000,
  "fl": 2,
  "c": 85,
  "s": "2-sentence description of what you see",
  "i": [
    {"cd":"03 30 00","nm":"Cast-in-Place Concrete","d":"Slab 5in thick 3000psi — 14,200 SF","q":263,"u":"CY","r":165,"tot":43395,"h":53},
    {"cd":"03 21 00","nm":"Reinforcing Steel","d":"#4 rebar @ 18in OC each way, slab","q":18000,"u":"LB","r":0.85,"tot":15300,"h":45}
  ],
  "mc": 450000,
  "lc": 180000,
  "pc": 693000,
  "ct": 10,
  "rec": ["key risk or estimating note", "value engineering opportunity", "long-lead item"]
}

Keys: cd=CSI code, nm=name, d=description with dimensions, q=qty, u=unit, r=unit rate $, tot=total $, h=labor hours.
A complete commercial takeoff has 30-55 line items. Include ALL visible materials.`;

// ─── JSON repair & parse ──────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
}

function extractFirstJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let inStr = false, esc = false;
  const stack: string[] = [];
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if ((c === '}' || c === ']') && stack.length) {
      stack.pop();
      if (stack.length === 0) { end = i; break; }
    }
  }
  return end >= 0 ? text.slice(start, end + 1) : null;
}

function repairJson(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let result = s;
  if (inStr) result += '"';
  result = result.replace(/,\s*$/, '');
  while (stack.length) result += stack.pop()!;
  return result;
}

function safeJsonParse<T = any>(raw: string, label: string): T | null {
  const cleaned = stripFences(raw);
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const normalized = cleaned.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(normalized); } catch { /* continue */ }
  const candidate = extractFirstJson(normalized);
  if (!candidate) { console.error(`[analyze/${label}] No JSON found`); return null; }
  try { return JSON.parse(candidate); } catch { /* continue */ }
  try { return JSON.parse(repairJson(candidate)); } catch (e) {
    console.error(`[analyze/${label}] parse failed:`, (e as Error).message, '| first 300:', raw.slice(0, 300));
    return null;
  }
}

// ─── Content block builder ────────────────────────────────────────────────────

type ContentBlock =
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'image';    source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'text';     text: string };

function buildContent(base64: string, mimeType: string, prompt: string): ContentBlock[] {
  if (mimeType === 'application/pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: prompt },
    ];
  }
  const validImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mime = validImage.includes(mimeType) ? mimeType : 'image/jpeg';
  return [
    { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
    { type: 'text', text: prompt },
  ];
}

// ─── Item types ───────────────────────────────────────────────────────────────

interface CompactItem {
  cd?: string; nm?: string; d?: string;
  q?: number; u?: string; r?: number; tot?: number; h?: number;
}

interface TakeoffResult {
  n?: string; t?: string; sf?: number; fl?: number;
  c?: number; s?: string; i?: CompactItem[];
  mc?: number; lc?: number; pc?: number; ct?: number; rec?: string[];
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const encoder = new TextEncoder();
  const supabase = createServerClient();
  const { id: takeoffId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      // ── Helpers ──────────────────────────────────────────────────────────
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`)
          );
        } catch { /* controller closed */ }
      };

      const startHeartbeat = (message: string, pct: number, step: number) => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          send('progress', { step, message, pct });
        }, 4000); // every 4s — keeps SSE + Vercel edge proxy alive
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
        // ── 1. Load takeoff record ───────────────────────────────────────
        send('progress', { step: 1, message: 'Loading blueprint...', pct: 5 });

        const { data: takeoff, error: takeoffErr } = await supabase
          .from('takeoffs').select('*').eq('id', takeoffId).single();

        if (takeoffErr || !takeoff) {
          send('error', { message: 'Takeoff not found.' });
          return done();
        }

        if (!takeoff.storage_path && !takeoff.file_url) {
          send('error', { message: 'No blueprint uploaded. Please upload a file first.' });
          return done();
        }

        // ── 2. Mark as analyzing ─────────────────────────────────────────
        await supabase.from('takeoffs').update({ status: 'analyzing' }).eq('id', takeoffId);
        send('progress', { step: 2, message: 'Connecting to AI...', pct: 10 });

        // ── 3. Fetch file from storage (with heartbeat — can take 5-15s) ─
        send('progress', { step: 3, message: 'Downloading blueprint...', pct: 14 });
        startHeartbeat('Downloading blueprint...', 14, 3);

        const rawMime: string = takeoff.storage_path
          ? (takeoff.file_type || 'application/pdf')
          : 'application/pdf';

        let fileBuffer: ArrayBuffer;

        if (takeoff.storage_path) {
          const { data: blob, error: dlErr } = await supabase.storage
            .from('blueprints').download(takeoff.storage_path);
          stopHeartbeat();
          if (dlErr || !blob) {
            send('error', { message: 'Could not load blueprint from storage.' });
            return done();
          }
          fileBuffer = await blob.arrayBuffer();
        } else if (takeoff.file_url) {
          const resp = await fetch(takeoff.file_url);
          stopHeartbeat();
          if (!resp.ok) { send('error', { message: 'Could not load blueprint file.' }); return done(); }
          fileBuffer = await resp.arrayBuffer();
        } else {
          stopHeartbeat();
          send('error', { message: 'No blueprint file found.' });
          return done();
        }

        // ── 4. Process file (resize/trim — fast with 4-page max) ─────────
        send('progress', { step: 3, message: 'Preparing blueprint for AI...', pct: 20 });
        startHeartbeat('Preparing blueprint for AI...', 20, 3);

        const processed = await processBlueprint(fileBuffer, rawMime);
        stopHeartbeat();

        if (processed.error) {
          send('error', { message: processed.error });
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
          return done();
        }

        const { base64, mimeType } = processed;

        // ── 5. Anthropic setup ───────────────────────────────────────────
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // ── 6. Streaming Claude call — heartbeats keep SSE alive ─────────
        // Critical: non-streaming calls go silent for 30-90s → proxy kills connection.
        // With stream: true, tokens flow continuously → connection stays alive.
        send('progress', { step: 4, message: 'AI is reading your blueprint...', pct: 25 });

        const startMs = Date.now();
        let accumulated = '';
        let lastPct = 25;

        const claudeStream = await client.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 6000,
          system:     SYSTEM,
          messages:   [{ role: 'user', content: buildContent(base64, mimeType, TAKEOFF_PROMPT) as any }],
          stream:     true,
        });

        // Iterate streaming events — each text delta keeps the SSE alive
        // Also send explicit progress updates every ~5 seconds
        let lastHeartbeatMs = Date.now();

        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            accumulated += event.delta.text;

            const now = Date.now();
            if (now - lastHeartbeatMs > 5000) {
              // Progress 25→70 while Claude is writing tokens
              lastPct = Math.min(70, 25 + Math.floor((accumulated.length / 6000) * 45));
              send('progress', { step: 4, message: 'AI analyzing blueprint...', pct: lastPct });
              lastHeartbeatMs = now;
            }
          }
        }

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[analyze] Claude streaming done: ${elapsed}s, chars: ${accumulated.length}`);

        send('progress', { step: 5, message: 'Processing AI results...', pct: 75 });

        // ── 7. Parse response ────────────────────────────────────────────
        const parsed = safeJsonParse<TakeoffResult>(accumulated, 'main');

        if (!parsed) {
          console.error('[analyze] No JSON parsed. Raw:', accumulated.slice(0, 500));
          send('error', { message: 'AI returned an unexpected format. Please try again.' });
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
          return done();
        }

        if ('error' in parsed && typeof (parsed as any).error === 'string') {
          send('error', { message: (parsed as any).error });
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
          return done();
        }

        send('progress', { step: 6, message: 'Saving materials to database...', pct: 85 });

        // ── 8. Expand items & save to DB ─────────────────────────────────
        const items = (parsed.i || []).map((item: CompactItem, idx: number) => ({
          takeoff_id:  takeoffId,
          csi_code:    item.cd  || '',
          csi_name:    item.nm  || '',
          description: item.d   || '',
          quantity:    Number(item.q)   || 0,
          unit:        item.u   || 'LS',
          unit_cost:   Number(item.r)   || 0,
          total_cost:  Number(item.tot) || 0,
          labor_hours: Number(item.h)   || 0,
          notes:       '',
          sort_order:  idx,
        }));

        if (items.length > 0) {
          await supabase.from('takeoff_materials').delete().eq('takeoff_id', takeoffId);
          const { error: insErr } = await supabase.from('takeoff_materials').insert(items);
          if (insErr) {
            console.error('[analyze] insert materials error:', insErr);
            // Don't fail — results still readable from result event
          }
        }

        // ── 9. Update takeoff summary ────────────────────────────────────
        const { error: updateErr } = await supabase.from('takeoffs').update({
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
        }).eq('id', takeoffId);

        if (updateErr) console.error('[analyze] update takeoff error:', updateErr);

        send('progress', { step: 7, message: 'Complete!', pct: 100 });

        // ── 10. Result event ─────────────────────────────────────────────
        const expandedItems = items.map((row) => ({
          csiCode:     row.csi_code,
          csiDivision: row.csi_code.slice(0, 2),
          csiName:     row.csi_name,
          description: row.description,
          quantity:    row.quantity,
          unit:        row.unit,
          unitCost:    row.unit_cost,
          totalCost:   row.total_cost,
          laborHours:  row.labor_hours,
          notes:       '',
        }));

        send('result', {
          takeoffId,
          projectName:       parsed.n   || '',
          buildingType:      parsed.t   || '',
          estimatedSF:       parsed.sf  || 0,
          confidence:        parsed.c   || 0,
          summary:           parsed.s   || '',
          items:             expandedItems,
          totalMaterialCost: parsed.mc  || 0,
          totalLaborCost:    parsed.lc  || 0,
          totalProjectCost:  parsed.pc  || 0,
          contingency:       parsed.ct  || 10,
          recommendations:   parsed.rec || [],
          itemCount:         expandedItems.length,
        });

        done();

      } catch (err: unknown) {
        stopHeartbeat();
        let message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        if (
          message.toLowerCase().includes('prompt is too long') ||
          message.toLowerCase().includes('context length')
        ) {
          message = 'Blueprint is too large for AI analysis. Try a smaller file or fewer PDF pages.';
        }
        console.error('[takeoff/analyze]', err);
        send('error', { message });
        try {
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
        } catch { /* non-fatal */ }
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
