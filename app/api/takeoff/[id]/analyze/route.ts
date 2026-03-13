import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { processBlueprint } from '@/lib/blueprint-processor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── System prompt — forces raw JSON on every call ───────────────────────────
const SYSTEM = 'Return ONLY raw JSON. No markdown. No backticks. Start with { end with }. Your entire response must be a single valid JSON object.';

// ─── JSON utilities ──────────────────────────────────────────────────────────

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
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
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
  // Try direct parse
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  // Try extracting first JSON object
  const candidate = extractFirstJson(cleaned);
  if (!candidate) {
    console.error(`[analyze/${label}] No JSON found in response`);
    return null;
  }
  // Try with trailing comma removal
  const normalized = candidate.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(normalized); } catch { /* continue */ }
  // Try repair (truncated output)
  try { return JSON.parse(repairJson(normalized)); } catch (e) {
    console.error(`[analyze/${label}] JSON parse failed:`, e);
    return null;
  }
}

function getText(response: any): string {
  return response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

// ─── Content block builder ───────────────────────────────────────────────────

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

// ─── Claude caller ───────────────────────────────────────────────────────────

async function callClaude(client: any, base64: string, mimeType: string, prompt: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildContent(base64, mimeType, prompt) as any }],
  });
  return getText(response);
}

// ─── Stage prompts ───────────────────────────────────────────────────────────

const PROMPT_STAGE1 = `Analyze this construction blueprint and detect all project intelligence. Return JSON:
{
  "project_name": "detected name or Unknown",
  "address": "detected address or Unknown",
  "building_type": "commercial|residential|industrial|medical|educational|mixed-use",
  "occupancy_class": "IBC occupancy classification",
  "construction_type": "Type I-A|I-B|II-A|II-B|III-A|III-B|IV|V-A|V-B",
  "total_sf": 0,
  "floors": 1,
  "units": 0,
  "scale": "detected scale or N/A",
  "sheet_list": ["S-1","A-1"],
  "ada_items": ["list of ADA features visible"],
  "fire_sprinklers_required": true,
  "seismic_zone": "2B",
  "summary": "2-sentence description of what you see",
  "confidence": 85
}
Arizona projects default to Seismic Zone 2B. Detect everything visible in the drawings.`;

const PROMPT_STAGE2 = `From this blueprint, create an SVG floor plan. Return JSON:
{
  "svg": "<svg>...</svg>",
  "rooms": [{"name":"Room Name","sf":200,"x":10,"y":10,"w":100,"h":80}]
}

SVG requirements:
- viewBox appropriate for the building dimensions
- Room outlines as rectangles/polygons with labels and SF
- Wall dimensions as text annotations
- Door swings as arcs, window locations as double lines
- Color coding: structural walls=#9CA3AF, mechanical=#3B82F6, electrical=#EAB308, plumbing=#06B6D4, fire protection=#EF4444
- Include a north arrow (top-right), scale bar (bottom-left), title block (bottom-right)
- Use font-family="system-ui" font-size="12" for labels
- Keep SVG under 6000 characters total`;

const PROMPT_STAGE3 = `From this blueprint, create a Three.js scene configuration. Return JSON:
{
  "walls": [{"x1":0,"y1":0,"x2":10,"y2":0,"height":3,"thickness":0.15,"material":"concrete"}],
  "rooms": [{"name":"Office","x":0,"y":0,"width":5,"depth":4,"height":3}],
  "roof": {"type":"flat|gable|hip","pitch":0,"overhang":0.5},
  "dimensions": {"length":30,"width":20,"height":3,"floors":1},
  "doors": [{"x":2.5,"y":0,"width":0.9,"height":2.1,"swing":"in"}],
  "windows": [{"x":5,"y":0,"width":1.2,"height":1.5,"sill_height":0.9}],
  "cameras": {
    "isometric":{"x":40,"y":30,"z":40,"target":[15,0,10]},
    "front":{"x":15,"y":5,"z":30,"target":[15,1.5,0]},
    "side":{"x":40,"y":5,"z":10,"target":[0,1.5,10]},
    "aerial":{"x":15,"y":40,"z":10,"target":[15,0,10]}
  },
  "materials": {
    "concrete":{"color":"#9CA3AF"},
    "wood":{"color":"#D2B48C"},
    "steel":{"color":"#C0C0C0"},
    "glass":{"color":"#ADD8E6","opacity":0.4}
  }
}
Use meters. Commercial default ceiling 3.05m (10ft), residential 2.74m (9ft). Detect from drawings if visible.`;

