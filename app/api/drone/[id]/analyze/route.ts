import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { prepareImageForClaude } from '@/lib/image-detect';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const DRONE_SYSTEM = `You are a senior construction site inspector analyzing drone photography.
Return ONLY raw JSON — no markdown, no backticks. Start with { end with }.`;

const DRONE_PROMPT = `Analyze this drone photo of a construction site.

Identify:
1. Work areas visible and their completion status
2. Any safety concerns or violations
3. Overall construction progress

Return JSON:
{
  "areas": [
    {
      "name": "Foundation - East Wing",
      "status": "in_progress",
      "pct_complete": 65,
      "notes": "Rebar placement visible, forms in place"
    }
  ],
  "safety_concerns": [
    {
      "description": "Missing guardrail on second floor edge",
      "severity": "high",
      "location": "Northeast corner, level 2"
    }
  ],
  "overall_progress": "A 2-3 sentence summary of overall site progress visible in this photo."
}

status must be one of: not_started, in_progress, complete, blocked.
severity must be one of: low, medium, high, critical.`;

function safeJsonParse(raw: string): any | null {
  const cleaned = raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const normalized = cleaned.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(normalized); } catch { /* continue */ }
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
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export async function GET(
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
  const { id: jobId } = await params;

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
        // 1. Load drone job with tenant check
        send('progress', { step: 1, message: 'Loading drone job...', pct: 5 });

        const { data: job, error: jobErr } = await supabase
          .from('drone_jobs')
          .select('*')
          .eq('id', jobId)
          .eq('tenant_id', user.tenantId)
          .single();

        if (jobErr || !job) {
          send('error', { message: 'Drone job not found.' });
          return done();
        }

        // 2. Load photos
        const { data: photos, error: photosErr } = await supabase
          .from('drone_photos')
          .select('*')
          .eq('drone_job_id', jobId)
          .eq('tenant_id', user.tenantId)
          .order('created_at', { ascending: true })
          .limit(8); // Analyze up to 8 photos

        if (photosErr || !photos || photos.length === 0) {
          send('error', { message: 'No photos found for this drone job.' });
          return done();
        }

        // 3. Set status to analyzing
        await supabase
          .from('drone_jobs')
          .update({ status: 'analyzing' })
          .eq('id', jobId)
          .eq('tenant_id', user.tenantId);

        send('progress', { step: 2, message: `Analyzing ${photos.length} photos...`, pct: 10 });

        // 4. Setup Anthropic
        if (!process.env.ANTHROPIC_API_KEY) {
          send('error', { message: 'AI service not configured. Add ANTHROPIC_API_KEY.' });
          await supabase.from('drone_jobs').update({ status: 'failed' }).eq('id', jobId).eq('tenant_id', user.tenantId);
          return done();
        }

        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // 5. Analyze each photo
        const allAreas: any[] = [];
        const allSafetyConcerns: any[] = [];
        const allSummaries: string[] = [];

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const photoNum = i + 1;
          const basePct = 10 + Math.floor((i / photos.length) * 75);

          send('progress', {
            step: 3,
            message: `Analyzing photo ${photoNum} of ${photos.length}: ${photo.file_name}...`,
            pct: basePct,
          });
          startHeartbeat(`Analyzing photo ${photoNum}/${photos.length}...`, basePct, 3);

          try {
            // Download photo from storage
            const { data: blob, error: dlErr } = await supabase.storage
              .from('project-files')
              .download(photo.storage_path);

            if (dlErr || !blob) {
              console.warn(`[drone/analyze] Could not download photo ${photo.file_name}`);
              stopHeartbeat();
              continue;
            }

            // Detect the real type from the bytes + normalize (EXIF-rotate,
            // downscale, HEIC→JPEG). Never trust the file extension — a wrong
            // label makes Claude reject the image. Skip only this photo on failure.
            let base64: string;
            let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
            try {
              const prepared = await prepareImageForClaude(await blob.arrayBuffer());
              base64 = prepared.base64;
              mediaType = prepared.mediaType;
            } catch (prepErr) {
              console.warn(`[drone/analyze] Skipping unreadable photo ${photo.file_name}:`, prepErr instanceof Error ? prepErr.message : prepErr);
              stopHeartbeat();
              continue;
            }

            // Send to Claude Vision
            let accumulated = '';
            const claudeStream = await client.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 4000,
              system: DRONE_SYSTEM,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                      data: base64,
                    },
                  },
                  { type: 'text', text: DRONE_PROMPT },
                ],
              }],
              stream: true,
            });

            for await (const event of claudeStream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                accumulated += event.delta.text;
              }
            }

            stopHeartbeat();

            const parsed = safeJsonParse(accumulated);
            if (parsed) {
              if (Array.isArray(parsed.areas)) {
                allAreas.push(
                  ...parsed.areas.map((a: any) => ({
                    ...a,
                    photo_id: photo.id,
                    photo_name: photo.file_name,
                  })),
                );
              }
              if (Array.isArray(parsed.safety_concerns)) {
                allSafetyConcerns.push(
                  ...parsed.safety_concerns.map((s: any) => ({
                    ...s,
                    photo_id: photo.id,
                    photo_name: photo.file_name,
                  })),
                );
              }
              if (parsed.overall_progress) {
                allSummaries.push(parsed.overall_progress);
              }

              // Update individual photo with analysis
              await supabase
                .from('drone_photos')
                .update({
                  ai_analysis: parsed,
                })
                .eq('id', photo.id)
                .eq('tenant_id', user.tenantId);
            } else {
              console.warn(`[drone/analyze] Could not parse AI response for photo ${photo.file_name}`);
            }

            send('progress', {
              step: 3,
              message: `Completed photo ${photoNum} of ${photos.length}`,
              pct: basePct + Math.floor(75 / photos.length),
            });
          } catch (photoErr: unknown) {
            stopHeartbeat();
            console.error(`[drone/analyze] Error analyzing photo ${photo.file_name}:`, photoErr);
            // Continue with next photo
          }
        }

        send('progress', { step: 4, message: 'Aggregating results...', pct: 90 });

        // 6. Aggregate results
        const progressSummary = allSummaries.length > 0
          ? allSummaries.join(' | ')
          : 'No progress summary available.';

        const aggregatedAnalysis = {
          areas: allAreas,
          safety_concerns: allSafetyConcerns,
          progress_summary: progressSummary,
          photos_analyzed: photos.length,
          analyzed_at: new Date().toISOString(),
        };

        // 7. Update drone job
        const { error: updateErr } = await supabase
          .from('drone_jobs')
          .update({
            status: 'complete',
            ai_analysis: aggregatedAnalysis,
            areas_detected: allAreas.length,
            safety_concerns: allSafetyConcerns.length,
            progress_summary: progressSummary,
            analyzed_at: new Date().toISOString(),
          })
          .eq('id', jobId)
          .eq('tenant_id', user.tenantId);

        if (updateErr) console.error('[drone/analyze] update error:', updateErr.message);

        send('progress', { step: 5, message: 'Complete!', pct: 100 });

        send('result', {
          jobId,
          photosAnalyzed: photos.length,
          areasDetected: allAreas.length,
          safetyConcerns: allSafetyConcerns.length,
          progressSummary: progressSummary,
          areas: allAreas,
          concerns: allSafetyConcerns,
        });

        done();
      } catch (err: unknown) {
        stopHeartbeat();
        const message = err instanceof Error ? err.message : 'Analysis failed.';
        console.error('[drone/analyze]', err);
        send('error', { message });
        try {
          await supabase.from('drone_jobs').update({ status: 'failed' }).eq('id', jobId).eq('tenant_id', user.tenantId);
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
