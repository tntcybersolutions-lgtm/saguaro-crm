import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import {
  loadBidDocumentContext,
  generateAllBidDocuments,
  saveGeneratedDocuments,
} from '@/lib/bid-document-engine';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const db = createServerClient();

        send({ stage: 'loading', message: 'Loading bid package context...', pct: 5 });

        const ctx = await loadBidDocumentContext(db, id, user.tenantId);
        if (!ctx) {
          send({ type: 'error', message: 'Bid package not found' });
          controller.close();
          return;
        }

        send({ stage: 'writing_scope', message: `Sage AI is writing the ${String(ctx.package.trade || ctx.package.name)} scope of work...`, pct: 15 });

        const docs = await generateAllBidDocuments(ctx, apiKey);

        // Send preview of scope as it becomes available
        if (docs.scope_narrative) {
          const preview = docs.scope_narrative.substring(0, 300);
          send({ stage: 'scope_preview', text: preview, pct: 40, message: 'Scope of work generated.' });
        }

        send({ stage: 'writing_instructions', message: 'Writing instructions to bidders...', pct: 55 });
        send({ stage: 'writing_inclusions', message: 'Writing work included / excluded...', pct: 65 });
        send({ stage: 'writing_quality', message: 'Writing quality standards and coordination notes...', pct: 75 });
        send({ stage: 'saving', message: 'Saving all documents to database...', pct: 90 });

        await saveGeneratedDocuments(db, id, user.tenantId, docs);

        send({
          type: 'done',
          pct: 100,
          message: `All bid documents generated for ${String(ctx.package.name)}`,
          scope_narrative: docs.scope_narrative,
          bid_instructions: docs.bid_instructions,
          work_included: docs.work_included,
          work_excluded: docs.work_excluded,
          coordination_notes: docs.coordination_notes,
          quality_standards: docs.quality_standards,
          special_requirements: docs.special_requirements,
          sub_qualification_criteria: docs.sub_qualification_criteria,
          sub_market_note: docs.sub_market_note,
          ai_generated: true,
          ai_generated_at: docs.generation_timestamp,
          ai_model_used: docs.ai_model_used,
        });

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Document generation failed';
        console.error('[sage-fill] error:', message);
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    }
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