const PROMPT_STAGE4 = `Produce a material takeoff with exactly 15-20 of the highest-value line items across all visible CSI divisions.

For EACH item return:
{"cd":"03 30 00","div":"03","nm":"Cast-in-Place Concrete","d":"Slab on grade 5in thick 3000psi","q":420,"u":"CY","uc":165,"luc":45,"tmc":69300,"tlc":18900,"tc":88200,"sp":98784,"h":84,"cs":4,"dur":5,"sub":false,"n":"","rec":"","conf":85,"alt":"","asav":0}

Keys: cd=CSI code, div=CSI division (2-digit), nm=CSI name, d=description with measurements, q=quantity, u=unit, uc=unit material cost, luc=labor unit cost, tmc=total material cost, tlc=total labor cost, tc=total cost, sp=sell price (tc×1.12), h=labor hours, cs=crew size, dur=duration days, sub=is subcontractor, n=notes, rec=recommendation, conf=confidence 0-100, alt=alternative material, asav=alternative savings $

Return JSON:
{
  "items": [...],
  "total_material": 0,
  "total_labor": 0,
  "total_cost": 0
}`;

const PROMPT_STAGE6 = `Based on this blueprint, generate 8-12 specific construction recommendations. Return JSON:
{
  "recommendations": [
    {"category":"value_engineering","text":"specific recommendation","impact":"high|medium|low","savings_estimate":0},
    {"category":"risk","text":"...","impact":"...","savings_estimate":0},
    {"category":"long_lead","text":"...","impact":"...","savings_estimate":0},
    {"category":"sub_packages","text":"...","impact":"...","savings_estimate":0},
    {"category":"permits","text":"...","impact":"...","savings_estimate":0},
    {"category":"code","text":"...","impact":"...","savings_estimate":0},
    {"category":"market","text":"...","impact":"...","savings_estimate":0}
  ]
}
Categories: value_engineering, risk, long_lead, sub_packages, permits, code, market, scheduling, safety, sustainability.
Be specific to what you see in this blueprint. Reference actual materials, dimensions, and systems visible.`;

