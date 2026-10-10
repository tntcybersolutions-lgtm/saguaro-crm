'use client';
/**
 * Downloads in the iPhone app.
 *
 * Eighteen screens export a file the browser way: an <a download> pointed at a
 * blob:, data: or same-origin URL, clicked in code. The iPhone app is a
 * Capacitor web view with no download manager — it ignores the download, so
 * every "Export CSV / Excel / PDF" button there did nothing. Rather than touch
 * each screen, the app shell installs this once, in the app only:
 *
 *  • a click on any <a download> — in code or by a finger — fetches the file
 *    inside the app (blob:, data: and same-origin links all resolve there) and
 *    opens the iOS share sheet with it (Files, AirDrop, Mail, Numbers…);
 *  • URL.revokeObjectURL is held for a minute, because those screens revoke
 *    the blob: URL right after click(), before the file has been read.
 *
 * Browsers are untouched: install() returns at once outside the app.
 */
import { isNative } from '@/lib/native';
import { shareFileInApp } from '@/lib/media-save';

const FLAG = '__sgNativeDownloads';

function shareAnchor(a: HTMLAnchorElement): void {
  const name = a.getAttribute('download') || a.textContent?.trim() || 'Saguaro file';
  shareFileInApp(a.href, name).catch((e) => {
    console.error('in-app download failed', e);
    window.alert("Couldn't save that file. Check your signal and try again.");
  });
}

export function installNativeDownloads(): void {
  if (typeof window === 'undefined' || !isNative()) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;

  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url: string) => { setTimeout(() => revoke(url), 60_000); };

  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
    if (this.hasAttribute('download') && this.href) { shareAnchor(this); return; }
    click.call(this);
  };

  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (!a?.href) return;
    e.preventDefault();
    shareAnchor(a);
  }, true);
}
