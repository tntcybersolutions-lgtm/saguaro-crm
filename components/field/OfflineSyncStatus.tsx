'use client';

import { useState, useEffect, useCallback } from 'react';
import { syncAll, getPendingCount, isOnline as checkOnline } from '@/lib/offline-sync';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

export default function OfflineSyncStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{ synced: number; failed: number } | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPending(count);
    } catch {
      // IndexedDB may not be available in some contexts
    }
  }, []);

  useEffect(() => {
    setOnline(checkOnline());
    refreshCount();

    const interval = setInterval(refreshCount, 10000);

    const handleOnline = () => {
      setOnline(true);
      refreshCount();
    };
    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (lastResult) {
      const timer = setTimeout(() => setLastResult(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [lastResult]);

  const handleSync = async () => {
    if (syncing || !online) return;
    setSyncing(true);
    setLastResult(null);
    try {
      const result = await syncAll();
      setLastResult({ synced: result.synced, failed: result.failed });
      setPending(result.remaining);
    } catch {
      setLastResult({ synced: 0, failed: pending });
    } finally {
      setSyncing(false);
    }
  };

  const showBar = !online || pending > 0 || syncing || lastResult;
  if (!showBar) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 72,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: RAISED,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '8px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        color: TEXT,
        animation: 'syncSlideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes syncSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes syncPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Status dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: online ? '#22c55e' : '#ef4444',
          boxShadow: online ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
          flexShrink: 0,
          animation: syncing ? 'syncPulse 1s ease-in-out infinite' : undefined,
        }}
      />

      {/* Status text */}
      <span style={{ color: online ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: 12 }}>
        {syncing ? 'Syncing...' : online ? 'Online' : 'Offline'}
      </span>

      {/* Pending badge */}
      {pending > 0 && !syncing && (
        <span
          style={{
            background: online ? GOLD : '#ef4444',
            color: DARK,
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          {pending} pending
        </span>
      )}

      {/* Sync result */}
      {lastResult && (
        <span style={{ fontSize: 11, color: lastResult.failed > 0 ? '#f59e0b' : '#22c55e' }}>
          {lastResult.synced} synced
          {lastResult.failed > 0 ? `, ${lastResult.failed} failed` : ''}
        </span>
      )}

      {/* Sync Now button */}
      {online && pending > 0 && !syncing && (
        <button
          onClick={handleSync}
          style={{
            background: GOLD,
            color: DARK,
            border: 'none',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Sync Now
        </button>
      )}
    </div>
  );
}
