'use client';
import React from 'react';

const GOLD = '#C8960F', DIM = '#8BAAC8', TEXT = '#F0F4FF';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

const ILLUSTRATIONS: Record<string, string> = {
  photos: '📷', punch: '✅', rfis: '❓', logs: '📋', schedule: '📅',
  drawings: '📐', equipment: '🚜', safety: '⚠️', invoices: '💰',
  documents: '📁', contacts: '👥', chat: '💬', deliveries: '📦',
  bids: '📊', contracts: '📝', timesheets: '⏱', default: '🌵',
};

export default function EmptyState({ icon, title, description, actionLabel, onAction, compact }: EmptyStateProps) {
  const emoji = icon && ILLUSTRATIONS[icon] ? ILLUSTRATIONS[icon] : ILLUSTRATIONS.default;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: compact ? '24px 20px' : '48px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: compact ? 56 : 80, height: compact ? 56 : 80, borderRadius: '50%',
        background: 'rgba(212,160,23,.08)', border: '2px solid rgba(212,160,23,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: compact ? 28 : 40, marginBottom: compact ? 12 : 20,
      }}>
        {emoji}
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: compact ? 15 : 18, fontWeight: 700, color: TEXT }}>{title}</h3>
      <p style={{ margin: '0 0 16px', fontSize: compact ? 12 : 13, color: DIM, lineHeight: 1.5, maxWidth: 280 }}>{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          padding: compact ? '8px 18px' : '10px 24px',
          background: `linear-gradient(135deg, ${GOLD}, #C8960F)`,
          border: 'none', borderRadius: 10,
          color: '#000', fontSize: compact ? 12 : 13, fontWeight: 800,
          cursor: 'pointer', letterSpacing: '0.03em',
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
