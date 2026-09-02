import { translateRadioMessage } from '@/lib/translate';
import { withTimeout } from '@/lib/storage-signing';
import { must } from '@/lib/db-write';

const BUCKET = 'project-files';

/**
 * Saguaro Radio transcription brain.
 *
 * Pulls a PTT clip back out of storage, runs it through OpenAI Whisper
 * (plain fetch + FormData — no SDK), stamps transcript + detected_lang onto
 * the radio_messages row, then hands the transcript to the existing
 * translation brain for EN + ES renderings. Designed to be fired WITHOUT
 * await from the voice send paths: it never throws, never blocks the caller,
 * and skips silently when OPENAI_API_KEY is not configured.
 */

/** Whisper's verbose_json reports full language names; radio rows store ISO codes. */
const LANG_CODES: Record<string, string> = {
  english: 'en', spanish: 'es', portuguese: 'pt', french: 'fr', german: 'de',
  italian: 'it', chinese: 'zh', vietnamese: 'vi', korean: 'ko', russian: 'ru',
  polish: 'pl', tagalog: 'tl', japanese: 'ja', arabic: 'ar', 'haitian creole': 'ht',
};

export async function transcribeRadioVoice(db: any, messageId: string, audioPath: string): Promise<void> {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key || !db || !messageId || !audioPath) return; // env-gated: no key, no transcript

    // Pull the clip out of the private bucket (bare path, exactly as stored).
    /* Bounded, like every other storage read. This runs inside a serverless
       function; an unbounded download holds the whole invocation until the
       platform kills it, and the transcript is a nice-to-have. */
    const dl = (await withTimeout(db.storage.from(BUCKET).download(audioPath), `${BUCKET}/${audioPath}`)) as
      { data?: unknown; error?: unknown } | null;
    let audio: Blob | null = dl && !dl.error && dl.data ? (dl.data as Blob) : null;
    if (!audio) {
      // Fallback: signed URL + fetch (covers storage clients without .download).
      const sig = (await withTimeout(db.storage.from(BUCKET).createSignedUrl(audioPath, 300), `${BUCKET}/${audioPath}`)) as
        { data?: { signedUrl?: string } } | null;
      const signed = sig?.data;
      if (!signed?.signedUrl) return;
      const r = await fetch(signed.signedUrl);
      if (!r.ok) return;
      audio = await r.blob();
    }

    const filename = audioPath.split('/').pop() || 'clip.m4a';
    const form = new FormData();
    form.append('file', audio, filename);
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return;
    const out: any = await res.json().catch(() => null);
    const transcript = typeof out?.text === 'string' ? out.text.trim() : '';
    if (!transcript) return;

    const langName = typeof out?.language === 'string' ? out.language.trim().toLowerCase() : '';
    const detected = LANG_CODES[langName] || (langName.length === 2 ? langName : '');

    await must(db.from('radio_messages').update({
      transcript,
      ...(detected ? { detected_lang: detected } : {}),
    } as never).eq('id', messageId), 'radio_messages update');

    // Same brain as text traffic: EN + ES renderings of the transcript.
    await translateRadioMessage(db, messageId, transcript);
  } catch {
    // Best-effort by design: the voice send already returned 201, so a
    // transcription failure must never surface. The clip stays audio-only.
    console.error('[radio/transcribe] transcription failed for message', messageId);
  }
}
