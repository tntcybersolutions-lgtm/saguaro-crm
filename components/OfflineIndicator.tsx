'use client';
import { useEffect, useState } from 'react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      // Trigger background sync
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('replay-queue');
          setSyncing(true);
          setTimeout(() => {
            setSyncing(false);
            setQueueCount(0);
          }, 3000);
        } catch {
          // Background sync not supported
        }
      }
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline && !syncing) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: isOffline ? '#b45309' : '#1d4ed8',
        color: '#fff',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {isOffline ? (
        <>
          Offline &mdash; field entries will sync automatically when connected
          {queueCount > 0 ? ` (${queueCount} queued)` : ''}
        </>
      ) : (
        <>Back online &mdash; syncing {queueCount} saved entries...</>
      )}
    </div>
  );
}
