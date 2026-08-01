import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { prepareImageForClaude, ImagePrepError, type ClaudeImageMediaType } from '@/lib/image-detect';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const body = await req.json();
  const { photoId } = body;

  if (!photoId) return NextResponse.json({ error: 'Missing required field: photoId' }, { status: 400 });

  try {
    // Load photo record
    const { data: photo, error: photoErr } = await db
      .from('project_photos')
      .select('*')
      .eq('id', photoId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();

    if (photoErr || !photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

    // Download photo for analysis — detect the REAL type from the bytes.
    // Never trust photo.mime_type; a wrong label makes Claude reject the image.
    let imageBase64 = '';
    let mediaType: ClaudeImageMediaType = 'image/jpeg';

    if (photo.storage_path) {
      const { data: fileData, error: dlErr } = await db.storage
        .from('project-photos')
        .download(photo.storage_path);

      if (dlErr) throw dlErr;
      if (fileData) {
        try {
          const prepared = await prepareImageForClaude(await fileData.arrayBuffer());
          imageBase64 = prepared.base64;
          mediaType = prepared.mediaType;
        } catch (e) {
          if (e instanceof ImagePrepError) {
            return NextResponse.json({ error: e.message }, { status: 422 });
          }
          throw e;
        }
      }
    }

    if (!imageBase64) {
      return NextResponse.json({ error: 'Could not download photo for analysis' }, { status: 500 });
    }

    // Update status
    await db.from('project_photos')
      .update({ analysis_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', photoId)
      .eq('tenant_id', user.tenantId);

    const anthropic = new Anthropic();

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text' as const,
            text: `You are a construction site photo analyst. Analyze this construction site photo.

Return a JSON object with:
{
  "scene_type": "exterior|interior|mechanical|electrical|plumbing|structural|finishes|site_work|safety|equipment|other",
  "description": "2-3 sentence description of what is shown",
  "detected_issues": [
    {"issue": "description", "severity": "critical|warning|info", "trade": "relevant trade"}
  ],
  "punch_candidate": true/false (whether any issue warrants a punch list item),
  "progress_indicators": ["indicator 1", "indicator 2"],
  "safety_observations": ["observation 1", "observation 2"],
  "quality_notes": ["note 1", "note 2"],
  "suggested_tags": ["tag1", "tag2"]
}`,
          },
        ],
      }],
    });

    const responseText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

    let analysis: any = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    } catch { /* use empty */ }

    // Update photo with analysis
    const { data: updated, error: updateErr } = await db.from('project_photos')
      .update({
        scene_type: analysis.scene_type || 'other',
        detected_issues: analysis.detected_issues || [],
        punch_candidate: analysis.punch_candidate || false,
        ai_analysis: analysis,
        analysis_status: 'analyzed',
        tags: analysis.suggested_tags || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', photoId)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ data: updated, analysis });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
