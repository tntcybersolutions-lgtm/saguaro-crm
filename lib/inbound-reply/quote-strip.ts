/**
 * Turn an emailed reply into just what the person wrote: no quoted history,
 * no "Sent from my iPhone", no signature block.
 *
 * Mail clients mark the quoted original differently:
 *   Gmail       "On Thu, Oct 16, 2026 at 3:04 PM Jane <jane@x.com> wrote:"
 *               (often wrapped onto two lines) + <div class="gmail_quote">
 *   Outlook     "-----Original Message-----", or a "____" rule followed by a
 *               From: / Sent: / To: / Subject: header block,
 *               <div id="divRplyFwdMsg"> / <div id="appendonsend">
 *   Apple Mail  "On Oct 16, 2026, at 3:04 PM, Jane <jane@x.com> wrote:" +
 *               <blockquote type="cite">
 * and every email we send that takes replies carries REPLY_MARKER above the
 * content, so whatever the client does, the cut is certain when it survives.
 *
 * Pure (no imports) so the sanity tests drive it with real client fixtures.
 */

/** Printed at the top of every outbound email that takes replies. */
export const REPLY_MARKER = '## Reply above this line ##';

const MARKER_RE = /^\s*>?\s*#{2}\s*reply above this line\s*#{2}/i;
const ORIGINAL_RE = /^\s*-{2,}\s*(original message|forwarded message|ursprüngliche nachricht|message d'origine)\s*-{2,}/i;
const UNDERSCORE_RULE_RE = /^\s*_{10,}\s*$/;
const ON_WROTE_START_RE = /^\s*(on|le|am|el)\s.{4,}/i;
const WROTE_END_RE = /(wrote|a écrit|schrieb|escribió)\s*:\s*$/i;
const HEADER_FROM_RE = /^\s*\*?(from|de|von)\s*:\*?\s+\S/i;
const HEADER_NEXT_RE = /^\s*\*?(sent|date|to|subject|cc|envoyé|gesendet|enviado)\s*:/i;
const SIGNOFF_RE = /^\s*(sent from my (iphone|ipad|android|samsung|galaxy|mobile|phone|smartphone|blackberry)|sent from (mail|outlook|yahoo mail|gmail) for |sent from (outlook|yahoo mail|gmail|mail)|get outlook for (ios|android)|sent via the samsung|sent from proton mail)/i;
const SIG_DELIM_RE = /^--\s?$/;

/** Cut the HTML at the first quoted-history container, before it is flattened to text. */
export function cutQuotedHtml(html: string): string {
  const s = String(html || '');
  const markers = [
    /<div[^>]+class=["'][^"']*\bgmail_quote\b/i,
    /<div[^>]+class=["'][^"']*\bgmail_attr\b/i,
    /<blockquote\b/i,
    /<div[^>]+id=["']?divRplyFwdMsg/i,
    /<div[^>]+id=["']?appendonsend/i,
    /<hr[^>]+id=["']?stopSpelling/i,
    /<div[^>]+class=["'][^"']*\byahoo_quoted\b/i,
    /<div[^>]+class=["'][^"']*\bOutlookMessageHeader\b/i,
  ];
  let cut = s.length;
  for (const re of markers) {
    const m = re.exec(s);
    if (m && m.index < cut) cut = m.index;
  }
  const markerIdx = s.search(/#{2}\s*reply above this line\s*#{2}/i);
  if (markerIdx >= 0 && markerIdx < cut) cut = markerIdx;
  return s.slice(0, cut);
}

/** Small, dependency-free HTML → text for reply bodies (paragraph and line breaks kept). */
export function htmlToPlain(html: string): string {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    // Block edges (opening or closing) are one line break, however many of them meet.
    .replace(/<\/?(p|div|tr|li|h[1-6]|table|blockquote)\b[^>]*>/gi, '\u0001')
    .replace(/\u0001+/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n');
}

/** Index of the first line that starts quoted history or a sign-off, or lines.length. */
function cutIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (MARKER_RE.test(line) || ORIGINAL_RE.test(line) || SIGNOFF_RE.test(line) || SIG_DELIM_RE.test(line)) return i;

    // "On <date>, <name> wrote:" — one line, or wrapped over up to three.
    if (ON_WROTE_START_RE.test(line)) {
      let joined = line;
      for (let k = 0; k < 3 && i + k < lines.length; k++) {
        if (k > 0) joined += ' ' + lines[i + k];
        if (WROTE_END_RE.test(joined.trim())) return i;
      }
    }

    // Outlook's header block: From: … then Sent:/Date:/To:/Subject: within the next few lines.
    if (HEADER_FROM_RE.test(line)) {
      for (let k = 1; k <= 4 && i + k < lines.length; k++) {
        if (HEADER_NEXT_RE.test(lines[i + k])) return i;
      }
    }

    // A ____ rule directly before a header block.
    if (UNDERSCORE_RULE_RE.test(line)) {
      for (let k = 1; k <= 2 && i + k < lines.length; k++) {
        if (HEADER_FROM_RE.test(lines[i + k])) return i;
      }
    }
  }
  return lines.length;
}

/** Plain-text reply → the new text only. */
export function stripQuotedText(text: string): string {
  let lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  lines = lines.slice(0, cutIndex(lines));

  // A trailing block of "> " lines is the quoted original (clients without a header line).
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === '' || /^\s*>/.test(lines[end - 1]))) end--;
  lines = lines.slice(0, end);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The reply as the person wrote it. Prefers the plain-text part (what every
 * client sends alongside HTML); falls back to the HTML with its quoted
 * containers cut off first.
 */
export function extractReply(input: { text?: string | null; html?: string | null }): string {
  const text = String(input.text || '');
  if (text.trim()) {
    const out = stripQuotedText(text);
    if (out) return out;
  }
  const html = String(input.html || '');
  if (html.trim()) return stripQuotedText(htmlToPlain(cutQuotedHtml(html)));
  return '';
}

export type SubmittalVerdict = 'approved' | 'approved_as_noted' | 'revise_resubmit' | 'rejected';

/* Longest phrases first, so "approved as noted" never reads as "approved". */
const VERDICTS: Array<[RegExp, SubmittalVerdict]> = [
  [/^(approved as noted|approved as corrected|approved with comments|make corrections noted|exceptions noted|furnish as corrected)\b/, 'approved_as_noted'],
  [/^(revise (and|&) resubmit|revise\/resubmit|amend (and|&) resubmit|resubmit)\b/, 'revise_resubmit'],
  [/^(not approved|rejected|reject)\b/, 'rejected'],
  [/^(approved|no exceptions taken|reviewed,? no exceptions)\b/, 'approved'],
];

/**
 * A submittal reviewer's verdict, only when the reply's FIRST line opens with
 * one of the standard review stamps. Anything else ("looks approved to me?",
 * "I have not approved this") is a comment, not a decision.
 */
export function parseSubmittalVerdict(reply: string): SubmittalVerdict | null {
  const first = String(reply || '').split('\n').map((l) => l.trim()).find(Boolean);
  if (!first) return null;
  const s = first.toLowerCase().replace(/^[*_"'\s]+/, '');
  for (const [re, v] of VERDICTS) {
    const m = re.exec(s);
    if (!m) continue;
    // The stamp must stand alone: end of line, or followed by punctuation / a dash / a new sentence.
    const rest = s.slice(m[0].length);
    if (rest === '' || /^\s*([.!:;,–—-]|\s*$)/.test(rest)) return v;
  }
  return null;
}
