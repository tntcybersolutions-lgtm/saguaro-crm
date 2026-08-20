import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      return NextResponse.json({ error: 'Failed to upload audio', details: uploadError.message }, { status: 500 });
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
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save voice memo', details: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ memo }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
