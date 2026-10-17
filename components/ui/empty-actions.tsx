'use client';

/**
 * The action row of an empty state — shared by kit `EmptyState` and premium
 * `PremiumEmpty`, so every "nothing here yet" in the app offers the same thing
 * Procore does: the add button, right where the list would be.
 *
 *   <EmptyState title="No RFIs yet"
 *     primary={{ label: 'New RFI', onClick: openCreate }}
 *     secondary={{ label: 'Import', href: `${base}/rfis/import` }}
 *     perm={['RFIs', 'Edit']} />
 *
 *   <EmptyState title="Nothing matches" onClearFilters={clearFilters} />
 *
 * - `primary` is the screen's yellow `.k-btn-primary`; `secondary` is slate.
 * - `perm` hides both for a person whose role cannot create here. It mirrors
 *   the `requirePermission` guard on the create route — that guard is the
 *   security; this only stops offering a button that would answer 403.
 *   usePermissions fails open, so a slow fetch never hides a GC's button.
 * - `onClearFilters` is the filtered-empty case: the list is not empty, the
 *   filter is. It replaces the create action with "Clear filters".
 *
 * Its own file (not kit or premium) because kit already imports premium.
 * Styles: `.k-empty-act` in app/globals.css (44px targets, wraps at 390px).
 */

import React from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import type { PermCategory, PermLevel } from '@/lib/permission-categories';

export interface EmptyAct {
  label: string;
  onClick?: () => void;
  href?: string;
  /** Defaults to a plus on the primary, nothing on the secondary. */
  icon?: React.ReactNode;
}

export interface EmptyActionProps {
  /** The create action — the same modal / form / route the page's own "New" button opens. */
  primary?: EmptyAct;
  /** A second way in: Import, Seed from bid package, Upload. */
  secondary?: EmptyAct;
  /** The permission the create route requires; the actions hide below it. */
  perm?: readonly [PermCategory, PermLevel];
  /** Filtered-empty: show "Clear filters" instead of the create action. */
  onClearFilters?: () => void;
}

function ActButton({ act, variant }: { act: EmptyAct; variant: 'primary' | 'secondary' }) {
  const cls = `k-btn k-btn-${variant}`;
  const icon = act.icon !== undefined ? act.icon : variant === 'primary' ? <Plus size={15} weight="bold" aria-hidden /> : null;
  if (act.href && !act.onClick) {
    return <a className={cls} href={act.href}>{icon}{act.label}</a>;
  }
  return <button type="button" className={cls} onClick={act.onClick}>{icon}{act.label}</button>;
}

function Acts({ primary, secondary }: { primary?: EmptyAct; secondary?: EmptyAct }) {
  if (!primary && !secondary) return null;
  return (
    <>
      {primary && <ActButton act={primary} variant="primary" />}
      {secondary && <ActButton act={secondary} variant="secondary" />}
    </>
  );
}

/** Rendered only when a `perm` is given, so public portals never fetch permissions. */
function GatedActs({ perm, primary, secondary }: { perm: readonly [PermCategory, PermLevel]; primary?: EmptyAct; secondary?: EmptyAct }) {
  const { can } = usePermissions();
  if (!can(perm[0], perm[1])) return null;
  return <Acts primary={primary} secondary={secondary} />;
}

/** True when the props ask for any structured action. */
export function hasEmptyActions(p: EmptyActionProps): boolean {
  return !!(p.primary || p.secondary || p.onClearFilters);
}

export function EmptyActions({ primary, secondary, perm, onClearFilters }: EmptyActionProps) {
  if (onClearFilters) {
    return (
      <button type="button" className="k-btn k-btn-secondary" onClick={onClearFilters}>
        <X size={14} weight="bold" aria-hidden />Clear filters
      </button>
    );
  }
  if (perm) return <GatedActs perm={perm} primary={primary} secondary={secondary} />;
  return <Acts primary={primary} secondary={secondary} />;
}
