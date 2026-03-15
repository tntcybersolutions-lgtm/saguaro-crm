'use client';
import React, { useRef, useState, useCallback } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
}

export function PullToRefresh({ onRefresh, children, threshold = 60 }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;
    if (container.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullY(Math.min(delta * 0.5, threshold + 20));
    }
  }, [refreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (pullY >= threshold && !refreshing) {
      setRefreshing(true);
      setPullY(threshold);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
        startY.current = null;
      }
    } else {
      setPullY(0);
      startY.current = null;
    }
  }, [pullY, threshold, refreshing, onRefresh]);

  const progress = Math.min(pullY / threshold, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as const, position: 'relative' }}
    >
      {/* Pull indicator */}
      {pullY > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: pullY,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 8,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {refreshing ? (
            <div
              style={{
                width: 24,
                height: 24,
                border: '2px solid #D4A017',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }}
            />
          ) : (
            <div
              style={{
                width: 24,
                height: 24,
                border: `2px solid rgba(212,160,23,${progress})`,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `rotate(${progress * 360}deg)`,
                transition: 'none',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v4l2.5-2.5" stroke={`rgba(212,160,23,${progress})`} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ transform: `translateY(${pullY}px)`, transition: refreshing || pullY === 0 ? 'transform 0.2s' : 'none' }}>
        {children}
      </div>
    </div>
  );
}
