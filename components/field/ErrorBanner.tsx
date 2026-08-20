'use client';
import { F } from '@/lib/field-tokens';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Inline error banner for field pages.
 * Shows when API fetch fails with optional retry button.
 */
export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div style={{
      background: F.redBg,
      border: `1px solid rgba(239,68,68,.25)`,
      borderRadius: F.radiusSm,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: F.fontMd, color: F.red, fontWeight: 600 }}>
          {message}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: 'rgba(239,68,68,.15)',
            border: `1px solid rgba(239,68,68,.3)`,
            borderRadius: 6,
            padding: '6px 12px',
            color: F.red,
            fontSize: F.fontSm,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
