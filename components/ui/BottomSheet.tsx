'use client';
import React, { useEffect, useRef } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Height of the sheet. Default: 'auto' (up to 90vh) */
  height?: string;
}

export function BottomSheet({ open, onClose, title, children, height = 'auto' }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        ref={sheetRef}
        style={{
          width: '100%',
          maxWidth: 600,
          maxHeight: '90vh',
          height,
          background: '#1f2c3e',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: '1px solid #263347',
          borderBottom: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#3a4f6a' }} />
        </div>

        {/* Header */}
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 20px 12px',
              borderBottom: '1px solid #263347',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 16, color: '#e8edf8' }}>{title}</span>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#8fa3c0',
                fontSize: 22,
                cursor: 'pointer',
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
          {children}
        </div>
      </div>
    </div>
  );
}
