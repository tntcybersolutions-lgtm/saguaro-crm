'use client';

import React from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

/* ────────────────────────── Icons ────────────────────────── */

function FolderIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path
        d="M6 14C6 11.7909 7.79086 10 10 10H18.3431C19.404 10 20.4214 10.4214 21.1716 11.1716L23.8284 13.8284C24.5786 14.5786 25.596 15 26.6569 15H38C40.2091 15 42 16.7909 42 19V34C42 36.2091 40.2091 38 38 38H10C7.79086 38 6 36.2091 6 34V14Z"
        stroke={GOLD}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="10" y="6" width="28" height="36" rx="3" stroke={GOLD} strokeWidth="2" />
      <line x1="16" y1="16" x2="32" y2="16" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="22" x2="28" y2="22" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="28" x2="24" y2="28" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <path d="M28 30L30 34L34 28" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PayAppIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="32" height="28" rx="3" stroke={GOLD} strokeWidth="2" />
      <line x1="8" y1="18" x2="40" y2="18" stroke={GOLD} strokeWidth="2" />
      <circle cx="24" cy="28" r="4" stroke={GOLD} strokeWidth="2" />
      <line x1="24" y1="25" x2="24" y2="31" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="27" x2="26" y2="27" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RFIIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="16" stroke={GOLD} strokeWidth="2" />
      <text x="24" y="30" textAnchor="middle" fill={GOLD} fontSize="20" fontWeight="700" fontFamily="sans-serif">
        ?
      </text>
    </svg>
  );
}

function ChangeOrderIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="10" y="8" width="28" height="32" rx="3" stroke={GOLD} strokeWidth="2" />
      <path d="M18 24H30" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <path d="M26 20L30 24L26 28" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 20L18 24L22 28" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="32" height="28" rx="3" stroke={GOLD} strokeWidth="2" />
      <circle cx="18" cy="20" r="3" stroke={GOLD} strokeWidth="2" />
      <path d="M8 32L16 24L22 30L30 20L40 32" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DailyLogIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="10" y="6" width="28" height="36" rx="3" stroke={GOLD} strokeWidth="2" />
      <line x1="18" y1="6" x2="18" y2="12" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="6" x2="30" y2="12" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="14" x2="38" y2="14" stroke={GOLD} strokeWidth="2" />
      <line x1="16" y1="20" x2="32" y2="20" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="26" x2="28" y2="26" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="32" x2="24" y2="32" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BidIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M12 40V12C12 9.79086 13.7909 8 16 8H32C34.2091 8 36 9.79086 36 12V40L24 34L12 40Z" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" />
      <line x1="18" y1="16" x2="30" y2="16" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="22" x2="26" y2="22" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ContractIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="10" y="6" width="28" height="36" rx="3" stroke={GOLD} strokeWidth="2" />
      <line x1="16" y1="14" x2="32" y2="14" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="20" x2="28" y2="20" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 30C22 28 26 28 28 30C30 32 32 34 34 32" stroke={GOLD} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function SubmittalIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="24" height="30" rx="3" stroke={GOLD} strokeWidth="2" />
      <rect x="16" y="6" width="24" height="30" rx="3" stroke={GOLD} strokeWidth="2" fill={DARK} />
      <line x1="22" y1="14" x2="34" y2="14" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="20" x2="30" y2="20" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M28 24L30 28L34 22" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ────────────────────────── EmptyState ────────────────────────── */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  const handleClick = () => {
    if (onAction) {
      onAction();
    } else if (actionHref) {
      window.location.href = actionHref;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
        background: `radial-gradient(ellipse at center, ${RAISED}44 0%, transparent 70%)`,
        borderRadius: 12,
        border: `1px dashed ${BORDER}`,
      }}
    >
      <div style={{ marginBottom: 16, opacity: 0.9 }}>{icon ?? <FolderIcon />}</div>

      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 18,
          fontWeight: 700,
          color: TEXT,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: '0 0 24px',
          fontSize: 14,
          color: DIM,
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {actionLabel && (
        <button
          onClick={handleClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 22px',
            background: GOLD,
            color: DARK,
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = 'none')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={DARK} strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ────────────────────────── Pre-built variants ────────────────────────── */

interface VariantProps {
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyInvoices({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<InvoiceIcon />}
      title="No invoices yet"
      description="Create your first invoice to start tracking payments and billing for this project."
      actionLabel="Create Invoice"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyPayApps({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<PayAppIcon />}
      title="No pay applications"
      description="Submit your first pay application to begin the payment request process with the owner."
      actionLabel="New Pay App"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyRFIs({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<RFIIcon />}
      title="No RFIs submitted"
      description="Create a Request for Information when you need clarification on plans, specs, or project details."
      actionLabel="Create RFI"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyChangeOrders({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<ChangeOrderIcon />}
      title="No change orders"
      description="Change orders will appear here when scope, cost, or schedule modifications are proposed."
      actionLabel="New Change Order"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyPhotos({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<PhotoIcon />}
      title="No photos uploaded"
      description="Upload progress photos to document the project timeline and share visual updates with stakeholders."
      actionLabel="Upload Photos"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyDailyLogs({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<DailyLogIcon />}
      title="No daily logs"
      description="Start logging daily field activities including weather, labor, equipment, and work completed."
      actionLabel="New Daily Log"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyBids({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<BidIcon />}
      title="No bids received"
      description="Bid submissions from subcontractors and vendors will appear here once bid packages are published."
      actionLabel="Create Bid Package"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptyContracts({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<ContractIcon />}
      title="No contracts created"
      description="Create contracts to define scope, pricing, and terms with subcontractors and suppliers."
      actionLabel="New Contract"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export function EmptySubmittals({ actionHref, onAction }: VariantProps) {
  return (
    <EmptyState
      icon={<SubmittalIcon />}
      title="No submittals"
      description="Track shop drawings, product data, and material samples submitted for approval by the design team."
      actionLabel="New Submittal"
      actionHref={actionHref}
      onAction={onAction}
    />
  );
}

export default EmptyState;
