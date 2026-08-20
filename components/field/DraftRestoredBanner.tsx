'use client';
import { F } from '@/lib/field-tokens';

interface DraftRestoredBannerProps {
  timeAgo: string;
  onDiscard: () => void;
}

/**
 * Banner shown when a form draft was restored from IndexedDB.
 */
export default function DraftRestoredBanner({ timeAgo, onDiscard }: DraftRestoredBannerProps) {
  return (
    <div style={{
      background: F.amberBg,
      border: '1px solid rgba(245,158,11,.25)',
      borderRadius: F.radiusSm,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: F.fontMd, color: F.amber, fontWeight: 600 }}>
          Draft restored from {timeAgo}
        </p>
      </div>
      <button onClick={onDiscard}
        style={{
          background: 'rgba(245,158,11,.15)',
          border: '1px solid rgba(245,158,11,.3)',
          borderRadius: 6,
          padding: '4px 10px',
          color: F.amber,
          fontSize: F.fontXs,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Discard
      </button>
    </div>
  );
}
