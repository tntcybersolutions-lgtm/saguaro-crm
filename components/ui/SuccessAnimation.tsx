'use client';
/**
 * SuccessAnimation — Celebratory checkmark animation after successful actions.
 * Shows a green checkmark circle with expanding ring effect.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';

interface SuccessAnimationProps {
  show: boolean;
  message?: string;
  subMessage?: string;
  onComplete?: () => void;
  duration?: number;
}

export default function SuccessAnimation({
  show,
  message = 'Success!',
  subMessage,
  onComplete,
  duration = 2500,
}: SuccessAnimationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [show, duration, onComplete]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(4px)',
      animation: 'successFadeIn .3s ease',
    }}>
      <div style={{ textAlign: 'center', animation: 'successBounce .5s ease' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: '#F0FDF4', border: '3px solid #16A34A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          animation: 'successPulseRing 1s ease',
          boxShadow: '0 0 0 0 rgba(22,163,74,.4)',
        }}>
          <CheckCircle size={44} weight="fill" color="#16A34A" />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#F0F4FF', marginBottom: 4 }}>{message}</div>
        {subMessage && <div style={{ fontSize: 14, color: '#8B9DB8' }}>{subMessage}</div>}
      </div>

      <style>{`
        @keyframes successFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes successBounce { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes successPulseRing { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.4); } 70% { box-shadow: 0 0 0 20px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
      `}</style>
    </div>
  );
}
