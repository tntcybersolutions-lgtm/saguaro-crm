'use client';
import React, { useRef, useState, useCallback } from 'react';

interface SwipeAction {
  label: string;
  color: string;
  icon: string;
  onAction: () => void;
}

interface SwipeActionProps {
  leftAction?: SwipeAction;  // Swipe right reveals left action (e.g., Complete)
  rightAction?: SwipeAction; // Swipe left reveals right action (e.g., Delete)
  children: React.ReactNode;
  threshold?: number;
}

export function SwipeActionItem({
  leftAction,
  rightAction,
  children,
  threshold = 72,
}: SwipeActionProps) {
  const [offsetX, setOffsetX] = useState(0);
  const startX  = useRef<number | null>(null);
  const dragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    // Clamp: only reveal the relevant action
    let clamped = delta;
    if (delta > 0 && !leftAction)  clamped = 0;
    if (delta < 0 && !rightAction) clamped = 0;
    clamped = Math.max(Math.min(clamped, threshold + 20), -(threshold + 20));
    setOffsetX(clamped * 0.75); // resistance
  }, [leftAction, rightAction, threshold]);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
    if (offsetX > threshold && leftAction) {
      leftAction.onAction();
    } else if (offsetX < -threshold && rightAction) {
      rightAction.onAction();
    }
    setOffsetX(0);
    startX.current = null;
  }, [offsetX, threshold, leftAction, rightAction]);

  const showLeft  = offsetX > 10 && leftAction;
  const showRight = offsetX < -10 && rightAction;

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Left action background (revealed on swipe right) */}
      {leftAction && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: Math.max(offsetX, 0),
          background: leftAction.color,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          paddingRight: 16,
          transition: dragging.current ? 'none' : 'width 0.2s',
          overflow: 'hidden',
        }}>
          {showLeft && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 18 }}>{leftAction.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{leftAction.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Right action background (revealed on swipe left) */}
      {rightAction && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: Math.max(-offsetX, 0),
          background: rightAction.color,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          paddingLeft: 16,
          transition: dragging.current ? 'none' : 'width 0.2s',
          overflow: 'hidden',
        }}>
          {showRight && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 18 }}>{rightAction.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{rightAction.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? 'none' : 'transform 0.2s cubic-bezier(0.32,0.72,0,1)',
          position: 'relative',
          zIndex: 1,
          background: '#07101C',
        }}
      >
        {children}
      </div>
    </div>
  );
}
