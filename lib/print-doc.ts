'use client';
/**
 * Print a document the page built as HTML — or, in the iPhone app, hand it to
 * the share sheet.
 *
 * Five screens printed with window.open('', '_blank') + document.write. The
 * iPhone app is a Capacitor web view that opens no blank windows, so
 * window.open returned null and the button did nothing there; on the web a
 * pop-up blocker could swallow it the same way. And the printed page used the
 * app's colour tokens (var(--c-text) …), which don't exist in a standalone
 * document, so header rows printed dark-on-dark.
 *
 *  • iPhone app: write the page to the app's cache as an .html file and open
 *    the iOS share sheet with it (Save to Files, AirDrop, Mail, Messages).
 *  • Browser: print from a hidden frame on the same page — no pop-up.
 */
import { isNative } from '@/lib/native';
import { DOC_HEX } from '@/lib/document-palette';

export type PrintResult = 'printed' | 'shared' | 'cancelled';

/** Print values for the app tokens these documents use — the document
 *  palette (lib/document-palette): dark ink on white paper, never the app's
 *  dark page. */
const PRINT_TOKENS = `<style>:root{--c-text:${DOC_HEX.ink};--text-primary:${DOC_HEX.ink};--text-secondary:${DOC_HEX.muted};--success:${DOC_HEX.success};--danger:${DOC_HEX.danger};--warning:${DOC_HEX.warning};--brand-primary:${DOC_HEX.accent};--brand-primary-strong:${DOC_HEX.accent};--surface-card:${DOC_HEX.zebra};--title-page:${DOC_HEX.accent};--title-section:${DOC_HEX.accent}}</style>`;

/** The document with the print token values in its <head> (or in front of it). */
export function withPrintTokens(html: string): string {
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + PRINT_TOKENS) : PRINT_TOKENS + html;
}

/** A filesystem-safe name like "Bid Tabulation.html". */
export function docFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Saguaro document';
  return `${base}.html`;
}

const isCancel = (e: unknown) => (e instanceof DOMException ? e.name === 'AbortError' : /cancel/i.test(String((e as Error)?.message || e)));

export async function printHtml(html: string, title: string): Promise<PrintResult> {
  const doc = withPrintTokens(html);

  if (isNative()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({
      path: `share/${Date.now()}-${docFileName(title)}`, data: doc, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true,
    });
    try {
      await Share.share({ title, files: [written.uri] });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      throw e;
    }
  }

  await new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.title = title;
    frame.setAttribute('style', 'visibility:hidden;height:0;width:0;position:absolute;border:0');
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) { frame.remove(); reject(new Error('The print frame did not open.')); return; }
      let gone = false;
      const cleanup = () => { if (!gone) { gone = true; frame.remove(); } };
      w.addEventListener('afterprint', () => setTimeout(cleanup, 300), { once: true });
      // Browsers that never fire afterprint still lose the frame.
      setTimeout(cleanup, 120_000);
      w.focus();
      w.print();
      resolve();
    };
    frame.srcdoc = doc;
    document.body.appendChild(frame);
  });
  return 'printed';
}
