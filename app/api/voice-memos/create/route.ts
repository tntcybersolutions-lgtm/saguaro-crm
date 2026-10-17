import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signUrl } from '@/lib/storage-signing';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  try {
    // Role check, not just sign-in: Projects: Edit, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'Projects', 'Edit');
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const projectId = formData.get('project_id') as string | null;
    const itemType = formData.get('item_type') as string | null;
    const itemId = formData.get('item_id') as string | null;
    const title = formData.get('title') as string | null;
    const transcribe = formData.get('transcribe') === 'true';

    if (!audioFile) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await audioFile.arrayBuffer());
    const fileName = `voice-memos/${projectId}/${Date.now()}_${audioFile.name}`;

    const { error: uploadError } = await db.storage
      .from('project-files')
      .upload(fileName, fileBuffer, {
        contentType: audioFile.type || 'audio/webm',
        upsert: false,
      });

    if (uploadError) {
      return apiError('voice-memos/create', uploadError, 'Failed to upload audio');
    }

    const { data: urlData } = db.storage.from('project-files').getPublicUrl(fileName);

    let transcription: string | null = null;
    if (transcribe && process.env.OPENAI_API_KEY) {
      try {
        const openaiForm = new FormData();
        openaiForm.append('file', new Blob([fileBuffer], { type: audioFile.type || 'audio/webm' }), audioFile.name);
        openaiForm.append('model', 'whisper-1');

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: openaiForm,
        });

        if (whisperRes.ok) {
          const whisperData = await whisperRes.json();
          transcription = whisperData.text || null;
        }
      } catch {
        // transcription is optional; continue without it
      }
    }

    const { data: memo, error: insertError } = await db
      .from('voice_memos')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        created_by: user.id,
        item_type: itemType,
        item_id: itemId,
        audio_url: urlData?.publicUrl || fileName,
        duration_seconds: null,
        transcription,
      } as Database['public']['Tables']['voice_memos']['Insert'])
      .select()
      .single();

    if (insertError) {
      return apiError('voice-memos/create', insertError, 'Failed to save voice memo');
    }

    if (memo?.audio_url) (memo as any).audio_url = await signUrl((memo as any).audio_url);
    return NextResponse.json({ memo }, { status: 201 });
  } catch (err: any) {
    return apiError('voice-memos/create', err, 'Internal server error');
  }
}
