import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const body = await req.json();
  const { projectId, specText } = body;

  if (!projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });

  try {
    // Load spec documents if no specText provided
    let tocText = specText || '';
    if (!tocText) {
      const { data: docs } = await db
        .from('project_documents')
        .select('extracted_text, title, submittals_required')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .in('document_type', ['spec', 'specification', 'specifications'])
        .eq('is_active', true);

      if (docs && docs.length > 0) {
        tocText = docs.map((d: any) =>
          `Document: ${d.title}\n${d.extracted_text || ''}\nSubmittals: ${JSON.stringify(d.submittals_required || [])}`
        ).join('\n---\n');
      }
    }

    if (!tocText) {
      return NextResponse.json({ error: 'No specification text available. Upload spec documents first.' }, { status: 400 });
    }

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'stage', stage: 'reading', message: 'Reading specification documents...' });

        try {
          const anthropic = new Anthropic();

          send({ type: 'stage', stage: 'analyzing', message: 'AI analyzing specifications for submittals_required...' });

          const aiResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: `You are a construction submittal specialist. Analyze these project specifications and generate a complete submittal log.

SPECIFICATION DATA:
${tocText.substring(0, 8000)}

Generate a JSON array of submittals_required:
[
  {
    "spec_section": "03 30 00",
    "spec_title": "Cast-in-Place Concrete",
    "submittal_type": "shop_drawing|product_data|sample|certificate|test_report|mix_design|warranty|closeout",
    "description": "detailed description of what needs to be submitted",
    "responsible_trade": "Concrete",
    "priority": "critical|high|medium|low",
    "estimated_days_to_prepare": number,
    "notes": "any special requirements"
  }
]

Include ALL submittals required by the specifications. Be thorough — missing a submittal causes project delays.`,
            }],
          });

          const responseText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

          let submittals: any[] = [];
          try {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) submittals = JSON.parse(jsonMatch[0]);
          } catch { /* use empty */ }

          send({ type: 'stage', stage: 'creating', message: `Creating ${submittals.length} submittal records...` });

          // Insert submittals
          let insertedCount = 0;
          for (const sub of submittals) {
            const { error: insertErr } = await db
              .from('submittals')
              .insert({
                tenant_id: user.tenantId,
                project_id: projectId,
                spec_section: sub.spec_section || '',
                title: `${sub.spec_section} - ${sub.description}`.substring(0, 200),
                description: sub.description,
                submittal_type: sub.submittal_type || 'product_data',
                status: 'not_started',
                priority: sub.priority || 'medium',
                responsible_party: sub.responsible_trade || '',
                created_by: user.id,
              });

            if (!insertErr) {
              insertedCount++;
              send({
                type: 'progress',
                current: insertedCount,
                total: submittals.length,
                item: sub.description,
              });
            }
          }

          send({ type: 'stage', stage: 'complete', message: `Created ${insertedCount} submittals from specifications` });
          send({ type: 'done', count: insertedCount });

        } catch (aiErr: any) {
          send({ type: 'error', message: aiErr.message || 'Auto-generation failed' });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
