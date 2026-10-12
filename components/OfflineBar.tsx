'use client';
/**
 * Says, plainly and on every screen, when the app is offline and when it is
 * back. Offline: a bar that stays until the connection returns, with how many
 * photos, videos, daily logs and punch items are waiting on this phone. Back online: a short green notice
 * while the waiting items upload, then how many went up.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CloudSlash, CloudCheck, ArrowsClockwise } from '@phosphor-icons/react';
import { getNetState, getServerNetState, subscribeNet, startOfflineWatch } from '@/lib/offline/outbox';
import { startAppWorker } from '@/lib/offline/worker';

const CSS = `
.offb { position: fixed; left: 50%; transform: translateX(-50%); top: var(--offb-top, 12px); z-index: 10050;
  display: flex; align-items: center; gap: 10px; width: max-content; max-width: min(620px, calc(100vw - 24px)); padding: 10px 16px; border-radius: 14px;
  font-size: 14px; font-weight: 700; line-height: 1.3; box-shadow: 0 14px 34px -12px rgba(0,0,0,0.75); pointer-events: none; }
.offb svg { flex: 0 0 auto; }
.offb small { display: block; font-size: 13px; font-weight: 600; opacity: .85; }
.offb[data-tone="off"] { background: var(--c-orange); color: var(--on-brand); }
.offb[data-tone="sync"] { background: var(--bg-solid-2); color: var(--text-primary); border: 1px solid var(--border-default); }
.offb[data-tone="on"] { background: var(--c-green); color: var(--on-brand); }
@media (prefers-reduced-motion: no-preference) { .offb { animation: offb-in .2s ease-out; } }
@keyframes offb-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@media (max-width: 767px) { .offb { left: 12px; right: 12px; width: auto; max-width: none; transform: none; } @keyframes offb-in { from { opacity: 0; } to { opacity: 1; } } }
`;

/** `top`: where the bar sits — just under the app header. */
export default function OfflineBar({ top }: { top?: string }) {
  const net = useSyncExternalStore(subscribeNet, getNetState, getServerNetState);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => { void startAppWorker(); return startOfflineWatch(); }, []);

  // "Back online" stays up while the waiting items upload, then 4 more seconds.
  useEffect(() => {
    if (!net.online || !net.changedAt) { setShowBack(false); return; }
    setShowBack(true);
    if (net.syncing) return;
    const t = window.setTimeout(() => setShowBack(false), 4000);
    return () => window.clearTimeout(t);
  }, [net.online, net.changedAt, net.syncing]);

  let body: React.ReactNode = null;
  let tone = '';
  if (!net.online) {
    tone = 'off';
    body = (<><CloudSlash size={20} weight="bold" /><span>You&apos;re offline<small>{net.pending ? `${net.pending} item${net.pending === 1 ? '' : 's'} saved on this phone — ${net.pending === 1 ? 'it sends' : 'they send'} when you're back.` : 'Photos, daily logs and punch items you add are saved on this phone and send when you\'re back.'}</small></span></>);
  } else if (showBack && net.syncing) {
    tone = 'sync';
    body = (<><ArrowsClockwise size={20} weight="bold" /><span>Back online<small>Sending what you saved offline… {net.synced ? `${net.synced} done` : ''}</small></span></>);
  } else if (showBack) {
    tone = 'on';
    body = (<><CloudCheck size={20} weight="bold" /><span>Back online{net.synced ? <small>{net.synced} item{net.synced === 1 ? '' : 's'} sent from this phone.</small> : null}</span></>);
  }
  if (!body) return null;
  return (
    <div className="offb" data-tone={tone} role="status" aria-live="polite" style={top ? ({ ['--offb-top' as string]: top } as React.CSSProperties) : undefined}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {body}
    </div>
  );
}
