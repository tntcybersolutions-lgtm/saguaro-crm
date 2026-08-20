'use client';
import React from 'react';

const PURPLE = '#a855f7';

/**
 * SageLoader — Premium AI loading indicator
 * Purple glow ring with sparkle, pulsing "Sage is thinking..."
 */
export function SageLoader({ message = 'Sage is thinking...' }: { message?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
      <style>{`
        @keyframes sageSpinRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sagePulseGlow {
          0%, 100% { box-shadow: 0 0 12px rgba(168,85,247,.2); }
          50% { box-shadow: 0 0 28px rgba(168,85,247,.45); }
        }
        @keyframes sagePulseText {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'sagePulseGlow 2s ease-in-out infinite',
      }}>
        {/* Spinning ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '3px solid rgba(168,85,247,.15)',
          borderTopColor: PURPLE,
          animation: 'sageSpinRing 1.2s linear infinite',
        }} />
        {/* Center sparkle */}
        <span style={{ fontSize: 22, zIndex: 1 }}>&#10024;</span>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 600, color: PURPLE,
        animation: 'sagePulseText 2s ease-in-out infinite',
        letterSpacing: 0.3,
      }}>
        {message}
      </div>
    </div>
  );
}

/**
 * SageTypingDots — Three bouncing purple dots for chat typing indicator
 */
export function SageTypingDots() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 0' }}>
      <style>{`
        @keyframes sageDotBounce {
          0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: PURPLE,
          display: 'inline-block',
          animation: `sageDotBounce 1.4s ease-in-out ${i * 0.16}s infinite`,
        }} />
      ))}
    </div>
  );
}
