'use client';
/**
 * The quiet line above the phone tab bar that says what is still on this phone:
 * "3 waiting for signal", "Sending…", or — for anything the server refused
 * five times — "2 couldn't send" with Retry. Hidden when nothing is waiting.
 * Phone only; on a desktop the screens' own badges carry the same news.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { getNetState, getServerNetState, subscribeNet, retryAllStuck, listStuck } from '@/lib/offline/outbox';

const CSS = `
.syncl { display: none; }
@media (max-width: 767px) {
  .syncl { position: fixed; left: 0; right: 0; bottom: var(--sag-tabbar-h, 56px); z-index: 140; display: flex; align-items: center; gap: 8px;
    min-height: 32px; padding: 0 16px; box-sizing: border-box; background: var(--bg-base); border-top: 1px solid var(--border-default);
    font-size: 13px; font-weight: 600; line-height: 1.3; color: var(--text-secondary); }
  .syncl i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--c-orange); }
  .syncl[data-tone="send"] i { background: var(--c-green); }
  .syncl[data-tone="stuck"] i { background: var(--danger); }
  .syncl span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .syncl button { flex: none; min-height: 44px; margin: -6px -8px -6px 0; padding: 0 8px; border: 0; background: none;
    color: var(--link); font: inherit; font-weight: 700; cursor: pointer; }
  .syncl button:disabled { color: var(--text-tertiary); cursor: default; }
}
@media (prefers-reduced-motion: no-preference) and (max-width: 767px) {
  .syncl[data-tone="send"] i { animation: syncl-pulse 1.2s ease-in-out infinite; }
  @keyframes syncl-pulse { 50% { opacity: .35; } }
}
`;

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export default function SyncLine() {
  const net = useSyncExternalStore(subscribeNet, getNetState, getServerNetState);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);

  // The first refusal's reason, so "couldn't send" says why.
  useEffect(() => {
    if (!net.failed) { setWhy(''); return; }
    let alive = true;
    void listStuck().then((l) => { if (alive) setWhy(l[0]?.error ? `${l[0].label}: ${l[0].error}` : ''); });
    return () => { alive = false; };
  }, [net.failed]);

  let tone = '';
  let text = '';
  if (net.syncing) { tone = 'send'; text = net.synced ? `Sending… ${net.synced} sent` : 'Sending…'; }
  else if (net.pending) { tone = 'wait'; text = `${n(net.pending, 'item', 'items')} waiting for signal`; }
  if (net.failed) {
    tone = tone || 'stuck';
    const stuck = `${net.failed} couldn't send`;
    text = text ? `${text} · ${stuck}` : stuck;
  }
  if (!tone) return null;

  const retry = async () => {
    setBusy(true);
    try { await retryAllStuck(); } catch (e) { console.warn('[sync] retry failed to start', e); }
    setBusy(false);
  };

  return (
    <div className="syncl" data-tone={tone} role="status" aria-live="polite" title={why || undefined}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <i aria-hidden />
      <span>{text}</span>
      {net.failed ? <button type="button" onClick={retry} disabled={busy || !net.online}>{net.online ? 'Retry' : 'Retry when online'}</button> : null}
    </div>
  );
}
