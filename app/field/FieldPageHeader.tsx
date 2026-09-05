'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { F } from '@/lib/field-tokens';

/* Shared header for field pages.
 *
 * Referenced by app/field/budget and app/field/daily-log, which imported
 * '../FieldPageHeader' when no such module existed — that broke `next build`.
 *
 * Mobile-first per the field constraints: the back control is a 44px touch
 * target, nothing overflows at 320px, and every colour comes from F.
 */

export interface FieldPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Defaults to router.back(). Pass a handler to override. */
  onBack?: () => void;
  /** Hide the back control on pages that are a tab root. */
  hideBack?: boolean;
  right?: React.ReactNode;
}

export default function FieldPageHeader({
  title, subtitle, icon, onBack, hideBack, right,
}: FieldPageHeaderProps) {
  const router = useRouter();
  const goBack = onBack ?? (() => router.back());

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0 14px',
        marginBottom: 4,
        borderBottom: `1px solid ${F.borderDim}`,
        minWidth: 0,
      }}
    >
      {!hideBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          style={{
            flex: '0 0 auto',
            width: 44, height: 44,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
            border: `1px solid ${F.border}`,
            borderRadius: 10,
            color: F.dim,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {icon && (
        <span style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>
          {icon}
        </span>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 800,
            color: F.text,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 13,
              color: F.dim,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {right && <div style={{ flex: '0 0 auto' }}>{right}</div>}
    </header>
  );
}
