'use client';
/**
 * EmptyState — Professional empty state with illustration, message, and action button.
 * Use when a list/table has zero records.
 */
import React from 'react';
import { FolderSimpleDashed, MagnifyingGlass, Plus, ArrowClockwise } from '@phosphor-icons/react';
import { colors, font, radius } from '../../lib/design-tokens';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  variant?: 'default' | 'search' | 'error';
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  variant = 'default',
}: EmptyStateProps) {
  const defaultIcons = {
    default: <FolderSimpleDashed size={48} weight="duotone" color={colors.textDim} />,
    search: <MagnifyingGlass size={48} weight="duotone" color={colors.textDim} />,
    error: <ArrowClockwise size={48} weight="duotone" color={colors.red} />,
  };

  const ActionTag = actionHref ? 'a' : 'button';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
      role="status"
    >
      <div style={{ marginBottom: 16, opacity: 0.6 }}>
        {icon || defaultIcons[variant]}
      </div>
      <h3 style={{
        margin: '0 0 8px',
        fontSize: font.size.xl,
        fontWeight: font.weight.bold,
        color: colors.text,
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          margin: '0 0 20px',
          fontSize: font.size.md,
          color: colors.textMuted,
          maxWidth: 380,
          lineHeight: 1.6,
        }}>
          {description}
        </p>
      )}
      {(actionLabel && (onAction || actionHref)) && (
        <ActionTag
          onClick={onAction}
          href={actionHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: colors.gold,
            color: colors.dark,
            border: 'none',
            borderRadius: radius.lg,
            fontSize: font.size.md,
            fontWeight: font.weight.black,
            cursor: 'pointer',
            textDecoration: 'none',
            transition: 'opacity .15s',
          }}
        >
          {variant === 'error' ? <ArrowClockwise size={16} weight="bold" /> : <Plus size={16} weight="bold" />}
          {actionLabel}
        </ActionTag>
      )}
    </div>
  );
}
