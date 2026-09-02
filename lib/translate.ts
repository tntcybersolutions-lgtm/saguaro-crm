import Anthropic from '@anthropic-ai/sdk';
import { tryWrite } from '@/lib/db-write';

/**
 * Saguaro Radio translation brain.
 *
 * Detects the language of a radio message and produces English + Spanish
 * renderings, then stamps them onto the radio_messages row
 * (detected_lang + translations jsonb). Designed to be fired WITHOUT await
 * from the send paths: it never throws, never blocks the caller, and skips
 * silently when ANTHROPIC_API_KEY is not configured. When voice transcription
 * lands (env-gated future work), the same function translates the transcript.
 */
export async function translateRadioMessage(db: any, messageId: string, text: string): Promise<void> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return; // env-gated: no key, no translation
    const clean = String(text || '').trim();
    if (!db || !messageId || !clean) return;

    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'You translate jobsite radio traffic for a construction crew. Use natural construction terminology in both directions (concreto = concrete, encofrado = formwork, varilla/rebar, drywall, framing, pour, punch list, etc.). Keep renderings short and literal; never add, soften, or invent content.',
      messages: [{
        role: 'user',
        content: `Detect the language of this construction radio message and render it in BOTH English and Spanish. For the rendering that matches the original language, keep the original wording (lightly cleaned).

Message: ${JSON.stringify(clean)}

Respond ONLY with valid JSON in this exact format:
{"detected_lang": "<two-letter ISO 639-1 code, e.g. en or es>", "en": "<English rendering>", "es": "<Spanish rendering>"}`,
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    let parsed: any = null;
    try { parsed = JSON.parse(jsonMatch[0]); } catch { return; }

    const detected = typeof parsed?.detected_lang === 'string' ? parsed.detected_lang.trim().toLowerCase().slice(0, 8) : '';
    const en = typeof parsed?.en === 'string' ? parsed.en.trim() : '';
    const es = typeof parsed?.es === 'string' ? parsed.es.trim() : '';
    const translations: Record<string, string> = {};
    if (en) translations.en = en;
    if (es) translations.es = es;
    if (!detected && !Object.keys(translations).length) return;

    await tryWrite(db.from('radio_messages').update({
      ...(detected ? { detected_lang: detected } : {}),
      ...(Object.keys(translations).length ? { translations } : {}),
    } as never).eq('id', messageId), 'radio_messages update');
  } catch {
    // Best-effort by design: the send path already returned 201, so a
    // translation failure must never surface. The message stays untranslated.
    console.error('[radio/translate] translation failed for message', messageId);
  }
}
