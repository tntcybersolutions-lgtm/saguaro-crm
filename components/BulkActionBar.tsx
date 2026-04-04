'use client';

import { useMemo } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

interface BulkActionBarProps {
  selectedCount: number;
  entityType: 'invoice' | 'pay_app' | 'rfi' | 'change_order' | 'submittal';
  onApprove?: () => void;
  onReject?: () => void;
  onExport?: () => void;
  onEmail?: () => void;
  onDelete?: () => void;
  onClear: () => void;
}

interface ActionButton {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}

const iconStyle = { width: 16, height: 16, flexShrink: 0 } as const;

const ApproveIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const RejectIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ExportIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const EmailIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <polyline points="22 7 12 13 2 7" />
  </svg>
);

const DeleteIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const ReturnIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4" />
    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  </svg>
);

const CloseIcon = (
  <svg {...iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="16 8 12 12 8 8" />
    <line x1="8" y1="16" x2="16" y2="16" />
  </svg>
);

export default function BulkActionBar({
  selectedCount,
  entityType,
  onApprove,
  onReject,
  onExport,
  onEmail,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  const actions: ActionButton[] = useMemo(() => {
    switch (entityType) {
      case 'invoice':
        return [
          { label: 'Approve', icon: ApproveIcon, onClick: onApprove, primary: true },
          { label: 'Export', icon: ExportIcon, onClick: onExport },
          { label: 'Email', icon: EmailIcon, onClick: onEmail },
          { label: 'Delete', icon: DeleteIcon, onClick: onDelete },
        ];
      case 'pay_app':
        return [
          { label: 'Approve', icon: ApproveIcon, onClick: onApprove, primary: true },
          { label: 'Export', icon: ExportIcon, onClick: onExport },
          { label: 'Email', icon: EmailIcon, onClick: onEmail },
        ];
      case 'rfi':
        return [
          { label: 'Close', icon: CloseIcon, onClick: onApprove, primary: true },
          { label: 'Export', icon: ExportIcon, onClick: onExport },
          { label: 'Email', icon: EmailIcon, onClick: onEmail },
        ];
      case 'change_order':
        return [
          { label: 'Approve', icon: ApproveIcon, onClick: onApprove, primary: true },
          { label: 'Reject', icon: RejectIcon, onClick: onReject },
          { label: 'Export', icon: ExportIcon, onClick: onExport },
        ];
      case 'submittal':
        return [
          { label: 'Approve', icon: ApproveIcon, onClick: onApprove, primary: true },
          { label: 'Return', icon: ReturnIcon, onClick: onReject },
          { label: 'Export', icon: ExportIcon, onClick: onExport },
        ];
      default:
        return [];
    }
  }, [entityType, onApprove, onReject, onExport, onEmail, onDelete]);

  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: RAISED,
        borderTop: `1px solid ${BORDER}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
        animation: 'bulkSlideUp 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes bulkSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Selected count */}
      <span
        style={{
          color: GOLD,
          fontWeight: 700,
          fontSize: 14,
          whiteSpace: 'nowrap',
          marginRight: 4,
        }}
      >
        {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
      </span>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: BORDER, flexShrink: 0 }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={!action.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              border: action.primary ? 'none' : `1px solid ${BORDER}`,
              background: action.primary ? GOLD : 'transparent',
              color: action.primary ? DARK : DIM,
              fontSize: 13,
              fontWeight: action.primary ? 700 : 500,
              cursor: action.onClick ? 'pointer' : 'not-allowed',
              opacity: action.onClick ? 1 : 0.4,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (action.onClick) {
                if (action.primary) {
                  (e.currentTarget as HTMLButtonElement).style.background = '#c49015';
                } else {
                  (e.currentTarget as HTMLButtonElement).style.background = BORDER;
                  (e.currentTarget as HTMLButtonElement).style.color = TEXT;
                }
              }
            }}
            onMouseLeave={(e) => {
              if (action.primary) {
                (e.currentTarget as HTMLButtonElement).style.background = GOLD;
              } else {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = DIM;
              }
            }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      {/* Clear selection */}
      <button
        onClick={onClear}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          background: 'transparent',
          color: DIM,
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = BORDER;
          (e.currentTarget as HTMLButtonElement).style.color = TEXT;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = DIM;
        }}
        aria-label="Clear selection"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Clear
      </button>
    </div>
  );
}
