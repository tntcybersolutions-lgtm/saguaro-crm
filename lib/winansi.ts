/**
 * lib/winansi.ts
 *
 * pdf-lib's StandardFonts (Helvetica, Times, Courier) can only encode the
 * WinAnsi (CP1252) repertoire. Drawing any character outside it throws:
 *   "WinAnsi cannot encode ... (0x2610)"   ← e.g. the ballot box ☐
 * which is what killed the 17 bid-jacket packages.
 *
 * `toWinAnsi` makes any string safe to hand to page.drawText:
 *   - maps the common non-WinAnsi glyphs we actually use (checkboxes, checks,
 *     arrows, geometric bullets, warning sign, primes) to ASCII equivalents,
 *     preserving checkbox semantics: ☐ → "[ ]", ☑/✓ → "[x]"
 *   - passes through everything WinAnsi CAN encode — including em/en dashes,
 *     bullets, curly quotes, …, €, ™ (these are >U+00FF in a JS string but are
 *     valid CP1252, so a naive /[^\x00-\xFF]/ guard would wrongly delete them)
 *   - replaces anything still unencodable (emoji, CJK, etc.) with "?" so
 *     drawText can never throw.
 */

// Codepoints WinAnsiEncoding supports beyond 0x20–0x7E and 0xA0–0xFF.
const WINANSI_EXTRA = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function winAnsiEncodable(cp: number): boolean {
  return (
    cp === 0x09 || cp === 0x0a || cp === 0x0d ||
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0xff) ||
    WINANSI_EXTRA.has(cp)
  );
}

// ASCII fallbacks for glyphs we use that WinAnsi cannot encode.
const GLYPH_MAP: Record<string, string> = {
  // checkboxes / checks — preserve semantics
  '☐': '[ ]', '□': '[ ]', '▢': '[ ]',
  '☑': '[x]', '☒': '[x]', '■': '[x]',
  '✓': '[x]', '✔': '[x]', '✗': '[ ]', '✘': '[ ]', '✕': 'x',
  // status bullets / shapes
  '○': '( )', '●': '*', '◦': '-', '▪': '-', '▫': '-', '◆': '*', '◇': '*',
  '►': '>', '▶': '>', '◄': '<', '▲': '^', '▼': 'v',
  // symbols
  '⚠': '(!)', '⚑': '>', '★': '*', '☆': '*', '✦': '*', '✱': '*', '∗': '*',
  '→': '->', '←': '<-', '↑': '^', '↓': 'v', '⇒': '=>', '⇐': '<=', '➜': '->', '➔': '->',
  '′': "'", '″': '"', '‴': "'''",
  // math glyphs outside CP1252 (×, ÷, ± are valid CP1252 and pass through)
  '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '∞': 'inf',
};

/** Make any value safe to draw with pdf-lib StandardFonts. Never throws. */
export function toWinAnsi(input: unknown): string {
  const s = String(input ?? '');
  let out = '';
  for (const ch of s) {
    const mapped = GLYPH_MAP[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    const cp = ch.codePointAt(0)!;
    out += winAnsiEncodable(cp) ? ch : '?';
  }
  return out;
}
