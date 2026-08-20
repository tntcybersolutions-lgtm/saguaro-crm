import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { runTakeoffOrchestration, ORCHESTRATION_TASKS } from '@/lib/takeoff-orchestrator';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = createServerClient();

    // Verify takeoff exists, is complete, and not already orchestrated
    const { data: takeoff, error: takeoffErr } = await db
      .from('takeoffs')
      .select('id, project_id, orchestration_status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (takeoffErr || !takeoff) {
      return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 });
    }

    if (takeoff.orchestration_status === 'complete') {
      return NextResponse.json({ error: 'Already orchestrated' }, { status: 409 });
    }

    if (takeoff.orchestration_status === 'running') {
      return NextResponse.json({ error: 'Orchestration already in progress' }, { status: 409 });
    }

    // Mark as running
    await db.from('takeoffs').update({
      orchestration_status: 'running',
      orchestration_started_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', user.tenantId);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            /* stream may be closed */
          }
        };

        // Send initial pending state for all tasks
        for (const task of ORCHESTRATION_TASKS) {
          send({ taskId: task.id, status: 'pending', message: task.detail });
        }

        const apiKey = process.env.ANTHROPIC_API_KEY || '';

        const result = await runTakeoffOrchestration(
          db,
          id,
          user.tenantId,
          takeoff.project_id,
          apiKey,
          async (update) => {
            send(update);
            await new Promise(r => setTimeout(r, 80));
          },
        );

        // Update takeoff orchestration status
        await db.from('takeoffs').update({
          orchestration_status: result.success ? 'complete' : 'failed',
          orchestration_completed_at: new Date().toISOString(),
          orchestration_results: result.stats,
        }).eq('id', id).eq('tenant_id', user.tenantId);

        send({ type: 'complete', success: result.success, stats: result.stats });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
