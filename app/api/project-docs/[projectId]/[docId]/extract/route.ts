import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { prepareImageForClaude, ImagePrepError, detectImageType, type ClaudeImageMediaType } from '@/lib/image-detect';

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string; docId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = await params;
  const db = createServerClient();

  try {
    // Load document
    const { data: doc, error: docErr } = await db
      .from('project_documents')
      .select('*')
      .eq('id', docId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Update status
    await db.from('project_documents')
      .update({ extraction_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', docId)
      .eq('tenant_id', user.tenantId);

    // Download the file from storage — decide PDF vs image from the REAL bytes,
    // not doc.mime_type (a wrong label makes Claude reject the image).
    let fileBase64 = '';
    let imgPrepared: { base64: string; mediaType: ClaudeImageMediaType } | null = null;
    let isPdf = !doc.mime_type || doc.mime_type.includes('pdf');

    if (doc.storage_path) {
      const { data: fileData, error: dlErr } = await db.storage
        .from('project-documents')
        .download(doc.storage_path);

      if (dlErr) throw dlErr;
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const detected = detectImageType(buffer);
        if (detected === 'application/pdf' || (detected === 'unknown' && isPdf)) {
          isPdf = true;
          fileBase64 = buffer.toString('base64');
        } else {
          isPdf = false;
          try {
            imgPrepared = await prepareImageForClaude(buffer);
          } catch (e) {
            if (e instanceof ImagePrepError) {
              await db.from('project_documents')
                .update({ extraction_status: 'failed', updated_at: new Date().toISOString() })
                .eq('id', docId).eq('tenant_id', user.tenantId);
              return NextResponse.json({ error: e.message }, { status: 422 });
            }
            throw e;
          }
        }
      }
    }

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'stage', stage: 'reading', message: 'Reading document...' });

        try {
          const anthropic = new Anthropic();

          // Build messages with document block (base64 source)
          const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

          if (fileBase64 && isPdf) {
            contentBlocks.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: fileBase64,
              },
            });
          } else if (imgPrepared) {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: imgPrepared.mediaType,
                data: imgPrepared.base64,
              },
            });
          }

          contentBlocks.push({
            type: 'text',
            text: `You are a construction document analyst. Analyze this ${doc.document_type} document titled "${doc.title}".

Extract and return a JSON object with:
{
  "summary": "2-3 sentence summary of the document",
  "document_category": "spec|drawing|submittal|contract|report|correspondence|other",
  "key_requirements": ["requirement 1", "requirement 2", ...],
  "submittals_required": [{"item": "name", "section": "spec section", "type": "shop drawing|product data|sample|certificate"}],
  "spec_sections": [{"number": "03 30 00", "title": "Cast-in-Place Concrete", "scope": "brief scope"}],
  "deadlines": ["deadline 1", "deadline 2"],
  "key_parties": ["party 1", "party 2"],
  "critical_notes": ["note 1", "note 2"],
  "extracted_text_summary": "key text content summary (500 words max)"
}`,
          });

          const messages: Anthropic.Messages.MessageParam[] = [{
            role: 'user',
            content: contentBlocks,
          }];

          send({ type: 'stage', stage: 'analyzing', message: 'AI analyzing document...' });

          const aiResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages,
          });

          const responseText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

          let extracted: any = {};
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
          } catch { /* use empty */ }

          send({ type: 'stage', stage: 'saving', message: 'Saving extracted intelligence...' });

          // Update document with extracted data
          await db.from('project_documents')
            .update({
              extraction_status: 'extracted',
              extracted_data: extracted,
              extracted_text: extracted.extracted_text_summary || '',
              key_requirements: extracted.key_requirements || [],
              submittals_required: extracted.submittals_required || [],
              spec_sections: extracted.spec_sections || [],
              updated_at: new Date().toISOString(),
            })
            .eq('id', docId)
            .eq('tenant_id', user.tenantId);

          send({ type: 'extracted', data: extracted });
          send({ type: 'done' });

        } catch (aiErr: any) {
          await db.from('project_documents')
            .update({ extraction_status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', docId)
            .eq('tenant_id', user.tenantId);

          send({ type: 'error', message: aiErr.message || 'AI extraction failed' });
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
