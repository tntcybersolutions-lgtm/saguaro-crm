/**
 * bid-jacket-route.ts
 *
 * Next.js App Router API route:
 *   POST /api/projects/[projectId]/bid-packages/[bidPackageId]/generate-jacket
 *
 * Streams Claude's bid jacket generation back to the browser as
 * Server-Sent Events so the UI can show real-time progress.
 *
 * Expects JSON body: { tenantId: string }
 * Optional query param: ?dry=true  → only returns the prompt, does not call Claude
 *
 * SSE event types emitted:
 *   data: {"type":"thinking","delta":"..."}   (Claude's reasoning, optional display)
 *   data: {"type":"text","delta":"..."}       (raw JSON being generated)
 *   data: {"type":"progress","message":"..."}  (status updates)
 *   data: {"type":"done","result":{...}}       (final structured result)
 *   data: {"type":"error","message":"..."}
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateBidJacketStream } from './ai-bid-jacket';

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper — reuse the same secret-token pattern as the autopilot route
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : null;

  if (!process.env.SAGUARO_API_SECRET) return false; // must be set in env
  return token === process.env.SAGUARO_API_SECRET;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encode an SSE event line
// ─────────────────────────────────────────────────────────────────────────────

function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; bidPackageId: string } },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const tenantId = String(body.tenantId ?? '');

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  const { projectId, bidPackageId } = params;

  if (!projectId || !bidPackageId) {
    return NextResponse.json(
      { error: 'projectId and bidPackageId are required in the URL' },
      { status: 400 },
    );
  }

  // Build a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          sseEvent({ type: 'progress', message: 'Fetching project data from Saguaro…' }),
        );

        for await (const chunk of generateBidJacketStream({ tenantId, projectId, bidPackageId })) {
          switch (chunk.type) {
            case 'thinking':
              // Stream thinking to the client so the UI can show a spinner/pulse
              controller.enqueue(sseEvent({ type: 'thinking', delta: chunk.delta }));
              break;

            case 'text':
              // Raw JSON being generated — most UIs will skip rendering this
              controller.enqueue(sseEvent({ type: 'text', delta: chunk.delta }));
              break;

            case 'done':
              controller.enqueue(
                sseEvent({ type: 'progress', message: 'Saving bid jacket to Saguaro…' }),
              );
              controller.enqueue(
                sseEvent({
                  type: 'done',
                  result: {
                    bidPackageId,
                    projectId,
                    lineItemsCreated: chunk.result.lineItemsCreated,
                    generatedAt: chunk.result.generatedAt,
                    usage: chunk.result.usage,
                    // Include the structured data so the UI can render immediately
                    jacket: {
                      project_summary: chunk.result.jacket.project_summary,
                      scope_of_work: chunk.result.jacket.scope_of_work,
                      line_items: chunk.result.jacket.line_items,
                      invitation_letter: chunk.result.jacket.invitation_letter,
                      evaluation_criteria: chunk.result.jacket.evaluation_criteria,
                      required_documents: chunk.result.jacket.required_documents,
                      suggested_subcontractors: chunk.result.jacket.suggested_subcontractors,
                    },
                  },
                }),
              );
              break;

            case 'error':
              controller.enqueue(sseEvent({ type: 'error', message: chunk.message }));
              break;
          }
        }
      } catch (err) {
        controller.enqueue(
          sseEvent({
            type: 'error',
            message: err instanceof Error ? err.message : 'Unknown server error',
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — check status / retrieve existing jacket (non-streaming)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; bidPackageId: string } },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId query param required' }, { status: 400 });
  }

  // Import here to avoid top-level supabaseAdmin dependency during build
  const { supabaseAdmin } = await import('./supabase/admin');

  const { data, error } = await supabaseAdmin
    .from('bid_jackets')
    .select('*')
    .eq('bid_package_id', params.bidPackageId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ exists: false, jacket: null });
  }

  return NextResponse.json({ exists: true, jacket: data });
}
