import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TAKEOFF_PROMPT = `You are an expert construction estimator with 25+ years of experience.
You are analyzing a construction blueprint. Your job is to perform a COMPLETE material takeoff.

INSTRUCTIONS:
1. Examine every sheet, every room, every detail in the blueprint
2. Calculate ALL quantities for every material visible
3. Organize by CSI MasterFormat division codes
4. Be precise with quantities — use the scale if visible, or estimate from proportions
5. Include EVERY trade: concrete, steel, framing, roofing, MEP, finishes, sitework

Return ONLY a valid JSON object. No markdown. No explanation. Just JSON.

Format:
{
  "projectName": "detected project name or Unknown",
  "buildingType": "commercial/residential/industrial/medical/etc",
  "estimatedSF": number,
  "floorCount": number,
  "confidence": number,
  "summary": "2-3 sentence description of what you see in the blueprint",
  "items": [
    {
      "csiCode": "03 30 00",
      "csiDivision": "03",
      "csiName": "Cast-in-Place Concrete",
      "description": "Slab on grade, 5 inch thickness",
      "quantity": 14200,
      "unit": "CY",
      "unitCost": 165,
      "totalCost": 2343000,
      "laborHours": 284,
      "notes": "Includes pump placement, finishing, curing"
    }
  ],
  "totalMaterialCost": number,
  "totalLaborCost": number,
  "totalProjectCost": number,
  "contingency": number,
  "recommendations": ["string array of 3-5 key estimating notes or risks"]
}

Be thorough. A typical commercial building takeoff has 20-60 line items.
Include all CSI divisions you can identify from the drawings.`;

export async function GET(
  req: NextRequest,
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
        // 1. Get takeoff record
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

        if (!takeoff.file_url) {
          send('error', { message: 'No blueprint uploaded. Please upload a file first.' });
          return done();
        }

        // 2. Update status to analyzing
        await supabase.from('takeoffs').update({ status: 'analyzing' }).eq('id', takeoffId);
        send('progress', { step: 2, message: 'Sending blueprint to AI...', pct: 15 });

        // 3. Fetch the file from storage
        const fileResponse = await fetch(takeoff.file_url);
        if (!fileResponse.ok) {
          send('error', { message: 'Could not load blueprint file from storage.' });
          return done();
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        const base64 = Buffer.from(fileBuffer).toString('base64');
        const mimeType: string = takeoff.file_type || 'application/pdf';

        send('progress', { step: 3, message: 'AI is reading your blueprint...', pct: 25 });

        // 4. Check Anthropic API key
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY to environment.' });
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        send('progress', { step: 4, message: 'Analyzing dimensions and materials...', pct: 40 });

        // 5. Build message content — PDF vs image
        type ContentBlock =
          | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
          | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
          | { type: 'text'; text: string };

        let messageContent: ContentBlock[];

        if (mimeType === 'application/pdf') {
          messageContent = [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: TAKEOFF_PROMPT },
          ];
        } else {
          const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          const imageMime = validImageTypes.includes(mimeType) ? mimeType : 'image/jpeg';
          messageContent = [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMime, data: base64 },
            },
            { type: 'text', text: TAKEOFF_PROMPT },
          ];
        }

        send('progress', { step: 5, message: 'Calculating quantities and costs...', pct: 55 });

        // 6. Call Claude
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{ role: 'user', content: messageContent as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] }],
        });

        send('progress', { step: 6, message: 'Processing results...', pct: 75 });

        // 7. Parse response
        const rawText = response.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join('');

        let parsed: {
          projectName?: string;
          buildingType?: string;
          estimatedSF?: number;
          floorCount?: number;
          confidence?: number;
          summary?: string;
          items?: Array<{
            csiCode?: string;
            csiName?: string;
            description?: string;
            quantity?: number;
            unit?: string;
            unitCost?: number;
            totalCost?: number;
            laborHours?: number;
            notes?: string;
          }>;
          totalMaterialCost?: number;
          totalLaborCost?: number;
          totalProjectCost?: number;
          contingency?: number;
          recommendations?: string[];
        };

        try {
          parsed = JSON.parse(rawText);
        } catch {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            send('error', { message: 'AI could not parse blueprint. Please try a clearer image.' });
            await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
            return done();
          }
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            send('error', { message: 'AI returned unexpected format. Please try again.' });
            await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId);
            return done();
          }
        }

        send('progress', { step: 7, message: 'Saving results...', pct: 85 });

        // 8. Save material line items
        const items = parsed.items || [];

        if (items.length > 0) {
          const rows = items.map((item) => ({
            takeoff_id: takeoffId,
            csi_code: item.csiCode || '',
            csi_name: item.csiName || '',
            description: item.description || '',
            quantity: Number(item.quantity) || 0,
            unit: item.unit || 'LS',
            unit_cost: Number(item.unitCost) || 0,
            total_cost: Number(item.totalCost) || 0,
            labor_hours: Number(item.laborHours) || 0,
            notes: item.notes || '',
          }));

          // Delete old items for this takeoff before reinserting
          await supabase.from('takeoff_materials').delete().eq('takeoff_id', takeoffId);

          const { error: insertErr } = await supabase.from('takeoff_materials').insert(rows);
          if (insertErr) console.error('[takeoff/analyze] insert materials error:', insertErr);
        }

        // 9. Update takeoff summary
        const { error: updateErr } = await supabase
          .from('takeoffs')
          .update({
            status: 'complete',
            building_area: parsed.estimatedSF || 0,
            floor_count: parsed.floorCount || 1,
            total_cost: parsed.totalProjectCost || 0,
            confidence: parsed.confidence || 0,
            project_name_detected: parsed.projectName || '',
            building_type: parsed.buildingType || '',
            summary: parsed.summary || '',
            recommendations: parsed.recommendations || [],
            material_cost: parsed.totalMaterialCost || 0,
            labor_cost: parsed.totalLaborCost || 0,
            contingency_pct: parsed.contingency || 10,
            analyzed_at: new Date().toISOString(),
          })
          .eq('id', takeoffId);

        if (updateErr) console.error('[takeoff/analyze] update error:', updateErr);

        send('progress', { step: 8, message: 'Complete!', pct: 100 });

        // 10. Stream the full result back
        send('result', {
          takeoffId,
          projectName: parsed.projectName,
          buildingType: parsed.buildingType,
          estimatedSF: parsed.estimatedSF,
          confidence: parsed.confidence,
          summary: parsed.summary,
          items,
          totalMaterialCost: parsed.totalMaterialCost,
          totalLaborCost: parsed.totalLaborCost,
          totalProjectCost: parsed.totalProjectCost,
          contingency: parsed.contingency,
          recommendations: parsed.recommendations,
          itemCount: items.length,
        });

        done();

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        console.error('[takeoff/analyze]', err);
        send('error', { message });
        try { await supabase.from('takeoffs').update({ status: 'failed' }).eq('id', takeoffId); } catch { /* non-fatal */ }
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
