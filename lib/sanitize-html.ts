/**
 * lib/sanitize-html.ts
 * HTML sanitizer for rendering markdown in chat components.
 * Escapes all HTML entities FIRST, then applies safe markdown formatting.
 * This prevents XSS from AI-generated or user-injected content.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Render markdown-like syntax to safe HTML.
 * ALWAYS escapes HTML entities before applying formatting —
 * this means injected <script>, <img onerror>, etc. are neutralized.
 */
export function renderSafeMarkdown(text: string): string {
  // Step 1: Escape all HTML entities
  let safe = escapeHtml(text);

  // Step 2: Apply markdown formatting on the escaped text
  safe = safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');

  return safe;
}
