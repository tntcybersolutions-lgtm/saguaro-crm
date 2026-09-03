/**
 * lib/ai-json.ts — reading JSON back out of a model response.
 *
 * A model asked for JSON returns JSON *almost* always. The rest of the time it
 * wraps the object in ```json fences, opens with a sentence of preamble, or
 * leaves a trailing comma before a closing brace. A bare JSON.parse throws on
 * all three and the route reports "could not read" on output that was fine.
 *
 * This parser exists in seven routes already — bids/level-extract,
 * heatmap/scan, takeoff/count-symbols, takeoff/compare-revisions,
 * bim/[id]/convert, drone/[id]/analyze, ai/network-wizard — in four slightly
 * different versions, of which only some do the trailing-comma repair and only
 * some are string-aware when matching braces. That divergence is how one route
 * quietly handles a response another one drops.
 *
 * One copy, the strongest of the four. New AI routes import this; the existing
 * seven can migrate to it when they are next touched.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Three stages, cheapest first:
 *   1. strip code fences and parse
 *   2. repair trailing commas and parse
 *   3. match braces from the first `{`, ignoring braces inside strings, and
 *      parse that slice
 *
 * Returns null when none of them yield an object — callers must handle that
 * rather than assuming a shape.
 */
export function extractJson<T = any>(raw: string): T | null {
  if (!raw) return null;

  let c = raw
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  try { return JSON.parse(c) as T; } catch { /* stage 2 */ }

  /* A trailing comma before } or ] is the single most common malformation. */
  c = c.replace(/,\s*(?=[}\]])/g, '');
  try { return JSON.parse(c) as T; } catch { /* stage 3 */ }

  const start = c.indexOf('{');
  if (start < 0) return null;

  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < c.length; i++) {
    const ch = c[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;

  try { return JSON.parse(c.slice(start, end + 1)) as T; } catch { return null; }
}

/** The standing clause for a system prompt that must return parseable JSON.
 *  Kept here so every route says it the same way. */
export const JSON_ONLY =
  'Return ONLY raw JSON — no markdown, no backticks, no prose. Start with { and end with }.';

/** Text out of a messages.create response. Always the filter/map/join, never
 *  content[0].text — a response can lead with a non-text block and the index
 *  form silently returns undefined. */
export function messageText(resp: { content?: Array<{ type?: string; text?: string }> }): string {
  return (resp?.content || [])
    .filter((x) => x?.type === 'text')
    .map((x) => x.text || '')
    .join('');
}
