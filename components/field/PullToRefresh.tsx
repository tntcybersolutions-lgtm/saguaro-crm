'use client';
import React, { useState, useRef, useCallback } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 60;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 100));
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try { await onRefresh(); } catch { /* */ }
      setRefreshing(false);
    }
    setPulling(false);
    setPullDistance(0);
  }, [pulling, pullDistance, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative', minHeight: '100%' }}
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div style={{
          height: refreshing ? 40 : pullDistance,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', transition: refreshing ? 'height 0.2s' : 'none',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: refreshing ? '2px solid transparent' : `2px solid rgba(212,160,23,${Math.min(pullDistance / threshold, 1)})`,
            borderTopColor: '#C8960F',
            animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            transform: !refreshing ? `rotate(${pullDistance * 3}deg)` : 'none',
          }} />
          {!refreshing && pullDistance >= threshold && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#C8960F', fontWeight: 600 }}>Release to refresh</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
