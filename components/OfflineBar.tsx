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
import SyncLine from '@/components/offline/SyncLine';

const CSS = `
.offb { position: fixed; left: 0; right: 0; top: var(--offb-top, 0px); z-index: 10050;
  display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 16px;
  background: var(--bg-base); border-bottom: 1px solid var(--border-default);
  font-size: 13px; font-weight: 600; line-height: 1.3; color: var(--text-secondary); pointer-events: none; }
.offb svg { flex: 0 0 auto; }
.offb b { font-weight: 700; }
.offb[data-tone="off"] b, .offb[data-tone="off"] svg { color: var(--warning); }
.offb[data-tone="sync"] b, .offb[data-tone="sync"] svg { color: var(--text-primary); }
.offb[data-tone="on"] b, .offb[data-tone="on"] svg { color: var(--success); }
@media (prefers-reduced-motion: no-preference) { .offb { animation: offb-in .2s ease-out; } }
@keyframes offb-in { from { opacity: 0; } to { opacity: 1; } }
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
    body = (<><CloudSlash size={16} weight="bold" /><span><b>No signal</b> · {net.pending ? `${net.pending} waiting to send` : 'saving on this phone'}</span></>);
  } else if (showBack && net.syncing) {
    tone = 'sync';
    body = (<><ArrowsClockwise size={16} weight="bold" /><span><b>Back online</b> · sending{net.synced ? ` · ${net.synced} done` : '…'}</span></>);
  } else if (showBack) {
    tone = 'on';
    body = (<><CloudCheck size={16} weight="bold" /><span><b>Back online</b>{net.synced ? ` · ${net.synced} sent` : ''}</span></>);
  }
  if (!body) return <SyncLine />;
  return (
    <>
    <SyncLine />
    <div className="offb" data-tone={tone} role="status" aria-live="polite" style={top ? ({ ['--offb-top' as string]: top } as React.CSSProperties) : undefined}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {body}
    </div>
    </>
  );
}
