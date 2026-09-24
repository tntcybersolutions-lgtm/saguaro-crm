import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';

/**
 * POST /api/design/generate  (SSE streaming)
 * Takes { design_session_id }. Loads session, downloads photo from Supabase Storage,
 * sends to Claude Vision for redesign analysis. Streams progress events.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const body = await req.json();
    const { design_session_id } = body;
    if (!design_session_id) {
      return new Response('design_session_id is required', { status: 400 });
    }

    const db = createServerClient();

    // Load the design session
    const { data: session, error: sessErr } = await db
      .from('design_sessions')
      .select('*')
      .eq('id', design_session_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (sessErr || !session) {
      return new Response('Design session not found', { status: 404 });
    }

    // Mark session as processing
    await must(db
      .from('design_sessions')
      .update({ status: 'processing' })
      .eq('tenant_id', user.tenantId).eq('id', design_session_id), 'design_sessions write');

    const startTime = Date.now();

    // Download photo from Supabase Storage
    let imageBase64: string;
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    try {
      const photoUrl = session.original_photo_url as string;

      // If it's a Supabase storage path, download via storage
      if (photoUrl.startsWith('design-photos/') || photoUrl.startsWith('/')) {
        const { data: fileData, error: dlErr } = await db.storage
          .from('design-photos')
          .download(photoUrl.replace('design-photos/', ''));

        if (dlErr || !fileData) throw new Error('Failed to download photo from storage');

        const buffer = Buffer.from(await fileData.arrayBuffer());
        imageBase64 = buffer.toString('base64');
        mediaType = fileData.type?.includes('png') ? 'image/png' : 'image/jpeg';
      } else {
        // External URL — fetch directly
        const imgRes = await fetch(photoUrl);
        if (!imgRes.ok) throw new Error('Failed to fetch photo');
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        imageBase64 = buffer.toString('base64');
        const ct = imgRes.headers.get('content-type') || 'image/jpeg';
        mediaType = ct.includes('png')
          ? 'image/png'
          : ct.includes('webp')
            ? 'image/webp'
            : 'image/jpeg';
      }
    } catch {
      await tryWrite(db.from('design_sessions').update({
        status: 'error',
        error_message: 'Failed to download original photo',
      }).eq('tenant_id', user.tenantId).eq('id', design_session_id), 'design_sessions update');
      return new Response('Failed to download photo', { status: 500 });
    }

    // Build the Claude Vision prompt
    const roomType = session.room_type as string;
    const designStyle = session.design_style as string;
    const customInstructions = session.custom_instructions as string | null;

    const prompt = `You are an expert interior/exterior designer and construction estimator. Analyze this photo of a ${roomType} and redesign it in ${designStyle} style.
${customInstructions ? `\nCustomer notes: ${customInstructions}` : ''}

Provide your analysis as a valid JSON object with these exact fields:
{
  "ai_description": "Detailed 3-4 paragraph description of the redesign: colors, materials, furniture, lighting, layout changes, and overall aesthetic",
  "estimated_sqft": <integer estimate of square footage>,
  "estimated_cost_low": <integer low-end total cost>,
  "estimated_cost_high": <integer high-end total cost>,
  "materials_detected": [
    {
      "name": "material name",
      "csi_code": "XX XX XX",
      "quantity": "estimated quantity with unit",
      "unit_cost_low": <integer>,
      "unit_cost_high": <integer>,
      "category": "one of: flooring, walls, ceiling, lighting, furniture, fixtures, electrical, plumbing"
    }
  ],
  "features_detected": [
    {
      "feature": "feature name",
      "current_condition": "good/fair/poor/missing",
      "recommendation": "what to do"
    }
  ],
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "style_notes": "Brief style summary"
}

Return ONLY valid JSON, no markdown wrapping.`;

    // Stream the response via SSE
    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        send('progress', { step: 'analyzing', message: 'Analyzing photo with AI...' });

        try {
          const client = new Anthropic();
          let fullText = '';

          const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 3000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mediaType,
                      data: imageBase64,
                    },
                  },
                  { type: 'text', text: prompt },
                ],
              },
            ],
          });

          stream.on('text', (text) => {
            fullText += text;
            send('stream', { text });
          });

          await stream.finalMessage();

          send('progress', { step: 'parsing', message: 'Parsing design analysis...' });

          // Parse the JSON response
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('Failed to parse AI response as JSON');
          }

          const parsed = JSON.parse(jsonMatch[0]);
          const processingTime = Date.now() - startTime;

          // Update the design session with results
          await must(db.from('design_sessions').update({
            ai_description: parsed.ai_description,
            estimated_sqft: parsed.estimated_sqft,
            estimated_cost_low: parsed.estimated_cost_low,
            estimated_cost_high: parsed.estimated_cost_high,
            materials_detected: parsed.materials_detected || [],
            features_detected: parsed.features_detected || [],
            status: 'completed',
            processing_time_ms: processingTime,
          }).eq('tenant_id', user.tenantId).eq('id', design_session_id), 'design_sessions update');

          send('progress', { step: 'complete', message: 'Design analysis complete!' });
          send('result', {
            session_id: design_session_id,
            ...parsed,
            processing_time_ms: processingTime,
          });
        } catch (err) {
          // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[design/generate]', err);
    const errorMessage = "AI analysis failed";
          await tryWrite(db.from('design_sessions').update({
            status: 'error',
            error_message: errorMessage,
            processing_time_ms: Date.now() - startTime,
          }).eq('tenant_id', user.tenantId).eq('id', design_session_id), 'design_sessions update');

          send('error', { message: errorMessage });
        } finally {
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
  } catch {
    return new Response('Internal server error', { status: 500 });
  }
}
