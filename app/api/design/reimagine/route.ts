import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/design/reimagine
 *
 * Accepts a photo + style → sends to Replicate SDXL + ControlNet → returns redesigned image URLs.
 * Also generates Claude Vision cost estimate of the redesign.
 *
 * If REPLICATE_API_TOKEN is not set, falls back to Claude Vision text-only description.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const supabase = createServerClient();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`)); } catch { /* closed */ }
      };
      const done = () => { send('done', {}); try { controller.close(); } catch { /* already closed */ } };

      try {
        const formData = await req.formData();
        const file = formData.get('photo') as File;
        const styleSlug = formData.get('style') as string || 'modern';
        const roomType = formData.get('roomType') as string || 'living room';
        const customInstructions = formData.get('instructions') as string || '';
        const sessionId = formData.get('sessionId') as string;
        const customerId = formData.get('customerId') as string;

        if (!file) { send('error', { message: 'No photo provided' }); return done(); }

        send('progress', { step: 1, message: 'Uploading your photo...', pct: 5 });

        // Upload original to Supabase Storage
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const storagePath = `design-studio/${Date.now()}/original.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('project-files')
          .upload(storagePath, buffer, { contentType: file.type, upsert: true });

        if (uploadErr) { send('error', { message: 'Failed to upload photo' }); return done(); }

        const { data: { publicUrl: originalUrl } } = supabase.storage
          .from('project-files').getPublicUrl(storagePath);

        send('progress', { step: 2, message: 'Loading style preset...', pct: 15 });

        // Load style preset
        const { data: preset } = await supabase
          .from('design_style_presets')
          .select('*')
          .eq('slug', styleSlug)
          .single();

        const styleName = preset?.name || styleSlug;
        const promptSuffix = preset?.prompt_suffix || `${styleSlug} interior design, 8k photo, architectural digest`;
        const negativePrompt = preset?.negative_prompt || 'low quality, blurry, distorted, ugly, bad proportions';
        const strength = preset?.strength || 0.70;

        const fullPrompt = customInstructions
          ? `${roomType} redesigned in ${styleName} style. ${customInstructions}. ${promptSuffix}`
          : `${roomType} redesigned in ${styleName} style. ${promptSuffix}`;

        // Create design session record
        const { data: session } = await supabase.from('design_sessions').insert({
          tenant_id: customerId || null,
          customer_id: customerId || null,
          original_photo_url: originalUrl,
          room_type: roomType,
          design_style: styleSlug,
          custom_instructions: customInstructions || null,
          generation_prompt: fullPrompt,
          negative_prompt: negativePrompt,
          strength,
          control_net_type: 'canny',
          guidance_scale: 7.5,
          num_outputs: 2,
          generation_provider: 'replicate',
          status: 'processing',
        }).select().single();

        const designSessionId = session?.id || sessionId;

        // ── REPLICATE IMAGE GENERATION ──
        const replicateToken = process.env.REPLICATE_API_TOKEN;

        if (replicateToken) {
          send('progress', { step: 3, message: 'AI is redesigning your space...', pct: 25 });

          // Start Replicate prediction
          const predictionRes = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${replicateToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: 'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf', // SDXL img2img
              input: {
                image: `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${base64}`,
                prompt: fullPrompt,
                negative_prompt: negativePrompt,
                num_outputs: 2,
                strength: strength,
                guidance_scale: 7.5,
                num_inference_steps: 30,
                scheduler: 'K_EULER_ANCESTRAL',
              },
            }),
          });

          if (!predictionRes.ok) {
            const errBody = await predictionRes.text();
            console.error('[design/reimagine] Replicate error:', errBody);
            send('progress', { step: 3, message: 'Image generation unavailable — generating AI description instead...', pct: 30 });
            // Fall through to Claude fallback below
          } else {
            const prediction = await predictionRes.json();
            const predictionId = prediction.id;

            send('progress', { step: 4, message: 'AI is rendering your new design...', pct: 35 });

            // Poll for completion (max 120 seconds)
            let result = null;
            for (let i = 0; i < 60; i++) {
              await new Promise(r => setTimeout(r, 2000));
              const pct = Math.min(85, 35 + i * 1.5);
              send('progress', { step: 4, message: `Rendering... ${Math.round(pct)}%`, pct: Math.round(pct) });

              const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: { 'Authorization': `Bearer ${replicateToken}` },
              });
              const status = await statusRes.json();

              if (status.status === 'succeeded') {
                result = status.output; // array of image URLs
                break;
              } else if (status.status === 'failed') {
                console.error('[design/reimagine] Replicate failed:', status.error);
                break;
              }
            }

            if (result && Array.isArray(result) && result.length > 0) {
              send('progress', { step: 5, message: 'Saving your designs...', pct: 88 });

              // Download generated images and upload to our storage
              const generatedUrls: string[] = [];
              for (let idx = 0; idx < Math.min(result.length, 3); idx++) {
                try {
                  const imgRes = await fetch(result[idx]);
                  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                  const genPath = `design-studio/${Date.now()}/generated_${idx + 1}.jpg`;

                  await supabase.storage
                    .from('project-files')
                    .upload(genPath, imgBuf, { contentType: 'image/jpeg', upsert: true });

                  const { data: { publicUrl } } = supabase.storage
                    .from('project-files').getPublicUrl(genPath);

                  generatedUrls.push(publicUrl);
                } catch (e) {
                  console.warn('[design/reimagine] Failed to save generated image:', e);
                  generatedUrls.push(result[idx]); // use Replicate URL as fallback
                }
              }

              // Now get Claude cost estimate
              send('progress', { step: 6, message: 'Estimating renovation cost...', pct: 92 });

              let costEstimate = null;
              try {
                const { default: Anthropic } = await import('@anthropic-ai/sdk');
                const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

                const costRes = await claude.messages.create({
                  model: 'claude-sonnet-4-6',
                  max_tokens: 2000,
                  system: 'You are a construction cost estimator. Return ONLY raw JSON.',
                  messages: [{
                    role: 'user',
                    content: [
                      { type: 'image', source: { type: 'base64', media_type: (ext === 'png' ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg', data: base64 } },
                      { type: 'text', text: `This room is being redesigned in ${styleName} style. The redesign prompt was: "${fullPrompt}". Estimate the renovation cost. Return JSON: { "description": "2-sentence summary of work needed", "cost_low": number, "cost_high": number, "materials": [{"name": "item", "csi_code": "XX XX XX", "quantity": number, "unit": "SF/EA/LF", "unit_cost": number, "total": number}], "timeline_weeks": number, "permits_needed": boolean }` },
                    ],
                  }],
                });

                const costText = (costRes.content[0] as any)?.text || '';
                try {
                  const cleaned = costText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
                  costEstimate = JSON.parse(cleaned);
                } catch { /* parse failed, no estimate */ }
              } catch (e) {
                console.warn('[design/reimagine] Claude cost estimate failed:', e);
              }

              // Update design session
              const updatePayload: Record<string, unknown> = {
                status: 'complete',
                generated_image_url: generatedUrls[0] || null,
                generated_image_2_url: generatedUrls[1] || null,
                generated_image_3_url: generatedUrls[2] || null,
                design_image_url: generatedUrls[0] || null,
                design_thumbnail_url: generatedUrls[0] || null,
                generation_model: 'sdxl-img2img',
                generation_cost: 0.02 * generatedUrls.length,
              };

              if (costEstimate) {
                updatePayload.ai_description = costEstimate.description;
                updatePayload.estimated_cost_low = costEstimate.cost_low;
                updatePayload.estimated_cost_high = costEstimate.cost_high;
                updatePayload.materials_detected = costEstimate.materials || [];
              }

              if (designSessionId) {
                await supabase.from('design_sessions').update(updatePayload).eq('id', designSessionId);
              }

              send('result', {
                sessionId: designSessionId,
                originalUrl,
                generatedUrls,
                styleName,
                costEstimate,
                provider: 'replicate',
              });
              return done();
            }
          }
        }

        // ── FALLBACK: Claude Vision text description (no image generation) ──
        send('progress', { step: 3, message: 'AI is analyzing your space...', pct: 30 });

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const mimeType = (ext === 'png' ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg';

        const response = await claude.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          system: 'You are an expert interior designer and construction estimator. Return ONLY raw JSON.',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              { type: 'text', text: `Redesign this ${roomType} in ${styleName} style. ${customInstructions || ''}\n\nReturn JSON:\n{\n  "description": "Detailed 4-sentence description of the redesigned space — colors, materials, furniture, lighting, layout",\n  "changes": ["change 1", "change 2", "change 3", ...],\n  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],\n  "cost_low": number,\n  "cost_high": number,\n  "materials": [{"name": "item", "csi_code": "XX XX XX", "quantity": number, "unit": "SF/EA/LF", "unit_cost": number, "total": number}],\n  "timeline_weeks": number,\n  "difficulty": "easy|moderate|complex",\n  "permits_needed": boolean,\n  "features_added": ["feature 1", "feature 2"]\n}` },
            ],
          }],
        });

        send('progress', { step: 4, message: 'Processing AI response...', pct: 80 });

        const rawText = (response.content[0] as any)?.text || '';
        let parsed = null;
        try {
          const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = { description: rawText, cost_low: 0, cost_high: 0, materials: [] };
        }

        // Update session
        if (designSessionId) {
          await supabase.from('design_sessions').update({
            status: 'complete',
            ai_description: parsed.description,
            estimated_cost_low: parsed.cost_low,
            estimated_cost_high: parsed.cost_high,
            materials_detected: parsed.materials || [],
            features_detected: parsed.features_added || parsed.changes || [],
            generation_provider: 'claude_vision',
            generation_model: 'claude-sonnet-4-6',
          }).eq('id', designSessionId);
        }

        send('result', {
          sessionId: designSessionId,
          originalUrl,
          generatedUrls: [], // no images without Replicate
          styleName,
          costEstimate: parsed,
          provider: 'claude_vision',
          note: 'Add REPLICATE_API_TOKEN to enable AI image generation. Currently showing text-only redesign description.',
        });
        return done();

      } catch (err) {
        console.error('[design/reimagine]', err);
        send('error', { message: 'Design generation failed. Please try again.' });
        return done();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