// ─── Route ───────────────────────────────────────────────────────────────────

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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`));
        } catch { /* controller closed */ }
      };
      const done = () => {
        send('done', {});
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // ── Load takeoff + blueprint ───────────────────────────────────────
        send('progress', { stage: 0, step: 'load', message: 'Loading blueprint...', pct: 2 });

        const { data: takeoff, error: takeoffErr } = await supabase
          .from('takeoffs').select('*').eq('id', takeoffId).single();

        if (takeoffErr || !takeoff) { send('error', { message: 'Takeoff not found' }); return done(); }
        if (!takeoff.storage_path && !takeoff.file_url) {
          send('error', { message: 'No blueprint uploaded. Please upload a file first.' }); return done();
        }

        await supabase.from('takeoffs').update({ status: 'analyzing' }).eq('id', takeoffId);

        const rawMime: string = takeoff.storage_path ? (takeoff.file_type || 'application/pdf') : 'application/pdf';
        let fileBuffer: ArrayBuffer;

        if (takeoff.storage_path) {
          const { data: blob, error: dlErr } = await supabase.storage.from('blueprints').download(takeoff.storage_path);
          if (dlErr || !blob) { send('error', { message: 'Could not load blueprint from storage.' }); return done(); }
          fileBuffer = await blob.arrayBuffer();
        } else if (takeoff.file_url) {
          const resp = await fetch(takeoff.file_url);
          if (!resp.ok) { send('error', { message: 'Could not load blueprint file.' }); return done(); }
          fileBuffer = await resp.arrayBuffer();
        } else {
          send('error', { message: 'No blueprint file found.' }); return done();
        }

        const processed = await processBlueprint(fileBuffer, rawMime);
        if (processed.error) {
          send('error', { message: processed.error });
          await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
          return done();
        }

        const { base64, mimeType } = processed;

        // Anthropic key check
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // ════════════════════════════════════════════════════════════════════
        // STAGE 1 — Blueprint Intelligence (0-20%)
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 1, step: 'start', message: 'Stage 1: Detecting project intelligence...', pct: 5 });

        let intel: any = {};
        try {
          send('progress', { stage: 1, step: 'detecting', message: 'Detecting project name, building type, construction class...', pct: 8 });
          const raw1 = await callClaude(client, base64, mimeType, PROMPT_STAGE1);
          intel = safeJsonParse(raw1, 'stage1') || {};

          send('progress', { stage: 1, step: 'project', message: `Project: ${intel.project_name || 'Unknown'}`, pct: 10 });
          send('progress', { stage: 1, step: 'building', message: `Type: ${intel.building_type || 'Unknown'} · ${intel.construction_type || 'Unknown'}`, pct: 12 });
          send('progress', { stage: 1, step: 'area', message: `Area: ${(intel.total_sf || 0).toLocaleString()} SF · ${intel.floors || 1} floor(s)`, pct: 14 });
          send('progress', { stage: 1, step: 'code', message: `Seismic: ${intel.seismic_zone || '2B'} · Sprinklers: ${intel.fire_sprinklers_required ? 'Yes' : 'No'}`, pct: 16 });
          send('progress', { stage: 1, step: 'ada', message: `ADA items: ${(intel.ada_items || []).length} detected`, pct: 18 });
          send('progress', { stage: 1, step: 'complete', message: 'Blueprint intelligence complete', pct: 20 });
        } catch (err) {
          console.error('[analyze/stage1]', err);
          send('progress', { stage: 1, step: 'fallback', message: 'Blueprint intelligence: partial detection', pct: 20 });
        }

        // Save Stage 1 results
        try {
          await supabase.from('takeoffs').update({
            project_name_detected: intel.project_name || '',
            building_type:         intel.building_type || '',
            building_area:         intel.total_sf || 0,
            floor_count:           intel.floors || 1,
            confidence:            intel.confidence || 0,
            summary:               intel.summary || '',
          }).eq('id', takeoffId);
        } catch (e) { console.error('[analyze/stage1] save error:', e); }

        // ════════════════════════════════════════════════════════════════════
        // STAGE 2 — 2D SVG Floor Plan (20-40%)
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 2, step: 'start', message: 'Stage 2: Generating 2D floor plan...', pct: 22 });

        let svgData: any = {};
        try {
          send('progress', { stage: 2, step: 'generating', message: 'Creating room outlines and dimensions...', pct: 26 });
          const raw2 = await callClaude(client, base64, mimeType, PROMPT_STAGE2);
          svgData = safeJsonParse(raw2, 'stage2') || {};

          if (svgData.svg) {
            send('progress', { stage: 2, step: 'rooms', message: `Floor plan: ${(svgData.rooms || []).length} rooms mapped`, pct: 34 });
            try {
              await supabase.from('takeoffs').update({ drawing_2d: svgData.svg }).eq('id', takeoffId);
            } catch (e) { console.error('[analyze/stage2] save error:', e); }
          }
          send('progress', { stage: 2, step: 'complete', message: '2D floor plan complete', pct: 40 });
        } catch (err) {
          console.error('[analyze/stage2]', err);
          send('progress', { stage: 2, step: 'fallback', message: '2D floor plan: generation skipped', pct: 40 });
        }

        // ════════════════════════════════════════════════════════════════════
        // STAGE 3 — 3D Model Config (40-55%)
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 3, step: 'start', message: 'Stage 3: Building 3D model...', pct: 42 });

        let model3d: any = {};
        try {
          send('progress', { stage: 3, step: 'generating', message: 'Extruding walls, placing doors and windows...', pct: 46 });
          const raw3 = await callClaude(client, base64, mimeType, PROMPT_STAGE3);
          model3d = safeJsonParse(raw3, 'stage3') || {};

          const wallCount = (model3d.walls || []).length;
          const doorCount = (model3d.doors || []).length;
          send('progress', { stage: 3, step: 'geometry', message: `3D model: ${wallCount} walls, ${doorCount} doors, roof: ${model3d.roof?.type || 'flat'}`, pct: 52 });

          if (Object.keys(model3d).length > 0) {
            try {
              await supabase.from('takeoffs').update({ model_3d: model3d }).eq('id', takeoffId);
            } catch (e) { console.error('[analyze/stage3] save error:', e); }
          }
          send('progress', { stage: 3, step: 'complete', message: '3D model complete', pct: 55 });
        } catch (err) {
          console.error('[analyze/stage3]', err);
          send('progress', { stage: 3, step: 'fallback', message: '3D model: generation skipped', pct: 55 });
        }

        // ════════════════════════════════════════════════════════════════════
        // STAGE 4 — Full Material Takeoff (55-75%)
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 4, step: 'start', message: 'Stage 4: Generating material takeoff...', pct: 57 });

        let takeoffData: any = {};
        let materialRows: any[] = [];
        try {
          send('progress', { stage: 4, step: 'analyzing', message: 'Calculating quantities across all CSI divisions...', pct: 60 });
          const raw4 = await callClaude(client, base64, mimeType, PROMPT_STAGE4);
          takeoffData = safeJsonParse(raw4, 'stage4') || {};

          const items = takeoffData.items || [];
          send('progress', { stage: 4, step: 'items', message: `Takeoff: ${items.length} line items extracted`, pct: 68 });

          // Expand compact items to full DB rows
          materialRows = items.map((item: any, idx: number) => ({
            takeoff_id:          takeoffId,
            csi_code:            item.cd  || '',
            csi_division:        item.div || (item.cd || '').slice(0, 2).replace(/\s/g, ''),
            csi_name:            item.nm  || '',
            description:         item.d   || '',
            quantity:            Number(item.q)   || 0,
            unit:                item.u   || 'LS',
            unit_cost:           Number(item.uc)  || 0,
            labor_unit_cost:     Number(item.luc) || 0,
            total_material_cost: Number(item.tmc) || 0,
            total_labor_cost:    Number(item.tlc) || 0,
            total_cost:          Number(item.tc)  || 0,
            sell_price:          Number(item.sp)  || Math.round((Number(item.tc) || 0) * 1.12),
            labor_hours:         Number(item.h)   || 0,
            crew_size:           Number(item.cs)  || 1,
            duration_days:       Number(item.dur) || 0,
            is_subcontractor:    Boolean(item.sub),
            notes:               item.n   || '',
            recommendation:      item.rec || '',
            confidence_score:    Number(item.conf) || 0,
            alternative_material: item.alt  || '',
            alternative_savings: Number(item.asav) || 0,
            sort_order:          idx,
          }));

          // Save materials
          if (materialRows.length > 0) {
            send('progress', { stage: 4, step: 'saving', message: 'Saving line items to database...', pct: 72 });
            await supabase.from('takeoff_materials').delete().eq('takeoff_id', takeoffId);
            const { error: insertErr } = await supabase.from('takeoff_materials').insert(materialRows);
            if (insertErr) console.error('[analyze/stage4] insert error:', insertErr);
          }

          send('progress', { stage: 4, step: 'complete', message: `Material takeoff complete: ${materialRows.length} items`, pct: 75 });
        } catch (err) {
          console.error('[analyze/stage4]', err);
          send('progress', { stage: 4, step: 'fallback', message: 'Material takeoff: partial results', pct: 75 });
        }

        // ════════════════════════════════════════════════════════════════════
        // STAGE 5 — Job Cost Summary (75-85%) — computed from Stage 4
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 5, step: 'start', message: 'Stage 5: Calculating job cost summary...', pct: 77 });

        const directMaterial = materialRows.reduce((s, r) => s + (r.total_material_cost || 0), 0);
        const directLabor   = materialRows.reduce((s, r) => s + (r.total_labor_cost || 0), 0);
        const subCosts      = materialRows.filter(r => r.is_subcontractor).reduce((s, r) => s + (r.total_cost || 0), 0);
        const directCost    = directMaterial + directLabor + subCosts;

        const equipment       = Math.round(directCost * 0.03);
        const tempFacilities  = Math.round(directCost * 0.015);
        const generalCond     = Math.round(directCost * 0.08);
        const totalDirect     = directCost + equipment + tempFacilities + generalCond;

        const overhead        = Math.round(totalDirect * 0.10);
        const profit          = Math.round(totalDirect * 0.12);
        const contingency     = Math.round(totalDirect * 0.05);
        const subtotalBid     = totalDirect + overhead + profit + contingency;

        const bond            = Math.round(subtotalBid * 0.015);
        const insurance       = Math.round(subtotalBid * 0.02);
        const totalBidPrice   = subtotalBid + bond + insurance;
        const sellPrice       = Math.round(totalBidPrice * 1.12);
        const grossProfit     = sellPrice - totalBidPrice;
        const grossProfitPct  = totalBidPrice > 0 ? Math.round((grossProfit / sellPrice) * 100) : 0;
        const buildingSF      = intel.total_sf || takeoff.building_area || 1;
        const costPerSF       = Math.round(totalBidPrice / buildingSF);

        send('progress', { stage: 5, step: 'direct', message: `Direct costs: ${fmtDollar(directCost)}`, pct: 79 });
        send('progress', { stage: 5, step: 'markup', message: `OH&P: ${fmtDollar(overhead + profit)} · Contingency: ${fmtDollar(contingency)}`, pct: 81 });
        send('progress', { stage: 5, step: 'total', message: `Total bid: ${fmtDollar(totalBidPrice)} · ${fmtDollar(costPerSF)}/SF`, pct: 83 });

        const costSummary = {
          direct_material: directMaterial,
          direct_labor: directLabor,
          sub_costs: subCosts,
          equipment,
          temp_facilities: tempFacilities,
          general_conditions: generalCond,
          overhead,
          profit,
          contingency,
          bond,
          insurance,
          total_bid_price: totalBidPrice,
          sell_price: sellPrice,
          gross_profit: grossProfit,
          gross_profit_pct: grossProfitPct,
          cost_per_sf: costPerSF,
        };

        try {
          await supabase.from('takeoffs').update({
            material_cost:   directMaterial,
            labor_cost:      directLabor,
            total_cost:      totalBidPrice,
            contingency_pct: 5,
            cost_summary:    costSummary,
          }).eq('id', takeoffId);
        } catch (e) { console.error('[analyze/stage5] save error:', e); }

        send('progress', { stage: 5, step: 'complete', message: 'Job cost summary complete', pct: 85 });

        // ════════════════════════════════════════════════════════════════════
        // STAGE 6 — Sage Recommendations (85-95%)
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 6, step: 'start', message: 'Stage 6: Generating recommendations...', pct: 87 });

        let recommendations: any[] = [];
        try {
          send('progress', { stage: 6, step: 'analyzing', message: 'Analyzing value engineering and risk items...', pct: 89 });
          const raw6 = await callClaude(client, base64, mimeType, PROMPT_STAGE6);
          const recData = safeJsonParse(raw6, 'stage6') || {};
          recommendations = recData.recommendations || [];

          send('progress', { stage: 6, step: 'items', message: `${recommendations.length} recommendations generated`, pct: 93 });

          try {
            await supabase.from('takeoffs').update({
              recommendations,
            }).eq('id', takeoffId);
          } catch (e) { console.error('[analyze/stage6] save error:', e); }

          send('progress', { stage: 6, step: 'complete', message: 'Recommendations complete', pct: 95 });
        } catch (err) {
          console.error('[analyze/stage6]', err);
          send('progress', { stage: 6, step: 'fallback', message: 'Recommendations: generation skipped', pct: 95 });
        }

        // ════════════════════════════════════════════════════════════════════
        // STAGE 7 — Complete (95-100%)
        // ════════════════════════════════════════════════════════════════════
        send('progress', { stage: 7, step: 'finalizing', message: 'Stage 7: Finalizing analysis...', pct: 97 });

        try {
          await supabase.from('takeoffs').update({
            status:      'complete',
            analyzed_at: new Date().toISOString(),
          }).eq('id', takeoffId);
        } catch (e) { console.error('[analyze/stage7] save error:', e); }

        send('progress', { stage: 7, step: 'complete', message: 'Analysis complete!', pct: 100 });

        // Final result payload
        send('result', {
          takeoffId,
          intel,
          svgFloorPlan: svgData.svg || null,
          model3d: Object.keys(model3d).length > 0 ? model3d : null,
          itemCount: materialRows.length,
          costSummary,
          recommendations,
          totalBidPrice,
          sellPrice,
          costPerSF,
        });

        done();

      } catch (err: unknown) {
        let message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        if (message.toLowerCase().includes('prompt is too long') || message.toLowerCase().includes('context length')) {
          message = 'Blueprint is too large for AI analysis. Try a smaller file, fewer pages, or lower resolution.';
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

function fmtDollar(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
