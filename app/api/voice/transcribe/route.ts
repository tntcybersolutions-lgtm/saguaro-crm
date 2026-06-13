import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';

// Transcribe a recorded audio clip to text via OpenAI Whisper.
// Used by the mobile field app (daily-report voice-to-fill): the app records
// audio with expo-av, uploads it here, and feeds the returned text to
// /api/daily-logs/ai-fill. Returns { text }.
//
// Calls the OpenAI REST API directly via fetch so no new SDK dependency is
// needed. Requires OPENAI_API_KEY in the environment.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Transcription not configured: set OPENAI_API_KEY' },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = (formData.get('file') || formData.get('audio')) as File | null;
  if (!file) {
    return NextResponse.json({ error: 'Missing audio file (field "file")' }, { status: 400 });
  }

  try {
    const openaiForm = new FormData();
    openaiForm.append('file', file, file.name || `audio-${Date.now()}.m4a`);
    openaiForm.append('model', 'whisper-1');
    const language = formData.get('language');
    if (typeof language === 'string' && language) openaiForm.append('language', language);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openaiForm,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[voice/transcribe] OpenAI error:', res.status, detail.slice(0, 500));
      return NextResponse.json({ error: `Transcription failed (${res.status})` }, { status: 502 });
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text || '' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[voice/transcribe] error:', msg);
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}
